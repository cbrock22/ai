#!/bin/bash

# Production database backup script

set -e

BACKUP_DIR="./backups/prod"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/mongodb_prod_${TIMESTAMP}.gz"

echo "💾 Production Database Backup"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Check if MongoDB container is running
if ! docker ps | grep -q "image-upload-mongodb-prod"; then
    echo "❌ MongoDB container is not running"
    exit 1
fi

# Load environment
if [ -f .env ]; then
    source .env
else
    echo "❌ .env file not found"
    exit 1
fi

echo "📦 Creating backup..."
echo "Container: image-upload-mongodb-prod"
echo "Destination: $BACKUP_FILE"
echo ""

# Create backup
docker exec image-upload-mongodb-prod mongodump \
    --username="${MONGO_USERNAME:-admin}" \
    --password="${MONGO_PASSWORD}" \
    --authenticationDatabase=admin \
    --db=image-upload-app \
    --archive | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo ""
    echo "✅ Backup created successfully!"
    echo "📁 File: $BACKUP_FILE"
    echo "📊 Size: $BACKUP_SIZE"
    echo ""

    # Keep only last 7 backups
    echo "🧹 Cleaning old backups (keeping last 7)..."
    ls -t ${BACKUP_DIR}/mongodb_prod_*.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true

    echo ""
    echo "📋 Available backups:"
    ls -lh ${BACKUP_DIR}/mongodb_prod_*.gz 2>/dev/null || echo "  No backups found"
else
    echo "❌ Backup failed"
    exit 1
fi
