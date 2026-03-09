param(
  [string]$TelemetryUrl = "http://127.0.0.1:4000/api/v1/telemetry/infrastructure",
  [string]$TrafficScript = "C:\repos\phase-2-cosmic\scripts\generate-governance-telemetry-traffic.ps1",
  [int]$MaxAttempts = 8,
  [int]$SleepSeconds = 5
)

$ErrorActionPreference = "Stop"

function Get-Telemetry {
  return Invoke-RestMethod -Uri $TelemetryUrl
}

function MetricValue {
  param(
    [object]$Telemetry,
    [string]$Name
  )

  $runtime = $Telemetry.services.governanceRuntime
  if ($null -eq $runtime) {
    return 0.0
  }
  $value = $runtime.$Name
  if ($null -eq $value) {
    return 0.0
  }
  return [double]$value
}

function RouteMetricSum {
  param(
    [object]$Telemetry,
    [string]$Name
  )

  $runtime = $Telemetry.services.governanceRuntime
  if ($null -eq $runtime) {
    return 0.0
  }
  $map = $runtime.$Name
  if ($null -eq $map) {
    return 0.0
  }

  $total = 0.0
  foreach ($property in $map.PSObject.Properties) {
    $total += [double]$property.Value
  }
  return $total
}

function Any-Improved {
  param(
    [object]$Before,
    [object]$After
  )

  $metricNames = @(
    "submissionRatePerSec",
    "datasetMutationRatePerSec",
    "operatorReadRatePerSec",
    "minioObjectWriteRatePerSec",
    "localObjectWriteRatePerSec",
    "rabbitIngestReceiveRatePerSec",
    "kafkaIngestReceiveRatePerSec",
    "pulsarIngestReceiveRatePerSec"
  )

  foreach ($name in $metricNames) {
    $beforeValue = MetricValue -Telemetry $Before -Name $name
    $afterValue = MetricValue -Telemetry $After -Name $name
    if ($afterValue -gt $beforeValue -or $afterValue -gt 0) {
      Write-Host "Observed telemetry movement in $name : before=$beforeValue after=$afterValue" -ForegroundColor Green
      return $true
    }
  }

  $beforeOperatorReads = RouteMetricSum -Telemetry $Before -Name "operatorReadRouteRatesPerSec"
  $afterOperatorReads = RouteMetricSum -Telemetry $After -Name "operatorReadRouteRatesPerSec"
  if ($afterOperatorReads -gt $beforeOperatorReads -or $afterOperatorReads -gt 0) {
    Write-Host "Observed telemetry movement in operatorReadRouteRatesPerSec : before=$beforeOperatorReads after=$afterOperatorReads" -ForegroundColor Green
    return $true
  }

  return $false
}

Write-Host "Fetching baseline telemetry from $TelemetryUrl" -ForegroundColor Cyan
$before = Get-Telemetry

Write-Host "Generating governance telemetry traffic" -ForegroundColor Cyan
& $TrafficScript | Out-Host

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  Start-Sleep -Seconds $SleepSeconds
  $after = Get-Telemetry
  if (Any-Improved -Before $before -After $after) {
    Write-Host "Telemetry smoke test passed on attempt $attempt." -ForegroundColor Green
    exit 0
  }
  Write-Host "No telemetry delta detected on attempt $attempt/$MaxAttempts yet." -ForegroundColor Yellow
}

throw "Governance telemetry smoke test did not observe a telemetry delta after generated load."
