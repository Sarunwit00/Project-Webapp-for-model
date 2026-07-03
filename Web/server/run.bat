@echo off
rem ---------------------------------------------------------------------------
rem  Launcher for the Thai speech-to-text backend + React frontend.
rem  NOTE: keep this file ASCII-only. Thai (multibyte) text inside a .bat makes
rem  cmd.exe mis-parse lines under "chcp 65001" and the venv fails to activate.
rem ---------------------------------------------------------------------------
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

set "PY=.venv\Scripts\python.exe"

if not exist "%PY%" (
  echo [1/4] Creating virtual environment ...
  python -m venv .venv
  if errorlevel 1 goto fail
)

echo [2/4] Installing / checking Python dependencies - first run downloads ~1GB ...
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 goto fail

echo [3/4] Building the React frontend ...
pushd "..\frontend-react"
if not exist "node_modules" (
  echo    - Installing frontend dependencies, first run only ...
  call npm install
)
call npm run build
set BUILD_ERR=%errorlevel%
popd
if not "%BUILD_ERR%"=="0" goto fail

echo [4/4] Starting server at http://127.0.0.1:8000  - press Ctrl+C to stop
"%PY%" -m uvicorn app:app --host 127.0.0.1 --port 8000
if errorlevel 1 goto fail
goto end

:fail
echo.
echo *** ERROR: a step above failed. Read the message printed above this line. ***

:end
echo.
pause
