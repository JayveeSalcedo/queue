@echo off
setlocal
:: Builds QueueSetup.exe on a Windows PC. Needs: Python 3.11+, Node.js 20+, Inno Setup 6.
:: (GitHub builds it automatically too: see .github\workflows\windows-installer.yml)
cd /d "%~dp0\.."
set "ROOT=%CD%"
set "OUT=%CD%\windows\build"
set "VERSION=%~1"
if "%VERSION%"=="" set "VERSION=1.0.0"

echo [1/5] Python build environment...
if not exist "%OUT%\venv\Scripts\python.exe" python -m venv "%OUT%\venv"
"%OUT%\venv\Scripts\python.exe" -m pip install -q --upgrade pip
"%OUT%\venv\Scripts\python.exe" -m pip install -q -r backend\requirements.txt -r windows\requirements-build.txt || goto fail

echo [2/5] Web pages...
pushd frontend
call npm ci || goto failpop
call npm run build || goto failpop
popd

echo [3/5] Server program...
"%OUT%\venv\Scripts\pyinstaller.exe" --noconfirm --onedir --noconsole --name QueueServer --icon "%ROOT%\windows\app.ico" ^
  --paths "%ROOT%\backend" --collect-submodules uvicorn --collect-submodules websockets ^
  --hidden-import aiosqlite --hidden-import multipart ^
  --distpath "%OUT%\server" --workpath "%OUT%\work-server" --specpath "%OUT%" "%ROOT%\backend\run_server.py" || goto fail

echo [4/5] Counter mini window app...
"%OUT%\venv\Scripts\pyinstaller.exe" --noconfirm --onefile --noconsole --name QueueMini --icon "%ROOT%\windows\app.ico" ^
  --collect-all webview ^
  --distpath "%OUT%\mini" --workpath "%OUT%\work-mini" --specpath "%OUT%" "%ROOT%\windows\mini\queue_mini.py" || goto fail

echo [5/5] Installer...
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    echo Inno Setup 6 was not found. Install it from https://jrsoftware.org/isdl.php and run this again.
    goto fail
)
"%ISCC%" /DAppVersion=%VERSION% windows\QueueSetup.iss || goto fail

echo.
echo Done: windows\output\QueueSetup.exe
exit /b 0

:failpop
popd
:fail
echo.
echo Build failed. See the messages above.
exit /b 1
