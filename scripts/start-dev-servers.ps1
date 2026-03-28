param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'

$tsxCliJs = '.\node_modules\tsx\dist\cli.mjs'
$nxCliJs = '.\node_modules\nx\bin\nx.js'

Set-Location $RepoRoot

$commands = @(
  @{
    Name = 'allocator'
    FilePath = 'node'
    WorkingDirectory = $RepoRoot
    ArgumentList = @('./tools/trident-allocator/server.js')
  },
  @{
    Name = 'ssr'
    FilePath = 'powershell.exe'
    WorkingDirectory = $RepoRoot
    ArgumentList = @(
      '-NoProfile',
      '-Command',
      "node .\node_modules\tsx\dist\cli.mjs --watch --tsconfig apps/frontend/tsconfig.server.json apps/frontend/server.nest.ts"
    )
  },
  @{
    Name = 'frontend'
    FilePath = 'powershell.exe'
    WorkingDirectory = $RepoRoot
    ArgumentList = @(
      '-NoProfile',
      '-Command',
      "`$env:NX_DAEMON='false'; node .\node_modules\nx\bin\nx.js serve frontend"
    )
  }
)

$processes = @()
foreach ($command in $commands) {
  $proc = Start-Process -FilePath $command.FilePath -ArgumentList $command.ArgumentList -WorkingDirectory $command.WorkingDirectory -PassThru -NoNewWindow
  $proc | Add-Member -NotePropertyName Label -NotePropertyValue $command.Name
  $processes += $proc
}

try {
  while ($true) {
    foreach ($proc in $processes) {
      if ($proc.HasExited) {
        $exitCode = $proc.ExitCode
        Write-Host "[$($proc.Label)] exited with code $exitCode"
        foreach ($other in $processes | Where-Object { $_.Id -ne $proc.Id -and -not $_.HasExited }) {
          Stop-Process -Id $other.Id -Force -ErrorAction SilentlyContinue
        }
        exit $exitCode
      }
    }
    Start-Sleep -Seconds 1
  }
} finally {
  foreach ($proc in $processes | Where-Object { -not $_.HasExited }) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}
