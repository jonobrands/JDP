@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Allow optional port argument: start-backend.bat [port]
set PORT=5000
if not "%~1"=="" set PORT=%~1

echo Checking for processes using port %PORT% ...

REM Preferred: use PowerShell to find and kill listeners on the port
powershell -NoProfile -Command "^$p = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess; if(^$p){ ^$p ^| ForEach-Object { try { Stop-Process -Id ^$_ -Force -ErrorAction SilentlyContinue } catch {} } }"

REM Fallback 1: use netstat+taskkill for any connection on the port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R ":%PORT%[ ]"') do (
  echo Attempting to kill PID %%a on port %PORT% ...
  taskkill /F /PID %%a >nul 2>&1
)

REM Fallback 2: only LISTENING lines
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R ":%PORT%[ ]" ^| findstr LISTENING') do (
  echo Ensuring PID %%a is killed ...
  taskkill /F /PID %%a >nul 2>&1
)

echo Starting backend on port %PORT% ...
set PORT=%PORT%
call npm run dev

endlocal
