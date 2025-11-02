#!/bin/bash

# Production startup script with Docker daemon check

set -e

echo "🚀 Starting Image Upload App (Production Mode)"
echo ""

# Check and start Docker daemon
./scripts/check-docker.sh

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found"
    echo "Creating .env from .env.example..."
    if [ -f backend/.env.example ]; then
        cp backend/.env.example .env
        echo "⚠️  Please edit .env with your production settings before continuing!"
        exit 1
    fi
fi

# Start services
echo ""
echo "📦 Building and starting services..."
docker-compose up --build -d

echo ""
echo "✅ Services started successfully!"
echo ""
echo "📱 Access points:"
echo "   Frontend: http://localhost:3000 (served by backend)"
echo "   Backend API: http://localhost:3001"
echo "   MongoDB: localhost:27017"
echo "   Mongo Express: http://localhost:8081 (admin/admin123)"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose down"
