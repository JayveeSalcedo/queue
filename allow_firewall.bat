@echo off
title Open Port 8000 for Mobile Devices
echo ======================================================================
echo       OPEN PORT 8000 IN WINDOWS DEFENDER FIREWALL
echo ======================================================================
echo.

:: Test for Admin privileges and self-elevate if needed
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [INFO] Prompting for Administrator permission...
    powershell -Command "Start-Process cmd -ArgumentList '/c %~dpnx0' -Verb RunAs"
    exit /b
)

echo [1/2] Adding inbound firewall rule for Port 8000...
netsh advfirewall firewall delete rule name="Queue System (Port 8000)" >nul 2>&1
netsh advfirewall firewall add rule name="Queue System (Port 8000)" dir=in action=allow protocol=TCP localport=8000 profile=any

echo.
echo ======================================================================
echo [SUCCESS] Port 8000 is now open to your local Wi-Fi!
echo.
echo You can now open this URL on your phone's browser:
echo   http://192.168.1.51:8000
echo   http://192.168.1.51:8000/guard
echo   http://192.168.1.51:8000/counter/1
echo ======================================================================
echo.
pause
