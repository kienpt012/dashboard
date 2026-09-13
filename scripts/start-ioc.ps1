<#
.SYNOPSIS
  Khởi động toàn bộ hệ thống IOC Lái Thiêu trên Windows, kể cả trên máy chưa cài gì.

.DESCRIPTION
  Chạy qua start-ioc.cmd ở thư mục gốc. Script tự làm theo thứ tự:

    1. Kiểm tra máy (Windows, ảo hoá, RAM, đĩa) và bản clone có đủ file không.
    2. Kiểm tra Docker Desktop; chưa có thì hỏi để cài bằng winget. Bật Docker Engine.
    3. Tạo file .env với mật khẩu và khoá bí mật ngẫu nhiên. Nếu máy còn dữ liệu của
       lần cài trước (xoá thư mục rồi clone lại), lấy lại cấu hình từ container cũ.
    4. Tránh xung đột với bản IOC khác và cổng đang bận: tự chọn tên, cổng còn trống.
    5. (Tuỳ chọn) Cài và bật Ollama, tải model AI.
    6. Build và chạy PostgreSQL, API, web bằng Docker Compose.
    7. Chờ API báo cơ sở dữ liệu sẵn sàng — migration chạy tự động khi API khởi động.
    8. Cơ sở dữ liệu còn trống thì tạo dữ liệu mẫu và tài khoản quản trị.
    9. Kiểm tra OCR và kết nối AI từ trong container, rồi mở trình duyệt.

  Chạy lại nhiều lần đều an toàn: file .env đã có không bị ghi đè, dữ liệu đã có
  không bị tạo lại, mật khẩu đã đặt không bị đổi. Dữ liệu chỉ bị xoá khi chạy với
  -ResetData và gõ xác nhận.

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

.PARAMETER ResetData
  XOÁ TOÀN BỘ dữ liệu IOC của thư mục này (volume PostgreSQL) rồi khởi tạo lại từ đầu.
  Luôn phải gõ tên dự án để xác nhận, kể cả khi có -Yes. Không ảnh hưởng dự án Docker khác.
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoAI,
  [switch]$SkipModelPull,
  [switch]$Yes,
  [switch]$CheckOnly,
  [switch]$NoBrowser,
  [switch]$NoPause,
  [switch]$ResetData
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
$script:dockerReady = $false
$script:envCreated = $false
$script:pendingProjectName = $null

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

# Clone vào thư mục quá sâu làm Git thất bại "Filename too long" giữa chừng, để lại một
# bản thiếu file. Báo đúng nguyên nhân ngay, thay vì để Docker báo lỗi build khó hiểu.
function Test-RepositoryFiles {
  $required = @(
    'docker-compose.yml',
    '.env.example',
    'apps\api\Dockerfile',
    'apps\web\Dockerfile',
    'apps\api\docker-entrypoint.sh',
    'apps\api\prisma\schema.prisma',
    'apps\api\prisma\seed.ts'
  )
  $missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $repoRoot $_)) })
  $migrations = Join-Path $repoRoot 'apps\api\prisma\migrations'
  $migrationCount = if (Test-Path -LiteralPath $migrations) { @(Get-ChildItem -LiteralPath $migrations -Directory).Count } else { 0 }
  if ($migrationCount -eq 0) { $missing += 'apps\api\prisma\migrations\*' }

  if ($missing.Count -gt 0) {
    Write-Problem "Thư mục dự án thiếu file: $($missing -join ', ')"
    Write-Note 'Nguyên nhân thường gặp: clone vào thư mục có đường dẫn quá dài, Git báo "Filename too long" và bỏ dở.'
    Write-Note 'Cách sửa: clone lại vào thư mục ngắn (ví dụ C:\ioc), hoặc chạy trước:'
    Write-Note '  git config --global core.longpaths true'
    throw 'Bản sao dự án chưa đầy đủ, không thể khởi động.'
  }
}

# ===========================================================================
#  2. Docker Desktop
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
    $script:dockerReady = $true
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
      $script:dockerReady = $true
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
#  3. Cấu hình .env, tên dự án và dữ liệu cũ
# ===========================================================================

# Một số giá trị có thể được chỉ định trước qua biến môi trường khi tạo .env lần đầu,
# ví dụ để chạy song song hai bản IOC hoặc chọn sẵn cổng.
$envOverrideKeys = @('COMPOSE_PROJECT_NAME', 'IOC_INSTANCE', 'IMAGE_TAG', 'WEB_PORT', 'API_PORT', 'POSTGRES_PORT', 'WEB_BIND_ADDRESS')

# Những giá trị lấy lại từ container cũ khi thư mục bị xoá rồi clone lại. Mật khẩu
# PostgreSQL là bắt buộc để kết nối lại dữ liệu; khoá JWT giữ phiên đăng nhập còn hiệu lực.
$restorableKeys = @(
  'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'JWT_SECRET', 'PASSWORD_RESET_PEPPER',
  'DEMO_ADMIN_PASSWORD', 'DEMO_USER_PASSWORD', 'PUBLIC_APP_URL', 'CORS_ORIGINS',
  'PUBLIC_DASHBOARD_ALLOWED_LINK_HOSTS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_REQUIRE_TLS', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'
)

function Get-DatabaseUrl($Settings, [string]$Password) {
  $user = [uri]::EscapeDataString((Get-IocSetting $Settings 'POSTGRES_USER' 'ioc_admin'))
  $database = [uri]::EscapeDataString((Get-IocSetting $Settings 'POSTGRES_DB' 'ioc_laithieu'))
  $port = Get-IocSetting $Settings 'POSTGRES_PORT' '5432'
  $secret = [uri]::EscapeDataString($Password)
  return "postgresql://${user}:${secret}@localhost:${port}/${database}?schema=public"
}

function Get-CurrentProjectName {
  return Get-IocComposeProjectName $repoRoot (Read-IocDotEnv $envPath)
}

# Người dùng đã tự chọn giá trị này (trong .env hoặc biến môi trường) thì script không
# được tự ý đổi, chỉ báo và hướng dẫn.
function Test-ExplicitSetting([string]$Key) {
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Key))) { return $true }
  return (Read-IocDotEnv $envPath).Contains($Key)
}

# Các dòng không rỗng của một lệnh docker. Docker chưa chạy hoặc lệnh lỗi thì coi như
# không có kết quả — mọi nơi gọi hàm này đều hiểu "không có" là trạng thái an toàn.
function Get-DockerLines([string[]]$Arguments) {
  if (-not $script:dockerReady) { return @() }
  $result = Invoke-IocNative 'docker' $Arguments
  if ($result.ExitCode -ne 0) { return @() }
  return @($result.Text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

# Volume dữ liệu đã tồn tại nghĩa là PostgreSQL đã được khởi tạo với mật khẩu cũ.
# Đổi POSTGRES_PASSWORD lúc này sẽ khoá API ra khỏi chính cơ sở dữ liệu của nó.
function Test-DatabaseVolumeExists([string]$Project) {
  return @(Get-DockerLines @(
      'volume', 'ls', '--quiet',
      '--filter', "label=com.docker.compose.project=$Project",
      '--filter', 'label=com.docker.compose.volume=ioc_postgres_data'
    )).Count -gt 0
}

function Test-ProjectInUse([string]$Project) {
  $containers = @(Get-DockerLines @('ps', '--all', '--quiet', '--filter', "label=com.docker.compose.project=$Project"))
  $volumes = @(Get-DockerLines @('volume', 'ls', '--quiet', '--filter', "label=com.docker.compose.project=$Project"))
  return ($containers.Count + $volumes.Count) -gt 0
}

function Find-UnusedProjectName([string]$Base) {
  for ($suffix = 2; $suffix -lt 100; $suffix++) {
    $candidate = "$Base-$suffix"
    if (-not (Test-ProjectInUse $candidate)) { return $candidate }
  }
  throw "Không tìm được tên dự án Docker còn trống cho '$Base'."
}

# Thư mục KHÁC, vẫn còn trên máy, đang dùng cùng tên dự án Compose. Tên dự án mặc định
# lấy từ tên thư mục, nên hai lần clone vào hai nơi cùng tên (C:\ioc và D:\ioc) sẽ tranh
# nhau một bộ container và một cơ sở dữ liệu mà không ai hay.
function Get-ProjectOwnerElsewhere([string]$Project) {
  $here = Get-IocCanonicalPath $repoRoot
  $lines = @(Get-DockerLines @('ps', '--all', '--filter', "label=com.docker.compose.project=$Project", '--format', '{{.Labels}}'))
  foreach ($line in $lines) {
    $match = [regex]::Match($line, '(?:^|,)com\.docker\.compose\.project\.working_dir=([^,]*)')
    if (-not $match.Success -or -not $match.Groups[1].Value) { continue }
    $directory = $match.Groups[1].Value
    if ((Get-IocCanonicalPath $directory) -eq $here) { continue }
    if (Test-Path -LiteralPath (Join-Path $directory 'docker-compose.yml')) { return $directory }
  }
  return $null
}

# Container cũ của dự án (kể cả đã dừng) vẫn giữ nguyên biến môi trường lúc tạo, trong đó
# có mật khẩu PostgreSQL. Đây là nguồn duy nhất còn lại khi .env đã mất theo thư mục cũ.
function Get-PreviousSettings([string]$Project) {
  $values = @{}
  # api đọc sau nên giá trị của nó được ưu tiên; postgres bù khi container api đã bị xoá.
  foreach ($service in @('postgres', 'api')) {
    $ids = @(Get-DockerLines @(
        'ps', '--all', '--quiet',
        '--filter', "label=com.docker.compose.project=$Project",
        '--filter', "label=com.docker.compose.service=$service"
      ))
    if ($ids.Count -eq 0) { continue }
    $inspect = Invoke-IocNative 'docker' @('inspect', '--format', '{{json .Config.Env}}', $ids[0])
    if ($inspect.ExitCode -ne 0) { continue }
    try { $entries = ConvertFrom-Json -InputObject $inspect.Text } catch { continue }
    foreach ($entry in @($entries)) {
      $text = [string]$entry
      $index = $text.IndexOf('=')
      if ($index -gt 0) { $values[$text.Substring(0, $index)] = $text.Substring($index + 1) }
    }
  }
  return $values
}

function Get-PreviousDatabasePassword([string]$Project) {
  $previous = Get-PreviousSettings $Project
  if ($previous.ContainsKey('POSTGRES_PASSWORD')) { return [string]$previous['POSTGRES_PASSWORD'] }
  return ''
}

# -ResetData: xoá container, volume và mạng mang nhãn của ĐÚNG dự án này. Làm theo nhãn
# thay vì "docker compose down -v" để vẫn chạy được khi .env đã mất (Compose từ chối đọc
# docker-compose.yml thiếu POSTGRES_PASSWORD).
function Remove-ProjectData([string]$Project) {
  Write-Caution "-ResetData: sẽ XOÁ VĨNH VIỄN toàn bộ dữ liệu IOC của dự án '$Project' — tài khoản, chỉ tiêu, phản ánh, văn bản."
  Write-Note 'Chỉ xoá container và volume của dự án này; các dự án Docker khác không bị ảnh hưởng.'

  if (-not (Test-ProjectInUse $Project)) {
    Write-Ok "Dự án '$Project' chưa có dữ liệu nào, không cần xoá"
    return
  }
  if (-not (Test-Interactive)) {
    Stop-ForUserAction 'Xoá dữ liệu phải được gõ xác nhận. Hãy chạy start-ioc.cmd -ResetData trong một cửa sổ lệnh.'
  }
  $typed = Read-Host "    ?  Gõ chính xác '$Project' để xác nhận xoá (Enter để huỷ)"
  if ([string]$typed -cne $Project) {
    Stop-ForUserAction 'Đã huỷ -ResetData, không có gì bị xoá. Chạy lại start-ioc.cmd (không kèm -ResetData) để khởi động bình thường.'
  }

  foreach ($id in @(Get-DockerLines @('ps', '--all', '--quiet', '--filter', "label=com.docker.compose.project=$Project"))) {
    $removed = Invoke-IocNative 'docker' @('rm', '--force', $id)
    if ($removed.ExitCode -ne 0) { throw "Không xoá được container ${id}: $($removed.Text)" }
  }
  foreach ($volume in @(Get-DockerLines @('volume', 'ls', '--quiet', '--filter', "label=com.docker.compose.project=$Project"))) {
    $removed = Invoke-IocNative 'docker' @('volume', 'rm', $volume)
    if ($removed.ExitCode -ne 0) { throw "Không xoá được volume ${volume}: $($removed.Text)" }
  }
  foreach ($network in @(Get-DockerLines @('network', 'ls', '--quiet', '--filter', "label=com.docker.compose.project=$Project"))) {
    $null = Invoke-IocNative 'docker' @('network', 'rm', $network)
  }
  Write-Ok "Đã xoá dữ liệu của dự án '$Project'. Hệ thống sẽ được khởi tạo lại từ đầu."
}

# Trả về tên dự án sẽ dùng. Thư mục khác đang giữ cùng tên thì: .env chưa có -> tự
# chọn tên riêng (chưa có gì để mất); .env đã có -> hỏi trước khi tách.
function Resolve-ProjectConflict([string]$Project, [bool]$EnvExists) {
  $other = Get-ProjectOwnerElsewhere $Project
  if (-not $other) { return $Project }

  Write-Caution "Thư mục '$other' cũng đang dùng tên dự án Docker '$Project'."
  Write-Note 'Chạy tiếp với cùng tên sẽ thay container của bản kia và dùng chung cơ sở dữ liệu của nó.'
  $candidate = Find-UnusedProjectName $Project

  if (Test-ExplicitSetting 'COMPOSE_PROJECT_NAME') {
    $message = "Hãy đổi COMPOSE_PROJECT_NAME của bản này sang tên khác '$Project' (ví dụ $candidate) trong .env."
    if ($CheckOnly) { $script:problems.Add($message); return $Project }
    Stop-ForUserAction $message
  }

  if ($CheckOnly) {
    Write-Note "Khi chạy thật, bản này sẽ dùng tên dự án riêng '$candidate' với cơ sở dữ liệu riêng."
    return $Project
  }

  if ($EnvExists) {
    $question = "Tách thư mục này thành dự án riêng '$candidate'? (cơ sở dữ liệu riêng, bắt đầu trống; bản kia giữ nguyên)"
    if (-not (Confirm-IocChoice -Question $question -DefaultYes $false -AssumeYes:$Yes)) {
      Write-Note "Muốn dùng dữ liệu của bản kia: chạy start-ioc.cmd trong '$other'."
      Stop-ForUserAction 'Hãy chạy IOC từ thư mục kia, hoặc chạy lại và đồng ý tách thành dự án riêng.'
    }
    Set-IocDotEnvValue $envPath 'COMPOSE_PROJECT_NAME' $candidate
    if (-not (Test-ExplicitSetting 'IOC_INSTANCE')) { Set-IocDotEnvValue $envPath 'IOC_INSTANCE' $candidate }
  } else {
    $script:pendingProjectName = $candidate
  }
  Write-Ok "Bản này dùng tên dự án riêng '$candidate' — không đụng tới bản ở '$other'"
  return $candidate
}

function Initialize-EnvFile {
  Write-Step 'Chuẩn bị cấu hình .env'

  $envExists = Test-Path -LiteralPath $envPath
  $project = Get-CurrentProjectName
  if (-not $project) {
    throw 'Tên thư mục không dùng được làm tên dự án Docker. Hãy đổi tên thư mục (chữ không dấu, số, - hoặc _), hoặc đặt biến COMPOSE_PROJECT_NAME.'
  }
  $project = Resolve-ProjectConflict $project $envExists

  if ($ResetData) {
    if ($CheckOnly) { Write-Note "-ResetData: khi chạy thật sẽ hỏi xác nhận rồi xoá dữ liệu của dự án '$project'." }
    else { Remove-ProjectData $project }
  }

  if ($envExists) {
    Write-Ok '.env đã có sẵn — giữ nguyên, chỉ thay những giá trị còn là mẫu'
    Repair-EnvFile $project
    return
  }

  # Chưa có .env nhưng volume dữ liệu của dự án đã tồn tại: thường là người dùng xoá thư
  # mục rồi clone lại. Sinh mật khẩu mới lúc này sẽ không khớp dữ liệu cũ và API khởi
  # động lại liên tục — phải lấy lại cấu hình cũ, hoặc dừng lại hướng dẫn.
  $previous = @{}
  if (-not $script:pendingProjectName -and -not ($ResetData -and $CheckOnly) -and (Test-DatabaseVolumeExists $project)) {
    Write-Caution "Máy đã có cơ sở dữ liệu IOC của dự án '$project' từ lần cài trước, nhưng thư mục này chưa có .env."
    $previous = Get-PreviousSettings $project
    $hasPassword = $previous.ContainsKey('POSTGRES_PASSWORD') -and -not [string]::IsNullOrWhiteSpace([string]$previous['POSTGRES_PASSWORD'])
    if (-not $hasPassword) {
      Write-Note 'Không còn container cũ để lấy lại mật khẩu cơ sở dữ liệu, nên không thể tự kết nối lại dữ liệu đó.'
      Write-Note 'Cách 1 — giữ dữ liệu: chép file .env cũ vào thư mục này rồi chạy lại start-ioc.cmd.'
      Write-Note 'Cách 2 — bắt đầu lại từ đầu: start-ioc.cmd -ResetData (hỏi xác nhận trước khi xoá).'
      $message = 'Cần file .env cũ để giữ dữ liệu, hoặc chạy lại với -ResetData.'
      if ($CheckOnly) { $script:problems.Add($message); return }
      Stop-ForUserAction $message
    }
    if ($CheckOnly) {
      Write-Note 'Khi chạy thật, cấu hình sẽ được lấy lại từ container cũ.'
      return
    }
  }

  if ($CheckOnly) {
    Write-Note 'Chưa có .env. Khi chạy thật, script sẽ tự tạo với khoá bí mật ngẫu nhiên.'
    return
  }

  try {
    New-EnvFile $previous
    $script:envCreated = $true
  } catch {
    # Không để lại .env dở dang: lần chạy sau sẽ tưởng cấu hình đã đầy đủ.
    if (Test-Path -LiteralPath $envPath) { [IO.File]::Delete($envPath) }
    throw
  }
}

function New-EnvFile([hashtable]$Previous) {
  Copy-Item -LiteralPath $envTemplatePath -Destination $envPath
  foreach ($key in $envOverrideKeys) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      Set-IocDotEnvValue $envPath $key $value
      Write-Note "Dùng $key=$value từ biến môi trường"
    }
  }
  if ($script:pendingProjectName) {
    Set-IocDotEnvValue $envPath 'COMPOSE_PROJECT_NAME' $script:pendingProjectName
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('IOC_INSTANCE'))) {
      Set-IocDotEnvValue $envPath 'IOC_INSTANCE' $script:pendingProjectName
    }
  }

  if ($Previous.Count -gt 0) {
    $restored = 0
    foreach ($key in $restorableKeys) {
      $value = if ($Previous.ContainsKey($key)) { [string]$Previous[$key] } else { '' }
      if ([string]::IsNullOrWhiteSpace($value)) { continue }
      Set-IocDotEnvValue $envPath $key $value
      $restored++
    }
    $settings = Read-IocDotEnv $envPath
    $password = [string]$settings['POSTGRES_PASSWORD']
    Set-IocDotEnvValue $envPath 'DATABASE_URL' (Get-DatabaseUrl $settings $password)
    Set-IocDotEnvValue $envPath 'DIRECT_URL' (Get-DatabaseUrl $settings $password)
    if (Test-IocPlaceholder (Get-IocSetting $settings 'JWT_SECRET' '')) {
      Set-IocDotEnvValue $envPath 'JWT_SECRET' (New-IocSecret 64)
    }
    Write-Ok "Đã lấy lại cấu hình từ container cũ ($restored giá trị, gồm mật khẩu cơ sở dữ liệu)"
    Write-Note 'Dữ liệu, tài khoản và mật khẩu đăng nhập cũ được giữ nguyên.'
    return
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
function Repair-EnvFile([string]$Project) {
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
    $newPassword = ''
    if (Test-DatabaseVolumeExists $Project) {
      # Cơ sở dữ liệu đã được tạo: chỉ dùng mật khẩu mà container cũ thật sự đã dùng.
      $oldPassword = Get-PreviousDatabasePassword $Project
      if ($oldPassword -and $oldPassword -ne $databasePassword) {
        $newPassword = $oldPassword
      } else {
        Write-Caution 'POSTGRES_PASSWORD vẫn là giá trị mẫu, nhưng cơ sở dữ liệu đã được khởi tạo với chính giá trị đó.'
        Write-Note 'Giữ nguyên để API còn kết nối được. Muốn đổi, hãy đổi trong PostgreSQL trước rồi mới sửa .env.'
      }
    } else {
      $newPassword = New-IocDatabasePassword
    }
    if ($newPassword) {
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
    Write-Ok "$verb giá trị mẫu: $($changes -join ', ')"
  }
}

# ===========================================================================
#  4. Tên container, cổng mạng và địa chỉ web
# ===========================================================================

# Container của IOC trùng tên nhưng thuộc dự án Compose khác (hoặc không thuộc Compose).
function Get-ContainerNameConflicts([string]$Instance, [string]$Project) {
  $wanted = @("$Instance-db", "$Instance-api", "$Instance-web")
  # Lấy toàn bộ nhãn rồi tự tách: {{.Label "..."}} cần nháy kép mà PowerShell 5.1 làm rơi.
  foreach ($line in @(Get-DockerLines @('ps', '--all', '--format', '{{.Names}}|{{.Labels}}'))) {
    $separator = $line.IndexOf('|')
    if ($separator -lt 1) { continue }
    $name = $line.Substring(0, $separator)
    if ($wanted -notcontains $name) { continue }
    $match = [regex]::Match($line.Substring($separator + 1), '(?:^|,)com\.docker\.compose\.project=([^,]*)')
    $owner = if ($match.Success) { $match.Groups[1].Value } else { '' }
    if ($owner -ne $Project) { [pscustomobject]@{ Name = $name; Owner = $owner } }
  }
}

# container_name trong docker-compose.yml là tên toàn cục trên cả máy. Bản IOC thứ hai
# (thư mục khác, dự án khác) mà vẫn dùng tên mặc định sẽ làm Compose dừng giữa chừng
# với lỗi "container name is already in use". Tên container không gắn với dữ liệu, nên
# khi người dùng chưa tự đặt IOC_INSTANCE thì đổi tên là an toàn.
function Resolve-ContainerNames {
  if (-not $script:dockerReady) { return }
  $settings = Read-IocDotEnv $envPath
  $project = Get-IocComposeProjectName $repoRoot $settings
  $instance = Get-IocSetting $settings 'IOC_INSTANCE' 'ioc-laithieu'
  $taken = @(Get-ContainerNameConflicts $instance $project)
  if ($taken.Count -eq 0) { return }

  $described = ($taken | ForEach-Object {
      if ($_.Owner) { "$($_.Name) (dự án $($_.Owner))" } else { $_.Name }
    }) -join ', '
  Write-Caution "Tên container IOC đã bị một bản khác dùng: $described"

  if (Test-ExplicitSetting 'IOC_INSTANCE') {
    $message = "Hãy đổi IOC_INSTANCE trong .env sang tên khác '$instance', ví dụ IOC_INSTANCE=$project"
    if ($CheckOnly) { $script:problems.Add($message); return }
    Stop-ForUserAction $message
  }
  if ($CheckOnly) {
    Write-Note "Khi chạy thật, script sẽ đặt IOC_INSTANCE riêng cho bản này."
    return
  }

  $candidate = $project
  for ($suffix = 2; @(Get-ContainerNameConflicts $candidate $project).Count -gt 0; $suffix++) {
    $candidate = "$project-$suffix"
  }
  Set-IocDotEnvValue $envPath 'IOC_INSTANCE' $candidate
  Write-Ok "Đặt IOC_INSTANCE=$candidate để container của bản này có tên riêng"
}

function Test-PortReserved([int]$Port, $Ranges) {
  foreach ($range in $Ranges) {
    if ($Port -ge $range.Start -and $Port -le $range.End) { return $true }
  }
  return $false
}

function Get-ListeningPorts {
  return @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { [int]$_.LocalPort } | Sort-Object -Unique)
}

# Cổng mà container của chính dự án này đang mở — không tính là xung đột.
function Get-ProjectPublishedPorts([string]$Project) {
  $ports = @()
  foreach ($line in @(Get-DockerLines @('ps', '--filter', "label=com.docker.compose.project=$Project", '--format', '{{.Ports}}'))) {
    foreach ($match in [regex]::Matches($line, ':(\d+)->')) { $ports += [int]$match.Groups[1].Value }
  }
  return $ports
}

function Find-FreePort([int]$After, [int[]]$Avoid, [int[]]$Listening, $Ranges) {
  $limit = [math]::Min(65535, $After + 500)
  for ($candidate = $After + 1; $candidate -le $limit; $candidate++) {
    if ($Avoid -contains $candidate -or $Listening -contains $candidate) { continue }
    if (Test-PortReserved $candidate $Ranges) { continue }
    return $candidate
  }
  return 0
}

function Write-PortOwner([int]$Port, [string]$Key, $Owner) {
  if ($Owner.ProcessId -eq 4) {
    Write-Problem "Cổng $Port ($Key) đang bị dịch vụ HTTP của Windows (http.sys, PID 4) giữ."
    Write-Note 'Thường là IIS, Hyper-V hoặc một ứng dụng dùng HttpListener. Không nên tắt; chuyển IOC sang cổng khác an toàn hơn.'
  } elseif (Test-IocDockerPortProcess $Owner.ProcessName) {
    $names = @(Get-DockerLines @('ps', '--filter', "publish=$Port", '--format', '{{.Names}}'))
    $who = if ($names.Count -gt 0) { "container '$($names -join ', ')'" } else { 'một container Docker khác' }
    Write-Problem "Cổng $Port ($Key) đang bị $who chiếm."
  } else {
    Write-Problem "Cổng $Port ($Key) đang bị chương trình '$($Owner.ProcessName)' (PID $($Owner.ProcessId)) chiếm."
  }
}

function Test-RequiredPorts {
  Write-Step 'Kiểm tra cổng mạng'

  $settings = Read-IocDotEnv $envPath
  $ports = Get-IocPorts $settings
  $keys = @{ Web = 'WEB_PORT'; Api = 'API_PORT'; Database = 'POSTGRES_PORT' }
  $ourPorts = @(Get-ProjectPublishedPorts (Get-IocComposeProjectName $repoRoot $settings))
  $ranges = @(Get-IocExcludedPortRanges)

  $conflicts = New-Object System.Collections.Generic.List[object]
  foreach ($entry in $ports.GetEnumerator()) {
    $port = [int]$entry.Value
    $key = $keys[$entry.Key]
    if ($ourPorts -contains $port) {
      Write-Ok "Cổng $port ($key) đang do chính IOC dùng"
      continue
    }

    $owner = Get-IocPortOwner $port
    if ($owner) {
      Write-PortOwner $port $key $owner
    } elseif (Test-PortReserved $port $ranges) {
      # Không ai lắng nghe nên trông như trống, nhưng Docker sẽ báo "access permissions".
      Write-Problem "Cổng $port ($key) nằm trong dải Windows giữ chỗ cho Hyper-V/WSL — trông như trống nhưng Docker không mở được."
      Write-Note 'Dải này đổi sau mỗi lần khởi động máy. Có thể giải phóng bằng quyền quản trị: net stop winnat, rồi net start winnat.'
    } else {
      Write-Ok "Cổng $port ($key) đang trống"
      continue
    }
    $conflicts.Add([pscustomobject]@{ Key = $key; Port = $port })
  }
  if ($conflicts.Count -eq 0) { return }

  if ($CheckOnly) {
    $list = ($conflicts | ForEach-Object { "$($_.Port) ($($_.Key))" }) -join ', '
    $script:problems.Add("Cổng đang bận: $list. Khi chạy thật, script sẽ đề nghị chuyển sang cổng trống.")
    return
  }

  # Tìm cổng thay thế cho từng cổng bận, tránh trùng nhau và tránh dải bị giữ chỗ.
  $listening = Get-ListeningPorts
  $avoid = @($ports.Values | ForEach-Object { [int]$_ }) + $ourPorts
  $plan = New-Object System.Collections.Generic.List[object]
  $canMove = $true
  foreach ($conflict in $conflicts) {
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($conflict.Key))) {
      Write-Note "$($conflict.Key) đang được đặt bằng biến môi trường nên script không tự đổi."
      $canMove = $false
      break
    }
    $free = Find-FreePort $conflict.Port $avoid $listening $ranges
    if ($free -eq 0) {
      $canMove = $false
      break
    }
    $avoid += $free
    $plan.Add([pscustomobject]@{ Key = $conflict.Key; Old = $conflict.Port; New = $free })
  }

  $accepted = $false
  $summary = ($plan | ForEach-Object { "$($_.Key) $($_.Old) -> $($_.New)" }) -join ', '
  if ($canMove) {
    if ($script:envCreated) {
      # .env vừa được tạo: chưa ai kịp quen với địa chỉ cũ, cứ chọn cổng trống.
      Write-Note "Cấu hình vừa được tạo nên tự chuyển sang cổng còn trống."
      $accepted = $true
    } else {
      $accepted = Confirm-IocChoice -Question "Chuyển IOC sang cổng còn trống ($summary)?" -DefaultYes $true -AssumeYes:$Yes
    }
  }
  if (-not $accepted) {
    Write-Note 'Cách sửa: tắt chương trình đang giữ cổng, hoặc mở .env và đổi các khoá cổng ở trên sang số khác.'
    Stop-ForUserAction 'Hãy giải phóng cổng hoặc đổi cổng trong .env, rồi chạy lại start-ioc.cmd.'
  }

  foreach ($item in $plan) {
    Set-IocDotEnvValue $envPath $item.Key "$($item.New)"
    if ($item.Key -ne 'POSTGRES_PORT') { continue }
    # Chuỗi kết nối dùng cho công cụ chạy ngoài Docker trỏ theo cổng PostgreSQL.
    $current = Read-IocDotEnv $envPath
    foreach ($urlKey in @('DATABASE_URL', 'DIRECT_URL')) {
      $url = if ($current.Contains($urlKey)) { [string]$current[$urlKey] } else { '' }
      if ($url.Contains("@localhost:$($item.Old)/")) {
        Set-IocDotEnvValue $envPath $urlKey $url.Replace("@localhost:$($item.Old)/", "@localhost:$($item.New)/")
      }
    }
  }
  Write-Ok "Đã đổi cổng trong .env: $summary"
}

# API chỉ nhận yêu cầu từ các địa chỉ trong CORS_ORIGINS và trả lỗi 500 cho mọi địa chỉ
# khác — kể cả chính trang web của nó khi chạy ở cổng khác 8080, hay khi máy khác trong
# mạng nội bộ mở vào: đăng nhập sẽ luôn thất bại. Giữ danh sách khớp với cổng web đang
# dùng: chỉ THÊM địa chỉ còn thiếu, không bao giờ xoá địa chỉ người dùng tự khai báo.
function Sync-WebOrigins {
  $settings = Read-IocDotEnv $envPath
  $ports = Get-IocPorts $settings
  $current = @(([string](Get-IocSetting $settings 'CORS_ORIGINS' '')) -split ',' |
      ForEach-Object { $_.Trim() } | Where-Object { $_ })

  $wanted = @("http://localhost:$($ports.Web)", "http://127.0.0.1:$($ports.Web)")
  if ((Get-IocSetting $settings 'WEB_BIND_ADDRESS' '0.0.0.0') -eq '0.0.0.0') {
    foreach ($address in @(Get-IocLanAddresses)) { $wanted += "http://${address}:$($ports.Web)" }
  }

  $added = @($wanted | Where-Object { $current -notcontains $_ })
  if ($added.Count -gt 0) {
    Set-IocDotEnvValue $envPath 'CORS_ORIGINS' (($current + $added) -join ',')
    Write-Ok "Cho phép đăng nhập từ: $($added -join ', ')"
  }

  # Liên kết trong email chỉ tự sửa khi vẫn là địa chỉ localhost mặc định.
  $publicUrl = [string](Get-IocSetting $settings 'PUBLIC_APP_URL' '')
  $expected = "http://localhost:$($ports.Web)"
  if ($publicUrl -match '^http://localhost:\d+/?$' -and $publicUrl.TrimEnd('/') -ne $expected) {
    Set-IocDotEnvValue $envPath 'PUBLIC_APP_URL' $expected
    Write-Ok "Cập nhật PUBLIC_APP_URL theo cổng web: $expected"
  }
}

# ===========================================================================
#  5. Ollama — lớp AI cục bộ (không bắt buộc)
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
#  6–7. Chạy hệ thống
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

# Đọc nhật ký API để chỉ ra nguyên nhân cụ thể cho những lỗi khởi động hay gặp nhất.
function Show-ApiFailureHint {
  $logs = Get-IocComposeOutput $repoRoot @('logs', '--no-color', '--tail', '150', 'api')
  if ($logs.Text -match '(?i)P1000|password authentication failed|Authentication failed against database') {
    Write-Caution 'API không đăng nhập được vào PostgreSQL: POSTGRES_PASSWORD trong .env khác mật khẩu lúc cơ sở dữ liệu được tạo.'
    Write-Note 'Giữ dữ liệu: đặt lại POSTGRES_PASSWORD đúng như trong file .env cũ.'
    Write-Note 'Không cần dữ liệu cũ: start-ioc.cmd -ResetData (hỏi xác nhận trước khi xoá).'
  } elseif ($logs.Text -match '(?i)P3009|P3018|failed migrations') {
    Write-Caution 'Có migration bị lỗi dở dang trong cơ sở dữ liệu nên Prisma dừng lại để bảo vệ dữ liệu.'
    Write-Note 'Dữ liệu dùng thử: start-ioc.cmd -ResetData. Dữ liệu thật: xem tên migration lỗi trong nhật ký ở trên và xử lý bằng "prisma migrate resolve" trước khi chạy lại.'
  } elseif ($logs.Text -match 'JWT_SECRET ph') {
    Write-Caution 'JWT_SECRET trong .env không hợp lệ. Xoá dòng JWT_SECRET trong .env rồi chạy lại để script tạo khoá mới.'
  }
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
      Show-ApiFailureHint
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
    Show-ApiFailureHint
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
#  8. Dữ liệu ban đầu
# ===========================================================================

# psql chạy bên trong container PostgreSQL qua socket cục bộ — ảnh chính thức của
# PostgreSQL tin cậy kết nối này nên không cần truyền mật khẩu qua dòng lệnh.
#
# Bảng tên "User" cần nháy kép trong SQL, nhưng PowerShell 5.1 làm rơi nháy kép khi
# truyền tham số (xem Invoke-IocNative). Truy vấn dưới đây dựng tên bảng bằng
# quote_ident('User') và chạy qua query_to_xml, nên cả câu lệnh chỉ dùng nháy đơn.
function Get-UserCount {
  $settings = Read-IocDotEnv $envPath
  $user = Get-IocSetting $settings 'POSTGRES_USER' 'ioc_admin'
  $database = Get-IocSetting $settings 'POSTGRES_DB' 'ioc_laithieu'
  $sql = 'SELECT (xpath(''/row/c/text()'', query_to_xml(''SELECT COUNT(*) AS c FROM '' || quote_ident(''User''), false, true, '''')))[1]::text'
  $result = Get-IocComposeOutput $repoRoot @(
    'exec', '-T', 'postgres', 'psql', '-U', $user, '-d', $database, '-tAc', $sql
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
#  9. Kiểm tra từ bên trong container
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
  $settings = Read-IocDotEnv $envPath
  $ports = Get-IocPorts $settings
  $web = "http://localhost:$($ports.Web)"
  $openToLan = (Get-IocSetting $settings 'WEB_BIND_ADDRESS' '0.0.0.0') -eq '0.0.0.0'
  $lan = if ($openToLan) { @(Get-IocLanAddresses) } else { @() }

  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Green
  Write-Host '  IOC Lái Thiêu đã sẵn sàng' -ForegroundColor Green
  Write-Host '============================================================' -ForegroundColor Green
  Write-Host "  Cổng thông tin      $web"
  Write-Host "  Đăng nhập quản trị  $web/admin/login"
  Write-Host "  Gửi phản ánh        $web/phan-anh"
  Write-Host "  Kiểm tra API        http://localhost:$($ports.Api)/api/health"
  if ($lan.Count -gt 0) {
    Write-Host "  Máy khác cùng mạng  http://$($lan[0]):$($ports.Web)"
  }
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
  if ($openToLan) {
    Write-Host '  Trang web mở cho cả mạng nội bộ. Chỉ dùng trên máy này: thêm WEB_BIND_ADDRESS=127.0.0.1 vào .env.' -ForegroundColor Gray
  }
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

  # Docker phải chạy TRƯỚC khi tạo .env: chỉ Docker mới cho biết máy đã có dữ liệu của
  # lần cài trước hay chưa, và mật khẩu cũ của nó là gì.
  Test-Machine
  Test-RepositoryFiles
  Start-DockerEngine
  Initialize-EnvFile
  Resolve-ContainerNames
  Test-RequiredPorts

  if ($CheckOnly) {
    Start-Ollama
    Show-CheckReport
  } else {
    Sync-WebOrigins
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
