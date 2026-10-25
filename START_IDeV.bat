@echo off
setlocal
cd /d "%~dp0"
title IDeV Setup
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the current LTS version from https://nodejs.org/ and reopen this file.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Repair your Node.js installation and try again.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing IDeV dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and Node.js version.
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
endlocal
