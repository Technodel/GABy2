@echo off
title GABy Launcher
cd /d "%~dp0"

echo.
echo  ==========================================
echo   GABy - Starting up...
echo  ==========================================
echo.

REM Kill any existing process on port 3500 (stale server from previous run)
echo  Checking for stale server on port 3500...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3500 "') do (
  echo  Killing stale process %%a on port 3500...
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM Start backend in its own window
start "GABy Backend (port 3500)" cmd /k "cd /d "%~dp0" && npm run dev:server"

REM Wait 3 seconds for backend to boot
timeout /t 3 /nobreak >nul

REM Generate a fresh 7-day JWT token and start the bridge
echo  Starting GABy Bridge...
for /f "delims=" %%T in ('node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({id:1,username:'testuser',role:'user'},process.env.GABY_SECRET_JWT||'dev_secret_for_local_testing_only_change_in_prod',{expiresIn:'7d'}))"') do set BRIDGE_TOKEN=%%T
start "GABy Bridge" cmd /k "gaby-bridge --token %BRIDGE_TOKEN% --server ws://localhost:3500"

REM Start frontend in its own window
start "GABy Frontend (port 5173)" cmd /k "cd /d "%~dp0\src\renderer" && npm run dev"

REM Wait 4 more seconds for Vite to be ready
timeout /t 4 /nobreak >nul

REM Open browser
start "" "http://localhost:5173"

echo.
echo  GABy is running!
echo    Backend  ->  http://localhost:3500
echo    Frontend ->  http://localhost:5173
echo.
echo  Close the two terminal windows to stop GABy.
echo.
pause
