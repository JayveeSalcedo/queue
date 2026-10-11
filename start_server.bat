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
echo  SERVER READY! CONNECT DEVICES ON THE SAME WI-FI / ROUTER NETWORK:
echo ======================================================================
echo.

:: Get local IP address using powershell
powershell -Command "$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254*' } | Select-Object -ExpandProperty IPAddress -First 1); if (-not $ip) { $ip = 'localhost' }; Write-Host '  Office PC Local IP : ' -NoNewline -ForegroundColor Yellow; Write-Host $ip -ForegroundColor Green; Write-Host ''; Write-Host '  Guard Station Phone : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/guard') -ForegroundColor Cyan; Write-Host '  Counter 1 (Regular) : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/counter/1') -ForegroundColor Cyan; Write-Host '  Counter 2 (Priority): ' -NoNewline; Write-Host ('http://' + $ip + ':8000/counter/2') -ForegroundColor Cyan; Write-Host '  Counter 3 (Request) : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/counter/3') -ForegroundColor Cyan; Write-Host '  Public Display (TV) : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/display') -ForegroundColor Cyan; Write-Host '  Admin Dashboard     : ' -NoNewline; Write-Host ('http://' + $ip + ':8000/admin') -ForegroundColor Cyan; Write-Host '  Local PC Access     : ' -NoNewline; Write-Host 'http://localhost:8000' -ForegroundColor Yellow"

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
