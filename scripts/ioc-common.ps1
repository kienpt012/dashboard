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
    } else {
      # Giống Docker Compose: với giá trị không có nháy, "#" đứng sau khoảng trắng là
      # chú thích cuối dòng. Thiếu bước này, "WEB_PORT=8081  # đổi cổng" được Compose
      # hiểu là 8081 nhưng script lại đọc cả chú thích và dừng vì không đổi được ra số.
      $value = ($value -replace '\s+#.*$', '').Trim()
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
      $lines[$i] = "$Key=$(ConvertTo-IocDotEnvLiteral $Value)"
      $replaced = $true
      break
    }
  }
  if (-not $replaced) { $lines.Add("$Key=$(ConvertTo-IocDotEnvLiteral $Value)") }

  Write-IocTextFile -Path $Path -Text (($lines -join "`r`n") + "`r`n")
}

# Compose hiểu "$" trong .env là biến và " #" là chú thích. Khoá do script sinh ra không
# bao giờ chứa các ký tự này, nhưng giá trị lấy lại từ container cũ (ví dụ mật khẩu SMTP
# người dùng tự đặt) thì có thể — đặt trong nháy đơn để Compose đọc nguyên văn.
function ConvertTo-IocDotEnvLiteral([string]$Value) {
  if ($Value -match '[\s#$"\\]' -and -not $Value.Contains("'")) { return "'$Value'" }
  return $Value
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

  # Windows PowerShell 5.1 KHÔNG thoát dấu nháy kép nằm trong tham số khi gọi chương
  # trình ngoài: 'FROM "User"' tới nơi thành 'FROM User'. Lỗi này im lặng cho ra kết
  # quả sai thay vì báo lỗi — đã từng khiến script đếm nhầm 1 tài khoản trên một cơ sở
  # dữ liệu trống (PostgreSQL hiểu "user" là hàm người dùng hiện tại) và bỏ qua bước
  # tạo tài khoản quản trị. Chặn ngay từ đầu để lỗi không bao giờ quay lại.
  foreach ($argument in $Arguments) {
    if ($argument.Contains('"')) {
      throw "Tham số truyền cho '$FilePath' không được chứa dấu nháy kép (PowerShell 5.1 làm rơi mất): $argument"
    }
  }

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

# Đường dẫn dạng chuẩn để so sánh hai thư mục. Cùng một thư mục có thể được viết khác
# nhau: chữ hoa/thường, dấu \ cuối, hay tên ngắn 8.3 (C:\Users\PHANT~1\...) mà %TEMP%
# hay dùng. Mỗi đoạn được tra lại tên thật trên đĩa để hai cách viết cho cùng kết quả.
function Get-IocCanonicalPath([string]$Path) {
  try {
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $root = [IO.Path]::GetPathRoot($full)
    $current = $root
    foreach ($segment in $full.Substring($root.Length).Split('\')) {
      if (-not $segment) { continue }
      $found = @()
      if (Test-Path -LiteralPath $current) { $found = @([IO.Directory]::GetFileSystemEntries($current, $segment)) }
      $current = if ($found.Count -eq 1) { $found[0] } else { Join-Path $current $segment }
    }
    return $current.TrimEnd('\').ToLowerInvariant()
  } catch {
    return ([string]$Path).TrimEnd('\').ToLowerInvariant()
  }
}

# Tên dự án Compose quyết định tên volume dữ liệu. Tính giống hệt cách Compose tự
# tính: ưu tiên COMPOSE_PROJECT_NAME, nếu không thì lấy tên thư mục đã chuẩn hoá.
function Get-IocComposeProjectName([string]$RepoRoot, $Settings) {
  $name = Get-IocSetting $Settings 'COMPOSE_PROJECT_NAME' ''
  if ([string]::IsNullOrWhiteSpace($name)) { $name = Split-Path -Leaf $RepoRoot }
  $name = ($name.ToLowerInvariant() -replace '[^a-z0-9_-]', '')
  $name = $name -replace '^[^a-z0-9]+', ''
  return $name
}

# Các dự án Compose từng được chạy từ ĐÚNG thư mục này, dựa vào nhãn working_dir mà
# Compose gắn vào mọi container. Cần khi .env đã mất: tên dự án có thể đã được đặt
# riêng (ví dụ "ioc-2" khi chạy song song) và không còn suy ra được từ tên thư mục.
function Get-IocDirectoryDeployments([string]$RepoRoot) {
  $result = Invoke-IocNative 'docker' @('ps', '--all', '--format', '{{.Names}}|{{.Labels}}')
  if ($result.ExitCode -ne 0) { return @() }
  $here = Get-IocCanonicalPath $RepoRoot
  $found = [ordered]@{}
  foreach ($line in ($result.Text -split "`n")) {
    $separator = $line.IndexOf('|')
    if ($separator -lt 1) { continue }
    $name = $line.Substring(0, $separator).Trim()
    $labels = $line.Substring($separator + 1).Trim()
    $directory = [regex]::Match($labels, '(?:^|,)com\.docker\.compose\.project\.working_dir=([^,]*)')
    if (-not $directory.Success -or (Get-IocCanonicalPath $directory.Groups[1].Value) -ne $here) { continue }
    $project = [regex]::Match($labels, '(?:^|,)com\.docker\.compose\.project=([^,]*)').Groups[1].Value
    $service = [regex]::Match($labels, '(?:^|,)com\.docker\.compose\.service=([^,]*)').Groups[1].Value
    if (-not $project) { continue }
    if (-not $found.Contains($project)) {
      $found[$project] = [pscustomobject]@{ Project = $project; Instance = $null }
    }
    # container_name của PostgreSQL là "<IOC_INSTANCE>-db".
    if ($service -eq 'postgres' -and $name.EndsWith('-db')) {
      $found[$project].Instance = $name.Substring(0, $name.Length - 3)
    }
  }
  return @($found.Values)
}

function ConvertTo-IocPort($Settings, [string]$Key, [string]$Default) {
  $raw = Get-IocSetting $Settings $Key $Default
  $port = 0
  if (-not [int]::TryParse($raw, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw "Giá trị $Key=$raw trong .env không phải số cổng hợp lệ (1–65535)."
  }
  return $port
}

function Get-IocPorts($Settings) {
  return [ordered]@{
    Web = ConvertTo-IocPort $Settings 'WEB_PORT' '8080'
    Api = ConvertTo-IocPort $Settings 'API_PORT' '3000'
    Database = ConvertTo-IocPort $Settings 'POSTGRES_PORT' '5432'
  }
}

# Hyper-V và WSL giữ chỗ trước những dải cổng ngẫu nhiên sau mỗi lần khởi động máy.
# Cổng trong dải này KHÔNG có ai lắng nghe nên trông như đang trống, nhưng Docker vẫn
# không mở được — lỗi rất hay gặp với 3000 và 5432 trên Windows.
function Get-IocExcludedPortRanges {
  $ranges = @()
  $result = Invoke-IocNative 'netsh.exe' @('interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp')
  if ($result.ExitCode -ne 0) { return $ranges }
  foreach ($line in ($result.Text -split "`n")) {
    $match = [regex]::Match($line, '^\s*(\d+)\s+(\d+)')
    if ($match.Success) {
      $ranges += [pscustomobject]@{ Start = [int]$match.Groups[1].Value; End = [int]$match.Groups[2].Value }
    }
  }
  return $ranges
}

# Địa chỉ IPv4 trong mạng nội bộ của máy (bỏ loopback và địa chỉ tự cấp 169.254.x.x).
function Get-IocLanAddresses {
  try {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object {
        $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' -and
        $_.InterfaceAlias -notmatch '(?i)vEthernet|WSL|Docker|Loopback'
      } | Select-Object -ExpandProperty IPAddress)
  } catch {
    return @()
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
