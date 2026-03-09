param(
  [string]$GovernanceBaseUrl = "http://127.0.0.1:8082",
  [string]$TelemetryUrl = "http://127.0.0.1:4000/api/v1/telemetry/infrastructure",
  [string]$DockerComposeFile = "docker/dev-compose.yml",
  [int]$DatasetCount = 3,
  [int]$JobCount = 4,
  [switch]$SkipBrokers
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body
  )

  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 8 } else { $null }
  return Invoke-RestMethod -Method $Method -Uri $Uri -ContentType "application/json" -Body $json
}

function New-TraceId {
  return [guid]::NewGuid().ToString()
}

function Publish-RabbitIngest {
  param([string]$Payload)

  $uri = "http://127.0.0.1:15672/api/exchanges/%2F/cosmic.ingest.exchange/publish"
  $auth = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes("guest:guest"))
  $body = @{
    properties       = @{}
    routing_key      = "ingest.test"
    payload          = $Payload
    payload_encoding = "string"
  }
  Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Basic $auth" } -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 6) | Out-Null
}

function Publish-DockerKafka {
  param([string]$Payload)

  $Payload | docker compose -f $DockerComposeFile exec -T kafka bash -lc "cat >/tmp/governance-telemetry-payload.json && kafka-console-producer --broker-list kafka:9092 --topic phase2-events < /tmp/governance-telemetry-payload.json" | Out-Null
}

function Publish-DockerPulsar {
  param([string]$Payload)

  $Payload | docker compose -f $DockerComposeFile exec -T pulsar bash -lc 'cat >/tmp/governance-telemetry-payload.json && MESSAGE=$(cat /tmp/governance-telemetry-payload.json) && bin/pulsar-client produce phase2-events -n 1 -m "$MESSAGE"' | Out-Null
}

Write-Host "Telemetry before traffic:" -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri $TelemetryUrl | ConvertTo-Json -Depth 8
} catch {
  Write-Warning "Could not read telemetry before traffic from $TelemetryUrl : $($_.Exception.Message)"
}

$createdDatasetIds = @()

for ($i = 1; $i -le $DatasetCount; $i++) {
  $requestedDatasetId = "telem-ds-$([guid]::NewGuid().ToString().Substring(0, 8))"
  $datasetBody = @{
    id          = $requestedDatasetId
    name        = "Telemetry Dataset $i"
    description = "Generated telemetry dataset"
    metadata    = @{
      source  = "telemetry-script"
      traceId = (New-TraceId)
    }
    manifest    = @{
      job             = "telemetry-script"
      version         = 1
      manifestVersion = 1
      channels        = 4
      storageHint     = "minio"
    }
  }
  $createdDataset = Invoke-Json -Method Post -Uri "$GovernanceBaseUrl/api/v1/datasets" -Body $datasetBody
  $createdDatasetIds += if ($createdDataset.id) { $createdDataset.id } else { $requestedDatasetId }
}

for ($i = 1; $i -le $JobCount; $i++) {
  $datasetId = $createdDatasetIds[($i - 1) % [Math]::Max(1, $createdDatasetIds.Count)]
  $isVoWorkflow = ($i % 2 -eq 0)
  $workflow = if ($isVoWorkflow) { "vo.adql.query" } else { "ingest" }
  $executor = if ($i % 3 -eq 0) { "tacc" } elseif ($isVoWorkflow) { "vo" } else { "simulator" }
  $parameters = @{
    requestId = (New-TraceId)
    executor  = $executor
  }
  if ($workflow -eq "vo.adql.query") {
    $parameters["provider"] = "heasarc"
    $parameters["tapUrl"] = "https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync"
    $parameters["adql"] = "SELECT TOP 5 * FROM ivoa.obscore"
    $parameters["limit"] = 5
  }
  $jobBody = @{
    workflow    = $workflow
    datasetId   = $datasetId
    requestedBy = "telemetry-script"
    parameters  = $parameters
    lineage     = @{
      parentDataset = $datasetId
      stage         = "telemetry-script"
    }
    manifest    = @{
      manifestVersion = 1
      scriptRun       = (Get-Date).ToString("o")
    }
  }
  Invoke-Json -Method Post -Uri "$GovernanceBaseUrl/api/v1/jobs" -Body $jobBody | Out-Null
}

Invoke-RestMethod -Uri "$GovernanceBaseUrl/api/v1/jobs" | Out-Null

if (-not $SkipBrokers) {
  $brokerPayload = @{
    workflow    = "ingest"
    datasetId   = "broker-ds-$([guid]::NewGuid().ToString().Substring(0, 8))"
    requestedBy = "telemetry-script"
    parameters  = @{
      requestId = (New-TraceId)
    }
  } | ConvertTo-Json -Depth 6 -Compress

  try {
    Publish-RabbitIngest -Payload $brokerPayload
  } catch {
    Write-Warning "RabbitMQ publish failed: $($_.Exception.Message)"
  }

  try {
    Publish-DockerKafka -Payload $brokerPayload
  } catch {
    Write-Warning "Kafka publish failed: $($_.Exception.Message)"
  }

  try {
    Publish-DockerPulsar -Payload $brokerPayload
  } catch {
    Write-Warning "Pulsar publish failed: $($_.Exception.Message)"
  }
}

Start-Sleep -Seconds 6

Write-Host "Telemetry after traffic:" -ForegroundColor Green
Invoke-RestMethod -Uri $TelemetryUrl | ConvertTo-Json -Depth 8
