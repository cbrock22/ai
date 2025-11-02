#!/bin/bash

# Script to check and start Docker daemon (macOS/Linux)

echo "🐳 Checking Docker daemon status..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "Please install Docker from https://www.docker.com/get-started"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "⚠️  Docker daemon is not running. Attempting to start..."

    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        echo "📱 Starting Docker Desktop on macOS..."
        open -a Docker

        # Wait for Docker to start
        echo "⏳ Waiting for Docker daemon to start..."
        retries=30
        while ! docker info &> /dev/null && [ $retries -gt 0 ]; do
            sleep 2
            retries=$((retries - 1))
            echo -n "."
        done
        echo ""

    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Check if running in WSL
        if grep -qi microsoft /proc/version 2>/dev/null; then
            # WSL detected
            echo "🪟 WSL (Windows Subsystem for Linux) detected"
            echo ""
            echo "Please start Docker Desktop on Windows:"
            echo "  1. Open Docker Desktop from the Start menu"
            echo "  2. Wait for Docker to start (whale icon in system tray)"
            echo "  3. Run this command again"
            echo ""
            echo "Alternatively, use the Windows batch script:"
            echo "  scripts\\start-dev.bat"
            exit 1
        fi

        # Native Linux
        echo "🐧 Starting Docker daemon on Linux..."

        # Try systemctl (systemd)
        if command -v systemctl &> /dev/null; then
            if sudo systemctl start docker 2>/dev/null; then
                sleep 3
            else
                echo "⚠️  Could not start Docker with systemctl"
                echo "Trying alternative methods..."
            fi
        fi

        # Try service command as fallback
        if ! docker info &> /dev/null && command -v service &> /dev/null; then
            sudo service docker start 2>/dev/null
            sleep 3
        fi

        # If still not running, give instructions
        if ! docker info &> /dev/null; then
            echo "❌ Could not start Docker daemon automatically"
            echo ""
            echo "Please start Docker manually:"
            echo "  sudo systemctl start docker"
            echo "  # or"
            echo "  sudo service docker start"
            exit 1
        fi
    else
        echo "❌ Unsupported operating system: $OSTYPE"
        exit 1
    fi
fi

# Verify Docker is now running
if docker info &> /dev/null; then
    echo "✅ Docker daemon is running!"
    docker --version
    exit 0
else
    echo "❌ Failed to start Docker daemon"
    echo "Please start Docker manually and try again"
    exit 1
fi
