@echo off
REM Development startup script with Docker daemon check (Windows)

echo Starting Image Upload App (Development Mode)
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

REM Start services
echo.
echo Starting services with docker-compose...
docker-compose -f docker-compose.dev.yml up --build

REM Cleanup
docker-compose -f docker-compose.dev.yml down
