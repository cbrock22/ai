@echo off
REM Production startup script with Docker daemon check (Windows)

echo Starting Image Upload App (Production Mode)
echo.

REM Get the directory of this script
set SCRIPT_DIR=%~dp0
REM Get the project root (parent of scripts folder)
set PROJECT_ROOT=%SCRIPT_DIR%..

REM Change to project root directory
cd /d "%PROJECT_ROOT%"

REM Check and start Docker daemon
call "%SCRIPT_DIR%check-docker.bat"
if errorlevel 1 exit /b 1

REM Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found
    echo Creating .env from .env.example...
    if exist backend\.env.example (
        copy backend\.env.example .env
        echo [WARNING] Please edit .env with your production settings before continuing!
        exit /b 1
    )
)

REM Start services
echo.
echo Building and starting services...
docker-compose up --build -d

echo.
echo [SUCCESS] Services started successfully!
echo.
echo Access points:
echo    Frontend: http://localhost:3000 (served by backend)
echo    Backend API: http://localhost:3001
echo    MongoDB: localhost:27017
echo    Mongo Express: http://localhost:8081 (admin/admin123)
echo.
echo View logs:
echo    docker-compose logs -f
echo.
echo Stop services:
echo    docker-compose down
