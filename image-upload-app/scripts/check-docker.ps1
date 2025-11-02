# PowerShell script to check and start Docker daemon (Windows)

Write-Host "🐳 Checking Docker daemon status..." -ForegroundColor Cyan

# Check if Docker is installed
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $dockerCmd) {
    Write-Host "❌ Docker is not installed!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/get-started" -ForegroundColor Yellow
    exit 1
}

# Check if Docker daemon is running
$dockerRunning = docker info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Docker daemon is not running. Attempting to start..." -ForegroundColor Yellow

    # Try to start Docker Desktop
    $dockerDesktop = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
    if ($null -eq $dockerDesktop) {
        Write-Host "📱 Starting Docker Desktop..." -ForegroundColor Cyan

        # Find Docker Desktop executable
        $dockerPaths = @(
            "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
            "$env:LOCALAPPDATA\Programs\Docker\Docker Desktop.exe",
            "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
        )

        $dockerExe = $null
        foreach ($path in $dockerPaths) {
            if (Test-Path $path) {
                $dockerExe = $path
                break
            }
        }

        if ($null -eq $dockerExe) {
            Write-Host "❌ Could not find Docker Desktop executable" -ForegroundColor Red
            Write-Host "Please start Docker Desktop manually and try again" -ForegroundColor Yellow
            exit 1
        }

        # Start Docker Desktop
        Start-Process -FilePath $dockerExe

        # Wait for Docker to start
        Write-Host "⏳ Waiting for Docker daemon to start..." -ForegroundColor Cyan
        $retries = 30
        while ($retries -gt 0) {
            Start-Sleep -Seconds 2
            $dockerRunning = docker info 2>$null
            if ($LASTEXITCODE -eq 0) {
                break
            }
            Write-Host "." -NoNewline
            $retries--
        }
        Write-Host ""
    }
}

# Verify Docker is now running
$dockerRunning = docker info 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Docker daemon is running!" -ForegroundColor Green
    docker --version
    exit 0
} else {
    Write-Host "❌ Failed to start Docker daemon" -ForegroundColor Red
    Write-Host "Please start Docker Desktop manually and try again" -ForegroundColor Yellow
    exit 1
}
