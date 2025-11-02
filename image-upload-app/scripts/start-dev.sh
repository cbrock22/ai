#!/bin/bash

# Development startup script with Docker daemon check

set -e

echo "🚀 Starting Image Upload App (Development Mode)"
echo ""

# Check and start Docker daemon
./scripts/check-docker.sh

# Start services
echo ""
echo "📦 Starting services with docker-compose..."
docker-compose -f docker-compose.dev.yml up --build

# Cleanup on exit
trap 'echo ""; echo "🛑 Stopping services..."; docker-compose -f docker-compose.dev.yml down' EXIT
