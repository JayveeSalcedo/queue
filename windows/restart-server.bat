@echo off
title Restart Queue Server

:: Needs administrator rights: ask for them if we do not have them yet
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo Restarting the queue server...
schtasks /End /TN "QueueSystem Server" >nul 2>&1
taskkill /F /IM QueueServer.exe >nul 2>&1
timeout /t 2 /nobreak >nul
schtasks /Run /TN "QueueSystem Server"
echo.
echo Done. The queue server is starting again (about 10 seconds).
timeout /t 5 >nul
