import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

const origin = 'http://localhost:5173';
const apps = [];

function freshApp() {
  const app = createApp({
    databasePath: ':memory:',
    sessionSecret: 'test-secret-that-is-long-enough-for-tests',
    appOrigin: origin,
    isProduction: false,
  });
  apps.push(app);
  return app;
}

afterEach(() => {
  while (apps.length) apps.pop().locals.db.close();
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
    expect(registered.body.data.user).toMatchObject({ email: 'customer@example.com', role: 'customer' });
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.post('/api/auth/logout').set('Origin', origin)).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await agent.post('/api/auth/login').set('Origin', origin).send({
      email: 'customer@example.com', password: 'correct horse battery staple',
    })).status).toBe(200);
  });

  it('rejects duplicate accounts, invalid credentials, and untrusted mutation origins', async () => {
    const app = freshApp();
    const payload = { email: 'customer@example.com', password: 'correct horse battery staple' };
    expect((await request(app).post('/api/auth/register').set('Origin', origin).send(payload)).status).toBe(201);
    expect((await request(app).post('/api/auth/register').set('Origin', origin).send(payload)).status).toBe(409);
    expect((await request(app).post('/api/auth/login').set('Origin', origin).send({ ...payload, password: 'not-the-password' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send(payload)).status).toBe(403);
  });

  it('fails startup in production mode if SESSION_SECRET is missing or shorter than 32 characters', () => {
    // Missing / empty in production
    expect(() => createApp({ isProduction: true, sessionSecret: '' }))
      .toThrow('SESSION_SECRET must contain at least 32 characters in production.');
    expect(() => createApp({ isProduction: true, sessionSecret: null }))
      .toThrow('SESSION_SECRET must contain at least 32 characters in production.');

    // Shorter than 32 characters in production
    expect(() => createApp({ isProduction: true, sessionSecret: 'too-short-secret' }))
      .toThrow('SESSION_SECRET must contain at least 32 characters in production.');

    // 32+ characters in production succeeds
    const prodApp = createApp({
      databasePath: ':memory:',
      isProduction: true,
      sessionSecret: 'a'.repeat(32),
      appOrigin: origin,
    });
    expect(prodApp).toBeDefined();
    prodApp.locals.db.close();
  });
});
