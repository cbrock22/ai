#!/bin/bash

# Production database restore script

set -e

echo "📥 Production Database Restore"
echo ""

# Check if backup file provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file.gz>"
    echo ""
    echo "Available backups:"
    ls -lh ./backups/prod/mongodb_prod_*.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

BACKUP_FILE=$1

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if MongoDB container is running
if ! docker ps | grep -q "image-upload-mongodb-prod"; then
    echo "❌ MongoDB container is not running"
    echo "Start services first: docker compose -f docker-compose.prod.yml up -d"
    exit 1
fi

# Load environment
if [ -f .env ]; then
    source .env
else
    echo "❌ .env file not found"
    exit 1
fi

echo "⚠️  WARNING: This will replace the current database!"
echo "Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to continue? (yes/no) " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

echo "📦 Restoring database..."

# Restore backup
gunzip < "$BACKUP_FILE" | docker exec -i image-upload-mongodb-prod mongorestore \
    --username="${MONGO_USERNAME:-admin}" \
    --password="${MONGO_PASSWORD}" \
    --authenticationDatabase=admin \
    --db=image-upload-app \
    --archive \
    --drop

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database restored successfully!"
    echo ""
    echo "🔄 Restarting backend..."
    docker compose -f docker-compose.prod.yml restart backend
    echo ""
    echo "✅ Restore complete!"
else
    echo "❌ Restore failed"
    exit 1
fi
