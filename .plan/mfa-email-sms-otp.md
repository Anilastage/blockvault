# Plan: Add Email OTP & SMS OTP as MFA Methods

> **Status: IMPLEMENTED (full plan completed & tested)**
>
> **Follow-up — Email OTP is now MANDATORY for all logins.** Login always
> issues an email OTP challenge regardless of a user's individual 2FA setting
> (`twoFactorEnabled`). When SMTP is unconfigured, the code is surfaced on the
> login screen via `devCode` so nobody is locked out; once real SMTP creds are
> added, the code is emailed and never displayed.

## Summary of what was built

- **Email OTP** (Nodemailer/SMTP) — free, works with Gmail app passwords etc.
- **SMS OTP** (Twilio) — optional/pluggable, gracefully no-ops when Twilio not configured.
- Users can pick a **preferred** 2FA method in Settings (Authenticator app / Email / SMS), but login always requires an email OTP.
- New `OtpCode` collection stores SHA-256 hashed, 5-min-expiry, single-use codes with rate limiting + brute-force protection.
- New `mfaMethod` + `phoneNumber` fields on User.
- Login returns the `method` in the challenge; the login page and Settings UI adapt.
- RN: fix the shared `authLimiter` being tripped during tests by disabling rate limiting under `NODE_ENV=test`.

## Verification

- `backend: npm run typecheck` ✓
- `backend: npm test` — 33 passing (incl. new Email OTP suite + existing TOTP suite) ✓
- `frontend: npm run typecheck` ✓
- `frontend: npm run build` ✓

## Context

The codebase has a fully working TOTP-based 2FA system (authenticator app + recovery codes). The user wants **email OTP** and **SMS OTP** as additional MFA methods. Users pick **one** method in Settings. Email OTP is the priority (free via Nodemailer/SMTP). SMS OTP is optional — pluggable via Twilio, gracefully skipped if unconfigured.

## Architecture

### MFA Method Selection
- User sets `mfaMethod` in Settings: `'totp'` | `'email_otp'` | `'sms_otp'` | `'none'`
- `twoFactorEnabled` remains the master switch (boolean)
- New field `mfaMethod` on User model determines the challenge type at login

### Login Flow (modified)
```
1. POST /auth/login → password check
2. If user.twoFactorEnabled:
   - Read user.mfaMethod
   - 'totp'      → existing flow (return mfaToken, frontend shows authenticator input)
   - 'email_otp' → generate OTP, send via email, return mfaToken (frontend shows OTP input)
   - 'sms_otp'   → generate OTP, send via SMS, return mfaToken (frontend shows OTP input)
3. POST /auth/2fa/login → verify based on mfaMethod
```

### OTP Lifecycle
- 6-digit numeric codes, 5-minute expiry, single-use
- Stored as SHA-256 hashes in a new `OtpCode` collection
- Rate-limited: 1 OTP per 60s per user per channel

---

## Implementation Steps

### Phase 1: Backend Infrastructure

#### 1.1 Add dependencies
```
cd backend && npm install nodemailer
cd backend && npm install -D @types/nodemailer
```

#### 1.2 Environment config — `backend/src/config/env.ts`
Add under a new `email` and `sms` block:
```ts
email: {
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  fromName: process.env.EMAIL_FROM_NAME ?? 'BlockVault',
  fromAddress: process.env.EMAIL_FROM_ADDRESS ?? '',
},
sms: {
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
},
```

#### 1.3 OTP model — `backend/src/models/OtpCode.ts` (new file)
```
Schema:
  userId: ObjectId (ref User, required, indexed)
  codeHash: string (SHA-256 of the 6-digit code, required)
  purpose: 'mfa_login' | 'mfa_setup' (required)
  channel: 'email' | 'sms' (required)
  expiresAt: Date (required, TTL index — auto-delete after 5 min)
  used: boolean (default false)
  attempts: number (default 0, max 5)
```
TTL index on `expiresAt` for automatic MongoDB cleanup.

#### 1.4 OTP service — `backend/src/services/otpService.ts` (new file)
- `generateOtp()` → returns 6-digit string
- `hashOtp(code)` → SHA-256 hex
- `createOtp(userId, purpose, channel)` → generate, hash, store, return plaintext code
- `verifyOtp(userId, code, purpose, channel)` → find unused unexpired, compare hash, check attempts, mark used
- `isRateLimited(userId, channel)` → check if an OTP was created in last 60s

#### 1.5 Email service — `backend/src/services/emailService.ts` (new file)
- Lazy Nodemailer transporter (singleton)
- `sendOtpEmail(to, code)` → sends a branded HTML email with the 6-digit code
- Graceful no-op if SMTP not configured (log warning)

#### 1.6 SMS service — `backend/src/services/smsService.ts` (new file)
- Lazy Twilio client (singleton)
- `sendOtpSms(to, code)` → sends SMS with the 6-digit code
- Graceful no-op if Twilio not configured (log warning)

#### 1.7 User model changes — `backend/src/models/User.ts`
Add fields:
```ts
mfaMethod: { type: String, enum: ['totp', 'email_otp', 'sms_otp'], default: undefined }
phoneNumber: { type: String }  // for SMS OTP
```
Update `toJSON` transform to also strip `phoneNumber` if desired (optional — phone is less sensitive than secrets).

### Phase 2: Backend Auth Changes

#### 2.1 Login controller — `backend/src/controllers/authController.ts`
Modify `login` handler (lines 83-137):
- After password check, when `user.twoFactorEnabled`:
  - Read `user.mfaMethod` (select `+mfaMethod`)
  - If `'email_otp'` or `'sms_otp'`: generate OTP via `otpService.createOtp()`, send via `emailService` or `smsService`
  - Return same `mfaToken` + `requiresTwoFactor: true` response (frontend handles the rest)

#### 2.2 MFA verification — `backend/src/controllers/twoFactorController.ts`
Modify `verifyLoginTwoFactor` (lines 168-239):
- Read `user.mfaMethod` (select `+mfaMethod`)
- Branch on method:
  - `'totp'` → existing TOTP + recovery code logic (unchanged)
  - `'email_otp'` → call `otpService.verifyOtp(userId, code, 'mfa_login', 'email')`
  - `'sms_otp'` → call `otpService.verifyOtp(userId, code, 'mfa_login', 'sms')`

#### 2.3 Setup endpoints — `backend/src/controllers/twoFactorController.ts`
Add new handlers:
- `POST /auth/2fa/email/setup` → generate OTP, send to user's email, return `{ message: 'Code sent' }`
- `POST /auth/2fa/email/verify` → verify OTP, set `mfaMethod: 'email_otp'`, `twoFactorEnabled: true`
- `POST /auth/2fa/sms/setup` → require `phoneNumber` in body, generate OTP, send via SMS, return `{ message: 'Code sent' }`
- `POST /auth/2fa/sms/verify` → verify OTP, set `mfaMethod: 'sms_otp'`, `twoFactorEnabled: true`, store `phoneNumber`
- Modify existing `disable2FA` → also accept OTP codes (not just TOTP/recovery), and clear `mfaMethod`

#### 2.4 Routes — `backend/src/routes/authRoutes.ts`
Add:
```ts
router.post('/2fa/email/setup', authLimiter, protect, startEmailOtpSetup);
router.post('/2fa/email/verify', authLimiter, protect, verifyEmailOtpSetup);
router.post('/2fa/sms/setup', authLimiter, protect, startSmsOtpSetup);
router.post('/2fa/sms/verify', authLimiter, protect, verifySmsOtpSetup);
```

#### 2.5 Validators — `backend/src/validators/index.ts`
Add:
```ts
export const mfaMethodSchema = z.object({
  method: z.enum(['totp', 'email_otp', 'sms_otp']),
});
export const smsSetupSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number (include country code)'),
});
export const otpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
```

### Phase 3: Frontend Changes

#### 3.1 Types — `frontend/src/types/index.ts`
Add to `User`:
```ts
mfaMethod?: 'totp' | 'email_otp' | 'sms_otp';
```
Add `MfaMethod` type.

#### 3.2 Auth service — `frontend/src/services/authService.ts`
Add:
```ts
async startEmailOtpSetup(): Promise<{ message: string }>
async verifyEmailOtpSetup(code: string): Promise<void>
async startSmsOtpSetup(phoneNumber: string): Promise<{ message: string }>
async verifySmsOtpSetup(code: string): Promise<void>
```

#### 3.3 Login page — `frontend/src/pages/LoginPage.tsx`
- The MFA stage already accepts a generic code input (6-digit or recovery code)
- No change needed — the backend returns the same `mfaToken` + `requiresTwoFactor` shape regardless of method
- The label can adapt: "Enter the code from your authenticator app" → "Enter the 6-digit code sent to your email/phone"

#### 3.4 TwoFactorSettings — `frontend/src/components/settings/TwoFactorSettings.tsx`
Major rework:
- Show current MFA method (TOTP / Email OTP / SMS OTP / None)
- If not enabled, show **method selection** (3 cards: Authenticator App, Email, SMS)
- Each card triggers the appropriate setup flow:
  - **Authenticator App** → existing QR code flow
  - **Email OTP** → "Send code to your email" → enter code → done
  - **SMS OTP** → enter phone number → "Send code" → enter code → done
- If enabled, show current method, option to switch (disable → re-enable with new method), disable button
- Disable accepts any valid code for the current method (TOTP/recovery/email OTP/SMS OTP)

#### 3.5 Settings page — `frontend/src/pages/SettingsPage.tsx`
Pass `mfaMethod` to `TwoFactorSettings`:
```tsx
<TwoFactorSettings enabled={!!user?.twoFactorEnabled} mfaMethod={user?.mfaMethod} />
```

### Phase 4: Config & Documentation

#### 4.1 `.env.example` updates
```
# Email (SMTP) — for email OTP MFA
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM_NAME=BlockVault
EMAIL_FROM_ADDRESS=your-email@gmail.com

# SMS (Twilio) — optional, for SMS OTP MFA
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `backend/package.json` | Add `nodemailer`, `@types/nodemailer` |
| `backend/src/config/env.ts` | Add `email` and `sms` config blocks |
| `backend/src/models/OtpCode.ts` | **Create** — OTP storage model |
| `backend/src/models/User.ts` | Add `mfaMethod`, `phoneNumber` fields |
| `backend/src/services/otpService.ts` | **Create** — OTP generate/verify/rate-limit |
| `backend/src/services/emailService.ts` | **Create** — Nodemailer SMTP transport |
| `backend/src/services/smsService.ts` | **Create** — Twilio SMS transport |
| `backend/src/controllers/authController.ts` | Modify login to branch on `mfaMethod` |
| `backend/src/controllers/twoFactorController.ts` | Add email/SMS setup+verify, modify login verify |
| `backend/src/routes/authRoutes.ts` | Add 4 new routes for email/SMS setup+verify |
| `backend/src/validators/index.ts` | Add `mfaMethodSchema`, `smsSetupSchema`, `otpCodeSchema` |
| `frontend/src/types/index.ts` | Add `mfaMethod` to `User`, `MfaMethod` type |
| `frontend/src/services/authService.ts` | Add email/SMS OTP API methods |
| `frontend/src/components/settings/TwoFactorSettings.tsx` | Rework: method selection + per-method setup flows |
| `frontend/src/pages/SettingsPage.tsx` | Pass `mfaMethod` prop |
| `.env.example` | Add SMTP and Twilio vars |

## Verification

1. **TypeScript**: `npm run typecheck` in both backend and frontend
2. **Existing tests**: `npm test` in backend — ensure TOTP flow still works
3. **Manual test flow**:
   - Enable Email OTP in Settings → receive code → verify → enabled
   - Login with Email OTP → password → email code → session
   - Disable Email OTP → verify with code → disabled
   - Same flow for SMS OTP (if Twilio configured)
   - TOTP flow unchanged
4. **Edge cases**: expired OTP, wrong code (5 attempts), rate limiting, missing SMTP config (graceful no-op)
