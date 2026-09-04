# BlockVault — one-command local demo launcher (Windows / PowerShell).
# Run from repo root:  powershell -ExecutionPolicy Bypass -File start-local.ps1
#
# Starts everything with NO Docker, NO wallet, NO Sepolia, NO real email.
# Processes are detached so they keep running after this script exits.
#
# Stop everything:  deploy\stop-local.ps1

$ErrorActionPreference = "SilentlyContinue"
$root = (Split-Path -Parent $MyInvocation.MyCommand.Path).TrimEnd('\')

Write-Host "==> In-memory MongoDB on 127.0.0.1:27017" -ForegroundColor Cyan
Start-Process -FilePath "node" -ArgumentList "`"$root\backend\scripts\devDb.mjs`"" -WorkingDirectory $root -WindowStyle Hidden
Start-Sleep -Seconds 8

Write-Host "==> Local Hardhat chain on 127.0.0.1:8545" -ForegroundColor Cyan
$cli = Join-Path $root "blockchain\node_modules\hardhat\internal\cli\bootstrap.js"
Start-Process -FilePath "node" -ArgumentList "`"$cli`"", "node" -WorkingDirectory (Join-Path $root "blockchain") -WindowStyle Hidden
Start-Sleep -Seconds 12

Write-Host "==> Deploying contract locally" -ForegroundColor Cyan
Push-Location (Join-Path $root "blockchain")
& npm run deploy:local
Pop-Location

Write-Host "==> Backend on :5000 (local Mongo, SMTP off for devCode login)" -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/c", "`"$root\backend\run-local.cmd`"" -WorkingDirectory (Join-Path $root "backend") -WindowStyle Hidden
Start-Sleep -Seconds 6

Write-Host "==> Frontend on :5173" -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/c", "npm run dev" -WorkingDirectory (Join-Path $root "frontend") -WindowStyle Hidden
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "BlockVault is running!" -ForegroundColor Green
Write-Host "  Backend  : http://localhost:5000/health"
Write-Host "  Frontend : http://localhost:5173"
Write-Host ""
Write-Host "Login: SMTP is off, so after login use the 'devCode' in the JSON response"
Write-Host "as your email OTP. First registered user becomes ADMIN."
Write-Host "Stop everything:  powershell -ExecutionPolicy Bypass -File deploy\stop-local.ps1"
