[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$SkipModelPull
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$ollamaUrl = 'http://127.0.0.1:11434'
$requiredModels = @(
  'qwen3:4b-instruct-2507-q4_K_M',
  'bge-m3:latest'
)

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-Endpoint([string]$Uri, [int]$TimeoutSec = 3) {
  try {
    $null = Invoke-RestMethod -Uri $Uri -TimeoutSec $TimeoutSec
    return $true
  } catch {
    return $false
  }
}

function Wait-Endpoint([string]$Uri, [int]$TimeoutSec, [string]$Name) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Endpoint -Uri $Uri -TimeoutSec 3) { return }
    Start-Sleep -Seconds 2
  }
  throw "$Name did not become ready within $TimeoutSec seconds: $Uri"
}

function Find-OllamaExecutable {
  $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
    (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw 'Ollama was not found. Install it with: winget install Ollama.Ollama'
}

function Normalize-ModelName([string]$Name) {
  if ($Name.Contains(':')) { return $Name }
  return "${Name}:latest"
}

function Ensure-Ollama {
  $ollamaExe = Find-OllamaExecutable
  if (-not (Test-Endpoint -Uri "$ollamaUrl/api/version" -TimeoutSec 3)) {
    Write-Step 'Starting Ollama on the Windows host'

    $oldModels = $env:OLLAMA_MODELS
    $oldFlash = $env:OLLAMA_FLASH_ATTENTION
    $oldCache = $env:OLLAMA_KV_CACHE_TYPE
    try {
      if (-not $env:OLLAMA_MODELS -and (Test-Path -LiteralPath 'F:\ollama-models')) {
        $env:OLLAMA_MODELS = 'F:\ollama-models'
      }
      if (-not $env:OLLAMA_FLASH_ATTENTION) { $env:OLLAMA_FLASH_ATTENTION = '1' }
      if (-not $env:OLLAMA_KV_CACHE_TYPE) { $env:OLLAMA_KV_CACHE_TYPE = 'q8_0' }
      Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
    } finally {
      $env:OLLAMA_MODELS = $oldModels
      $env:OLLAMA_FLASH_ATTENTION = $oldFlash
      $env:OLLAMA_KV_CACHE_TYPE = $oldCache
    }
    Wait-Endpoint -Uri "$ollamaUrl/api/version" -TimeoutSec 60 -Name 'Ollama'
  } else {
    Write-Step 'Ollama is already running'
  }

  $tags = Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -TimeoutSec 10
  $installed = @($tags.models | ForEach-Object { Normalize-ModelName ([string]$_.name) })
  $missing = @($requiredModels | Where-Object { (Normalize-ModelName $_) -notin $installed })

  if ($missing.Count -gt 0 -and -not $SkipModelPull) {
    foreach ($model in $missing) {
      Write-Step "Pulling missing model: $model"
      & $ollamaExe pull $model
      if ($LASTEXITCODE -ne 0) { throw "Could not pull model $model" }
    }
    $tags = Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -TimeoutSec 10
    $installed = @($tags.models | ForEach-Object { Normalize-ModelName ([string]$_.name) })
    $missing = @($requiredModels | Where-Object { (Normalize-ModelName $_) -notin $installed })
  }

  if ($missing.Count -gt 0) {
    throw "Missing Ollama model(s): $($missing -join ', ')"
  }
  Write-Host "Models are ready: $($requiredModels -join ', ')" -ForegroundColor Green
}

function Ensure-DockerDesktop {
  $state = (& docker desktop status 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0 -or $state -notmatch '(?im)^Status\s+running\s*$') {
    Write-Step 'Starting Docker Desktop'
    & docker desktop start --timeout 180
    if ($LASTEXITCODE -ne 0) {
      throw 'Docker Desktop did not start. Open Docker Desktop, then run this command again.'
    }
  } else {
    Write-Step 'Docker Desktop is already running'
  }
}

function Start-ComposeStack {
  Write-Step 'Validating Docker Compose configuration'
  Push-Location $repoRoot
  try {
    & docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'docker compose config is invalid.' }

    Write-Step 'Starting PostgreSQL, API and web'
    if ($SkipBuild) {
      & docker compose up -d
    } else {
      & docker compose up -d --build
    }
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to start.' }
  } finally {
    Pop-Location
  }

  Wait-Endpoint -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 180 -Name 'IOC API'
  Wait-Endpoint -Uri 'http://127.0.0.1:8080/' -TimeoutSec 120 -Name 'IOC Web'
}

function Test-ContainerDependencies {
  Write-Step 'Checking AI and OCR from inside the API container'

  $ollamaProbe = & docker exec ioc-laithieu-api node -e "fetch('http://host.docker.internal:11434/api/tags').then(r=>{if(!r.ok)throw new Error(String(r.status));return r.json()}).then(x=>console.log(x.models.map(m=>m.name).join(','))).catch(e=>{console.error(e.message);process.exit(1)})"
  if ($LASTEXITCODE -ne 0) { throw 'The API container cannot reach Ollama on the Windows host.' }

  $ocrLanguages = @(& docker exec ioc-laithieu-api tesseract --list-langs 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'Tesseract is not ready inside the API container.' }
  foreach ($language in @('vie', 'eng')) {
    if ($ocrLanguages -notcontains $language) {
      throw "Tesseract is missing the $language language inside the API container."
    }
  }

  Write-Host "Ollama models visible from the container: $ollamaProbe" -ForegroundColor Green
  Write-Host 'Tesseract languages are ready: vie, eng' -ForegroundColor Green
}

try {
  Write-Host 'IOC Lai Thieu - AI/OCR environment startup' -ForegroundColor Yellow
  Ensure-Ollama
  Ensure-DockerDesktop
  Start-ComposeStack
  Test-ContainerDependencies

  Write-Host "`nSystem is ready:" -ForegroundColor Green
  Write-Host '  Web:   http://localhost:8080'
  Write-Host '  Admin: http://localhost:8080/admin/login'
  Write-Host '  API:   http://localhost:3000/api/health'
  Write-Host '  AI:    Qwen3 handles extraction/Copilot; bge-m3 is available for embedding/RAG.'
  Write-Host '  OCR:   Tesseract is launched per job by the API; no separate service is needed.'
} catch {
  Write-Error $_
  exit 1
}
