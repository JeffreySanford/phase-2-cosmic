$full = "c:\repos\phase-2-cosmic\test-results\java-governance-full-run.txt"
$out = "c:\repos\phase-2-cosmic\test-results\KafkaIngestListenerIntegrationTest-failure.txt"
if(Test-Path $out){ Remove-Item $out -Force }
$p = Select-String -Path $full -Pattern '\[INFO\] Running com\.cosmic\.governance\.api\.messaging\.KafkaIngestListenerIntegrationTest' -Context 0,400
if($p){
    $lines = @()
    $lines += $p.Line
    $lines += $p.Context.PostContext
    $lines | Out-File $out -Encoding utf8
    Write-Output "EXTRACTED"
} else { Write-Output "NO_MATCH" }
