@echo off
setlocal
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
if not exist .env (
  call npm run setup
  if errorlevel 1 exit /b 1
)
call npm start
