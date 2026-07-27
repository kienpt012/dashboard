[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$ollamaUrl = 'http://127.0.0.1:11434'
$ollamaModels = @(
  'qwen3:4b-instruct-2507-q4_K_M',
  'bge-m3:latest'
)
$iocPorts = @(3000, 5432, 8080, 11434)
$dockerProcessNames = @(
  'Docker Desktop',
  'com.docker.backend',
  'com.docker.build'
)
$ollamaProcessNames = @(
  'ollama app',
  'ollama',
  'llama-server'
)

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-Endpoint([string]$Uri, [int]$TimeoutSec = 2) {
  try {
    $null = Invoke-RestMethod -Uri $Uri -TimeoutSec $TimeoutSec
    return $true
  } catch {
    return $false
  }
}

function Test-DockerEngine {
  try {
    $version = (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
    return ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($version))
  } catch {
    return $false
  }
}

function Get-DockerDesktopProcesses {
  return @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $dockerProcessNames -contains $_.ProcessName
  })
}

function Get-OllamaProcesses {
  return @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $ollamaProcessNames -contains $_.ProcessName
  })
}

function Stop-IocCompose {
  if (-not (Test-DockerEngine)) {
    Write-Step 'IOC containers are already stopped'
    return
  }

  Write-Step 'Stopping IOC web, API and PostgreSQL containers'
  Push-Location $repoRoot
  try {
    & docker compose stop --timeout 30
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'Normal container stop failed. Retrying with compose down (data volume is preserved).'
      & docker compose down --remove-orphans --timeout 10
      if ($LASTEXITCODE -ne 0) {
        throw 'Could not stop the IOC Docker Compose stack.'
      }
    }
  } finally {
    Pop-Location
  }

  Write-Host 'IOC containers stopped. PostgreSQL volume was not removed.' -ForegroundColor Green
}

function Stop-OllamaRuntime {
  Write-Step 'Unloading local AI models and stopping Ollama'

  $ollamaCommand = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($ollamaCommand -and (Test-Endpoint -Uri "$ollamaUrl/api/version")) {
    foreach ($model in $ollamaModels) {
      try {
        & $ollamaCommand.Source stop $model 2>$null | Out-Null
      } catch {
        # A model that is not currently loaded does not need any action.
      }
    }
  }

  $ollamaServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^Ollama' -or $_.DisplayName -match '^Ollama'
  })
  foreach ($service in $ollamaServices) {
    if ($service.Status -ne 'Stopped') {
      Stop-Service -InputObject $service -Force -ErrorAction SilentlyContinue
    }
  }

  $processes = @(Get-OllamaProcesses)
  if ($processes.Count -gt 0) {
    $processes | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }

  $remaining = @(Get-OllamaProcesses)
  if ($remaining.Count -gt 0) {
    $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  if (@(Get-OllamaProcesses).Count -gt 0) {
    throw 'Ollama processes are still running.'
  }
  Write-Host 'Ollama and loaded AI models stopped; RAM and GPU memory are released.' -ForegroundColor Green
}

function Stop-DockerDesktopRuntime {
  Write-Step 'Stopping Docker Desktop and its WSL runtime'

  $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
  $desktopProcesses = @(Get-DockerDesktopProcesses)
  if ($dockerCommand -and $desktopProcesses.Count -gt 0) {
    & $dockerCommand.Source desktop stop --timeout 90 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'Docker Desktop did not stop normally. Retrying with force.'
      & $dockerCommand.Source desktop stop --force --timeout 30 2>$null
    }
  }

  Start-Sleep -Seconds 2
  $remaining = @(Get-DockerDesktopProcesses)
  if ($remaining.Count -gt 0) {
    $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }

  $wslCommand = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if ($wslCommand) {
    $runningDistros = @(& $wslCommand.Source --list --running --quiet 2>$null)
    foreach ($distro in $runningDistros) {
      $name = ([string]$distro).Replace([char]0, '').Trim()
      if ($name -like 'docker-desktop*') {
        & $wslCommand.Source --terminate $name 2>$null | Out-Null
      }
    }
  }

  $remaining = @(Get-DockerDesktopProcesses)
  if ($remaining.Count -gt 0) {
    throw "Docker Desktop processes are still running: $($remaining.ProcessName -join ', ')"
  }
  Write-Host 'Docker Desktop stopped. Other WSL distributions were not touched.' -ForegroundColor Green
}

function Assert-IocStopped {
  Write-Step 'Verifying that IOC resources are released'

  $issues = [System.Collections.Generic.List[string]]::new()
  $remainingProcesses = @()
  $remainingProcesses += @(Get-DockerDesktopProcesses)
  $remainingProcesses += @(Get-OllamaProcesses)
  if ($remainingProcesses.Count -gt 0) {
    $issues.Add("Processes still running: $($remainingProcesses.ProcessName -join ', ')")
  }

  $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
    $_.LocalPort -in $iocPorts
  })
  if ($listeners.Count -gt 0) {
    $ports = @($listeners | Select-Object -ExpandProperty LocalPort -Unique | Sort-Object)
    $issues.Add("IOC ports still listening: $($ports -join ', ')")
  }

  if ($issues.Count -gt 0) {
    throw ($issues -join ' | ')
  }

  Write-Host 'Verified: ports 3000, 5432, 8080 and 11434 are closed.' -ForegroundColor Green
}

try {
  Write-Host 'IOC Lai Thieu - full resource shutdown' -ForegroundColor Yellow
  Stop-IocCompose
  Stop-OllamaRuntime
  Stop-DockerDesktopRuntime
  Assert-IocStopped

  Write-Host "`nIOC is fully stopped. Database data remains safe in the Docker volume." -ForegroundColor Green
  Write-Host 'Run start-ioc.cmd when you want to use the system again.'
} catch {
  Write-Error $_
  exit 1
}
