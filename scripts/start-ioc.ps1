<#
.SYNOPSIS
  Khởi động toàn bộ hệ thống IOC Lái Thiêu trên Windows, kể cả trên máy chưa cài gì.

.DESCRIPTION
  Chạy qua start-ioc.cmd ở thư mục gốc. Script tự làm theo thứ tự:

    1. Kiểm tra máy: phiên bản Windows, ảo hoá, RAM, dung lượng đĩa.
    2. Tạo file .env từ .env.example với mật khẩu và khoá bí mật ngẫu nhiên.
    3. Kiểm tra Docker Desktop; chưa có thì hỏi để cài bằng winget.
    4. Bật Docker Engine và chờ sẵn sàng.
    5. Kiểm tra các cổng mạng cần dùng có đang bị chiếm không.
    6. (Tuỳ chọn) Cài và bật Ollama, tải model AI.
    7. Build và chạy PostgreSQL, API, web bằng Docker Compose.
    8. Chờ API báo cơ sở dữ liệu sẵn sàng — migration chạy tự động khi API khởi động.
    9. Cơ sở dữ liệu còn trống thì tạo dữ liệu mẫu và tài khoản quản trị.
   10. Kiểm tra OCR và kết nối AI từ trong container, rồi mở trình duyệt.

  Chạy lại nhiều lần đều an toàn: file .env đã có không bị ghi đè, dữ liệu đã có
  không bị tạo lại, mật khẩu đã đặt không bị đổi.

.PARAMETER SkipBuild
  Dùng image Docker đã build từ lần trước, không build lại (khởi động nhanh hơn).

.PARAMETER NoAI
  Bỏ qua hoàn toàn Ollama. Hệ thống vẫn chạy; trích xuất văn bản dùng bộ luật.

.PARAMETER SkipModelPull
  Không tải model AI còn thiếu.

.PARAMETER Yes
  Tự đồng ý mọi câu hỏi (cài phần mềm, tải model). Dùng khi chạy không người trông.
  Điều khoản của Docker Desktop và Ollama vẫn do chính bạn đồng ý khi được hỏi.

.PARAMETER CheckOnly
  Chỉ kiểm tra máy có đủ điều kiện hay không, không cài đặt hay thay đổi gì.

.PARAMETER NoBrowser
  Không tự mở trình duyệt khi xong.

.PARAMETER NoPause
  Không dừng chờ nhấn phím trước khi đóng cửa sổ.
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoAI,
  [switch]$SkipModelPull,
  [switch]$Yes,
  [switch]$CheckOnly,
  [switch]$NoBrowser,
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'ioc-common.ps1')
Initialize-IocConsole

$envPath = Join-Path $repoRoot '.env'
$envTemplatePath = Join-Path $repoRoot '.env.example'
$ollamaUrl = 'http://127.0.0.1:11434'
$dockerDownloadUrl = 'https://www.docker.com/products/docker-desktop/'
$requiredModels = @(
  [pscustomobject]@{ Name = 'qwen3:4b-instruct-2507-q4_K_M'; Size = '2,5 GB'; Purpose = 'trích xuất chỉ tiêu và Copilot' },
  [pscustomobject]@{ Name = 'bge-m3:latest'; Size = '1,2 GB'; Purpose = 'tìm kiếm ngữ nghĩa' }
)

# Mã thoát: 0 = sẵn sàng, 1 = lỗi, 2 = cần người dùng làm một bước rồi chạy lại.
$script:exitCode = 0
$script:aiState = 'chưa kiểm tra'
$script:newAccounts = $null
$script:userAction = $null
$script:problems = New-Object System.Collections.Generic.List[string]

# Dừng script vì cần người dùng tự làm một việc (cài phần mềm, khởi động lại máy...).
# Khác với lỗi: đây là bước bình thường trên máy mới, nên thông báo nhẹ nhàng hơn.
function Stop-ForUserAction([string]$Message) {
  $script:userAction = $Message
  throw $Message
}

# ===========================================================================
#  1. Kiểm tra máy
# ===========================================================================

function Test-Machine {
  Write-Step 'Kiểm tra máy tính'

  $os = Get-CimInstance Win32_OperatingSystem
  $build = [int]$os.BuildNumber
  if ($build -lt 19045) {
    Write-Caution "Windows bản dựng $build đã cũ. Docker Desktop yêu cầu Windows 10 22H2 (19045) trở lên hoặc Windows 11."
    $script:problems.Add('Windows cần cập nhật lên Windows 10 22H2 hoặc Windows 11.')
  } else {
    Write-Ok "$($os.Caption) (bản dựng $build)"
  }

  $ramGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  if ($ramGb -lt 8) {
    Write-Caution "RAM $ramGb GB. Nên có tối thiểu 8 GB; với AI cục bộ nên có 16 GB."
  } else {
    Write-Ok "RAM $ramGb GB"
  }

  try {
    $driveName = (Split-Path -Qualifier $repoRoot).TrimEnd(':')
    $drive = Get-PSDrive -Name $driveName -ErrorAction Stop
    $freeGb = [math]::Round($drive.Free / 1GB, 1)
    if ($freeGb -lt 15) {
      Write-Caution "Ổ ${driveName}: còn trống $freeGb GB. Cần khoảng 10 GB cho Docker và thêm 4 GB nếu dùng AI."
    } else {
      Write-Ok "Ổ ${driveName}: còn trống $freeGb GB"
    }
  } catch {
    # Thư mục mạng (\\may-chu\thu-muc) không có ký tự ổ đĩa; bỏ qua bước này.
  }

  # Docker Desktop cần ảo hoá phần cứng. KHÔNG tin riêng cờ VirtualizationFirmwareEnabled:
  # khi Hyper-V/WSL 2 đang chạy, hypervisor giấu cờ này và Windows báo "False" dù ảo
  # hoá đang hoạt động. Chỉ cảnh báo khi cả hai dấu hiệu đều cho thấy ảo hoá tắt.
  $hypervisor = $false
  try { $hypervisor = [bool](Get-CimInstance Win32_ComputerSystem).HypervisorPresent } catch { }
  $firmware = @(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue |
      ForEach-Object { $_.VirtualizationFirmwareEnabled })
  if ($hypervisor) {
    Write-Ok 'Ảo hoá phần cứng đang hoạt động'
  } elseif ($firmware.Count -gt 0 -and -not ($firmware -contains $true)) {
    Write-Caution 'Có vẻ ảo hoá phần cứng (Intel VT-x / AMD-V) đang TẮT trong BIOS/UEFI.'
    Write-Note 'Nếu Docker Desktop không khởi động được, hãy bật "Virtualization Technology" trong BIOS.'
  }
}

# ===========================================================================
#  2. File cấu hình .env
# ===========================================================================

# Một số giá trị có thể được chỉ định trước qua biến môi trường khi tạo .env lần đầu,
# chủ yếu để đổi cổng khi máy đã có dịch vụ khác chiếm 8080, 3000 hoặc 5432.
$envOverrideKeys = @('COMPOSE_PROJECT_NAME', 'IOC_INSTANCE', 'IMAGE_TAG', 'WEB_PORT', 'API_PORT', 'POSTGRES_PORT', 'WEB_BIND_ADDRESS')

function Get-DatabaseUrl($Settings, [string]$Password) {
  $user = [uri]::EscapeDataString((Get-IocSetting $Settings 'POSTGRES_USER' 'ioc_admin'))
  $database = [uri]::EscapeDataString((Get-IocSetting $Settings 'POSTGRES_DB' 'ioc_laithieu'))
  $port = Get-IocSetting $Settings 'POSTGRES_PORT' '5432'
  $secret = [uri]::EscapeDataString($Password)
  return "postgresql://${user}:${secret}@localhost:${port}/${database}?schema=public"
}

# Volume dữ liệu đã tồn tại nghĩa là PostgreSQL đã được khởi tạo với mật khẩu cũ.
# Đổi POSTGRES_PASSWORD lúc này sẽ khoá API ra khỏi chính cơ sở dữ liệu của nó.
function Test-DatabaseVolumeExists {
  if (-not (Find-DockerCli)) { return $false }
  $project = Get-IocComposeProjectName $repoRoot (Read-IocDotEnv $envPath)
  $result = Invoke-IocNative 'docker' @(
    'volume', 'ls', '--quiet',
    '--filter', "label=com.docker.compose.project=$project",
    '--filter', 'label=com.docker.compose.volume=ioc_postgres_data'
  )
  return ($result.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($result.Text))
}

function Initialize-EnvFile {
  Write-Step 'Chuẩn bị file cấu hình .env'

  if (-not (Test-Path -LiteralPath $envTemplatePath)) {
    throw 'Không tìm thấy .env.example. Thư mục dự án có thể chưa được tải về đầy đủ.'
  }

  if (Test-Path -LiteralPath $envPath) {
    Write-Ok '.env đã có sẵn — giữ nguyên, chỉ thay những giá trị còn là mẫu'
    Repair-EnvFile
    return
  }

  if ($CheckOnly) {
    Write-Note 'Chưa có .env. Khi chạy thật, script sẽ tự tạo với khoá bí mật ngẫu nhiên.'
    return
  }

  Copy-Item -LiteralPath $envTemplatePath -Destination $envPath
  foreach ($key in $envOverrideKeys) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      Set-IocDotEnvValue $envPath $key $value
      Write-Note "Dùng $key=$value từ biến môi trường"
    }
  }

  $settings = Read-IocDotEnv $envPath
  $databasePassword = New-IocDatabasePassword
  $webPort = Get-IocSetting $settings 'WEB_PORT' '8080'

  Set-IocDotEnvValue $envPath 'POSTGRES_PASSWORD' $databasePassword
  Set-IocDotEnvValue $envPath 'DATABASE_URL' (Get-DatabaseUrl $settings $databasePassword)
  Set-IocDotEnvValue $envPath 'DIRECT_URL' (Get-DatabaseUrl $settings $databasePassword)
  Set-IocDotEnvValue $envPath 'JWT_SECRET' (New-IocSecret 64)
  Set-IocDotEnvValue $envPath 'PASSWORD_RESET_PEPPER' (New-IocSecret 64)
  Set-IocDotEnvValue $envPath 'DEMO_ADMIN_PASSWORD' (New-IocLoginPassword)
  Set-IocDotEnvValue $envPath 'DEMO_USER_PASSWORD' (New-IocLoginPassword)
  Set-IocDotEnvValue $envPath 'PUBLIC_APP_URL' "http://localhost:$webPort"

  Write-Ok 'Đã tạo .env với mật khẩu cơ sở dữ liệu, khoá JWT và mật khẩu đăng nhập ngẫu nhiên'
  Write-Note 'File này chứa bí mật: không gửi cho người khác và không đưa lên Git (đã có trong .gitignore).'
}

# .env có từ trước (ví dụ ai đó đã sao chép .env.example theo hướng dẫn cũ) có thể còn
# giá trị mẫu. API từ chối khởi động với JWT_SECRET mẫu, nên thay những giá trị đó.
function Repair-EnvFile {
  $settings = Read-IocDotEnv $envPath
  $changes = New-Object System.Collections.Generic.List[string]

  if (Test-IocPlaceholder ([string]$settings['JWT_SECRET'])) {
    if (-not $CheckOnly) { Set-IocDotEnvValue $envPath 'JWT_SECRET' (New-IocSecret 64) }
    $changes.Add('JWT_SECRET')
  }

  $pepper = if ($settings.Contains('PASSWORD_RESET_PEPPER')) { [string]$settings['PASSWORD_RESET_PEPPER'] } else { '' }
  if (-not [string]::IsNullOrWhiteSpace($pepper) -and (Test-IocPlaceholder $pepper)) {
    if (-not $CheckOnly) { Set-IocDotEnvValue $envPath 'PASSWORD_RESET_PEPPER' (New-IocSecret 64) }
    $changes.Add('PASSWORD_RESET_PEPPER')
  }

  $databasePassword = if ($settings.Contains('POSTGRES_PASSWORD')) { [string]$settings['POSTGRES_PASSWORD'] } else { '' }
  if (Test-IocPlaceholder $databasePassword) {
    if (Test-DatabaseVolumeExists) {
      Write-Caution 'POSTGRES_PASSWORD vẫn là giá trị mẫu, nhưng cơ sở dữ liệu đã được khởi tạo với chính giá trị đó.'
      Write-Note 'Giữ nguyên để API còn kết nối được. Muốn đổi, hãy đổi trong PostgreSQL trước rồi mới sửa .env.'
    } else {
      $newPassword = New-IocDatabasePassword
      if (-not $CheckOnly) {
        Set-IocDotEnvValue $envPath 'POSTGRES_PASSWORD' $newPassword
        Set-IocDotEnvValue $envPath 'DATABASE_URL' (Get-DatabaseUrl $settings $newPassword)
        Set-IocDotEnvValue $envPath 'DIRECT_URL' (Get-DatabaseUrl $settings $newPassword)
      }
      $changes.Add('POSTGRES_PASSWORD')
    }
  }

  if ($changes.Count -gt 0) {
    $verb = if ($CheckOnly) { 'Sẽ thay' } else { 'Đã thay' }
    Write-Ok "$verb giá trị mẫu bằng khoá ngẫu nhiên: $($changes -join ', ')"
  }
}

# ===========================================================================
#  3–4. Docker Desktop
# ===========================================================================

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Find-DockerCli {
  $command = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidate = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'
  if (Test-Path -LiteralPath $candidate) {
    # Vừa cài xong nhưng cửa sổ này mở từ trước nên PATH chưa có Docker.
    $env:Path = "$(Split-Path -Parent $candidate);$env:Path"
    return $candidate
  }
  return $null
}

function Find-DockerDesktopApp {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Install-DockerDesktop {
  Write-Caution 'Máy chưa cài Docker Desktop — phần mềm bắt buộc để chạy cơ sở dữ liệu, API và web.'

  if ($CheckOnly) {
    $script:problems.Add("Cần cài Docker Desktop: $dockerDownloadUrl")
    return
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Note 'Máy không có winget để cài tự động. Trang tải Docker Desktop sẽ được mở.'
    Start-Process $dockerDownloadUrl
    Stop-ForUserAction 'Hãy cài Docker Desktop, khởi động lại máy nếu được yêu cầu, rồi chạy lại start-ioc.cmd.'
  }

  if (-not (Confirm-IocChoice -Question 'Cài Docker Desktop ngay bây giờ bằng winget? (khoảng 600 MB, cần quyền quản trị)' -AssumeYes:$Yes)) {
    Start-Process $dockerDownloadUrl
    Stop-ForUserAction 'Đã bỏ qua cài đặt. Hãy tự cài Docker Desktop rồi chạy lại start-ioc.cmd.'
  }

  # Không truyền --accept-package-agreements: điều khoản của Docker phải do chính người
  # dùng đồng ý khi winget hỏi, không để script đồng ý thay.
  Write-Note 'Windows có thể hỏi quyền quản trị, và winget có thể hỏi bạn đồng ý điều khoản của Docker.'
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $winget.Source install --exact --id Docker.DockerDesktop --source winget
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($code -ne 0) {
    Start-Process $dockerDownloadUrl
    Stop-ForUserAction "winget không cài được Docker Desktop (mã $code). Hãy cài thủ công từ trang vừa mở rồi chạy lại start-ioc.cmd."
  }

  Update-SessionPath
  Write-Ok 'Đã cài Docker Desktop'
  Write-Caution 'Docker Desktop cần ĐĂNG XUẤT hoặc KHỞI ĐỘNG LẠI Windows để hoàn tất cài đặt.'
  Stop-ForUserAction 'Hãy khởi động lại máy, rồi chạy lại start-ioc.cmd — script sẽ tự làm tiếp từ bước này.'
}

function Get-DockerEngineError {
  $result = Invoke-IocNative 'docker' @('info', '--format', '{{.ServerVersion}}')
  if ($result.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($result.Text)) { return $null }
  if ([string]::IsNullOrWhiteSpace($result.Text)) { return 'Docker Engine không phản hồi.' }
  return $result.Text
}

function Show-DockerDiagnostics([string]$LastError) {
  Write-Problem 'Docker Engine không khởi động được.'

  if ($LastError -match '(?i)access is denied|permission denied|docker-users') {
    Write-Note 'Tài khoản Windows này chưa có quyền dùng Docker.'
    Write-Note 'Mở "Computer Management" > "Local Users and Groups" > nhóm "docker-users", thêm tài khoản của bạn,'
    Write-Note 'rồi đăng xuất và đăng nhập lại Windows.'
    return
  }

  if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    $wsl = Invoke-IocNative 'wsl.exe' @('--status')
    if ($wsl.ExitCode -ne 0) {
      Write-Note 'WSL 2 (nền tảng Linux mà Docker Desktop dùng) chưa được cài.'
      Write-Note 'Mở PowerShell bằng quyền quản trị và chạy: wsl --install --no-distribution'
      Write-Note 'Sau đó khởi động lại máy và chạy lại start-ioc.cmd.'
      return
    }
  }

  Write-Note 'Hãy mở Docker Desktop từ menu Start để xem thông báo lỗi cụ thể của nó.'
  if (-not [string]::IsNullOrWhiteSpace($LastError)) {
    Write-Note "Chi tiết: $(($LastError -split "`n")[0])"
  }
}

function Test-ComposeAvailable {
  $result = Invoke-IocNative 'docker' @('compose', 'version', '--short')
  if ($result.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($result.Text)) {
    throw 'Docker Compose v2 chưa có. Hãy cập nhật Docker Desktop lên bản mới nhất.'
  }
  Write-Ok "Docker Compose $($result.Text)"
}

function Start-DockerEngine {
  Write-Step 'Kiểm tra Docker'

  if (-not (Find-DockerCli)) {
    Install-DockerDesktop
    return
  }

  $version = Invoke-IocNative 'docker' @('version', '--format', '{{.Client.Version}}')
  Write-Ok "Đã cài Docker $($version.Text)"

  if (-not (Get-DockerEngineError)) {
    Write-Ok 'Docker Engine đang chạy'
    Test-ComposeAvailable
    return
  }

  if ($CheckOnly) {
    Write-Note 'Docker Engine đang tắt. Khi chạy thật, script sẽ tự bật Docker Desktop.'
    return
  }

  Write-Note 'Docker Engine đang tắt — đang bật Docker Desktop...'
  $viaCli = Invoke-IocNative 'docker' @('desktop', 'start', '--detach')
  if ($viaCli.ExitCode -ne 0) {
    # Docker Desktop bản cũ chưa có lệnh "docker desktop"; mở thẳng ứng dụng.
    $app = Find-DockerDesktopApp
    if (-not $app) {
      Stop-ForUserAction 'Không tìm thấy Docker Desktop để bật. Hãy mở Docker Desktop từ menu Start rồi chạy lại start-ioc.cmd.'
    }
    Start-Process -FilePath $app
  }

  Write-Note 'Lần đầu mở, Docker Desktop có thể hỏi bạn đồng ý điều khoản sử dụng — hãy xử lý trong cửa sổ Docker Desktop.'
  Write-Note 'Script sẽ tự chờ tới khi Docker sẵn sàng (tối đa 5 phút).'

  $deadline = (Get-Date).AddMinutes(5)
  $nextReport = (Get-Date).AddSeconds(20)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    $lastError = Get-DockerEngineError
    if (-not $lastError) {
      Write-Ok 'Docker Engine đã sẵn sàng'
      Test-ComposeAvailable
      return
    }
    if ((Get-Date) -ge $nextReport) {
      $remaining = [math]::Ceiling(($deadline - (Get-Date)).TotalSeconds)
      Write-Note "Vẫn đang chờ Docker Desktop khởi động... (còn tối đa $remaining giây)"
      $nextReport = (Get-Date).AddSeconds(20)
    }
    Start-Sleep -Seconds 3
  }

  Show-DockerDiagnostics $lastError
  Stop-ForUserAction 'Khi Docker Desktop hiện trạng thái "Engine running", hãy chạy lại start-ioc.cmd.'
}

# ===========================================================================
#  5. Cổng mạng
# ===========================================================================

function Test-RequiredPorts {
  Write-Step 'Kiểm tra cổng mạng'

  $settings = Read-IocDotEnv $envPath
  $ports = Get-IocPorts $settings
  $instance = Get-IocSetting $settings 'IOC_INSTANCE' 'ioc-laithieu'
  $labels = @{ Web = 'WEB_PORT'; Api = 'API_PORT'; Database = 'POSTGRES_PORT' }

  # Cổng do chính các container IOC đang giữ thì không phải xung đột.
  $ourPorts = @()
  $published = Invoke-IocNative 'docker' @('ps', '--filter', "name=^$instance-", '--format', '{{.Ports}}')
  if ($published.ExitCode -eq 0) {
    foreach ($match in [regex]::Matches($published.Text, ':(\d+)->')) { $ourPorts += [int]$match.Groups[1].Value }
  }

  $blocked = $false
  foreach ($entry in $ports.GetEnumerator()) {
    $owner = Get-IocPortOwner $entry.Value
    if (-not $owner) {
      Write-Ok "Cổng $($entry.Value) ($($labels[$entry.Key])) đang trống"
      continue
    }
    if ($ourPorts -contains $entry.Value) {
      Write-Ok "Cổng $($entry.Value) đang do chính IOC dùng"
      continue
    }

    $blocked = $true
    if (Test-IocDockerPortProcess $owner.ProcessName) {
      Write-Problem "Cổng $($entry.Value) đang bị một container Docker khác chiếm."
      Write-Note 'Có thể là một bản IOC khác hoặc một dự án khác. Xem bằng lệnh: docker ps'
    } else {
      Write-Problem "Cổng $($entry.Value) đang bị chương trình '$($owner.ProcessName)' (PID $($owner.ProcessId)) chiếm."
    }
    Write-Note "Cách sửa: tắt chương trình đó, hoặc mở .env và đổi $($labels[$entry.Key]) sang cổng khác."
  }

  if ($blocked) {
    if ($CheckOnly) { $script:problems.Add('Có cổng mạng đang bị chiếm (xem chi tiết ở trên).') }
    else { Stop-ForUserAction 'Hãy giải phóng cổng hoặc đổi cổng trong .env, rồi chạy lại start-ioc.cmd.' }
  }
}

# ===========================================================================
#  6. Ollama — lớp AI cục bộ (không bắt buộc)
#
#  Không có Ollama hệ thống vẫn chạy đầy đủ: trích xuất văn bản tự hạ cấp về bộ luật
#  và Copilot hiểu lệnh bằng từ khoá. Vì vậy mọi trục trặc ở đây chỉ là cảnh báo,
#  không bao giờ được chặn việc khởi động hệ thống.
# ===========================================================================

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
  return $null
}

function ConvertTo-ModelName([string]$Name) {
  if ($Name.Contains(':')) { return $Name }
  return "${Name}:latest"
}

function Get-MissingModels {
  $tags = Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -TimeoutSec 10 -UseBasicParsing
  $installed = @($tags.models | ForEach-Object { ConvertTo-ModelName ([string]$_.name) })
  return @($requiredModels | Where-Object { (ConvertTo-ModelName $_.Name) -notin $installed })
}

function Start-Ollama {
  Write-Step 'Kiểm tra AI cục bộ (Ollama)'
  try {
    Start-OllamaCore
  } catch {
    Write-Caution "Không chuẩn bị được AI cục bộ: $($_.Exception.Message)"
    Write-Note 'Hệ thống vẫn khởi động; trích xuất văn bản tạm dùng bộ luật.'
    $script:aiState = 'lỗi khi chuẩn bị (trích xuất dùng bộ luật)'
  }
}

function Start-OllamaCore {
  if ($NoAI) {
    $script:aiState = 'đã tắt theo tham số -NoAI (trích xuất dùng bộ luật)'
    Write-Note 'Bỏ qua theo tham số -NoAI.'
    return
  }

  $ollamaExe = Find-OllamaExecutable
  if (-not $ollamaExe) {
    Write-Caution 'Chưa cài Ollama. Hệ thống vẫn chạy được, nhưng trích xuất văn bản sẽ dùng bộ luật thay vì AI.'
    if ($CheckOnly) {
      $script:aiState = 'chưa cài Ollama'
      return
    }
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
      Write-Note 'Muốn bật AI: cài Ollama tại https://ollama.com/download rồi chạy lại start-ioc.cmd.'
      $script:aiState = 'chưa cài Ollama (trích xuất dùng bộ luật)'
      return
    }
    if (-not (Confirm-IocChoice -Question 'Cài Ollama để bật trích xuất bằng AI? (khoảng 1 GB, chưa gồm model)' -DefaultYes $true -AssumeYes:$Yes)) {
      $script:aiState = 'bỏ qua cài Ollama (trích xuất dùng bộ luật)'
      return
    }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & $winget.Source install --exact --id Ollama.Ollama --source winget
      $code = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
      Write-Caution "winget không cài được Ollama (mã $code). Tiếp tục mà không có AI."
      $script:aiState = 'cài Ollama thất bại (trích xuất dùng bộ luật)'
      return
    }
    Update-SessionPath
    $ollamaExe = Find-OllamaExecutable
    if (-not $ollamaExe) {
      $script:aiState = 'đã cài Ollama nhưng chưa tìm thấy — mở lại cửa sổ rồi chạy lại'
      return
    }
    Write-Ok 'Đã cài Ollama'
  }

  if (-not (Test-IocEndpoint "$ollamaUrl/api/version")) {
    if ($CheckOnly) {
      Write-Note 'Ollama đã cài nhưng đang tắt. Khi chạy thật, script sẽ tự bật.'
      $script:aiState = 'đã cài, đang tắt'
      return
    }
    Write-Note 'Đang bật Ollama...'
    $oldFlash = $env:OLLAMA_FLASH_ATTENTION
    $oldCache = $env:OLLAMA_KV_CACHE_TYPE
    try {
      if (-not $env:OLLAMA_FLASH_ATTENTION) { $env:OLLAMA_FLASH_ATTENTION = '1' }
      if (-not $env:OLLAMA_KV_CACHE_TYPE) { $env:OLLAMA_KV_CACHE_TYPE = 'q8_0' }
      Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
    } finally {
      $env:OLLAMA_FLASH_ATTENTION = $oldFlash
      $env:OLLAMA_KV_CACHE_TYPE = $oldCache
    }

    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline -and -not (Test-IocEndpoint "$ollamaUrl/api/version")) { Start-Sleep -Seconds 2 }
    if (-not (Test-IocEndpoint "$ollamaUrl/api/version")) {
      Write-Caution 'Ollama không phản hồi sau 60 giây. Tiếp tục mà không có AI.'
      $script:aiState = 'Ollama không khởi động được (trích xuất dùng bộ luật)'
      return
    }
  }
  Write-Ok 'Ollama đang chạy'

  $missing = @(Get-MissingModels)
  if ($missing.Count -eq 0) {
    Write-Ok "Đủ model: $(($requiredModels | ForEach-Object { $_.Name }) -join ', ')"
    $script:aiState = 'sẵn sàng'
    return
  }

  foreach ($model in $missing) {
    Write-Caution "Thiếu model $($model.Name) ($($model.Size), dùng cho $($model.Purpose))"
  }
  if ($CheckOnly -or $SkipModelPull) {
    $script:aiState = "thiếu model: $(($missing | ForEach-Object { $_.Name }) -join ', ')"
    return
  }
  if (-not (Confirm-IocChoice -Question 'Tải các model còn thiếu ngay bây giờ? (có thể mất vài chục phút)' -DefaultYes $true -AssumeYes:$Yes)) {
    $script:aiState = 'bỏ qua tải model (trích xuất dùng bộ luật)'
    return
  }

  foreach ($model in $missing) {
    Write-Note "Đang tải $($model.Name)..."
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & $ollamaExe pull $model.Name
      $code = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
      Write-Caution "Không tải được $($model.Name). Có thể thử lại sau bằng lệnh: ollama pull $($model.Name)"
    }
  }

  $stillMissing = @(Get-MissingModels)
  if ($stillMissing.Count -eq 0) {
    Write-Ok 'Đã tải xong model'
    $script:aiState = 'sẵn sàng'
  } else {
    $script:aiState = "thiếu model: $(($stillMissing | ForEach-Object { $_.Name }) -join ', ')"
  }
}

# ===========================================================================
#  7–8. Chạy hệ thống
# ===========================================================================

function Show-ServiceLogs([string]$Service, [int]$Lines = 60) {
  Write-Note "---- $Lines dòng nhật ký gần nhất của dịch vụ '$Service' ----"
  $null = Invoke-IocCompose $repoRoot @('logs', '--no-color', '--tail', "$Lines", $Service)
  Write-Note '---- hết nhật ký ----'
}

function Get-ServiceContainerId([string]$Service) {
  $result = Get-IocComposeOutput $repoRoot @('ps', '--all', '--quiet', $Service)
  if ($result.ExitCode -ne 0) { return '' }
  return (($result.Text -split "`n")[0]).Trim()
}

function Get-ServiceStatus([string]$Service) {
  $id = Get-ServiceContainerId $Service
  if (-not $id) { return $null }
  $result = Invoke-IocNative 'docker' @('inspect', '--format', '{{.State.Status}}|{{.RestartCount}}', $id)
  if ($result.ExitCode -ne 0) { return $null }
  $parts = $result.Text.Split('|')
  return [pscustomobject]@{ State = $parts[0]; Restarts = [int]$parts[1] }
}

function Start-IocStack {
  Write-Step 'Khởi động cơ sở dữ liệu, API và web'

  $validation = Get-IocComposeOutput $repoRoot @('config', '--quiet')
  if ($validation.ExitCode -ne 0) {
    Write-Problem $validation.Text
    throw 'File docker-compose.yml hoặc .env không hợp lệ.'
  }

  if ($SkipBuild) {
    Write-Note 'Dùng image đã build từ lần trước (-SkipBuild).'
    $code = Invoke-IocCompose $repoRoot @('up', '--detach')
  } else {
    Write-Note 'Lần build đầu tiên có thể mất 5–10 phút; các lần sau nhanh hơn nhiều nhờ bộ nhớ đệm.'
    $code = Invoke-IocCompose $repoRoot @('up', '--detach', '--build')
  }

  if ($code -ne 0) {
    foreach ($service in @('postgres', 'api')) {
      $status = Get-ServiceStatus $service
      if ($status -and $status.State -ne 'running') { Show-ServiceLogs $service 40 }
    }
    throw 'Docker Compose không khởi động được hệ thống (xem thông báo và nhật ký ở trên).'
  }
  Write-Ok 'Các container đã chạy'
}

# API chạy migration TRƯỚC khi mở cổng, và health check truy vấn cơ sở dữ liệu. Vì vậy
# health check trả về "ok" nghĩa là: cơ sở dữ liệu chạy và migration đã áp dụng xong.
function Wait-IocHealthy {
  Write-Step 'Chờ API áp dụng migration và sẵn sàng'

  $ports = Get-IocPorts (Read-IocDotEnv $envPath)
  $healthUrl = "http://127.0.0.1:$($ports.Api)/api/health"

  $deadline = (Get-Date).AddMinutes(4)
  $nextReport = (Get-Date).AddSeconds(20)
  $healthy = $false
  while ((Get-Date) -lt $deadline) {
    if (Test-IocEndpoint $healthUrl) {
      $healthy = $true
      break
    }

    # Container API khởi động lại liên tục thì chờ tiếp cũng vô ích: báo lỗi ngay kèm
    # nhật ký, thay vì bắt người dùng ngồi chờ hết 4 phút.
    $status = Get-ServiceStatus 'api'
    if ($status -and ($status.State -in @('exited', 'dead') -or $status.Restarts -ge 2)) {
      Show-ServiceLogs 'api'
      throw 'API dừng trong lúc khởi động (thường do migration lỗi hoặc cấu hình .env sai — xem nhật ký ở trên).'
    }

    if ((Get-Date) -ge $nextReport) {
      Write-Note 'Vẫn đang chờ API... (lần đầu chạy migration có thể mất thêm chút thời gian)'
      $nextReport = (Get-Date).AddSeconds(20)
    }
    Start-Sleep -Seconds 3
  }

  if (-not $healthy) {
    Show-ServiceLogs 'api'
    throw "API không sẵn sàng sau 4 phút: $healthUrl"
  }
  Write-Ok 'API đã sẵn sàng, cơ sở dữ liệu đã ở lược đồ mới nhất'

  $webUrl = "http://127.0.0.1:$($ports.Web)/"
  $deadline = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $deadline -and -not (Test-IocEndpoint $webUrl)) { Start-Sleep -Seconds 2 }
  if (-not (Test-IocEndpoint $webUrl)) {
    Show-ServiceLogs 'web' 30
    throw "Web không phản hồi sau 2 phút: $webUrl"
  }
  Write-Ok 'Web đã sẵn sàng'
}

# ===========================================================================
#  9. Dữ liệu ban đầu
# ===========================================================================

# psql chạy bên trong container PostgreSQL qua socket cục bộ — ảnh chính thức của
# PostgreSQL tin cậy kết nối này nên không cần truyền mật khẩu qua dòng lệnh.
function Get-UserCount {
  $settings = Read-IocDotEnv $envPath
  $user = Get-IocSetting $settings 'POSTGRES_USER' 'ioc_admin'
  $database = Get-IocSetting $settings 'POSTGRES_DB' 'ioc_laithieu'
  $result = Get-IocComposeOutput $repoRoot @(
    'exec', '-T', 'postgres', 'psql', '-U', $user, '-d', $database, '-tAc', 'SELECT COUNT(*) FROM "User"'
  )
  if ($result.ExitCode -ne 0) {
    throw "Không đọc được bảng tài khoản trong cơ sở dữ liệu: $($result.Text)"
  }
  return [int](($result.Text -split "`n")[-1].Trim())
}

function Initialize-DemoData {
  Write-Step 'Kiểm tra dữ liệu ban đầu'

  $count = Get-UserCount
  if ($count -gt 0) {
    Write-Ok "Cơ sở dữ liệu đã có $count tài khoản — không tạo lại dữ liệu"
    return
  }

  Write-Note 'Cơ sở dữ liệu còn trống: chưa có tài khoản nào để đăng nhập.'
  Write-Note 'Đang tạo phòng ban, chỉ tiêu mẫu, tài khoản quản trị và tài khoản dùng thử...'

  # Image build từ phiên bản cũ chưa có lệnh "seed" trong entrypoint; gọi nó sẽ khởi
  # động thêm một tiến trình API thay vì tạo dữ liệu.
  $supportsSeed = Get-IocComposeOutput $repoRoot @('exec', '-T', 'api', 'grep', '-q', 'seed)', 'docker-entrypoint.sh')
  if ($supportsSeed.ExitCode -ne 0) {
    throw 'Image API đang dùng là bản cũ, chưa hỗ trợ tạo dữ liệu ban đầu. Hãy chạy lại start-ioc.cmd KHÔNG kèm -SkipBuild.'
  }

  $settings = Read-IocDotEnv $envPath
  $adminPassword = if ($settings.Contains('DEMO_ADMIN_PASSWORD')) { [string]$settings['DEMO_ADMIN_PASSWORD'] } else { '' }
  $userPassword = if ($settings.Contains('DEMO_USER_PASSWORD')) { [string]$settings['DEMO_USER_PASSWORD'] } else { '' }

  # Chỉ đổi mật khẩu mẫu trong .env khi CHƯA có tài khoản nào — lúc này chúng chưa được
  # dùng ở đâu. Seed chạy trong môi trường production nên từ chối mật khẩu yếu/mặc định.
  if (-not (Test-IocStrongLoginPassword $adminPassword 'Admin@12345')) {
    $adminPassword = New-IocLoginPassword
    Set-IocDotEnvValue $envPath 'DEMO_ADMIN_PASSWORD' $adminPassword
  }
  if (-not (Test-IocStrongLoginPassword $userPassword 'Demo@12345') -or $userPassword -eq $adminPassword) {
    $userPassword = New-IocLoginPassword
    Set-IocDotEnvValue $envPath 'DEMO_USER_PASSWORD' $userPassword
  }

  $code = Invoke-IocCompose $repoRoot @(
    'exec', '-T',
    '-e', "DEMO_ADMIN_PASSWORD=$adminPassword",
    '-e', "DEMO_USER_PASSWORD=$userPassword",
    'api', './docker-entrypoint.sh', 'seed'
  )
  if ($code -ne 0) { throw 'Tạo dữ liệu ban đầu thất bại (xem thông báo ở trên).' }

  $count = Get-UserCount
  if ($count -eq 0) { throw 'Tạo dữ liệu chạy xong nhưng vẫn chưa có tài khoản nào.' }

  Write-Ok "Đã tạo dữ liệu ban đầu ($count tài khoản)"
  $script:newAccounts = [pscustomobject]@{
    AdminPassword = $adminPassword
    UserPassword = $userPassword
  }
}

# ===========================================================================
#  10. Kiểm tra từ bên trong container
# ===========================================================================

function Test-ContainerDependencies {
  Write-Step 'Kiểm tra OCR và AI từ bên trong container API'

  $languages = Get-IocComposeOutput $repoRoot @('exec', '-T', 'api', 'tesseract', '--list-langs')
  $list = @($languages.Text -split "`r?`n" | ForEach-Object { $_.Trim() })
  if ($languages.ExitCode -ne 0 -or $list -notcontains 'vie' -or $list -notcontains 'eng') {
    Write-Caution 'Tesseract trong container thiếu dữ liệu tiếng Việt hoặc tiếng Anh. Hãy chạy lại không kèm -SkipBuild.'
    $script:problems.Add('OCR chưa sẵn sàng trong container API.')
  } else {
    Write-Ok 'OCR sẵn sàng (tiếng Việt, tiếng Anh)'
  }

  if ($NoAI -or $script:aiState -ne 'sẵn sàng') { return }

  $probe = "fetch(process.env.OLLAMA_BASE_URL+'/api/tags').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
  $reach = Get-IocComposeOutput $repoRoot @('exec', '-T', 'api', 'node', '-e', $probe)
  if ($reach.ExitCode -ne 0) {
    Write-Caution 'Container API chưa kết nối được tới Ollama trên máy. Trích xuất sẽ tạm dùng bộ luật.'
    $script:aiState = 'Ollama chạy nhưng container chưa kết nối được'
  } else {
    Write-Ok 'Container API kết nối được tới Ollama'
  }
}

# ===========================================================================
#  Tổng kết
# ===========================================================================

function Show-Summary {
  $ports = Get-IocPorts (Read-IocDotEnv $envPath)
  $web = "http://localhost:$($ports.Web)"

  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Green
  Write-Host '  IOC Lái Thiêu đã sẵn sàng' -ForegroundColor Green
  Write-Host '============================================================' -ForegroundColor Green
  Write-Host "  Cổng thông tin      $web"
  Write-Host "  Đăng nhập quản trị  $web/admin/login"
  Write-Host "  Gửi phản ánh        $web/phan-anh"
  Write-Host "  Kiểm tra API        http://localhost:$($ports.Api)/api/health"
  Write-Host "  AI cục bộ           $($script:aiState)"

  if ($script:newAccounts) {
    Write-Host ''
    Write-Host '  TÀI KHOẢN VỪA ĐƯỢC TẠO — hãy lưu lại:' -ForegroundColor Yellow
    Write-Host "    Quản trị     admin  /  $($script:newAccounts.AdminPassword)" -ForegroundColor Yellow
    Write-Host '    Dùng thử     lan.anh, staff.ktht, viewer.ktht, manager.vhxh' -ForegroundColor Yellow
    Write-Host "                 (chung một mật khẩu)  /  $($script:newAccounts.UserPassword)" -ForegroundColor Yellow
    Write-Host '    Hai mật khẩu này cũng được lưu trong file .env (DEMO_ADMIN_PASSWORD, DEMO_USER_PASSWORD).' -ForegroundColor Gray
    Write-Host '    Nên đổi mật khẩu quản trị tại "Hồ sơ & bảo mật" sau khi đăng nhập.' -ForegroundColor Gray
  }

  if ($script:problems.Count -gt 0) {
    Write-Host ''
    Write-Host '  Cần lưu ý:' -ForegroundColor Yellow
    foreach ($problem in $script:problems) { Write-Host "    - $problem" -ForegroundColor Yellow }
  }

  Write-Host ''
  Write-Host '  Dừng hệ thống: chạy stop-ioc.cmd (dữ liệu được giữ nguyên).' -ForegroundColor Gray
  Write-Host ''

  if (-not $NoBrowser -and (Test-Interactive)) {
    Start-Process $web
  }
}

function Show-CheckReport {
  Write-Host ''
  if ($script:problems.Count -eq 0) {
    Write-Host 'Máy đủ điều kiện. Chạy start-ioc.cmd (không kèm -CheckOnly) để khởi động.' -ForegroundColor Green
  } else {
    Write-Host 'Cần xử lý trước khi khởi động:' -ForegroundColor Yellow
    foreach ($problem in $script:problems) { Write-Host "  - $problem" -ForegroundColor Yellow }
    $script:exitCode = 2
  }
  Write-Host "AI cục bộ: $($script:aiState)"
}

# ===========================================================================
#  Chạy
# ===========================================================================

$pauseAtEnd = (-not $NoPause) -and (Test-LaunchedFromExplorer)

try {
  Write-Host ''
  Write-Host 'IOC Lái Thiêu — trình khởi động' -ForegroundColor White
  if ($CheckOnly) { Write-Host 'Chế độ chỉ kiểm tra: không cài đặt và không thay đổi gì.' -ForegroundColor Gray }

  Test-Machine
  Initialize-EnvFile
  Start-DockerEngine

  if ($CheckOnly) {
    if (Find-DockerCli) { Test-RequiredPorts }
    Start-Ollama
    Show-CheckReport
  } else {
    Test-RequiredPorts
    Start-Ollama
    Start-IocStack
    Wait-IocHealthy
    Initialize-DemoData
    Test-ContainerDependencies
    Show-Summary
  }
} catch {
  Write-Host ''
  if ($script:userAction) {
    Write-Host "CẦN BẠN XỬ LÝ: $($script:userAction)" -ForegroundColor Yellow
    $script:exitCode = 2
  } else {
    Write-Problem $_.Exception.Message
    Write-Note 'Chạy lại start-ioc.cmd sau khi xử lý. Dữ liệu hiện có không bị ảnh hưởng.'
    $script:exitCode = 1
  }
} finally {
  if ($pauseAtEnd) {
    Write-Host ''
    [void](Read-Host 'Nhấn Enter để đóng cửa sổ')
  }
}

exit $script:exitCode
