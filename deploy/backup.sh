#! /usr/bin/env bash
#
# BlockVault — nightly MongoDB backup via mongodump.
#
# Copy/adapt to your host and schedule with cron:
#   0 2 * * * /path/to/blockvault/deploy/backup.sh >> /var/log/blockvault-backup.log 2>&1
#
# Requirements:
#   - mongodump / mongosh on the PATH (or set MONGODUMP to the full path).
#   - MONGODB_URI in the environment (or --env-file / a .env source).
#   - A backup destination with enough free space + retention policy.
#
# This backs up ONE database (the blockvault app DB). For a managed Atlas
# cluster, prefer Atlas Continuous Backup / Cloud Backup instead.

set -euo pipefail

MONGODUMP="${MONGODUMP:-mongodump}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/blockvault}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
MONGODB_URI="${MONGODB_URI:?MONGODB_URI is required}"

STAMP="$(date +%Y%m%d_%H%M%S)"
DEST="${BACKUP_ROOT}/${STAMP}"

mkdir -p "${DEST}"

echo "[backup] taking snapshot to ${DEST} at $(date -Is)"

"${MONGODUMP}" \
  --uri="${MONGODB_URI}" \
  --gzip \
  --archive="${DEST}/blockvault.archive.gz"

echo "[backup] snapshot complete"

# Retention: prune directories older than RETENTION_DAYS days.
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +
echo "[backup] pruned backups older than ${RETENTION_DAYS} days"

echo "[backup] done"
