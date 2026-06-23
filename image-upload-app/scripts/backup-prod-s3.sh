#!/bin/bash

# Production database backup -> offsite to S3 (3-2-1 rule).
#
# The existing backup-prod.sh keeps dumps in ./backups/prod ON THE SAME BOX, so a
# lost/destroyed Lightsail instance takes the backups with it. This script adds the
# missing OFFSITE copy: it mongodumps the prod DB, gzips it, and uploads the archive
# to s3://$S3_BUCKET_NAME/db-backups/. A small rolling local copy is also kept for
# fast restores. Long-term retention is handled by an S3 lifecycle rule (see below),
# NOT by this script — that keeps the offsite policy in one place and survives even
# if this box never runs the cleanup.
#
# Usage:   bash scripts/backup-prod-s3.sh
# Cron:    add to the Lightsail box (daily at 03:15):
#            15 3 * * * cd /home/ubuntu/image-upload-app && bash scripts/backup-prod-s3.sh >> /var/log/db-backup.log 2>&1
#
# One-time S3 lifecycle rule to auto-expire old offsite backups (run locally with
# the AWS CLI / your admin creds; keeps 30 days of daily dumps):
#   aws s3api put-bucket-lifecycle-configuration \
#     --bucket "$S3_BUCKET_NAME" \
#     --lifecycle-configuration '{"Rules":[{"ID":"expire-db-backups","Filter":{"Prefix":"db-backups/"},"Status":"Enabled","Expiration":{"Days":30}}]}'

set -euo pipefail

CONTAINER="image-upload-mongodb-prod"
LOCAL_DIR="./backups/prod"
LOCAL_KEEP=7
S3_PREFIX="db-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mongodb_prod_${TIMESTAMP}.gz"
BACKUP_FILE="${LOCAL_DIR}/${BACKUP_NAME}"

echo "💾 Production DB backup -> S3"
echo ""

# Load environment (Mongo creds + AWS creds + bucket name).
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

# Verify the Mongo container is up before dumping.
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "❌ ${CONTAINER} is not running"
    exit 1
fi

mkdir -p "$LOCAL_DIR"

echo "📦 Dumping ${CONTAINER} -> ${BACKUP_FILE}"
docker exec "$CONTAINER" mongodump \
    --username="${MONGO_USERNAME:-admin}" \
    --password="${MONGO_PASSWORD}" \
    --authenticationDatabase=admin \
    --db=image-upload-app \
    --archive | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "   ✅ Local archive created (${BACKUP_SIZE})"

# Upload offsite. Run the AWS CLI from its official image so the host needs no
# aws-cli install; mount the backup dir read-only and pass creds via the env.
echo "☁️  Uploading to s3://${S3_BUCKET_NAME}/${S3_PREFIX}/${BACKUP_NAME}"
docker run --rm \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_REGION \
    -e AWS_DEFAULT_REGION="$AWS_REGION" \
    -v "$(cd "$LOCAL_DIR" && pwd):/backup:ro" \
    amazon/aws-cli:latest \
    s3 cp "/backup/${BACKUP_NAME}" \
    "s3://${S3_BUCKET_NAME}/${S3_PREFIX}/${BACKUP_NAME}" \
    --only-show-errors

echo "   ✅ Offsite copy uploaded"

# Trim the local rolling copies (S3 lifecycle handles offsite retention).
echo "🧹 Trimming local copies (keeping last ${LOCAL_KEEP})..."
ls -t "${LOCAL_DIR}"/mongodb_prod_*.gz 2>/dev/null | tail -n +$((LOCAL_KEEP + 1)) | xargs rm -f 2>/dev/null || true

echo ""
echo "✅ Backup complete: ${BACKUP_NAME}"
echo "   Local:  ${BACKUP_FILE}"
echo "   S3:     s3://${S3_BUCKET_NAME}/${S3_PREFIX}/${BACKUP_NAME}"
