<#
.SYNOPSIS
  Dừng IOC Lái Thiêu và giải phóng RAM, GPU. Dữ liệu PostgreSQL được giữ nguyên.

.DESCRIPTION
  Chạy qua stop-ioc.cmd ở thư mục gốc. Theo thứ tự:
    1. Dừng các container web, API và PostgreSQL của IOC (không xoá volume dữ liệu).
    2. Gỡ model AI khỏi bộ nhớ và dừng Ollama.
    3. Dừng Docker Desktop cùng máy ảo WSL của nó.

  Nếu đang có container của dự án KHÁC chạy, script hỏi trước khi tắt Docker Desktop
  — người clone dự án về có thể đang dùng Docker cho việc khác.

.PARAMETER KeepDocker
  Chỉ dừng IOC và Ollama, để nguyên Docker Desktop.

.PARAMETER KeepAI
  Để nguyên Ollama đang chạy.

.PARAMETER NoPause
  Không dừng chờ nhấn phím trước khi đóng cửa sổ.
#>
[CmdletBinding()]
param(
  [switch]$KeepDocker,
  [switch]$KeepAI,
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'ioc-common.ps1')
Initialize-IocConsole

$envPath = Join-Path $repoRoot '.env'
$ollamaUrl = 'http://127.0.0.1:11434'
$ollamaModels = @('qwen3:4b-instruct-2507-q4_K_M', 'bge-m3:latest')
$dockerProcessNames = @('Docker Desktop', 'com.docker.backend', 'com.docker.build')
$ollamaProcessNames = @('ollama app', 'ollama', 'llama-server')

$script:dockerStopped = $false
$script:aiStopped = $false

function Test-DockerEngine {
  if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { return $false }
  $result = Invoke-IocNative 'docker' @('info', '--format', '{{.ServerVersion}}')
  return ($result.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($result.Text))
}

function Get-DockerDesktopProcesses {
  return @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $dockerProcessNames -contains $_.ProcessName })
}

function Get-OllamaProcesses {
  return @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $ollamaProcessNames -contains $_.ProcessName })
}

function Stop-IocContainers {
  Write-Step 'Dừng web, API và PostgreSQL của IOC'

  if (-not (Test-DockerEngine)) {
    Write-Ok 'Docker đang tắt — các container IOC đã dừng sẵn'
    return
  }

  $code = Invoke-IocCompose $repoRoot @('stop', '--timeout', '30')
  if ($code -ne 0) {
    # Compose không đọc được cấu hình (thường do .env bị xoá). Dừng thẳng theo nhãn dự
    # án. KHÔNG dùng "compose down": xoá container sẽ mất luôn bản cấu hình duy nhất
    # còn lại mà start-ioc.cmd cần để kết nối lại dữ liệu khi .env đã mất.
    Write-Caution 'Docker Compose không đọc được cấu hình. Dừng trực tiếp các container của dự án.'
    # Tìm theo thư mục làm việc trước: tên dự án có thể đã được đặt riêng và không còn
    # suy ra được từ tên thư mục khi .env không còn.
    $projects = @(Get-IocDirectoryDeployments $repoRoot | ForEach-Object { $_.Project })
    if ($projects.Count -eq 0) { $projects = @(Get-IocComposeProjectName $repoRoot (Read-IocDotEnv $envPath)) }
    foreach ($project in $projects) {
      $ids = Invoke-IocNative 'docker' @('ps', '--quiet', '--filter', "label=com.docker.compose.project=$project")
      foreach ($id in @($ids.Text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
        $stopped = Invoke-IocNative 'docker' @('stop', '-t', '30', $id)
        if ($stopped.ExitCode -ne 0) { throw "Không dừng được container ${id}: $($stopped.Text)" }
      }
    }
  }
  Write-Ok 'Đã dừng container IOC. Volume dữ liệu PostgreSQL không bị xoá.'
}

function Stop-OllamaRuntime {
  Write-Step 'Gỡ model AI khỏi bộ nhớ và dừng Ollama'

  if ($KeepAI) {
    Write-Note 'Để nguyên Ollama theo tham số -KeepAI.'
    return
  }

  $ollama = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($ollama -and (Test-IocEndpoint "$ollamaUrl/api/version" 2)) {
    foreach ($model in $ollamaModels) {
      $null = Invoke-IocNative $ollama.Source @('stop', $model)
    }
  }

  foreach ($service in @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^Ollama' -or $_.DisplayName -match '^Ollama' })) {
    if ($service.Status -ne 'Stopped') { Stop-Service -InputObject $service -Force -ErrorAction SilentlyContinue }
  }

  for ($attempt = 0; $attempt -lt 2 -and @(Get-OllamaProcesses).Count -gt 0; $attempt++) {
    Get-OllamaProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }

  if (@(Get-OllamaProcesses).Count -gt 0) {
    Write-Caution 'Một số tiến trình Ollama vẫn còn chạy.'
  } else {
    Write-Ok 'Đã dừng Ollama, RAM và bộ nhớ GPU đã được giải phóng'
    $script:aiStopped = $true
  }
}

# Container đang chạy không thuộc dự án IOC này — ví dụ cơ sở dữ liệu của dự án khác.
function Get-ForeignContainers {
  $project = Get-IocComposeProjectName $repoRoot (Read-IocDotEnv $envPath)
  # Không dùng {{.Label "..."}}: PowerShell 5.1 làm rơi nháy kép, mẫu hỏng và docker
  # trả lỗi — kiểm tra này sẽ im lặng không bao giờ cảnh báo. Lấy toàn bộ nhãn rồi tự
  # tách nhãn dự án.
  $result = Invoke-IocNative 'docker' @('ps', '--format', '{{.Names}}|{{.Labels}}')
  if ($result.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($result.Text)) { return @() }
  return @($result.Text -split "`n" | ForEach-Object {
      $line = $_.Trim()
      $separator = $line.IndexOf('|')
      if ($separator -lt 1) { return }
      $name = $line.Substring(0, $separator)
      $match = [regex]::Match($line.Substring($separator + 1), '(?:^|,)com\.docker\.compose\.project=([^,]*)')
      $owner = if ($match.Success) { $match.Groups[1].Value } else { '' }
      if ($owner -ne $project) { $name }
    })
}

function Stop-DockerDesktopRuntime {
  Write-Step 'Dừng Docker Desktop'

  if ($KeepDocker) {
    Write-Note 'Để nguyên Docker Desktop theo tham số -KeepDocker.'
    return
  }

  if (Test-DockerEngine) {
    $foreign = @(Get-ForeignContainers)
    if ($foreign.Count -gt 0) {
      Write-Caution "Docker đang chạy container của dự án khác: $($foreign -join ', ')"
      if (-not (Confirm-IocChoice -Question 'Vẫn tắt Docker Desktop? (các container trên cũng sẽ dừng)' -DefaultYes $false)) {
        Write-Note 'Giữ Docker Desktop chạy.'
        return
      }
    }
  }

  $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($docker -and @(Get-DockerDesktopProcesses).Count -gt 0) {
    $result = Invoke-IocNative $docker.Source @('desktop', 'stop', '--timeout', '90')
    if ($result.ExitCode -ne 0) {
      $null = Invoke-IocNative $docker.Source @('desktop', 'stop', '--force', '--timeout', '30')
    }
  }

  Start-Sleep -Seconds 2
  if (@(Get-DockerDesktopProcesses).Count -gt 0) {
    Get-DockerDesktopProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }

  # Chỉ tắt máy ảo WSL của Docker; các bản phân phối Linux khác của người dùng giữ nguyên.
  $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if ($wsl) {
    $running = Invoke-IocNative $wsl.Source @('--list', '--running', '--quiet')
    foreach ($line in ($running.Text -split "`n")) {
      $name = $line.Replace([string][char]0, '').Trim()
      if ($name -like 'docker-desktop*') { $null = Invoke-IocNative $wsl.Source @('--terminate', $name) }
    }
  }

  $remaining = @(Get-DockerDesktopProcesses)
  if ($remaining.Count -gt 0) {
    throw "Docker Desktop vẫn còn chạy: $(($remaining | ForEach-Object { $_.ProcessName }) -join ', ')"
  }
  Write-Ok 'Đã dừng Docker Desktop. Các bản Linux (WSL) khác không bị ảnh hưởng.'
  $script:dockerStopped = $true
}

function Test-IocReleased {
  Write-Step 'Kiểm tra tài nguyên đã được giải phóng'

  $ports = Get-IocPorts (Read-IocDotEnv $envPath)
  $held = New-Object System.Collections.Generic.List[string]
  foreach ($port in @($ports.Web, $ports.Api, $ports.Database)) {
    $owner = Get-IocPortOwner $port
    # Chỉ tính là IOC còn giữ cổng khi chính Docker đang giữ nó. Một PostgreSQL cài sẵn
    # trên máy chiếm 5432 không phải lỗi của việc dừng IOC.
    if ($owner -and (Test-IocDockerPortProcess $owner.ProcessName)) { $held.Add("$port") }
  }
  if (-not $KeepAI -and (Get-IocPortOwner 11434)) { $held.Add('11434') }

  if ($held.Count -gt 0) {
    if ($KeepDocker -or -not $script:dockerStopped) {
      Write-Note "Cổng $($held -join ', ') vẫn mở vì Docker hoặc Ollama còn chạy theo lựa chọn của bạn."
      return
    }
    throw "Cổng vẫn còn mở: $($held -join ', ')"
  }
  Write-Ok "Các cổng $($ports.Web), $($ports.Api), $($ports.Database) đã đóng"
}

$pauseAtEnd = (-not $NoPause) -and (Test-LaunchedFromExplorer)
$exitCode = 0

try {
  Write-Host ''
  Write-Host 'IOC Lái Thiêu — dừng hệ thống' -ForegroundColor White

  Stop-IocContainers
  Stop-OllamaRuntime
  Stop-DockerDesktopRuntime
  Test-IocReleased

  Write-Host ''
  Write-Host 'Đã dừng IOC. Dữ liệu vẫn nằm an toàn trong volume Docker.' -ForegroundColor Green
  Write-Host 'Chạy start-ioc.cmd khi muốn dùng lại.' -ForegroundColor Gray
} catch {
  Write-Host ''
  Write-Problem $_.Exception.Message
  $exitCode = 1
} finally {
  if ($pauseAtEnd) {
    Write-Host ''
    [void](Read-Host 'Nhấn Enter để đóng cửa sổ')
  }
}

exit $exitCode
