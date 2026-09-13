# BlockVault — What Changed & Important Facts

Reference doc for everything added in the recent feature batches, the data model, live deployment state, and the things that matter operationally.

---

## 1. Live State (production)

| Thing | Value |
|---|---|
| Frontend | https://blockvault-smoky.vercel.app |
| Backend API | https://blockvault-4099.onrender.com |
| Repo | GitHub `Anilastage/blockvault`, branch `master` (auto-deploys both) |
| Blockchain | Sepolia testnet, chainId `11155111` |
| Smart contract | `0xe68C76d721952aECF9F19A5461adF0BD2B0801D4` |
| Contract env key | `CONTRACT_ADDRESS` (backend env, `BETA_` prefixed in Render) |
| Walkthrough/admin account | `anil.astage@gmail.com` |
| Database | MongoDB Atlas cluster `cluster0…`, db `blockvault` |
| Tests | 51 backend tests, all passing |

**Only 1 document is currently `CONFIRMED` on-chain** in prod:
`Screenshot 2025-08-06 181344.png` (hash `38b1c06e…31272`), owned by `anil astage`. It has no versions yet.

---

## 2. Feature Batch — “Public Verification + Certificates + Pending Registration”

### 2.1 Public verification (no login needed)
- `/verify` and `/verify/:hash` are now **public** routes (moved out of the logged-in layout).
- `/verify/<sha256>` deep-links straight into a hash lookup and runs verification automatically.
- Anyone can verify a document by hash or by uploading a file — no account required.
- Anonymous verifies **skip** the Verification-history and activity logs but **still notify the document owner** (shown as “A visitor verified…”).
- Public endpoints:
  - `POST /api/verification/public/hash`
  - `POST /api/verification/public/upload`
- The old protected endpoints (`POST /api/verification/hash`, `/api/verification/upload`) still exist and still require a token.

Verification result states: `VERIFIED` | `MODIFIED` | `NOT_FOUND`.

### 2.2 QR code + printable certificate
- New `CertificateModal` on any CONFIRMED document (Document Detail page → “Certificate”, and Verify page result → “Certificate & QR”).
- Contains a **QR code** pointing to `https://blockvault-smoky.vercel.app/verify/<hash>` (public verification page, works from any phone camera), plus fingerprint, owner wallet, block number, tx hash, explorer link, and “Print Certificate”.
- Printing uses `window.print()` + CSS `@media print` rules (no PDF lib).
- Depends on `qrcode-react` v4 (exports `QRCodeSVG`, not `QRCode`).
- “Copy Verify Link” button on the verify page and certificate.

### 2.3 Pending registration + auto-register toggle + Register All Pending
- Uploads no longer *require* an on-chain transaction at upload time.
- **Upload page toggle “Register on blockchain after upload”** (default ON):
  - ON → wallet signs a transaction, doc saved as `CONFIRMED`/`VERIFIED`.
  - OFF → file saved without a wallet interaction as `PENDING`/`UNVERIFIED`.
- **Documents page → “Register All Pending (n)”**: one click registers every pending doc on-chain. Each doc needs its own wallet signature (sequential).
- Per-row ⚡ register icon on pending documents (desktop + mobile) and a Register button in the detail modal.
- Server independently re-verifies every submitted transaction (`validateRegistrationTx`) — a client can’t fake a confirmation.
- Shared frontend helper: `frontend/src/utils/blockchainRegistration.ts` (`registerHashOnChain`, `RegisterFailure`, `isRegisterFailure`, `failureMessage`).

---

## 3. Feature — Document Versioning

### What it does
- Upload a new revision of an on-chain document → registered as the next version, keeping full history per document family.
- Each version’s hash is individually anchored on-chain (the record is permanent and separately verifiable).
- Legacy (pre-versioning) documents behave as v1 with no family.

### Rules
- The parent must be `CONFIRMED` on-chain before a new version can be uploaded (else 400).
- Only the owner or an admin can add versions (else 403).
- Deleting a version does NOT remove its on-chain record (same as normal docs).

### UI
- **Document Detail page**: version chip (`v2`) next to the title; “New Version” button (CONFIRMED + current version only); superseded banner on older revisions linking to the current one; **“Version History”** card listing all versions with current/superseded badges and per-version Verify/Details.
- **Upload page**: visiting `/upload?parent=<docId>` shows “Uploading a new version of X” and saves into the family; on success you land on the new version’s detail page.
- **Documents list**: documents with version > 1 show a `vN` badge.

### New API
- `GET /api/documents/:id/versions` → `{ familyId, currentVersion, versions: [{ document, version, isCurrent, isSuperseded }] }` (owner/admin only).
- `POST /api/documents` (multipart) now accepts an optional `parentId`.

### New data fields (on documents)
| Field | Meaning |
|---|---|
| `familyId` | `_id` of the first document in the family (root). Valid for all versions. |
| `version` | Revision number, 1-based. |
| `previousVersionId` | `_id` of the parent revision. |
| `previousVersionHash` | SHA-256 of the parent revision. |

---

## 4. New Data model / schema changes

### Document model (backend `models/Document.ts`)
Added (all optional, so existing docs are untouched):
- `familyId` (ObjectId, indexed)
- `version` (Number)
- `previousVersionId` (ObjectId)
- `previousVersionHash` (String)
- New compound index `{ familyId: 1, version: 1 }`

Existing fields remain: `userId, originalName, fileName, fileSize, mimeType, storagePath, sha256Hash, blockchainHash, transactionHash, blockNumber, contractAddress, chainId, uploadedAt, blockchainStatus, verificationStatus`.

### Statuses
- `blockchainStatus`: `PENDING` → `CONFIRMED` (or `FAILED`). New uploads without a tx start `PENDING`; register endpoint flips to `CONFIRMED`.
- `verificationStatus`: `UNVERIFIED` → `VERIFIED` | `MODIFIED` | `NOT_FOUND`.

---

## 5. New/changed API endpoints (summary)

Public:
- `POST /api/verification/public/hash`
- `POST /api/verification/public/upload`

Protected (auth required):
- `POST /api/documents/:id/register` — confirm a PENDING doc after the wallet signs
- `GET /api/documents/:id/versions` — version family history
- `POST /api/documents` — now accepts optional `parentId` (new version) and optional `transactionHash` (immediate CONFIRM)

---

## 6. New/changed frontend files

New:
- `frontend/src/utils/blockchainRegistration.ts`
- `frontend/src/components/documents/CertificateModal.tsx`

Changed:
- `frontend/src/pages/VerifyPage.tsx` (public mode, `/verify/:hash` auto-run)
- `frontend/src/pages/UploadPage.tsx` (auto-register toggle, version mode)
- `frontend/src/pages/DocumentsPage.tsx` (register-all-pending, per-row register, version badge)
- `frontend/src/pages/DocumentDetailPage.tsx` (register button, certificate, version history)
- `frontend/src/services/documentService.ts` (create/register/versions)
- `frontend/src/services/verificationService.ts` (public verify variants)
- `frontend/src/context/WalletContext.tsx` (exported `WalletContextValue`)
- `frontend/src/types/index.ts` (version fields + `DocumentVersion`)
- `frontend/src/App.tsx` (public `/verify` + `/verify/:hash` routes)
- `frontend/src/index.css` (print styles)

---

## 7. Tests

`backend/test/versioning.test.ts` — 6 new tests:
1. Standalone doc returns a single current v1.
2. Rejects new version when parent not CONFIRMED (400).
3. Rejects non-owner (403).
4. Rejects bogus parent id (404).
5. Links new upload into family (familyId, version, previousVersionId/Hash) and serves full history with current/superseded flags.
6. History queryable from a child document id.

Full suite: **39 passing** (access, mfa-email, mfa totp, notifications, versioning).

### Versioning suite (feature 5)
- `backend/test/versioning.test.ts`: 6 tests. Full suite now **51 passing** after adding folders/tags tests.

---

## 8. Feature 6 — Folders + Tags + tag-aware search

### Data model
- **`Folder` collection** (new, per-user): `{ userId, name, createdAt }`, unique index `{ userId, name }`. Flat (one level, no nesting).
- **`Document`**: new optional fields `folderId` (→ `Folder`) and `tags: string[]` (lowercased, max 8 per doc, each ≤ 24 chars). Index `{ userId, folderId }`. Existing docs are unaffected → all start “Unfiled” with no tags.
- **No backfill/migration needed.**

### New API
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/folders` | GET/POST | List / create (duplicate name → 409) |
| `/api/folders/:id` | PATCH/DELETE | Rename / delete (delete moves its docs to Unfiled) |
| `/api/documents/tags` | GET | Authenticated user’s distinct tags + usage counts (aggregated) |
| `/api/documents/:id` | PATCH | Set `{ folderId (null to unfile), tags }`; validates folder ownership, 422 on empty body |
| `/api/documents` | GET | New query params: `folderId` (`unfiled` = no folder), `tag` (repeatable → AND via `$all`) |
| `/api/documents` | POST | Optional `folderId` + `tags` at upload time |

Search (`GET /api/documents?search=…`) now also matches **tags**, alongside name/hash/transaction.

### Frontend
- `DocumentsPage`: Folder pill row (All folders / Unfiled / each folder) + inline “New folder” creator; tag filter chips with counts (AND-selectable); new “Move to folder / add tags” row action (desktop + mobile); an “Organize” button in the document detail modal; `?folderId=` and `?tag=` persisted in URL.
- `DocumentDetailPage`: new “Organization” card showing current folder + tag chips with an “Organize” action.
- New shared `components/documents/FolderTagManager.tsx` modal: folder dropdown (+ inline folder creation) and tag chip editor (lowercase, Enter/`,` to add, max 8).
- `documentService`: `updateOrganization`, `tags`, `listFolders`, `createFolder`, `renameFolder`, `deleteFolder`; `list()` accepts `folderId`/`tag`.

### Tests (`backend/test/folders.test.ts`, 11 tests + 1 covering version metadata)
Folder CRUD + owner isolation, duplicate-name 409, delete-unlinks, foreign-folder rejection on upload and PATCH, unfiled filter, tag AND filter, tag counts endpoint, search-by-tag, and PATCH validation (422 for empty body/blank tag).

### Operational notes
- Folder names and tags are normalized to lowercase/trimmed on write.
- Account deletion now also removes the user's `Folder` rows (documents are already deleted in that flow).
- 12 feature-6 tests added → full suite is **51 passing**, `npm test` count (section 1) is 51.

---

## 8. Important operational facts / gotchas

1. **Deployment**: pushing `master` auto-deploys Render (backend) + Vercel (frontend). Backend health check: `GET https://blockvault-4099.onrender.com/health`.
2. **Render free tier cold-starts** (~15 s idle → slow first call). Frontend refetches blockchain config on wallet connect to self-heal.
3. **SMTP is intentionally disabled** (`smtpEnabled: false` in `env.ts`). OTPs fall back to the on-screen devCode. To re-enable, set `SMTP_HOST/PORT/USER/PASS` + flip `smtpEnabled` (Gmail relay is parked).
4. **Mobile wallet caveat**: user’s network blocks `metamask.app.link`/`link.meta?` domains, so mobile deeplinks can fail. Fallbacks: “open in MetaMask in-app browser” manual option + copy-link. Actual signing always needs MetaMask.
5. **`qrcode-react` is v4** — imports are `{ QRCodeSVG }` / `{ QRCodeCanvas }`, `QRCode` does not exist.
6. **JWT_SECRET is per-environment** — a token minted locally is rejected by Render (different secret). Log in live to test live flows.
7. **File storage** is local disk (`uploads/`); blockchain stores only the SHA-256 fingerprint, never the file.
8. **Registration is one-time per hash** — the contract rejects duplicate hashes. Uploading an identical file as a “new version” is pointless (same hash).
9. **Do NOT commit `.env`** files (`backend/.env`, `frontend/.env`). Local dev secrets differ from Render’s.
10. Only the **owner or admin** can view/download a document, its versions, its downloads, or its share code.

---

## 9. Commands

```bash
# Backend
npm run typecheck   # tsc --noEmit + tsconfig.test.json
npm test            # 39 tests, in-memory Mongo

# Frontend
npm run typecheck
npm run build

# Deploy
git add -A
git commit -m "..."
git push origin master   # auto-deploys Render + Vercel
```