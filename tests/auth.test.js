import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import mongoose from 'mongoose';
import { createApp } from '../server/app.js';
import { verifyGoogleProfile } from '../server/routes/auth.js';
import { connectDatabase, runInTransaction } from '../server/db/connection.js';
import { User } from '../server/models/User.js';
import { setupTestReplSet, teardownTestReplSet, clearCollections } from './setup-mongo.js';
import { createRateLimiters } from '../server/middleware/rateLimiter.js';

const origin = 'http://localhost:5173';
let testUri = '';

beforeAll(async () => {
  const setup = await setupTestReplSet();
  testUri = setup.uri;
});

afterAll(async () => {
  await teardownTestReplSet();
});

beforeEach(async () => {
  await clearCollections();
});

function freshApp(overrides = {}) {
  const sessionStore = new session.MemoryStore();
  return createApp({
    mongodbUri: testUri,
    mongodbDbName: 'art_studio_test',
    sessionSecret: 'test-secret-that-is-long-enough-for-tests',
    appOrigin: origin,
    isProduction: false,
    sessionStore,
    rateLimitOptions: {
      enableApiLimiterInTest: false,
      authMax: 3,
      oauthMax: 5,
    },
    ...overrides,
  });
}

describe('MongoDB startup & connection failure', () => {
  it('throws clear startup error when MongoDB connection fails', async () => {
    await expect(
      connectDatabase('mongodb://127.0.0.1:59999', 'invalid_db', { serverSelectionTimeoutMS: 200 })
    ).rejects.toThrow(/Failed to connect to MongoDB/);

    await connectDatabase(testUri, 'art_studio_test');
  });

  it('rejects execution when MongoDB topology does not support transactions', async () => {
    // Temporarily mock topology description as Standalone to verify clear failure
    const client = mongoose.connection.client;
    const originalType = client?.topology?.description?.type;
    const originalSetName = client?.topology?.description?.setName;

    try {
      if (client?.topology?.description) {
        client.topology.description.type = 'Standalone';
        client.topology.description.setName = null;
      }

      await expect(
        runInTransaction(async () => 'should not execute')
      ).rejects.toThrow(/MongoDB transactions are required.*does not support transactions/);
    } finally {
      if (client?.topology?.description) {
        client.topology.description.type = originalType;
        client.topology.description.setName = originalSetName;
      }
    }
  });
});

describe('authentication and mutation protection', () => {
  it('registers only customers, persists a session, logs out, and logs in again', async () => {
    const app = freshApp();
    const agent = request.agent(app);

    const registered = await agent.post('/api/auth/register').set('Origin', origin).send({
      email: 'Customer@Example.com',
      password: 'correct horse battery staple',
      role: 'studio',
    });

    expect(registered.status).toBe(201);
    expect(registered.body.data.user).toMatchObject({
      email: 'customer@example.com',
      role: 'customer',
    });

    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.post('/api/auth/logout').set('Origin', origin)).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    const loggedIn = await agent.post('/api/auth/login').set('Origin', origin).send({
      email: 'customer@example.com',
      password: 'correct horse battery staple',
    });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body.data.user.role).toBe('customer');
  });

  it('rejects duplicate accounts, invalid credentials, and untrusted mutation origins', async () => {
    const app = freshApp();
    const payload = { email: 'customer@example.com', password: 'correct horse battery staple' };

    expect((await request(app).post('/api/auth/register').set('Origin', origin).send(payload)).status).toBe(201);
    const dupRes = await request(app).post('/api/auth/register').set('Origin', origin).send(payload);
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('EMAIL_TAKEN');

    const badCreds = await request(app).post('/api/auth/login').set('Origin', origin).send({ ...payload, password: 'not-the-password' });
    expect(badCreds.status).toBe(401);
    expect(badCreds.body.error.code).toBe('INVALID_CREDENTIALS');

    const badOrigin = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send(payload);
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.error.code).toBe('ORIGIN_FORBIDDEN');
  });

  it('fails startup in production mode if SESSION_SECRET is missing or shorter than 32 characters', () => {
    expect(() => createApp({ isProduction: true, sessionSecret: '' }))
      .toThrow('SESSION_SECRET must contain at least 32 characters in production.');
    expect(() => createApp({ isProduction: true, sessionSecret: null }))
      .toThrow('SESSION_SECRET must contain at least 32 characters in production.');
    expect(() => createApp({ isProduction: true, sessionSecret: 'too-short-secret' }))
      .toThrow('SESSION_SECRET must contain at least 32 characters in production.');
  });
});

describe('Secure Google OAuth Email Verification & Account Linking', () => {
  it('accepts authoritatively verified email via _json.email_verified === true', async () => {
    let resultUser = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-verified-1',
        displayName: 'Verified User',
        _json: {
          email: 'verified.authoritative@example.com',
          email_verified: true,
        },
      },
      (err, user) => {
        expect(err).toBeNull();
        resultUser = user;
      }
    );
    expect(resultUser).toBeDefined();
    expect(resultUser.email).toBe('verified.authoritative@example.com');
    expect(resultUser.role).toBe('customer');
  });

  it('accepts explicitly verified emails[] entry when _json.email is absent', async () => {
    let resultUser = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-verified-array-1',
        displayName: 'Verified Array User',
        emails: [{ value: 'array.verified@example.com', verified: true }],
      },
      (err, user) => {
        expect(err).toBeNull();
        resultUser = user;
      }
    );
    expect(resultUser).toBeDefined();
    expect(resultUser.email).toBe('array.verified@example.com');
    expect(resultUser.role).toBe('customer');
  });

  it('rejects profile when _json.email_verified is true but _json.email is absent and array emails are unverified', async () => {
    let resultUser = null;
    let authError = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-mismatched-claims-1',
        displayName: 'Mismatched Claim User',
        _json: {
          email_verified: true, // Claim exists on _json but email does not
        },
        emails: [{ value: 'fallback@example.com' }], // Array email lacks verified: true
      },
      (err, user, info) => {
        authError = info;
        resultUser = user;
      }
    );
    expect(resultUser).toBeFalsy();
    expect(authError?.message).toBe('unverified_email');
  });

  it('rejects profile when _json.email_verified is true but no emails exist at all', async () => {
    let resultUser = null;
    let authError = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-no-email-1',
        _json: { email_verified: true },
      },
      (err, user, info) => {
        authError = info;
        resultUser = user;
      }
    );
    expect(resultUser).toBeFalsy();
    expect(authError?.message).toBe('invalid_email');
  });

  it('does not authorize an unverified array email using verified _json claim from a different email', async () => {
    let resultUser = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-two-emails-1',
        _json: {
          email: 'primary.verified@example.com',
          email_verified: true,
        },
        emails: [
          { value: 'secondary.unverified@example.com', verified: false },
        ],
      },
      (err, user) => {
        expect(err).toBeNull();
        resultUser = user;
      }
    );
    expect(resultUser).toBeDefined();
    // Must select the verified _json email, never the unverified array email
    expect(resultUser.email).toBe('primary.verified@example.com');
  });

  it('selects verified email from multiple array emails where only one is verified', async () => {
    let resultUser = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-multi-array-1',
        displayName: 'Multi Email User',
        emails: [
          { value: 'unverified-1@example.com', verified: false },
          { value: 'verified-winner@example.com', verified: true },
          { value: 'unverified-2@example.com' },
        ],
      },
      (err, user) => {
        expect(err).toBeNull();
        resultUser = user;
      }
    );
    expect(resultUser).toBeDefined();
    expect(resultUser.email).toBe('verified-winner@example.com');
  });

  it('rejects email when verified is explicitly false', async () => {
    let resultUser = null;
    let authError = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-unverified-1',
        displayName: 'Unverified User',
        _json: {
          email: 'unverified@example.com',
          email_verified: false,
        },
        emails: [{ value: 'unverified@example.com', verified: false }],
      },
      (err, user, info) => {
        authError = info;
        resultUser = user;
      }
    );
    expect(resultUser).toBeFalsy();
    expect(authError?.message).toBe('unverified_email');
  });

  it('rejects profile when authoritative verification claim is missing', async () => {
    let resultUser = null;
    let authError = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-missing-claim-1',
        displayName: 'Missing Claim User',
        _json: {
          email: 'noclaim@example.com',
          // email_verified omitted
        },
        emails: [{ value: 'noclaim@example.com' }], // verified omitted
      },
      (err, user, info) => {
        authError = info;
        resultUser = user;
      }
    );
    expect(resultUser).toBeFalsy();
    expect(authError?.message).toBe('unverified_email');
  });

  it('rejects profile when email is malformed or missing', async () => {
    let authError1 = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-malformed-1',
        _json: { email: 'not-an-email', email_verified: true },
      },
      (err, user, info) => {
        authError1 = info;
      }
    );
    expect(authError1?.message).toBe('invalid_email');

    let authError2 = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-missing-1',
        _json: {},
      },
      (err, user, info) => {
        authError2 = info;
      }
    );
    expect(authError2?.message).toBe('invalid_email');
  });

  it('safely links existing local account without changing its role', async () => {
    const studio = await User.create({
      email: 'master@artstudio.com',
      passwordHash: 'hash',
      role: 'studio',
      displayName: 'Studio Master',
    });

    let linkedUser = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-studio-999',
        displayName: 'Google Master',
        _json: {
          email: 'master@artstudio.com',
          email_verified: true,
        },
      },
      (err, user) => {
        expect(err).toBeNull();
        linkedUser = user;
      }
    );

    expect(linkedUser).toBeDefined();
    expect(linkedUser.id).toBe(studio.id);
    expect(linkedUser.role).toBe('studio');
    expect(linkedUser.googleId).toBe('google-studio-999');
  });
});

describe('OAuth Login-CSRF Protection & State Enforcement', () => {
  function createMockPassport(authenticateHandler) {
    return {
      initialize: () => (req, res, next) => next(),
      _strategy: () => true,
      use: () => {},
      authenticate: (strategy, options, callback) => {
        return (req, res, next) => {
          if (typeof callback === 'function') {
            return authenticateHandler(req, res, next, callback);
          }
          // Initiation route (/google): simulate redirect containing state
          const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?state=${options.state}`;
          return res.redirect(redirectUrl);
        };
      },
    };
  }

  it('creates cryptographic session-bound state upon authorization initiation', async () => {
    const app = freshApp({
      googleClientId: 'mock-client-id',
      googleClientSecret: 'mock-client-secret',
    });
    const agent = request.agent(app);

    const initRes = await agent.get('/api/auth/google');
    expect(initRes.status).toBe(302);
    const redirectUrl = new URL(initRes.headers.location);
    const generatedState = redirectUrl.searchParams.get('state');
    expect(generatedState).toBeDefined();
    expect(generatedState.length).toBe(64); // 32 bytes in hex = 64 characters
  });

  it('allows valid matching state to reach Passport callback flow without contacting Google', async () => {
    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'oauth.buyer@example.com',
      role: 'customer',
      displayName: 'OAuth Buyer',
    };

    const mockPassport = createMockPassport((req, res, next, done) => {
      done(null, mockUser);
    });

    const app = freshApp({
      googleClientId: 'mock-client-id',
      googleClientSecret: 'mock-client-secret',
      passportInstance: mockPassport,
      rateLimitOptions: {
        enableApiLimiterInTest: false,
        authMax: 20,
        oauthMax: 20,
      },
    });
    const agent = request.agent(app);

    // 1. Initiate OAuth to generate session-bound state
    const initRes = await agent.get('/api/auth/google');
    expect(initRes.status).toBe(302);
    const redirectUrl = new URL(initRes.headers.location);
    const generatedState = redirectUrl.searchParams.get('state');
    expect(generatedState).toBeDefined();

    // 2. Callback with matching state
    const callbackRes = await agent.get(`/api/auth/google/callback?state=${generatedState}&code=mock_code`);
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toBe('http://localhost:5173/buyer');

    // 3. User session is active
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('oauth.buyer@example.com');
  });

  it('rejects replay of consumed state (single-use enforcement)', async () => {
    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: 'replay.tester@example.com',
      role: 'customer',
      displayName: 'Replay Tester',
    };

    const mockPassport = createMockPassport((req, res, next, done) => {
      done(null, mockUser);
    });

    const app = freshApp({
      googleClientId: 'mock-client-id',
      googleClientSecret: 'mock-client-secret',
      passportInstance: mockPassport,
      rateLimitOptions: {
        enableApiLimiterInTest: false,
        authMax: 20,
        oauthMax: 20,
      },
    });
    const agent = request.agent(app);

    // 1. Initiate OAuth
    const initRes = await agent.get('/api/auth/google');
    const redirectUrl = new URL(initRes.headers.location);
    const state = redirectUrl.searchParams.get('state');

    // 2. First callback succeeds and consumes state
    const firstCallback = await agent.get(`/api/auth/google/callback?state=${state}&code=mock_code_1`);
    expect(firstCallback.status).toBe(302);
    expect(firstCallback.headers.location).toBe('http://localhost:5173/buyer');

    // 3. Replaying the identical callback with consumed state must be rejected
    const replayCallback = await agent.get(`/api/auth/google/callback?state=${state}&code=mock_code_2`);
    expect(replayCallback.status).toBe(302);
    expect(replayCallback.headers.location).toBe('http://localhost:5173/login?error=oauth_csrf_rejected');
  });

  it('rejects callback when state query parameter is missing', async () => {
    const app = freshApp({
      googleClientId: 'mock-client-id',
      googleClientSecret: 'mock-client-secret',
    });
    const agent = request.agent(app);

    await agent.get('/api/auth/google');
    const callbackRes = await agent.get('/api/auth/google/callback?code=mock_code');
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toContain('error=oauth_csrf_rejected');
  });

  it('rejects callback when state query parameter is mismatched', async () => {
    const app = freshApp({
      googleClientId: 'mock-client-id',
      googleClientSecret: 'mock-client-secret',
    });
    const agent = request.agent(app);

    await agent.get('/api/auth/google');
    const callbackRes = await agent.get('/api/auth/google/callback?state=forged_state_nonce&code=mock_code');
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toContain('error=oauth_csrf_rejected');
  });

  it('handles provider failure after valid state safely', async () => {
    let mockFailureBehavior = null;
    const mockPassport = createMockPassport((req, res, next, done) => {
      mockFailureBehavior(done);
    });

    const app = freshApp({
      googleClientId: 'mock-client-id',
      googleClientSecret: 'mock-client-secret',
      passportInstance: mockPassport,
      rateLimitOptions: {
        enableApiLimiterInTest: false,
        authMax: 20,
        oauthMax: 20,
      },
    });

    // Case A: Strategy callback receives an error
    {
      mockFailureBehavior = (done) => done(new Error('Google 500 Server Error'));
      const agent = request.agent(app);
      const initRes = await agent.get('/api/auth/google');
      const state = new URL(initRes.headers.location).searchParams.get('state');

      const res = await agent.get(`/api/auth/google/callback?state=${state}&code=code_err`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=oauth_failed');
    }

    // Case B: Strategy callback receives unverified_email info
    {
      mockFailureBehavior = (done) => done(null, false, { message: 'unverified_email' });
      const agent = request.agent(app);
      const initRes = await agent.get('/api/auth/google');
      const state = new URL(initRes.headers.location).searchParams.get('state');

      const res = await agent.get(`/api/auth/google/callback?state=${state}&code=code_unverified`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=unverified_email');
    }

    // Case C: Strategy callback receives oauth denied/generic failure
    {
      mockFailureBehavior = (done) => done(null, false, { message: 'access_denied' });
      const agent = request.agent(app);
      const initRes = await agent.get('/api/auth/google');
      const state = new URL(initRes.headers.location).searchParams.get('state');

      const res = await agent.get(`/api/auth/google/callback?state=${state}&code=code_denied`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/login?error=oauth_denied');
    }
  });
});

describe('Configurable Proxy Trust and Rate Limiting', () => {
  it('prevents rate limit bypass via spoofed forwarding headers when trustProxy is default (false)', async () => {
    const isolatedLimiters = createRateLimiters({
      isTest: false,
      authMax: 2,
      authWindowMs: 60000,
    });
    // Default trustProxy: false
    const app = freshApp({ rateLimiters: isolatedLimiters, trustProxy: false });

    const payload = { email: 'spoof@example.com', password: 'wrongpassword' };

    // Request 1 with spoofed header
    const res1 = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '203.0.113.1')
      .send(payload);
    expect(res1.status).toBe(401);

    // Request 2 with different spoofed header
    const res2 = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '203.0.113.2')
      .send(payload);
    expect(res2.status).toBe(401);

    // Request 3 with third spoofed header -> Must be RATE_LIMITED because true socket IP is untrusted
    const res3 = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '203.0.113.3')
      .send(payload);
    expect(res3.status).toBe(429);
    expect(res3.body.error.code).toBe('RATE_LIMITED');
  });

  it('evaluates forwarding headers when trustProxy is explicitly configured', async () => {
    const isolatedLimiters = createRateLimiters({
      isTest: false,
      authMax: 2,
      authWindowMs: 60000,
    });
    // Configured trustProxy: 1 (trusted reverse proxy)
    const app = freshApp({ rateLimiters: isolatedLimiters, trustProxy: 1 });

    const payload = { email: 'trusted-proxy@example.com', password: 'wrongpassword' };

    // 2 requests from IP A
    await request(app).post('/api/auth/login').set('Origin', origin).set('X-Forwarded-For', '198.51.100.1').send(payload);
    await request(app).post('/api/auth/login').set('Origin', origin).set('X-Forwarded-For', '198.51.100.1').send(payload);

    // IP A hits limit
    const resA = await request(app).post('/api/auth/login').set('Origin', origin).set('X-Forwarded-For', '198.51.100.1').send(payload);
    expect(resA.status).toBe(429);

    // Different legitimate forwarded IP B is NOT blocked by IP A's limit
    const resB = await request(app).post('/api/auth/login').set('Origin', origin).set('X-Forwarded-For', '198.51.100.2').send(payload);
    expect(resB.status).toBe(401);
  });
});
