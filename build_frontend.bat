@echo off
title Build Queue System Frontend
cd /d "%~dp0\frontend"
echo [INFO] Building frontend production bundle...
call npm run build
echo [SUCCESS] Build complete! Assets saved to frontend\dist.
pause
