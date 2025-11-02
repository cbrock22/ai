#!/bin/bash

# Script to backup MongoDB database

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/mongodb_backup_${TIMESTAMP}.gz"

echo "💾 MongoDB Backup Utility"
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if MongoDB container is running
if ! docker ps | grep -q "image-upload-mongodb"; then
    echo "❌ MongoDB container is not running"
    echo "Start the services first with: npm run docker:dev or npm run docker:prod"
    exit 1
fi

# Determine container name
if docker ps | grep -q "image-upload-mongodb-dev"; then
    CONTAINER="image-upload-mongodb-dev"
else
    CONTAINER="image-upload-mongodb"
fi

echo "Creating backup from container: $CONTAINER"
echo "Backup location: $BACKUP_FILE"
echo ""

# Create backup
docker exec $CONTAINER mongodump \
    --username=admin \
    --password=admin123 \
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
    echo "To restore this backup, run:"
    echo "   ./scripts/db-restore.sh $BACKUP_FILE"
else
    echo "❌ Backup failed"
    exit 1
fi
