@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PS_SCRIPT=%SCRIPT_DIR%package-release-offline-images.ps1

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% EQU 0 (
  echo Packaging completed successfully.
) else (
  echo Packaging failed with exit code %EXIT_CODE%.
)

pause
exit /b %EXIT_CODE%