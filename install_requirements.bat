@echo off
setlocal EnableExtensions
title Queue Management System - Install Requirements
color 0A
cd /d "%~dp0"

echo ======================================================================
echo          QUEUE MANAGEMENT SYSTEM - INSTALL REQUIREMENTS
echo ======================================================================
echo.
echo  This sets up everything the server needs on this PC:
echo    1. Python 3.9.2 or newer  (3.13 recommended)
echo    2. The server's Python packages  (backend\venv)
echo    3. Node.js 20.19+ / 22.12+  (only to build the web pages)
echo    4. The web pages  (frontend\dist)
echo.
echo  An internet connection is needed for this setup only.
echo  After that the queue system runs fully offline.
echo.
pause
echo.

:: ======================================================================
:: 1. Python
:: ======================================================================
echo [1/4] Checking for Python 3.9.2 or newer...
call :find_python
if defined PYEXE goto python_ok

echo [WARN] Python 3.9.2 or newer was not found on this PC.
where winget >nul 2>&1
if errorlevel 1 goto python_manual
choice /C YN /M "        Download and install Python 3.13 now"
if errorlevel 2 goto python_manual
echo [INFO] Installing Python 3.13 - this can take a few minutes...
winget install -e --id Python.Python.3.13 --accept-package-agreements --accept-source-agreements
call :find_python
if defined PYEXE goto python_ok
echo.
echo [INFO] Python was installed, but this window cannot see it yet.
echo        Close this window and double-click install_requirements.bat again.
goto end_fail

:python_manual
echo.
echo  Please install Python 3.13 from https://www.python.org/downloads/
echo  IMPORTANT: on the first installer screen, tick "Add python.exe to PATH".
echo  Then double-click install_requirements.bat again.
goto end_fail

:python_ok
for /f "delims=" %%V in ('call "%PYEXE%" --version 2^>^&1') do echo [OK] %%V  -  %PYEXE%
echo.

:: ======================================================================
:: 2. Python packages in backend\venv
:: ======================================================================
echo [2/4] Installing the server's Python packages...

:: A venv copied from another computer (e.g. a Mac, or another PC's Python) does not work here
if exist "backend\venv\Scripts\python.exe" (
    "backend\venv\Scripts\python.exe" -c "import sys" >nul 2>&1
    if errorlevel 1 (
        echo [INFO] Removing a broken backend\venv...
        rmdir /s /q "backend\venv"
    )
) else if exist "backend\venv" (
    echo [INFO] Removing a backend\venv copied from another computer...
    rmdir /s /q "backend\venv"
)

if not exist "backend\venv\Scripts\python.exe" (
    echo [INFO] Creating backend\venv...
    "%PYEXE%" -m venv "backend\venv"
    if errorlevel 1 goto fail_venv
)

"backend\venv\Scripts\python.exe" -m pip install --upgrade pip --disable-pip-version-check -q
"backend\venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt" --disable-pip-version-check
if errorlevel 1 goto fail_pip
echo [OK] Python packages installed.
echo.

:: ======================================================================
:: 3. Node.js (only needed to build the web pages)
:: ======================================================================
echo [3/4] Checking for Node.js...
call :find_node
if defined NODE_OK goto node_ok

if exist "frontend\dist\index.html" (
    echo [INFO] Node.js not found, but the web pages are already built.
    echo        Skipping the build. Install Node.js later only if you change the pages.
    goto done
)

echo [WARN] Node.js 20.19+ or 22.12+ was not found, and the web pages are not built yet.
where winget >nul 2>&1
if errorlevel 1 goto node_manual
choice /C YN /M "        Download and install Node.js LTS now"
if errorlevel 2 goto node_manual
echo [INFO] Installing Node.js LTS - this can take a few minutes...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
call :find_node
if defined NODE_OK goto node_ok
echo.
echo [INFO] Node.js was installed, but this window cannot see it yet.
echo        Close this window and double-click install_requirements.bat again.
goto end_fail

:node_manual
echo.
echo  Either install the LTS version of Node.js from https://nodejs.org/
echo  and run install_requirements.bat again,
echo  or copy an already-built "frontend\dist" folder from another computer.
goto end_fail

:node_ok
for /f "delims=" %%V in ('node --version') do echo [OK] Node.js %%V
echo.

:: ======================================================================
:: 4. Build the web pages
:: ======================================================================
echo [4/4] Building the web pages...
pushd frontend
:: Clean install: node_modules copied from a Mac contains Mac-only build tools
call npm ci --no-audit --no-fund
if errorlevel 1 call npm install --no-audit --no-fund
if errorlevel 1 (
    popd
    goto fail_npm
)
call npm run build
if errorlevel 1 (
    popd
    goto fail_build
)
popd
echo [OK] Web pages built.

:done
echo.
echo ======================================================================
echo  [SUCCESS] Everything is installed.
echo ======================================================================
echo.
echo  Next steps:
echo    1. Right-click allow_firewall.bat and choose "Run as administrator"
echo       (only once - lets other PCs and phones connect).
echo    2. Double-click start_server.bat to start the queue system.
echo.
pause
exit /b 0

:: ======================================================================
:: Errors
:: ======================================================================
:fail_venv
echo.
echo [ERROR] Could not create the Python environment in backend\venv.
goto end_fail

:fail_pip
echo.
echo [ERROR] Installing the Python packages failed. Check the internet connection
echo         and the messages above, then run install_requirements.bat again.
goto end_fail

:fail_npm
echo.
echo [ERROR] Installing the web page tools failed. Check the internet connection
echo         and the messages above, then run install_requirements.bat again.
goto end_fail

:fail_build
echo.
echo [ERROR] Building the web pages failed. See the messages above.
goto end_fail

:end_fail
echo.
pause
exit /b 1

:: ======================================================================
:: Helpers
:: ======================================================================

:: Sets PYEXE to the full path of a Python 3.9.2+ interpreter, if one exists.
:: Tries the "py" launcher, PATH, then the default install folders (a fresh
:: install is not on this window's PATH yet).
:find_python
set "PYEXE="
call :try_python_cmd "py -3"
if not defined PYEXE call :try_python_cmd "python"
if not defined PYEXE call :try_python_file "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not defined PYEXE call :try_python_file "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PYEXE call :try_python_file "%ProgramFiles%\Python313\python.exe"
if not defined PYEXE call :try_python_file "%ProgramFiles%\Python312\python.exe"
exit /b 0

:try_python_cmd
%~1 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9, 2) else 1)" >nul 2>&1
if errorlevel 1 exit /b 0
for /f "delims=" %%E in ('%~1 -c "import sys; print(sys.executable)"') do set "PYEXE=%%E"
exit /b 0

:try_python_file
if not exist "%~1" exit /b 0
"%~1" -c "import sys; sys.exit(0 if sys.version_info >= (3, 9, 2) else 1)" >nul 2>&1
if errorlevel 1 exit /b 0
set "PYEXE=%~1"
exit /b 0

:: Sets NODE_OK=1 when a Node.js new enough for the build tools is available.
:find_node
set "NODE_OK="
where node >nul 2>&1
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>&1
if errorlevel 1 exit /b 0
node -e "const [a, b] = process.versions.node.split('.').map(Number); process.exit((a === 20 && b >= 19) || (a === 22 && b >= 12) || a >= 23 ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
    for /f "delims=" %%V in ('node --version') do echo [WARN] Node.js %%V is too old - version 20.19+ or 22.12+ is needed.
    exit /b 0
)
set "NODE_OK=1"
exit /b 0
