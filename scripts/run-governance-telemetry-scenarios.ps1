param(
  [ValidateSet("all", "simulator", "vo", "tacc", "rabbit", "kafka", "pulsar", "curation", "reads")]
  [string]$Scenario = "all",
  [string]$GovernanceBaseUrl = "http://127.0.0.1:8082",
  [string]$DockerComposeFile = "docker/dev-compose.yml",
  [int]$SleepSeconds = 4
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body
  )

  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 8 } else { $null }
  Invoke-RestMethod -Method $Method -Uri $Uri -ContentType "application/json" -Body $json
}

function New-TraceId {
  [guid]::NewGuid().ToString()
}

function New-Dataset {
  param([string]$Name)

  $requestedDatasetId = "scenario-ds-$([guid]::NewGuid().ToString().Substring(0, 8))"
  $body = @{
    id          = $requestedDatasetId
    name        = $Name
    description = "Deterministic telemetry scenario dataset"
    metadata    = @{
      source  = "scenario-runner"
      traceId = (New-TraceId)
    }
    manifest    = @{
      job             = "scenario-runner"
      version         = 1
      manifestVersion = 1
      scenario        = $Name
    }
  }
  $createdDataset = Invoke-Json -Method Post -Uri "$GovernanceBaseUrl/api/v1/datasets" -Body $body
  return $(if ($createdDataset.id) { $createdDataset.id } else { $requestedDatasetId })
}

function Submit-Job {
  param(
    [string]$Workflow,
    [string]$Executor,
    [string]$DatasetId
  )

  $parameters = @{
    requestId = (New-TraceId)
    executor  = $Executor
    scenario  = $Scenario
  }
  if ($Workflow -eq "vo.adql.query") {
    $parameters["provider"] = "heasarc"
    $parameters["tapUrl"] = "https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync"
    $parameters["adql"] = "SELECT TOP 5 * FROM ivoa.obscore"
    $parameters["limit"] = 5
  }

  $body = @{
    workflow    = $Workflow
    datasetId   = $DatasetId
    requestedBy = "scenario-runner"
    parameters  = $parameters
    lineage     = @{
      parentDataset = $DatasetId
      stage         = "scenario-runner"
    }
    manifest    = @{
      manifestVersion = 1
      executor        = $Executor
      workflow        = $Workflow
    }
  }
  Invoke-Json -Method Post -Uri "$GovernanceBaseUrl/api/v1/jobs" -Body $body | Out-Null
}

function Publish-Rabbit {
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

function Publish-Kafka {
  param([string]$Payload)

  $Payload | docker compose -f $DockerComposeFile exec -T kafka bash -lc "cat >/tmp/governance-telemetry-payload.json && kafka-console-producer --broker-list kafka:9092 --topic phase2-events < /tmp/governance-telemetry-payload.json" | Out-Null
}

function Publish-Pulsar {
  param([string]$Payload)

  $Payload | docker compose -f $DockerComposeFile exec -T pulsar bash -lc 'cat >/tmp/governance-telemetry-payload.json && MESSAGE=$(cat /tmp/governance-telemetry-payload.json) && bin/pulsar-client produce phase2-events -n 1 -m "$MESSAGE"' | Out-Null
}

function Invoke-ReadPath {
  param([string]$DatasetId)

  Invoke-RestMethod -Uri "$GovernanceBaseUrl/api/v1/datasets/$DatasetId" | Out-Null
  Invoke-RestMethod -Uri "$GovernanceBaseUrl/api/v1/datasets" | Out-Null
  Invoke-RestMethod -Uri "$GovernanceBaseUrl/api/v1/jobs" | Out-Null
}

function Invoke-BrokerScenario {
  param([string]$Broker)

  $payload = @{
    workflow    = "ingest"
    datasetId   = "broker-ds-$([guid]::NewGuid().ToString().Substring(0, 8))"
    requestedBy = "scenario-runner"
    parameters  = @{
      requestId = (New-TraceId)
      scenario  = "$Broker-path"
    }
  } | ConvertTo-Json -Depth 6 -Compress

  switch ($Broker) {
    "rabbit" { Publish-Rabbit -Payload $payload }
    "kafka" { Publish-Kafka -Payload $payload }
    "pulsar" { Publish-Pulsar -Payload $payload }
  }
}

Write-Host "Running governance telemetry scenario: $Scenario" -ForegroundColor Cyan

$datasetId = New-Dataset -Name "Scenario $Scenario"

switch ($Scenario) {
  "all" {
    Submit-Job -Workflow "simulate.visibility" -Executor "simulator" -DatasetId $datasetId
    Submit-Job -Workflow "vo.adql.query" -Executor "vo" -DatasetId $datasetId
    Submit-Job -Workflow "ingest" -Executor "tacc" -DatasetId $datasetId
    Invoke-BrokerScenario -Broker "rabbit"
    Invoke-BrokerScenario -Broker "kafka"
    Invoke-BrokerScenario -Broker "pulsar"
    Invoke-ReadPath -DatasetId $datasetId
  }
  "simulator" { Submit-Job -Workflow "simulate.visibility" -Executor "simulator" -DatasetId $datasetId }
  "vo" { Submit-Job -Workflow "vo.adql.query" -Executor "vo" -DatasetId $datasetId }
  "tacc" { Submit-Job -Workflow "ingest" -Executor "tacc" -DatasetId $datasetId }
  "rabbit" { Invoke-BrokerScenario -Broker "rabbit" }
  "kafka" { Invoke-BrokerScenario -Broker "kafka" }
  "pulsar" { Invoke-BrokerScenario -Broker "pulsar" }
  "curation" {
    New-Dataset -Name "Scenario curation extra" | Out-Null
    Submit-Job -Workflow "ingest" -Executor "tacc" -DatasetId $datasetId
  }
  "reads" { Invoke-ReadPath -DatasetId $datasetId }
}

Start-Sleep -Seconds $SleepSeconds

Write-Host "Scenario complete." -ForegroundColor Green
Write-Host "Dataset seed: $datasetId"
