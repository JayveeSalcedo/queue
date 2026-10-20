@echo off
title Queue Management System - Offline LAN Server
color 0A

echo ======================================================================
echo          OFFICE QUEUE MANAGEMENT SYSTEM (OFFLINE LAN SERVER)
echo ======================================================================
echo.

cd /d "%~dp0"

:: 1. Check if backend venv exists
if not exist "backend\venv\Scripts\python.exe" (
    echo [INFO] Python virtual environment not found. Creating backend\venv...
    python -m venv backend\venv
    echo [INFO] Installing backend dependencies...
    backend\venv\Scripts\pip install -r backend\requirements.txt
)

:: 2. Check if frontend dist exists
if not exist "frontend\dist\index.html" (
    echo [INFO] Frontend production build not found. Building frontend...
    cd frontend
    call npm install
    call npm run build
    cd ..
)

echo.
echo ======================================================================
echo  SERVER READY! CONNECT DEVICES ON THE OFFICE NETWORK (CABLE OR WI-FI):
echo ======================================================================
echo.

:: List every connected network adapter (LAN cable and Wi-Fi each get their own address),
:: skipping virtual adapters; station links use the adapter that has a router (default gateway)
powershell -NoProfile -Command "$cfg = @(Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Virtual|VMware|VirtualBox|Hyper-V|Loopback|TAP|WireGuard' }); Write-Host '  This PC''s address on each network connection:' -ForegroundColor Yellow; foreach ($c in $cfg) { foreach ($a in $c.IPv4Address) { if ($a.IPAddress -notlike '169.254*') { Write-Host ('    ' + $c.InterfaceAlias.PadRight(22) + ': ') -NoNewline; Write-Host ('http://' + $a.IPAddress + ':8000') -ForegroundColor Green } } }; $gw = $cfg | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1; if (-not $gw) { $gw = $cfg | Select-Object -First 1 }; $ip = if ($gw) { ($gw.IPv4Address | Where-Object { $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress } else { $null }; if (-not $ip) { $ip = 'localhost' }; Write-Host ''; Write-Host '  Other devices must use the address of the network they are on.'; Write-Host ('  Station links below use ' + $ip + ':'); Write-Host '';Write-Host '  Guard Station Phone : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/guard') -ForegroundColor Cyan; Write-Host '  Counter 1 (Regular) : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/counter/1') -ForegroundColor Cyan; Write-Host '  Counter 2 (Priority): ' -NoNewline; Write-Host ('http://' + $ip + ':8000/counter/2') -ForegroundColor Cyan; Write-Host '  Counter 3 (Request) : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/counter/3') -ForegroundColor Cyan; Write-Host '  Public Display (TV) : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/display') -ForegroundColor Cyan; Write-Host '  Admin Dashboard     : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/admin') -ForegroundColor Cyan; Write-Host '  Local PC Access     : ' -NoNewline; Write-Host 'http://localhost:8000' -ForegroundColor Yellow"

echo.
echo ======================================================================
echo  Press Ctrl+C to stop the server at any time.
echo ======================================================================
echo.

:: Open browser on local machine
start http://localhost:8000

:: Start Uvicorn Server on 0.0.0.0:8000
backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
pause
