[CmdletBinding()]
param(
  [string]$EnvFile
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $repoRoot '.env.supabase.local'
} elseif (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $repoRoot $EnvFile
}

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Supabase environment file was not found: $Path`nCopy .env.supabase.example to .env.supabase.local and replace every placeholder."
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }

    $separator = $line.IndexOf('=')
    if ($separator -lt 1) { continue }

    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Assert-SupabaseUrl([string]$Name, [string]$Value, [switch]$MigrationUrl) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required."
  }
  if ($Value -notmatch '^postgres(?:ql)?://') {
    throw "$Name must be a PostgreSQL connection URL."
  }
  if ($Value -notmatch '(?i)\.supabase\.(com|co)') {
    throw "$Name does not point to a Supabase host."
  }
  if ($Value -match '(PROJECT_REF|URL_ENCODED_PASSWORD|REGION|YOUR-PASSWORD)') {
    throw "$Name still contains a placeholder."
  }
  if ($Value -notmatch '(?i)([?&])schema=ioc(?:&|$)') {
    throw "$Name must contain schema=ioc to keep IOC tables outside the public Data API schema."
  }
  if ($Value -notmatch '(?i)([?&])sslmode=require(?:&|$)') {
    throw "$Name must contain sslmode=require."
  }
  if ($MigrationUrl -and $Value -match ':6543/') {
    throw 'DIRECT_URL cannot use the transaction-mode pooler on port 6543.'
  }
}

function Get-ProcessEnvironment([string]$Name) {
  return [Environment]::GetEnvironmentVariable($Name, 'Process')
}

function Initialize-SupabaseUrls {
  $databaseUrl = Get-ProcessEnvironment -Name 'DATABASE_URL'
  $directUrl = Get-ProcessEnvironment -Name 'DIRECT_URL'
  if (-not [string]::IsNullOrWhiteSpace($databaseUrl) -or
      -not [string]::IsNullOrWhiteSpace($directUrl)) {
    if ([string]::IsNullOrWhiteSpace($databaseUrl) -or
        [string]::IsNullOrWhiteSpace($directUrl)) {
      throw 'DATABASE_URL and DIRECT_URL must either both be set or both be left blank.'
    }
    return
  }

  $projectRef = Get-ProcessEnvironment -Name 'SUPABASE_PROJECT_REF'
  $poolerHost = Get-ProcessEnvironment -Name 'SUPABASE_POOLER_HOST'
  $password = Get-ProcessEnvironment -Name 'SUPABASE_DB_PASSWORD'

  if ([string]::IsNullOrWhiteSpace($projectRef) -or $projectRef -eq 'PROJECT_REF') {
    throw 'SUPABASE_PROJECT_REF is missing or still contains a placeholder.'
  }
  if ($projectRef -notmatch '^[a-z0-9]{12,32}$') {
    throw 'SUPABASE_PROJECT_REF has an invalid format.'
  }
  if ([string]::IsNullOrWhiteSpace($poolerHost) -or $poolerHost -match 'REGION') {
    throw 'SUPABASE_POOLER_HOST is missing or still contains a placeholder.'
  }
  if ($poolerHost -notmatch '^[a-z0-9.-]+\.pooler\.supabase\.com$') {
    throw 'SUPABASE_POOLER_HOST has an invalid format.'
  }
  if ([string]::IsNullOrWhiteSpace($password) -or $password -eq 'PASTE_DATABASE_PASSWORD_HERE') {
    throw 'SUPABASE_DB_PASSWORD is missing or still contains a placeholder.'
  }

  $encodedUser = [Uri]::EscapeDataString("postgres.$projectRef")
  $encodedPassword = [Uri]::EscapeDataString($password)
  $baseUrl = "postgresql://${encodedUser}:${encodedPassword}@${poolerHost}:5432/postgres"
  $databaseUrl = "${baseUrl}?schema=ioc&sslmode=require&connect_timeout=30&connection_limit=5"
  $directUrl = "${baseUrl}?schema=ioc&sslmode=require&connect_timeout=30"

  [Environment]::SetEnvironmentVariable('DATABASE_URL', $databaseUrl, 'Process')
  [Environment]::SetEnvironmentVariable('DIRECT_URL', $directUrl, 'Process')
  $password = $null
  $encodedPassword = $null
}

try {
  Import-DotEnv -Path $EnvFile
  Initialize-SupabaseUrls

  $databaseUrl = Get-ProcessEnvironment -Name 'DATABASE_URL'
  $directUrl = Get-ProcessEnvironment -Name 'DIRECT_URL'
  Assert-SupabaseUrl -Name 'DATABASE_URL' -Value $databaseUrl
  Assert-SupabaseUrl -Name 'DIRECT_URL' -Value $directUrl -MigrationUrl

  Write-Host 'Supabase connection configuration is valid.' -ForegroundColor Green
  Write-Host 'Deploying committed Prisma migrations to the private ioc schema...' -ForegroundColor Cyan

  Push-Location $repoRoot
  try {
    & npm run prisma:deploy -w '@ioc/api'
    if ($LASTEXITCODE -ne 0) { throw 'Prisma migrate deploy failed.' }

    & npm run prisma:status -w '@ioc/api'
    if ($LASTEXITCODE -ne 0) { throw 'Prisma migration status verification failed.' }

    & npm run prisma:generate -w '@ioc/api'
    if ($LASTEXITCODE -ne 0) { throw 'Prisma Client generation failed.' }

    $schemaPath = Join-Path $repoRoot 'apps\api\prisma\schema.prisma'
    $expectedTables = @(Get-Content -LiteralPath $schemaPath | ForEach-Object {
      if ($_ -match '^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{') { $Matches[1] }
    })
    $expectedEnums = @(Get-Content -LiteralPath $schemaPath | ForEach-Object {
      if ($_ -match '^enum\s+([A-Za-z][A-Za-z0-9_]*)\s*\{') { $Matches[1] }
    })

    $verificationScript = Join-Path $repoRoot 'scripts\verify-supabase-schema.mjs'
    $verificationJson = (& node $verificationScript | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($verificationJson)) {
      throw 'Could not verify the deployed Supabase schema.'
    }
    $verification = $verificationJson | ConvertFrom-Json
    $actualTables = @($verification.tables | ForEach-Object { [string]$_.name })
    $actualEnums = @($verification.enums | ForEach-Object { [string]$_.name })
    $actualMigrations = @($verification.migrations | ForEach-Object { [string]$_.name })
    $missingTables = @($expectedTables | Where-Object { $_ -notin $actualTables })
    $missingEnums = @($expectedEnums | Where-Object { $_ -notin $actualEnums })

    if ($missingTables.Count -gt 0) {
      throw "Supabase is missing table(s): $($missingTables -join ', ')"
    }
    if ($missingEnums.Count -gt 0) {
      throw "Supabase is missing enum(s): $($missingEnums -join ', ')"
    }
    if ($actualMigrations.Count -ne 27) {
      throw "Expected 27 applied migrations, found $($actualMigrations.Count)."
    }

    Write-Host "Verified $($expectedTables.Count) application tables, $($expectedEnums.Count) enums and $($actualMigrations.Count) applied migrations." -ForegroundColor Green
  } finally {
    Pop-Location
  }

  Write-Host 'Supabase schema deployment completed successfully.' -ForegroundColor Green
} catch {
  Write-Error $_
  exit 1
}
