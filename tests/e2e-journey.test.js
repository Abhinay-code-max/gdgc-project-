import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { createApp } from '../server/app.js';
import { seedDatabase, STUDIO_EMAIL, STUDIO_PASSWORD } from '../server/seed.js';
import { setupTestReplSet, teardownTestReplSet, clearCollections } from './setup-mongo.js';

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

describe('Full Studio and Customer Journey (Agent 4 Verification)', () => {
  it('verifies complete journey with 1 studio account and 2 customer accounts, concurrency, ownership, and persistence', async () => {
    // 1. Initial setup and seed with MongoDB
    await seedDatabase({ mongodbUri: testUri, mongodbDbName: 'art_studio_test' });

    const sessionStore1 = MongoStore.create({
      mongoUrl: testUri,
      dbName: 'art_studio_test',
      collectionName: 'sessions',
    });

    const app1 = createApp({
      mongodbUri: testUri,
      mongodbDbName: 'art_studio_test',
      appOrigin: origin,
      sessionStore: sessionStore1,
    });

    // 2. Authenticate Studio Agent
    const studioAgent = request.agent(app1);
    const studioLogin = await studioAgent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: STUDIO_EMAIL, password: STUDIO_PASSWORD });
    expect(studioLogin.status).toBe(200);
    expect(studioLogin.body.data.user.role).toBe('studio');

    // 3. Register Customer 1 (Alice) - attempt to inject studio role
    const customer1Agent = request.agent(app1);
    const c1Reg = await customer1Agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ email: 'alice.journey@example.com', password: 'Password123!', role: 'studio' });
    expect(c1Reg.status).toBe(201);
    expect(c1Reg.body.data.user.role).toBe('customer'); // Role assignment from server

    // 4. Register Customer 2 (Bob)
    const customer2Agent = request.agent(app1);
    const c2Reg = await customer2Agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ email: 'bob.journey@example.com', password: 'Password123!' });
    expect(c2Reg.status).toBe(201);
    expect(c2Reg.body.data.user.role).toBe('customer');

    // 5. Server Role Checks: Customer cannot create painting
    const customerAddPainting = await customer1Agent
      .post('/api/paintings')
      .set('Origin', origin)
      .send({ title: 'Hacked', description: 'Desc', priceMinor: 1000 });
    expect(customerAddPainting.status).toBe(403);

    // 6. Studio adds a new original painting
    const newPaintingRes = await studioAgent
      .post('/api/paintings')
      .set('Origin', origin)
      .send({
        title: 'Dawn on Emerald Hills',
        description: 'Original acrylic on heavy linen.',
        priceMinor: 5200000,
        imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675',
      });
    expect(newPaintingRes.status).toBe(201);
    const paintingId = newPaintingRes.body.data.id;
    expect(newPaintingRes.body.data.available).toBe(true);

    // 7. Concurrent Purchase: Alice and Bob try to buy the same painting simultaneously
    const [buy1, buy2] = await Promise.all([
      customer1Agent.post(`/api/paintings/${paintingId}/purchase`).set('Origin', origin),
      customer2Agent.post(`/api/paintings/${paintingId}/purchase`).set('Origin', origin),
    ]);

    const statuses = [buy1.status, buy2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winnerRes = buy1.status === 201 ? buy1 : buy2;
    const loserRes = buy1.status === 409 ? buy1 : buy2;
    const winnerAgent = buy1.status === 201 ? customer1Agent : customer2Agent;
    const loserAgent = buy1.status === 409 ? customer1Agent : customer2Agent;

    expect(loserRes.body.error.code).toBe('PAINTING_UNAVAILABLE');
    const orderId = winnerRes.body.data.id;
    expect(winnerRes.body.data.priceMinor).toBe(5200000); // Stored price snapshot

    // 8. Ownership Protection: Loser customer requests Winner's order
    const loserOrderInspect = await loserAgent.get(`/api/orders/${orderId}`);
    expect(loserOrderInspect.status).toBe(404); // Returns 404 so existence is not revealed

    const loserOrderCancel = await loserAgent
      .post(`/api/orders/${orderId}/cancel`)
      .set('Origin', origin);
    expect(loserOrderCancel.status).toBe(404);

    // 9. Studio edits on sold painting must be rejected
    const studioEditSold = await studioAgent
      .patch(`/api/paintings/${paintingId}`)
      .set('Origin', origin)
      .send({ title: 'Illegal Edit', priceMinor: 9999999 });
    expect(studioEditSold.status).toBe(409);
    expect(studioEditSold.body.error.code).toBe('PAINTING_SOLD');

    // 10. Studio cannot cancel customer orders
    const studioCancel = await studioAgent
      .post(`/api/orders/${orderId}/cancel`)
      .set('Origin', origin);
    expect(studioCancel.status).toBe(403);

    // 11. Winner cancels order -> restores availability
    const cancelRes = await winnerAgent
      .post(`/api/orders/${orderId}/cancel`)
      .set('Origin', origin);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');
    expect(cancelRes.body.data.cancelledAt).toBeTruthy();

    // 12. Loser (second customer) repurchases released painting
    const repurchaseRes = await loserAgent
      .post(`/api/paintings/${paintingId}/purchase`)
      .set('Origin', origin);
    expect(repurchaseRes.status).toBe(201);
    expect(repurchaseRes.body.data.status).toBe('placed');
    expect(repurchaseRes.body.data.paintingId).toBe(paintingId);

    // 13. Persistence across app restart using MongoDB session store
    const sessionStore2 = MongoStore.create({
      mongoUrl: testUri,
      dbName: 'art_studio_test',
      collectionName: 'sessions',
    });

    const app2 = createApp({
      mongodbUri: testUri,
      mongodbDbName: 'art_studio_test',
      appOrigin: origin,
      sessionStore: sessionStore2,
    });

    const restartedPainting = await request(app2).get(`/api/paintings/${paintingId}`);
    expect(restartedPainting.status).toBe(200);
    expect(restartedPainting.body.data.available).toBe(false);

    // Verify session persistence in app2 by making request with cookie from studioAgent
    const studioCookie = studioLogin.headers['set-cookie'];
    const studioMe = await request(app2)
      .get('/api/auth/me')
      .set('Cookie', studioCookie);
    expect(studioMe.status).toBe(200);
    expect(studioMe.body.data.user.email).toBe(STUDIO_EMAIL);
    expect(studioMe.body.data.user.role).toBe('studio');
  });
});
