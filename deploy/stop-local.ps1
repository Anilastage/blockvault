# Stop all local BlockVault services.
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -match 'server\.js|devDb|bootstrap\.js|hardhat|vite|src/server'
}
if ($procs) {
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Host "Stopped $($procs.Count) process(es)." -ForegroundColor Yellow
} else {
    Write-Host "No BlockVault processes found." -ForegroundColor Gray
}
