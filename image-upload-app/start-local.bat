@echo off
echo ========================================
echo Starting Image Upload App (Local Network Only)
echo ========================================
echo.

echo [1/2] Starting backend server...
start "Backend Server" cmd /k "cd /d %~dp0backend && npm start"

echo.
echo Waiting for backend to initialize...
timeout /t 8 /nobreak > nul

echo [2/2] Starting frontend...
start "Frontend Server" cmd /k "cd /d %~dp0frontend && npm start"

echo.
echo ========================================
echo Servers Starting!
echo ========================================
echo.
echo The app will open automatically in your browser.
echo.
echo Access from your computer: http://localhost:3000
echo.
echo The backend will show your network IP address.
echo Use that IP to access from iPhone on same WiFi.
echo Example: http://192.168.1.100:3000
echo.
echo To stop: Close the server windows
echo.
