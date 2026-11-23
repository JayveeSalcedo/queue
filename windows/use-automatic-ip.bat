@echo off
title Use Automatic IP (undo the fixed address)

:: Needs administrator rights: ask for them if we do not have them yet
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo This puts the network connection of this PC back to automatic (DHCP).
echo After that the address of this PC may change, and phones, counters and the
echo TV that use the old address will need the new one.
echo.
choice /C YN /M "Go back to automatic"
if errorlevel 2 exit /b

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-static-ip.ps1" -Undo
echo.
pause
