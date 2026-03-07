$ErrorActionPreference = 'Stop'

# Repeatable stress harness:
# 1) set runtime load profile via SSR API
# 2) run governance job publisher load
# 3) capture Prometheus snapshots + compose logs
# 4) always revert profile back to 10%

$SSR_URL = if ($env:SSR_URL) { $env:SSR_URL } else { 'http://localhost:4000' }
$LoadProfile = if ($env:PROFILE) { [int]$env:PROFILE } else { 100 }
$SMOKE_SECONDS = if ($env:SMOKE_SECONDS) { [int]$env:SMOKE_SECONDS } else { 180 }
$RATE = if ($env:RATE) { [int]$env:RATE } else { 200 }
$TOTAL = if ($env:TOTAL) { [int]$env:TOTAL } else { 5000 }
$GOV_URL = if ($env:GOV_URL) { $env:GOV_URL } else { "$SSR_URL/api/v1/jobs" }

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$outDir = Join-Path (Get-Location) "logs\stress-run-$stamp"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)] [string]$Path,
        [Parameter(Mandatory = $true)] $Body
    )
    ($Body | ConvertTo-Json -Depth 8) | Out-File -FilePath $Path -Encoding utf8
}

try {
    Write-Host "Setting runtime load profile to $PROFILE% (smokeSeconds=$SMOKE_SECONDS)"
    $setResp = Invoke-RestMethod -Method Post -Uri "$SSR_URL/api/load-profile" -ContentType 'application/json' -Body (@{ profilePct = $PROFILE; smokeSeconds = $SMOKE_SECONDS } | ConvertTo-Json)
    Write-JsonFile -Path (Join-Path $outDir 'profile-set.json') -Body $setResp

    Write-Host "Capturing pre-run profile status + metrics"
    $statusBefore = Invoke-RestMethod -Method Get -Uri "$SSR_URL/api/load-profile"
    Write-JsonFile -Path (Join-Path $outDir 'profile-status-before.json') -Body $statusBefore
    Invoke-WebRequest -UseBasicParsing -Uri "$SSR_URL/api/proxy/prometheus?query=rate(generator_bytes_produced_total[1m])" | Select-Object -ExpandProperty Content | Out-File -FilePath (Join-Path $outDir 'prom-before-bytes-rate.json') -Encoding utf8
    Invoke-WebRequest -UseBasicParsing -Uri "$SSR_URL/api/proxy/prometheus?query=100%20*%20sum(rate(process_cpu_seconds_total%7Bjob%3D~%22data-generator%7Cjava-ingest%22%7D%5B1m%5D))" | Select-Object -ExpandProperty Content | Out-File -FilePath (Join-Path $outDir 'prom-before-cpu.json') -Encoding utf8

    Write-Host "Running governance publisher load (RATE=$RATE, TOTAL=$TOTAL)"
    $env:RATE = "$RATE"
    $env:TOTAL = "$TOTAL"
    $env:GOV_URL = "$GOV_URL"
    node tools/perf/job-publisher.js *> (Join-Path $outDir 'job-publisher.log')

    Write-Host "Capturing post-run profile status + metrics"
    $statusAfter = Invoke-RestMethod -Method Get -Uri "$SSR_URL/api/load-profile"
    Write-JsonFile -Path (Join-Path $outDir 'profile-status-after.json') -Body $statusAfter
    Invoke-WebRequest -UseBasicParsing -Uri "$SSR_URL/api/proxy/prometheus?query=rate(generator_bytes_produced_total[1m])" | Select-Object -ExpandProperty Content | Out-File -FilePath (Join-Path $outDir 'prom-after-bytes-rate.json') -Encoding utf8
    Invoke-WebRequest -UseBasicParsing -Uri "$SSR_URL/api/proxy/prometheus?query=100%20*%20sum(rate(process_cpu_seconds_total%7Bjob%3D~%22data-generator%7Cjava-ingest%22%7D%5B1m%5D))" | Select-Object -ExpandProperty Content | Out-File -FilePath (Join-Path $outDir 'prom-after-cpu.json') -Encoding utf8

    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host 'Capturing docker compose logs snapshot'
        docker compose -f docker/dev-compose.yml logs --no-color --timestamps data-generator java-governance *> (Join-Path $outDir 'compose-logs.txt')
    }

    Write-Host "Stress run complete. Artifacts: $outDir"
}
finally {
    try {
        $revertResp = Invoke-RestMethod -Method Post -Uri "$SSR_URL/api/load-profile" -ContentType 'application/json' -Body (@{ profilePct = 10 } | ConvertTo-Json)
        Write-JsonFile -Path (Join-Path $outDir 'profile-revert.json') -Body $revertResp
    }
    catch {
        $_ | Out-File -FilePath (Join-Path $outDir 'profile-revert.error.txt') -Encoding utf8
    }
}
