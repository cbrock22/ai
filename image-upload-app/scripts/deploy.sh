#!/bin/bash

# Deployment script for production server

set -e

echo "🚀 Deploying Image Upload App to Production"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo ""
    echo "Please create .env file from .env.production.example:"
    echo "  cp .env.production.example .env"
    echo "  nano .env  # Edit with your values"
    exit 1
fi

# Check if required vars are set
source .env
if [ "$MONGO_PASSWORD" = "CHANGE_THIS_TO_STRONG_PASSWORD" ]; then
    echo "❌ Error: Please change MONGO_PASSWORD in .env"
    exit 1
fi

if [ "$JWT_SECRET" = "GENERATE_A_NEW_SECRET_HERE" ]; then
    echo "❌ Error: Please generate JWT_SECRET in .env"
    echo "Run: openssl rand -hex 32"
    exit 1
fi

echo "✅ Environment configuration validated"
echo ""

# Pull latest code (if using git)
if [ -d .git ]; then
    echo "📥 Pulling latest code..."
    git pull
    echo ""
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose -f docker-compose.prod.yml down
echo ""

# Build and start services
echo "🔨 Building and starting services..."
docker compose -f docker-compose.prod.yml up --build -d
echo ""

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check if containers are running
if docker compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📊 Container status:"
    docker compose -f docker-compose.prod.yml ps
    echo ""
    echo "🌐 Access your app at: $FRONTEND_URL"
    echo ""
    echo "📝 Useful commands:"
    echo "  View logs:       docker compose -f docker-compose.prod.yml logs -f"
    echo "  Restart:         docker compose -f docker-compose.prod.yml restart"
    echo "  Stop:            docker compose -f docker-compose.prod.yml down"
    echo "  Backup DB:       ./scripts/backup-prod.sh"
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Check logs with: docker compose -f docker-compose.prod.yml logs"
    exit 1
fi
