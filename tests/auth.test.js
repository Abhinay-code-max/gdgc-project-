import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../server/app.js';
import { verifyGoogleProfile } from '../server/routes/auth.js';
import { connectDatabase } from '../server/db/connection.js';
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
      oauthMax: 3,
    },
    ...overrides,
  });
}

describe('MongoDB startup & connection failure', () => {
  it('throws clear startup error when MongoDB connection fails', async () => {
    // Attempt connecting to invalid host with short timeout
    await expect(
      connectDatabase('mongodb://127.0.0.1:59999', 'invalid_db', { serverSelectionTimeoutMS: 200 })
    ).rejects.toThrow(/Failed to connect to MongoDB/);

    // Reconnect to test instance for subsequent tests
    await connectDatabase(testUri, 'art_studio_test');
  });
});

describe('authentication and mutation protection', () => {
  it('registers only customers, persists a session, logs out, and logs in again', async () => {
    const app = freshApp();
    const agent = request.agent(app);

    const registered = await agent.post('/api/auth/register').set('Origin', origin).send({
      email: 'Customer@Example.com',
      password: 'correct horse battery staple',
      role: 'studio', // Attempt to inject role
    });

    expect(registered.status).toBe(201);
    expect(registered.body.data.user).toMatchObject({
      email: 'customer@example.com',
      role: 'customer', // Must strictly remain customer
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

describe('Google OAuth logic and account linking', () => {
  it('creates a new customer account from verified Google profile and rejects unverified email', async () => {
    // 1. Unverified email
    let resultUser = null;
    let authError = null;
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-100',
        displayName: 'Unverified Guy',
        emails: [{ value: 'unverified@example.com', verified: false }],
      },
      (err, user, info) => {
        authError = info;
        resultUser = user;
      }
    );
    expect(resultUser).toBeFalsy();
    expect(authError?.message).toBe('unverified_email');

    // 2. Verified email creates customer role
    await verifyGoogleProfile(
      'token',
      'refresh',
      {
        id: 'google-101',
        displayName: 'Alice Google',
        emails: [{ value: 'alice.google@example.com', verified: true }],
        photos: [{ value: 'https://example.com/avatar.jpg' }],
      },
      (err, user) => {
        expect(err).toBeNull();
        resultUser = user;
      }
    );
    expect(resultUser).toBeDefined();
    expect(resultUser.email).toBe('alice.google@example.com');
    expect(resultUser.role).toBe('customer');
    expect(resultUser.googleId).toBe('google-101');
    expect(resultUser.displayName).toBe('Alice Google');
    expect(resultUser.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('safely links existing studio account without modifying its role', async () => {
    // Existing studio account created before Google OAuth
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
        emails: [{ value: 'master@artstudio.com', verified: true }],
      },
      (err, user) => {
        expect(err).toBeNull();
        linkedUser = user;
      }
    );

    expect(linkedUser).toBeDefined();
    expect(linkedUser.id).toBe(studio.id);
    expect(linkedUser.role).toBe('studio'); // Preserved studio role!
    expect(linkedUser.googleId).toBe('google-studio-999');
  });

  it('handles missing Google OAuth configuration gracefully without crashing', async () => {
    const app = freshApp({
      googleClientId: '',
      googleClientSecret: '',
    });

    const configRes = await request(app).get('/api/auth/config');
    expect(configRes.status).toBe(200);
    expect(configRes.body.data.googleAuthAvailable).toBe(false);

    const googleReq = await request(app).get('/api/auth/google');
    expect(googleReq.status).toBe(302);
    expect(googleReq.headers.location).toContain('error=oauth_not_configured');
  });
});

describe('Rate limiting and API 404', () => {
  it('returns HTTP 429 with RATE_LIMITED code when authentication rate limit is exceeded', async () => {
    const isolatedLimiters = createRateLimiters({
      isTest: false,
      authMax: 2,
      authWindowMs: 60000,
    });
    const app = freshApp({ rateLimiters: isolatedLimiters });

    const payload = { email: 'ratelimit@example.com', password: 'wrongpassword123' };

    // First attempt: 401
    const res1 = await request(app).post('/api/auth/login').set('Origin', origin).send(payload);
    expect(res1.status).toBe(401);

    // Second attempt: 401
    const res2 = await request(app).post('/api/auth/login').set('Origin', origin).send(payload);
    expect(res2.status).toBe(401);

    // Third attempt: 429 RATE_LIMITED
    const res3 = await request(app).post('/api/auth/login').set('Origin', origin).send(payload);
    expect(res3.status).toBe(429);
    expect(res3.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    });
    expect(res3.headers['ratelimit-limit']).toBeDefined();
  });

  it('returns JSON error for unknown API routes', async () => {
    const app = freshApp();
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested route was not found.',
    });
  });
});
