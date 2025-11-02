@echo off
REM Batch script to check and start Docker daemon (Windows)

echo Checking Docker daemon status...

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed!
    echo Please install Docker Desktop from https://www.docker.com/get-started
    exit /b 1
)

REM Check if Docker daemon is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Docker daemon is not running. Attempting to start...

    REM Try to start Docker Desktop
    echo Starting Docker Desktop...

    REM Check common Docker Desktop locations
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Docker\Docker Desktop.exe" (
        start "" "%LOCALAPPDATA%\Programs\Docker\Docker Desktop.exe"
    ) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo [ERROR] Could not find Docker Desktop executable
        echo Please start Docker Desktop manually and try again
        exit /b 1
    )

    REM Wait for Docker to start
    echo Waiting for Docker daemon to start...
    set retries=30
    :wait_loop
    if %retries% leq 0 goto wait_failed
    timeout /t 2 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        set /a retries-=1
        echo|set /p="."
        goto wait_loop
    )
    echo.
)

REM Verify Docker is now running
docker info >nul 2>&1
if errorlevel 1 (
    :wait_failed
    echo [ERROR] Failed to start Docker daemon
    echo Please start Docker Desktop manually and try again
    exit /b 1
)

echo [SUCCESS] Docker daemon is running!
docker --version
exit /b 0
