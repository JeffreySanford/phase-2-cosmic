param(
  [string]$TelemetryUrl = "http://127.0.0.1:4000/api/v1/telemetry/infrastructure",
  [string]$TopologyUrl = "http://127.0.0.1:8082/api/v1/metrics/topology",
  [string]$OutputDir = "documentation/governance/examples",
  [string]$ScenarioScript = "C:\repos\phase-2-cosmic\scripts\run-governance-telemetry-scenarios.ps1",
  [string]$LiveScenario = "all",
  [switch]$SkipLiveCapture
)

$ErrorActionPreference = "Stop"

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  ($Value | ConvertTo-Json -Depth 12) | Set-Content -Path $Path -Encoding utf8
}

function Get-Json {
  param([string]$Uri)
  Invoke-RestMethod -Uri $Uri
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$idleTelemetryPath = Join-Path $OutputDir "idle-telemetry-$timestamp.json"
$idleTopologyPath = Join-Path $OutputDir "idle-topology-$timestamp.json"
$liveTelemetryPath = Join-Path $OutputDir "live-telemetry-$timestamp.json"
$liveTopologyPath = Join-Path $OutputDir "live-topology-$timestamp.json"
$readmePath = Join-Path $OutputDir "README.md"

Write-Host "Capturing idle telemetry and topology payloads..." -ForegroundColor Cyan
$idleTelemetry = Get-Json -Uri $TelemetryUrl
$idleTopology = Get-Json -Uri $TopologyUrl
Write-JsonFile -Path $idleTelemetryPath -Value $idleTelemetry
Write-JsonFile -Path $idleTopologyPath -Value $idleTopology

if (-not $SkipLiveCapture) {
  Write-Host "Generating live scenario '$LiveScenario' before capture..." -ForegroundColor Cyan
  & $ScenarioScript -Scenario $LiveScenario | Out-Host
  Start-Sleep -Seconds 6

  Write-Host "Capturing live telemetry and topology payloads..." -ForegroundColor Green
  $liveTelemetry = Get-Json -Uri $TelemetryUrl
  $liveTopology = Get-Json -Uri $TopologyUrl
  Write-JsonFile -Path $liveTelemetryPath -Value $liveTelemetry
  Write-JsonFile -Path $liveTopologyPath -Value $liveTopology
}

$readme = @"
# Governance Telemetry Example Payloads

Generated: $(Get-Date -Format o)

## Idle Capture

- Telemetry: `$idleTelemetryPath`
- Topology: `$idleTopologyPath`

## Live Capture

- Telemetry: `$liveTelemetryPath`
- Topology: `$liveTopologyPath`

## Notes

- Idle captures should show `prometheus` sources with legitimate zero values where the system is quiet.
- Live captures should show movement after the deterministic scenario runner exercises executor, dataset, and broker paths.
- These payloads are intended to support validation and documentation of live-versus-idle behavior.
"@

Set-Content -Path $readmePath -Value $readme -Encoding utf8
Write-Host "Capture complete. Artifacts written under $OutputDir" -ForegroundColor Green
