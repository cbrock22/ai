@echo off
REM Simple startup script (no Docker check)
REM Run this from the project root directory

echo.
echo ========================================
echo   Image Upload App - Development Mode
echo ========================================
echo.

REM Check if Docker is available
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo.
    echo Please start Docker Desktop from the Start menu
    echo and wait for the whale icon to appear in the system tray.
    echo.
    echo Then run this script again.
    echo.
    pause
    exit /b 1
)

echo [OK] Docker is running
echo.
echo Starting services...
echo.
echo This will:
echo   - Start MongoDB (port 27017)
echo   - Start Mongo Express (http://localhost:8081)
echo   - Start Backend API (http://localhost:5001)
echo   - Start Frontend (http://localhost:5000)
echo.
echo ========================================
echo   ACCESS YOUR APP AT:
echo   http://localhost:5000
echo ========================================
echo.

docker-compose -f docker-compose.dev.yml up --build

REM On exit
echo.
echo Services stopped. Cleaning up...
docker-compose -f docker-compose.dev.yml down
