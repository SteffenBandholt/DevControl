$root = Split-Path -Parent $PSScriptRoot
Write-Host "DevControl wird vorbereitet unter $root"

$dirs = @(
    "$root\data\packages",
    "$root\data\reviews",
    "$root\data\runs",
    "$root\logs",
    "$root\temp",
    "$root\workspaces"
)

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

if (-not (Test-Path "$root\.env") -and (Test-Path "$root\.env.example")) {
    Copy-Item "$root\.env.example" "$root\.env"
    Write-Host ".env aus .env.example angelegt"
}

Write-Host "DevControl vorbereitet."
