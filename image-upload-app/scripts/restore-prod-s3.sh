#!/bin/bash

# Restore the prod MongoDB from an OFFSITE S3 backup created by backup-prod-s3.sh.
#
# Usage:
#   bash scripts/restore-prod-s3.sh                 # list available S3 backups
#   bash scripts/restore-prod-s3.sh <backup-name>   # download + restore that archive
#     e.g. bash scripts/restore-prod-s3.sh mongodb_prod_20260620_031500.gz

set -euo pipefail

CONTAINER="image-upload-mongodb-prod"
LOCAL_DIR="./backups/prod"
S3_PREFIX="db-backups"

echo "📥 Production DB restore from S3"
echo ""

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
else
    echo "❌ .env file not found"
    exit 1
fi

: "${S3_BUCKET_NAME:?S3_BUCKET_NAME must be set in .env}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID must be set in .env}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY must be set in .env}"
AWS_REGION="${AWS_REGION:-us-east-2}"

aws_cli() {
    docker run --rm \
        -e AWS_ACCESS_KEY_ID \
        -e AWS_SECRET_ACCESS_KEY \
        -e AWS_REGION \
        -e AWS_DEFAULT_REGION="$AWS_REGION" \
        -v "$(cd "$LOCAL_DIR" && pwd):/backup" \
        amazon/aws-cli:latest "$@"
}

mkdir -p "$LOCAL_DIR"

# No arg: list what's offsite and exit.
if [ -z "${1:-}" ]; then
    echo "Available S3 backups (s3://${S3_BUCKET_NAME}/${S3_PREFIX}/):"
    aws_cli s3 ls "s3://${S3_BUCKET_NAME}/${S3_PREFIX}/" || echo "  (none found)"
    echo ""
    echo "Re-run with a backup name to restore, e.g.:"
    echo "   bash scripts/restore-prod-s3.sh mongodb_prod_YYYYMMDD_HHMMSS.gz"
    exit 0
fi

BACKUP_NAME="$1"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "❌ ${CONTAINER} is not running"
    exit 1
fi

echo "☁️  Downloading ${BACKUP_NAME} from S3..."
aws_cli s3 cp "s3://${S3_BUCKET_NAME}/${S3_PREFIX}/${BACKUP_NAME}" "/backup/${BACKUP_NAME}" --only-show-errors

echo ""
echo "⚠️  WARNING: this will DROP and replace the current prod database!"
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Restoring ${BACKUP_NAME}..."
gunzip < "${LOCAL_DIR}/${BACKUP_NAME}" | docker exec -i "$CONTAINER" mongorestore \
    --username="${MONGO_USERNAME:-admin}" \
    --password="${MONGO_PASSWORD}" \
    --authenticationDatabase=admin \
    --db=image-upload-app \
    --archive \
    --drop

echo ""
echo "✅ Database restored from offsite backup: ${BACKUP_NAME}"
