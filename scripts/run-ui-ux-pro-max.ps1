[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string]$Query,

  [switch]$DesignSystem = $true,

  [string]$Project = "RentMate",

  [string]$Domain,

  [string]$Stack,

  [switch]$Persist,

  [string]$Page,

  [ValidateSet("markdown", "ascii")]
  [string]$Format = "ascii",

  [int]$MaxResults,

  [string[]]$ExtraArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $repositoryRoot ".venv\Scripts\python.exe"
$searchScript = Join-Path $repositoryRoot ".codex\skills\ui-ux-pro-max\scripts\search.py"

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw "The project-local UI/UX Python interpreter is missing: $python"
}

if (-not (Test-Path -LiteralPath $searchScript -PathType Leaf)) {
  throw "The ui-ux-pro-max helper is missing: $searchScript"
}

& $python --version
if ($LASTEXITCODE -ne 0) {
  throw @"
The project-local interpreter could not start. The virtual environment requires the base Python runtime recorded in .venv\pyvenv.cfg.
Repair or recreate .venv with an accessible Python 3.11 runtime, then run this command again.
"@
}

$arguments = @($searchScript, $Query)
if ($DesignSystem) {
  $arguments += "--design-system"
}
if ($Project) {
  $arguments += @("-p", $Project)
}
if ($Domain) {
  $arguments += @("--domain", $Domain)
}
if ($Stack) {
  $arguments += @("--stack", $Stack)
}
if ($Persist) {
  $arguments += "--persist"
}
if ($Page) {
  $arguments += @("--page", $Page)
}
if ($Format -eq "markdown") {
  $arguments += @("-f", "markdown")
}
if ($MaxResults -gt 0) {
  $arguments += @("-n", $MaxResults)
}
$arguments += $ExtraArgs

& $python @arguments
exit $LASTEXITCODE
