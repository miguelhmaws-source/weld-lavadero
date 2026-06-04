@echo off
setlocal
set "APP_DIR=%~dp0"
set "BUNDLED_PY=C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%BUNDLED_PY%" (
  "%BUNDLED_PY%" "%APP_DIR%server.py" --open
) else (
  py "%APP_DIR%server.py" --open
)

pause
