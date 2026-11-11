@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 24 or later.
 pause
 exit /b 1
)
if not exist "node_modules\pdfkit\package.json" (
 echo Installing project dependencies...
 call npm.cmd ci --cache ".npm-cache"
 if errorlevel 1 (
  echo Could not install dependencies. Check your internet connection.
  pause
  exit /b 1
 )
)
node launch.mjs
pause
