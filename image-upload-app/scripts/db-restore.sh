#!/bin/bash

# Script to restore MongoDB database from backup

set -e

echo "📥 MongoDB Restore Utility"
echo ""

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file.gz>"
    echo ""
    echo "Available backups:"
    ls -lh backups/*.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE=$1

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

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

echo "⚠️  WARNING: This will replace the current database!"
echo "Container: $CONTAINER"
echo "Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

echo ""
echo "Restoring database..."

# Restore backup
gunzip < "$BACKUP_FILE" | docker exec -i $CONTAINER mongorestore \
    --username=admin \
    --password=admin123 \
    --authenticationDatabase=admin \
    --db=image-upload-app \
    --archive \
    --drop

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database restored successfully!"
else
    echo "❌ Restore failed"
    exit 1
fi
