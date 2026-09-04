@echo off
REM BlockVault backend - LOCAL dev with IPv4 mongo + SMTP disabled for devCode login.
REM Run from repo root:  backend\run-local.cmd
set MONGODB_URI=mongodb://127.0.0.1:27017/blockvault
set SMTP_ENABLED=false
set SMTP_HOST=
set SMTP_USER=
set SMTP_PASS=
set EMAIL_FROM_ADDRESS=
set BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
set CHAIN_ID=31337
set CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
set PORT=5000
cd /d "%~dp0"
node dist\server.js
