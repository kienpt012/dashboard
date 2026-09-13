# =============================================================================
#  IOC Lái Thiêu — thư viện dùng chung cho trình khởi động và trình dừng
#
#  Được nạp bằng dot-source từ start-ioc.ps1 và stop-ioc.ps1. Không chạy độc lập.
#
#  File này PHẢI được lưu dạng UTF-8 có BOM: Windows PowerShell 5.1 đọc file
#  không có BOM theo bảng mã ANSI của hệ thống và sẽ làm vỡ toàn bộ chữ tiếng Việt.
# =============================================================================

Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
#  Đầu ra
# ---------------------------------------------------------------------------

function Initialize-IocConsole {
  try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
    $global:OutputEncoding = [Console]::OutputEncoding
  } catch {
    # Một số máy chủ PowerShell nhúng không cho đổi bảng mã; chỉ ảnh hưởng hiển thị.
  }
}

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "    [ OK ] $Message" -ForegroundColor Green
}

function Write-Note([string]$Message) {
  Write-Host "           $Message" -ForegroundColor Gray
}

function Write-Caution([string]$Message) {
  Write-Host "    [ !! ] $Message" -ForegroundColor Yellow
}

function Write-Problem([string]$Message) {
  Write-Host "    [LỖI ] $Message" -ForegroundColor Red
}

# ---------------------------------------------------------------------------
#  Hỏi người dùng
# ---------------------------------------------------------------------------

# Trả về $true khi tiến trình đang có người ngồi trước bàn phím để trả lời.
function Test-Interactive {
  try {
    if ([Console]::IsInputRedirected) { return $false }
  } catch {
    return $false
  }
  return [Environment]::UserInteractive
}

# Câu hỏi có/không. -AssumeYes dùng cho chế độ chạy không người trông (-Yes).
# Khi không có bàn phím (CI, chạy nền), luôn chọn giá trị mặc định an toàn.
function Confirm-IocChoice {
  param(
    [Parameter(Mandatory)] [string]$Question,
    [bool]$DefaultYes = $true,
    [switch]$AssumeYes
  )

  if ($AssumeYes) {
    Write-Note "$Question -> Có (tham số -Yes)"
    return $true
  }
  if (-not (Test-Interactive)) {
    $label = if ($DefaultYes) { 'Có' } else { 'Không' }
    Write-Note "$Question -> $label (không có bàn phím, dùng mặc định)"
    return $DefaultYes
  }

  $hint = if ($DefaultYes) { '[C/k]' } else { '[c/K]' }
  while ($true) {
    $answer = Read-Host "    ?  $Question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
    switch -Regex ($answer.Trim().ToLowerInvariant()) {
      '^(c|co|có|y|yes)$' { return $true }
      '^(k|khong|không|n|no)$' { return $false }
    }
    Write-Note 'Hãy gõ C (có) hoặc K (không).'
  }
}

# Được mở bằng cách nhấp đúp trong Explorer thì cửa sổ sẽ tự đóng ngay khi script
# kết thúc — người dùng không kịp đọc kết quả hay mật khẩu vừa tạo.
function Test-LaunchedFromExplorer {
  try {
    $self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($self.ParentProcessId)" -ErrorAction Stop
    if ($parent.Name -ieq 'explorer.exe') { return $true }
    if ($parent.Name -ieq 'cmd.exe') {
      $grand = Get-CimInstance Win32_Process -Filter "ProcessId=$($parent.ParentProcessId)" -ErrorAction Stop
      return ($grand.Name -ieq 'explorer.exe')
    }
  } catch {
    return $false
  }
  return $false
}

# ---------------------------------------------------------------------------
#  File .env
#
#  Docker Compose đọc .env theo cú pháp KEY=VALUE đơn giản. Ghi file KHÔNG có BOM:
#  một BOM ở đầu file khiến Compose đọc sai tên khoá đầu tiên.
# ---------------------------------------------------------------------------

function Read-IocDotEnv([string]$Path) {
  $values = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }

  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $index = $trimmed.IndexOf('=')
    if ($index -lt 1) { continue }
    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim()
    if ($value.Length -ge 2 -and (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Write-IocTextFile([string]$Path, [string]$Text) {
  $encoding = New-Object System.Text.UTF8Encoding $false
  [IO.File]::WriteAllText($Path, $Text, $encoding)
}

# Đặt giá trị cho một khoá: thay tại chỗ nếu đã có dòng KEY=, nếu chưa thì thêm cuối
# file. Mọi dòng khác (kể cả chú thích) giữ nguyên thứ tự và nội dung.
function Set-IocDotEnvValue([string]$Path, [string]$Key, [string]$Value) {
  $lines = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $Path) {
    foreach ($line in [IO.File]::ReadAllLines($Path)) { $lines.Add($line) }
  }

  $pattern = '^\s*' + [regex]::Escape($Key) + '\s*='
  $replaced = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $pattern) {
      $lines[$i] = "$Key=$Value"
      $replaced = $true
      break
    }
  }
  if (-not $replaced) { $lines.Add("$Key=$Value") }

  Write-IocTextFile -Path $Path -Text (($lines -join "`r`n") + "`r`n")
}

function Get-IocSetting($Settings, [string]$Key, [string]$Default) {
  $fromProcess = [Environment]::GetEnvironmentVariable($Key)
  if (-not [string]::IsNullOrWhiteSpace($fromProcess)) { return $fromProcess }
  if ($Settings.Contains($Key) -and -not [string]::IsNullOrWhiteSpace([string]$Settings[$Key])) {
    return [string]$Settings[$Key]
  }
  return $Default
}

# ---------------------------------------------------------------------------
#  Bí mật ngẫu nhiên
#
#  Dùng bộ sinh số ngẫu nhiên mật mã học và loại bỏ mẫu lệch để mọi ký tự có xác
#  suất như nhau. Bảng ký tự cố ý bỏ $ (Compose sẽ hiểu là biến), # (chú thích),
#  dấu nháy, khoảng trắng và dấu \.
# ---------------------------------------------------------------------------

function New-IocRandomString([int]$Length, [string]$Alphabet) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $builder = New-Object System.Text.StringBuilder
    $limit = 256 - (256 % $Alphabet.Length)
    $buffer = New-Object byte[] 1
    while ($builder.Length -lt $Length) {
      $rng.GetBytes($buffer)
      if ($buffer[0] -lt $limit) {
        [void]$builder.Append($Alphabet[$buffer[0] % $Alphabet.Length])
      }
    }
    return $builder.ToString()
  } finally {
    $rng.Dispose()
  }
}

function New-IocSecret([int]$Length = 64) {
  return New-IocRandomString -Length $Length -Alphabet '0123456789abcdef'
}

# Mật khẩu chỉ gồm chữ và số: dùng được thẳng trong chuỗi kết nối PostgreSQL mà
# không phải mã hoá, và độ dài bù lại cho bảng ký tự hẹp.
function New-IocDatabasePassword([int]$Length = 40) {
  return New-IocRandomString -Length $Length -Alphabet 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
}

# Mật khẩu đăng nhập đạt quy tắc của hệ thống: tối thiểu 12 ký tự, có chữ hoa, chữ
# thường, số và ký tự đặc biệt. Bỏ các ký tự dễ nhìn nhầm (O/0, l/1/I) vì người dùng
# sẽ phải gõ lại mật khẩu này.
function New-IocLoginPassword {
  $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  $lower = 'abcdefghijkmnpqrstuvwxyz'
  $digit = '23456789'
  $special = '@-_.!'
  $body = New-IocRandomString -Length 12 -Alphabet ($upper + $lower + $digit)
  return (New-IocRandomString 2 $upper) + $body + (New-IocRandomString 2 $digit) +
    (New-IocRandomString 1 $special) + (New-IocRandomString 1 $lower)
}

function Test-IocPlaceholder([string]$Value) {
  return ([string]::IsNullOrWhiteSpace($Value) -or $Value.StartsWith('replace-with-') -or $Value.StartsWith('replace-'))
}

# Cùng quy tắc với prisma/seed.ts: seed từ chối mật khẩu yếu trong production.
function Test-IocStrongLoginPassword([string]$Value, [string]$KnownDefault) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  if ($Value -eq $KnownDefault -or (Test-IocPlaceholder $Value)) { return $false }
  return ($Value.Length -ge 12 -and $Value -cmatch '[a-z]' -and $Value -cmatch '[A-Z]' -and
    $Value -match '\d' -and $Value -match '[^A-Za-z0-9]')
}

# ---------------------------------------------------------------------------
#  Gọi chương trình ngoài
#
#  Windows PowerShell 5.1 có một lỗi đã biết: khi $ErrorActionPreference = 'Stop',
#  một chương trình ngoài vừa trả mã lỗi vừa ghi ra stderr — mà stderr lại được
#  chuyển hướng (2>$null hoặc 2>&1) — sẽ biến thành lỗi dừng script. Đúng tình huống
#  "docker info" lúc Docker còn tắt trên một máy mới. Mọi lệnh cần đọc hoặc bỏ qua
#  stderr đều phải đi qua hàm này, và luôn kiểm tra ExitCode thay vì trông vào
#  ngoại lệ.
# ---------------------------------------------------------------------------

function Invoke-IocNative {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory
  )

  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  if ($WorkingDirectory) { Push-Location -LiteralPath $WorkingDirectory }
  try {
    $raw = & $FilePath @Arguments 2>&1
    $code = $LASTEXITCODE
  } catch {
    $raw = @($_.Exception.Message)
    $code = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
  } finally {
    if ($WorkingDirectory) { Pop-Location }
    $ErrorActionPreference = $previous
  }

  $lines = @($raw | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { [string]$_ }
    })
  return [pscustomobject]@{
    ExitCode = [int]$code
    Text = (($lines -join "`n").Trim())
  }
}

# ---------------------------------------------------------------------------
#  Docker Compose
# ---------------------------------------------------------------------------

# Tên dự án Compose quyết định tên volume dữ liệu. Tính giống hệt cách Compose tự
# tính: ưu tiên COMPOSE_PROJECT_NAME, nếu không thì lấy tên thư mục đã chuẩn hoá.
function Get-IocComposeProjectName([string]$RepoRoot, $Settings) {
  $name = Get-IocSetting $Settings 'COMPOSE_PROJECT_NAME' ''
  if ([string]::IsNullOrWhiteSpace($name)) { $name = Split-Path -Leaf $RepoRoot }
  $name = ($name.ToLowerInvariant() -replace '[^a-z0-9_-]', '')
  $name = $name -replace '^[^a-z0-9]+', ''
  return $name
}

function Get-IocPorts($Settings) {
  return [ordered]@{
    Web = [int](Get-IocSetting $Settings 'WEB_PORT' '8080')
    Api = [int](Get-IocSetting $Settings 'API_PORT' '3000')
    Database = [int](Get-IocSetting $Settings 'POSTGRES_PORT' '5432')
  }
}

# Chạy docker compose trong thư mục dự án, cho đầu ra hiện thẳng lên màn hình (dùng
# cho build/up để người dùng thấy tiến độ). Không chuyển hướng stderr nên không dính
# lỗi của PowerShell 5.1 nói ở trên.
#
# BẮT BUỘC có "| Out-Host": một hàm PowerShell trả về MỌI dòng đầu ra chưa được bắt,
# không chỉ giá trị sau "return". Thiếu nó, các dòng chữ của compose bị gộp chung với
# mã thoát thành một mảng, "$code -ne 0" luôn đúng và một lần khởi động thành công bị
# báo là thất bại — lỗi này đã xảy ra thật khi chạy thử trên bản clone mới.
function Invoke-IocCompose([string]$RepoRoot, [string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  Push-Location -LiteralPath $RepoRoot
  try {
    & docker compose @Arguments | Out-Host
    return [int]$LASTEXITCODE
  } finally {
    Pop-Location
    $ErrorActionPreference = $previous
  }
}

# Chạy docker compose và lấy đầu ra dạng chữ (dùng cho truy vấn, không in ra màn hình).
function Get-IocComposeOutput([string]$RepoRoot, [string[]]$Arguments) {
  return Invoke-IocNative -FilePath 'docker' -Arguments (@('compose') + $Arguments) -WorkingDirectory $RepoRoot
}

function Test-IocEndpoint([string]$Uri, [int]$TimeoutSec = 3) {
  try {
    $null = Invoke-RestMethod -Uri $Uri -TimeoutSec $TimeoutSec -UseBasicParsing
    return $true
  } catch {
    return $false
  }
}

# Tiến trình nào đang giữ một cổng TCP. Trả về $null nếu cổng đang trống.
function Get-IocPortOwner([int]$Port) {
  $listener = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) | Select-Object -First 1
  if (-not $listener) { return $null }
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    Port = $Port
    ProcessId = $listener.OwningProcess
    ProcessName = if ($process) { $process.ProcessName } else { 'không xác định' }
  }
}

# Docker Desktop chuyển tiếp cổng của container qua các tiến trình này.
function Test-IocDockerPortProcess([string]$ProcessName) {
  return $ProcessName -in @('com.docker.backend', 'com.docker.proxy', 'vpnkit', 'wslrelay', 'docker-proxy', 'Docker Desktop')
}
