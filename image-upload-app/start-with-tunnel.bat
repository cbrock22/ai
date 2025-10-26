@echo off
echo ========================================
echo Starting Image Upload App with LocalTunnel
echo ========================================
echo.

echo [1/2] Starting backend server with localtunnel...
start "Backend Server (with LocalTunnel)" cmd /k "cd /d %~dp0backend && set "ENABLE_TUNNEL=true" && npm start"

echo [2/2] Waiting for backend to initialize...
timeout /t 5 /nobreak > nul

echo [3/2] Starting frontend...
start "Frontend Server" cmd /k "cd /d %~dp0frontend && set "DANGEROUSLY_DISABLE_HOST_CHECK=true" && npm start"

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Check the "Backend Server (with LocalTunnel)" window for:
echo   - Local URLs (localhost and network IP)
echo   - Public LocalTunnel URL (accessible from anywhere)
echo.
echo NOTE: LocalTunnel requires NO signup!
echo   - Works immediately out of the box
echo   - No authentication needed
echo   - Just run and get a public URL
echo.
echo The tunnel will start automatically!
echo.
