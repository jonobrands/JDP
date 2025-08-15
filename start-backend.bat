@echo off
title CaseCon Backend (5000 or PORT env)
color 0A

echo Starting CaseCon Backend...
if "%PORT%"=="" (
  echo No PORT set. Defaulting to 5000.
  set PORT=5000
)
cd backend
npm run dev

echo.
echo Backend stopped.
pause
