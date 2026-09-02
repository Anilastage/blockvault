import { expect } from 'chai';
import request from 'supertest';
import type { Express } from 'express';
import { getApp, resetDb, stopDb, createUser, type TestUser } from './helpers';
import { createOtp } from '../src/services/otpService';

describe('Two-factor authentication (Email OTP)', () => {
  let app: Express;
  let user: TestUser;
  const PASSWORD = 'Password123!';

  before(async () => {
    app = await getApp();
    await resetDb();
    await createUser(app, 'Root Admin', 'admin@boult.test');
    user = await createUser(app, 'Email MFA Tester', 'emailmfa@boult.test', PASSWORD);
  });

  after(async () => {
    await stopDb();
  });

  const bearer = (token: string) => `Bearer ${token}`;

  const login = () =>
    request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });

  const login2fa = (mfaToken: string, code: string) =>
    request(app).post('/api/auth/2fa/login').send({ mfaToken, code });

  it('sends a code (no-op without SMTP) and rejects a bad code', async () => {
    const sent = await request(app)
      .post('/api/auth/2fa/email/setup')
      .set('Authorization', bearer(user.token))
      .send()
      .expect(200);
    expect(sent.body.message).to.contain('sent to your email');

    const bad = await request(app)
      .post('/api/auth/2fa/email/verify')
      .set('Authorization', bearer(user.token))
      .send({ code: '000000' })
      .expect(400);
    expect(bad.body.message).to.contain('Invalid or expired');
  });

  it('enables email OTP with a real code', async () => {
    const code = await createOtp(user.id, 'mfa_setup', 'email');

    const ok = await request(app)
      .post('/api/auth/2fa/email/verify')
      .set('Authorization', bearer(user.token))
      .send({ code })
      .expect(200);
    expect(ok.body.data.enabled).to.equal(true);
    expect(ok.body.data.mfaMethod).to.equal('email_otp');

    const me = await request(app).get('/api/auth/me').set('Authorization', bearer(user.token));
    expect(me.body.data.user.twoFactorEnabled).to.equal(true);
    expect(me.body.data.user.mfaMethod).to.equal('email_otp');
  });

  it('login now returns an MFA challenge with the email method', async () => {
    const res = await login().expect(200);
    expect(res.body.data.requiresTwoFactor).to.equal(true);
    expect(res.body.data.method).to.equal('email_otp');
    expect(res.body.data.token).to.be.undefined;
  });

  it('completes login with a valid emailed code', async () => {
    const res = await login().expect(200);
    const mfaToken = res.body.data.mfaToken as string;

    const wrong = await login2fa(mfaToken, '000000').expect(401);
    expect(wrong.body.message).to.contain('Invalid authentication code');

    const code = await createOtp(user.id, 'mfa_login', 'email');
    const ok = await login2fa(mfaToken, code).expect(200);
    expect(ok.body.data.token).to.be.a('string');
    expect(ok.body.data.user.mfaMethod).to.equal('email_otp');
  });

  it('rejects an already-consumed code', async () => {
    const res = await login().expect(200);
    const mfaToken = res.body.data.mfaToken as string;

    const code = await createOtp(user.id, 'mfa_login', 'email');
    await login2fa(mfaToken, code).expect(200);

    // A new challenge but the same code was already consumed.
    const again = await login().expect(200);
    const reuse = await login2fa(again.body.data.mfaToken, code).expect(401);
    expect(reuse.body.message).to.contain('Invalid authentication code');
  });

  it('disabling 2FA still requires the mandatory email OTP at login', async () => {
    const code = await createOtp(user.id, 'mfa_setup', 'email');

    const disabled = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', bearer(user.token))
      .send({ token: code })
      .expect(200);
    expect(disabled.body.message).to.contain('disabled');

    // Email OTP is mandatory app-wide, so login still returns a challenge.
    const res = await login().expect(200);
    expect(res.body.data.requiresTwoFactor).to.equal(true);
    expect(res.body.data.method).to.equal('email_otp');
    expect(res.body.data.token).to.be.undefined;
  });
});
