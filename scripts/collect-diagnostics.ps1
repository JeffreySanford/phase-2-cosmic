# PowerShell diagnostic collector for phase-2-cosmic
# Usage: .\scripts\collect-diagnostics.ps1

$ErrorActionPreference = 'Stop'

$timestamp = (Get-Date).ToString('yyyyMMddTHHmmssZ')
$out = Join-Path -Path (Get-Location) -ChildPath ("logs\diagnostics-$timestamp")
New-Item -ItemType Directory -Path $out -Force | Out-Null

Write-Host "Collecting diagnostics into: $out"

# 1) copy existing repo logs if any
if (Test-Path .\logs) {
    Write-Host "Copying repo logs..."
    try { Copy-Item -Path .\logs\* -Destination (Join-Path $out 'repo-logs') -Recurse -Force -ErrorAction SilentlyContinue } catch { }
}

# 2) copy Cypress screenshots (if present)
$cypressScreens = Join-Path (Get-Location) 'dist\cypress\apps\frontend-e2e\screenshots'
if (Test-Path $cypressScreens) {
    Write-Host "Copying Cypress screenshots from $cypressScreens"
    New-Item -ItemType Directory -Path (Join-Path $out 'screenshots') -Force | Out-Null
    Get-ChildItem -Path $cypressScreens -Recurse -Include *.png -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName -Destination (Join-Path $out 'screenshots') -Force
    }
}

# 3) collect docker compose logs for java-governance (if docker available)
try {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "Collecting docker compose logs for java-governance (if running)"
        docker compose -f docker/dev-compose.yml logs --no-color --timestamps java-governance 2>&1 | Out-File -FilePath (Join-Path $out 'java-governance.log') -Encoding utf8
    }
} catch {
    Write-Host "Docker logs collection failed: $_"
}

# 4) snapshot network/listening ports related to frontend/SSR
try {
    Write-Host "Recording listening ports (netstat)"
    netstat -aon | Select-String ":4200|:3000" | Out-File -FilePath (Join-Path $out 'ports-netstat.txt') -Encoding utf8
} catch {
    Write-Host "netstat failed: $_"
}

# 5) tail the most recently modified start* log under repo logs
try {
    $startLog = Get-ChildItem -Path .\logs -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'start*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($startLog) {
        Write-Host "Tailing start log: $($startLog.FullName)"
        Get-Content -Path $startLog.FullName -Tail 2000 | Out-File -FilePath (Join-Path $out 'start-latest.log') -Encoding utf8
    } else {
        Write-Host "No start* logs found under .\logs"
    }
} catch {
    Write-Host "Failed reading start logs: $_"
}

Write-Host "Diagnostics collected into: $out"
Write-Host "You can compress the folder or attach files from there."
