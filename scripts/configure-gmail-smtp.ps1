[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Test-GitIgnoredPath {
  param([Parameter(Mandatory = $true)][string]$RepositoryRoot, [Parameter(Mandatory = $true)][string]$RelativePath)

  Push-Location -LiteralPath $RepositoryRoot
  try {
    & git check-ignore -q --no-index -- $RelativePath
    return $LASTEXITCODE -eq 0
  } finally {
    Pop-Location
  }
}

function Get-AppPasswordPlainText {
  param([Parameter(Mandatory = $true)][System.Security.SecureString]$SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function New-DeliveryToken {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Update-EnvironmentLines {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][AllowEmptyString()][string[]]$Lines,
    [Parameter(Mandatory = $true)][hashtable]$Updates
  )

  $updated = [System.Collections.Generic.List[string]]::new()
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($line in $Lines) {
    $match = [regex]::Match($line, "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=")
    if ($match.Success -and $Updates.ContainsKey($match.Groups[1].Value)) {
      $key = $match.Groups[1].Value
      if ($seen.Add($key)) {
        $updated.Add("$key=$($Updates[$key])")
      }
      continue
    }
    $updated.Add($line)
  }

  foreach ($key in $Updates.Keys) {
    if ($seen.Add($key)) {
      $updated.Add("$key=$($Updates[$key])")
    }
  }
  return $updated.ToArray()
}

function Get-EnvironmentValue {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][AllowEmptyString()][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Name
  )

  foreach ($line in $Lines) {
    $match = [regex]::Match($line, "^\s*$([regex]::Escape($Name))\s*=\s*(.*?)\s*$")
    if ($match.Success) {
      return $match.Groups[1].Value
    }
  }
  return $null
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $repositoryRoot ".env"

if (-not (Test-GitIgnoredPath -RepositoryRoot $repositoryRoot -RelativePath ".env")) {
  throw "Refusing to write SMTP credentials because root .env is not ignored by Git."
}

$gmailAddress = (Read-Host "Gmail address used to send RentMate email").Trim()
if ($gmailAddress.Length -gt 320 -or $gmailAddress -match "[\r\n]" -or $gmailAddress -notmatch "^[^\s@]+@[^\s@]+\.[^\s@]+$") {
  throw "Enter a valid Gmail sender address."
}

$securePassword = Read-Host "16-character Google App Password" -AsSecureString
$appPassword = Get-AppPasswordPlainText -SecureValue $securePassword
$normalizedPassword = $appPassword -replace "\s", ""
Remove-Variable appPassword
if ($normalizedPassword -notmatch "^[A-Za-z0-9]{16}$") {
  Remove-Variable normalizedPassword
  throw "Google App Password must contain 16 letters or digits after spaces are removed."
}

$existingLines = if (Test-Path -LiteralPath $environmentPath) {
  [string[]](Get-Content -LiteralPath $environmentPath)
} else {
  [string[]]@()
}
$existingToken = Get-EnvironmentValue -Lines $existingLines -Name "VERIFICATION_DELIVERY_TOKEN"
$existingDeliveryUrl = Get-EnvironmentValue -Lines $existingLines -Name "VERIFICATION_DELIVERY_URL"

$updates = @{
  EMAIL_DELIVERY_PROVIDER = "GMAIL_SMTP"
  SMTP_HOST = "smtp.gmail.com"
  SMTP_PORT = "465"
  SMTP_SECURE = "true"
  SMTP_USER = $gmailAddress
  SMTP_PASSWORD = $normalizedPassword
  SMTP_FROM = $gmailAddress
  SMTP_TIMEOUT_MS = "5000"
  VERIFICATION_DELIVERY_TOKEN = if ([string]::IsNullOrWhiteSpace($existingToken)) { New-DeliveryToken } else { $existingToken.Trim() }
  VERIFICATION_DELIVERY_URL = if ([string]::IsNullOrWhiteSpace($existingDeliveryUrl)) {
    "http://verification-delivery:4400/internal/v1/verification-delivery"
  } else {
    $existingDeliveryUrl.Trim()
  }
}

try {
  $newLines = Update-EnvironmentLines -Lines $existingLines -Updates $updates
  Set-Content -LiteralPath $environmentPath -Value $newLines -Encoding utf8
} finally {
  Remove-Variable normalizedPassword -ErrorAction SilentlyContinue
  Remove-Variable securePassword -ErrorAction SilentlyContinue
  Remove-Variable updates -ErrorAction SilentlyContinue
  Remove-Variable gmailAddress -ErrorAction SilentlyContinue
}

Write-Host "Gmail SMTP configuration updated. SMTP secret was not printed."
