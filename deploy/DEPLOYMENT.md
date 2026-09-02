# BlockVault — Deployment, Rollback & Operations

This is the consolidated operator guide for taking **BlockVault** to production.
The full step-by-step playbook lives in [`WHATS_NEXT.txt`](../WHATS_NEXT.txt);
this file documents the concrete artifacts this repo now ships to support it.

## Artifacts in this repo

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Base stack (mongo + backend + frontend). `JWT_SECRET`/`CLIENT_URL`/`BLOCKCHAIN_RPC_URL`/`CHAIN_ID` are now **required** — no fallback. Full SMTP/SMS passthrough added. |
| `docker-compose.prod.yml` | Production override: requires `MONGODB_URI` (managed Mongo) and exposes only :443. Layer with `-f docker-compose.yml -f docker-compose.prod.yml`. |
| `docker.env.example` | Template listing every variable the compose stack reads (git-committed). Copy to host `./.env` (git-ignored) and fill in. |
| `frontend/nginx.conf` | Same-origin reverse proxy; SPA fallback + SSE `proxy_buffering off`. |
| `frontend/nginx.https.conf` | Optional TLS-terminating nginx config (replace `app.yourdomain.com`). Pairs with a certbot sidecar. |
| `backend/.env.prod.example` | Production backend template (git-committed). Copy to `backend/.env` on the host. |
| `blockchain/.env.sepolia.example` | Sepolia deploy template (git-committed). Copy to `blockchain/.env`. |
| `deploy/backup.sh` | Nightly `mongodump` archive + retention prune. |
| `deploy/restore.sh` | `mongorestore` of a backup archive (drops target db). |
| `deploy/release.sh` | Runs the full test gate, then tags an annotated release. |
| `backend/scripts/promote.ts` | Promote a user to ADMIN against the prod DB. |

## Before you deploy

1. **Verify baseline** — everything must pass locally first:
   ```bash
   cd backend   && npm run typecheck && npm test      # 33 tests
   cd blockchain&& npm test                           # 9 tests
   cd frontend  && npm run typecheck && npm run build
   npm run build   # root: backend + frontend
   ```
2. **Generate secrets** (one per environment):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   The backend now **refuses to start in production with a known/default secret**
   (`change-me-...`, `dev-only-...`, `blockvault-dev-...`). `docker-compose.yml`
   also fails fast if `JWT_SECRET`/`CLIENT_URL`/`BLOCKCHAIN_RPC_URL`/`CHAIN_ID`
   are unset.
3. **MongoDB** — use a managed DB (Atlas or dedicated mongod with auth + backups).
   Put the URI in `MONGODB_URI`. If you keep the containerized mongo, set a
   password and `MONGODB_URI=mongodb://user:pass@mongo:27017/blockvault?authSource=admin`.
4. **Email SMTP** — login is gated on Email OTP, so SMTP is effectively required.
   Prefer a domain sender; configure SPF/DKIM/DMARC. Fill `SMTP_*` / `EMAIL_FROM_*`.
5. **Deploy the contract to Sepolia**:
   ```bash
   cd blockchain
   cp .env.sepolia.example .env   # fill SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY (+ ETHERSCAN_API_KEY)
   npm run deploy:sepolia         # writes blockchain/deployment.json
   ```
   Copy `CONTRACT_ADDRESS` from `deployment.json` into `backend/.env` / the
   compose env.
6. **Admin account** — the first registered user becomes ADMIN. To promote an
   existing user to ADMIN against prod:
   ```bash
   cd backend
   npx tsx scripts/promote.ts admin@yourdomain.com
   ```

## Deploy (two common paths)

### A) Managed Mongo (recommended) — compose
```bash
cp docker.env.example .env      # fill in real values (git-ignored)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose ps
docker compose logs -f backend   # expect "BlockVault API running"
```

### B) Containerized Mongo
```bash
cp docker.env.example .env
docker compose build --no-cache
docker compose up -d
```

In both cases the frontend bakes in `VITE_API_URL=/api` (same-origin reverse
proxy, no CORS). Point DNS at the host and make `CLIENT_URL` match the real
origin exactly, or CORS will reject browser requests.

## Health check

```
GET /health
```
Returns `200` + `{ db: "connected", contract: "configured"|"not-set", chainId }`
when Mongo is connected, or `503` when the DB is down — useful for uptime probes.

## Rollback

If a release misbehaves:

1. `docker compose -f docker-compose.yml -f docker-compose.prod.yml down`
2. Re-checkout the previous known-good tag:
   ```bash
   git checkout v1.0.0   # the last good tag
   ```
3. `docker compose ... build --no-cache && docker compose ... up -d` (env unchanged)
4. If the DB schema changed and you need the old shape, restore the pre-release
   backup (always back up before every deploy):
   ```bash
   ./deploy/restore.sh /var/backups/blockvault/<pre-release-stamp>/blockvault.archive.gz
   ```

## Backups

Automate nightly snapshots:
```bash
./deploy/backup.sh    # requires MONGODB_URI, defaults: retention 7d -> /var/backups/blockvault
```
Cron (host):
```
0 2 * * * /path/to/blockvault/deploy/backup.sh >> /var/log/blockvault-backup.log 2>&1
```
Test a restore at least once a month.

## Security checklist (post go-live)

- [ ] `JWT_SECRET` is a long random value; confirm no `change-me-...` string is active.
- [ ] `devCode` is absent from login responses in prod (the backend only returns it when
      SMTP is unconfigured or in test mode — see `authController.ts`).
- [ ] Rotate the old Gmail app password (backend/.env had real creds in dev).
- [ ] TLS auto-renewal is configured (certbot / managed LB).
- [ ] Mongo is reachable only from the backend, not the internet.
- [ ] Docker image ports: only expose :443 (and :5000 if you need direct API access).

## Scaling later

- Move uploads to object storage (S3) — the local Docker volume can't be shared
  across replicas; downloads are already authorized-routes-only.
- Multiple backend replicas need a shared notification/session store
  (SSE notifications are currently in-memory).
- Keep SSE behind a proxy with buffering OFF (already done in `nginx.conf`).
