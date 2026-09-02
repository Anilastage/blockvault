#! /usr/bin/env bash
#
# BlockVault — restore a mongorestore archive produced by deploy/backup.sh
#
# Usage:
#   restore.sh /var/backups/blockvault/20260902_020000/blockvault.archive.gz
#
# WARNING: this DROPS and recreates  the target database from the archive.
# Only run it as part of a deliberate restore / rollback, never casually.
#
# Set MONGODB_URI to the DATABASE YOU ARE RESTORING INTO (the target).

set -euo pipefail

MONGORESTORE="${MONGORESTORE:-mongorestore}"
ARCHIVE="${1:?usage: restore.sh <backup-archive.gz>}"
MONGODB_URI="${MONGODB_URI:?MONGODB_URI is required (target database)}"

if [[ ! -f "${ARCHIVE}" ]]; then
  echo "[restore] archive not found: ${ARCHIVE}" >&2
  exit 1
fi

echo "[restore] restoring ${ARCHIVE} into ${MONGODB_URI}"
echo "[restore] this will overwrite the existing database. Ctrl-C to abort (5s)..."
sleep 5

# --drop removes existing collections in the target db before importing.
"${MONGORESTORE}" \
  --uri="${MONGODB_URI}" \
  --gzip \
  --archive="${ARCHIVE}" \
  --drop

echo "[restore] restore complete"
