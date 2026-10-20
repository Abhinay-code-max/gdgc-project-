import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../server/app.js';
import { setupTestReplSet, teardownTestReplSet } from './setup-mongo.js';

let testUri = '';

beforeAll(async () => {
  const setup = await setupTestReplSet();
  testUri = setup.uri;

  // Controlled SPA fixture ensuring the test is deterministic and independent of build execution order
  const distDir = path.resolve('dist');
  const distIndex = path.join(distDir, 'index.html');
  if (!fs.existsSync(distIndex)) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      distIndex,
      '<!doctype html><html><head><title>Atelier Art Studio</title></head><body><div id="root">Atelier SPA Root</div></body></html>',
      'utf8'
    );
  }
});

afterAll(async () => {
  await teardownTestReplSet();
});

function freshApp() {
  const sessionStore = new session.MemoryStore();
  return createApp({
    mongodbUri: testUri,
    mongodbDbName: 'art_studio_test',
    appOrigin: 'http://localhost:5173',
    sessionStore,
  });
}

describe('Frontend and Backend routing contracts', () => {
  it('returns JSON 404 for unhandled API routes', async () => {
    const app = freshApp();
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error).toEqual({
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested route was not found.',
    });
  });

  it('serves SPA index.html for non-API client routes so React Router can display 404 or page', async () => {
    const app = freshApp();

    // Home route
    const homeRes = await request(app).get('/');
    expect(homeRes.status).toBe(200);
    expect(homeRes.headers['content-type']).toMatch(/html/);
    expect(homeRes.text).toContain('<!doctype html>');

    // Deep non-API route (unknown route that React Router catches as 404)
    const unknownRes = await request(app).get('/unknown-studio-page');
    expect(unknownRes.status).toBe(200);
    expect(unknownRes.headers['content-type']).toMatch(/html/);
    expect(unknownRes.text).toContain('<!doctype html>');

    // Client routes
    const buyerRes = await request(app).get('/buyer');
    expect(buyerRes.status).toBe(200);
    expect(buyerRes.headers['content-type']).toMatch(/html/);

    const loginRes = await request(app).get('/login');
    expect(loginRes.status).toBe(200);
    expect(loginRes.headers['content-type']).toMatch(/html/);
  });
});
