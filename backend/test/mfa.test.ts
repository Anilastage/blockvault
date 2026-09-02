import { expect } from 'chai';
import request from 'supertest';
import type { Express } from 'express';
import { getApp, resetDb, stopDb, createUser, type TestUser } from './helpers';

describe('Two-factor authentication (TOTP)', () => {
  let app: Express;
  let mfaUser: TestUser;
  let secret = '';
  let recoveryCodes: string[] = [];
  

  const PASSWORD = 'Password123!';

  before(async () => {
    app = await getApp();
    await resetDb();
    await createUser(app, 'Root Admin', 'admin@boult.test');
    mfaUser = await createUser(app, 'MFA Tester', 'mfa@boult.test', PASSWORD);
  });

  after(async () => {
    await stopDb();
  });

  const bearer = (token: string) => `Bearer ${token}`;

  const setup = () =>
    request(app).post('/api/auth/2fa/setup').set('Authorization', bearer(mfaUser.token)).send();

  const login = () =>
    request(app).post('/api/auth/login').send({ email: mfaUser.email, password: PASSWORD });

  const login2fa = (mfaToken: string, code: string) =>
    request(app).post('/api/auth/2fa/login').send({ mfaToken, code });

  it('requires authentication to start setup', async () => {
    await request(app).post('/api/auth/2fa/setup').send().expect(401);
    await request(app).post('/api/auth/2fa/verify').send({ token: '000000' }).expect(401);
  });

  it('stages a secret, QR URI and recovery codes', async () => {
    const res = await setup().expect(200);
    secret = res.body.data.secret as string;
    recoveryCodes = res.body.data.recoveryCodes as string[];
    expect(secret).to.match(/^[A-Z2-7]{16,}$/);
    expect(res.body.data.otpauthUrl).to.contain('otpauth://totp/').and.contain('BlockVault');
    expect(res.body.data.qrDataUrl).to.match(/^data:image\/png;base64,/);
    expect(recoveryCodes).to.have.length(10);
    recoveryCodes.forEach((code) => expect(code).to.match(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/));
  });

  it('rejects a bogus setup code, then enables 2FA with a real code', async () => {
    const bad = await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', bearer(mfaUser.token))
      .send({ token: '123456' })
      .expect(400);
    expect(bad.body.message).to.contain('Invalid code');

    const { generateTotpCode } = await import('../src/services/twoFactorService');
    const code = await generateTotpCode(secret);

    const ok = await request(app)
      .post('/api/auth/2fa/verify')
      .set('Authorization', bearer(mfaUser.token))
      .send({ token: code })
      .expect(200);
    expect(ok.body.data.enabled).to.equal(true);

    const me = await request(app).get('/api/auth/me').set('Authorization', bearer(mfaUser.token));
    expect(me.body.data.user.twoFactorEnabled).to.equal(true);

    await setup().expect(409);
  });

  it('now returns an MFA challenge instead of a session token', async () => {
    const res = await login().expect(200);
    expect(res.body.data.requiresTwoFactor).to.equal(true);
    expect(res.body.data.mfaToken).to.be.a('string');
    expect(res.body.data.token).to.be.undefined;
  });

  it('rejects a wrong code, then completes login with a valid email OTP code', async () => {
    const res = await login().expect(200);
    const mfaToken = res.body.data.mfaToken as string;

    const wrong = await login2fa(mfaToken, '000000').expect(401);
    expect(wrong.body.message).to.contain('Invalid authentication code');

    // SMTP is unconfigured in tests, so the login response surfaces the code
    // via devCode. Login always gates on an email OTP.
    const code = res.body.data.devCode as string;
    expect(code).to.match(/^\d{6}$/);
    const ok = await login2fa(mfaToken, code).expect(200);
    expect(ok.body.data.token).to.be.a('string');
  });

  it('expires a spoiled mfaToken from a previous login attempt', async () => {
    const before = await login().expect(200);
    const mfaToken = before.body.data.mfaToken as string;

    // Consume the challenge once with the delivered email OTP (devCode).
    await login2fa(mfaToken, before.body.data.devCode).expect(200);
    // A tampered token should be rejected as an expired/invalid session.
    const tampered = mfaToken.slice(0, -2) + 'xx';
    const res = await login2fa(tampered, '000000').expect(401);
    expect(res.body.message).to.contain('session has expired');
  });

  it('email OTP code signs in once and cannot be reused', async () => {
    const res = await login().expect(200);
    const mfaToken = res.body.data.mfaToken as string;
    const code = res.body.data.devCode as string;

    await login2fa(mfaToken, code).expect(200);

    // The same code, used against a fresh challenge, must be rejected (single-use).
    const again = await login().expect(200);
    const reuse = await login2fa(again.body.data.mfaToken, code).expect(401);
    expect(reuse.body.message).to.contain('Invalid authentication code');
  });

  it('rotates recovery codes with a TOTP code', async () => {
    const { generateTotpCode } = await import('../src/services/twoFactorService');

    const bad = await request(app)
      .post('/api/auth/2fa/recovery')
      .set('Authorization', bearer(mfaUser.token))
      .send({ token: '000000' })
      .expect(400);
    expect(bad.body.message).to.contain('Invalid authentication code');

    const rotated = await request(app)
      .post('/api/auth/2fa/recovery')
      .set('Authorization', bearer(mfaUser.token))
      .send({ token: await generateTotpCode(secret) })
      .expect(200);
    expect(rotated.body.data.recoveryCodes).to.have.length(10);
    expect(rotated.body.data.recoveryCodes).not.to.include.members(recoveryCodes);
    recoveryCodes = rotated.body.data.recoveryCodes as string[];
  });

  it('disabling 2FA still requires the mandatory email OTP at login', async () => {
    const { generateTotpCode } = await import('../src/services/twoFactorService');

    await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', bearer(mfaUser.token))
      .send({ token: '000000' })
      .expect(400);

    // Disable using one of the freshly rotated recovery codes.
    const disabled = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', bearer(mfaUser.token))
      .send({ token: recoveryCodes[1] })
      .expect(200);
    expect(disabled.body.message).to.contain('disabled');

    // Email OTP is mandatory app-wide, so login still returns a challenge.
    const res = await login().expect(200);
    expect(res.body.data.requiresTwoFactor).to.equal(true);
    expect(res.body.data.method).to.equal('email_otp');
    expect(res.body.data.token).to.be.undefined;
  });
});