#! /usr/bin/env bash
#
# BlockVault — tag and cut a release.
#
# Usage:
#   ./deploy/release.sh v1.0.0   "Short release summary"
#
# Steps:
#   1. Runs the full local test gate (backend + blockchain tests, frontend build)
#      — abort with a non-zero exit if anything fails.
#   2. Creates an annotated git tag.
#
# It does NOT push (you may want to review first). To push:
#   git push --tags && git push
#
# Rollback (see deploy/rollback.md): re-checkout the previous tag, rebuild, and
#   `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
#   plus a mongorestore if the schema changed.

set -euo pipefail

TAG="${1:?usage: release.sh <tag> [summary]}"
SUMMARY="${2:-Release ${TAG}}"

echo "[release] running test gate..."
npm run typecheck   --prefix backend
npm test            --prefix backend
npm test            --prefix blockchain
npm run typecheck   --prefix frontend
npm run build       --prefix frontend

echo "[release] creating annotated tag ${TAG}"
git tag -a "${TAG}" -m "${SUMMARY}"

echo "[release] tag ${TAG} created. Verify with: git show ${TAG}"
echo "[release] push with: git push --tags && git push"
