import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const apps = [];

function freshApp() {
  const app = createApp({
    databasePath: ':memory:',
    sessionSecret: 'painting-order-tests-have-a-long-secret',
    appOrigin: origin,
    isProduction: false,
  });
  apps.push(app);
  return app;
}

async function registerCustomer(app, email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').set('Origin', origin).send({ email, password });
  expect(response.status).toBe(201);
  return agent;
}

async function studioAgent(app) {
  const passwordHash = await bcrypt.hash(password, 4);
  app.locals.db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'studio')")
    .run('studio@example.com', passwordHash);
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').set('Origin', origin)
    .send({ email: 'studio@example.com', password });
  expect(response.status).toBe(200);
  return agent;
}

async function createPainting(agent, overrides = {}) {
  const response = await agent.post('/api/paintings').set('Origin', origin).send({
    title: 'Evening Banyan',
    description: 'Oil on canvas',
    priceMinor: 175000,
    imageUrl: 'https://example.com/banyan.jpg',
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.data;
}

afterEach(() => {
  while (apps.length) apps.pop().locals.db.close();
});

describe('painting management and public browsing', () => {
  it('allows public browsing while enforcing studio mutations and validation', async () => {
    const app = freshApp();
    const customer = await registerCustomer(app, 'customer@example.com');
    const studio = await studioAgent(app);

    expect((await request(app).get('/api/paintings')).body).toEqual({ data: [] });
    expect((await request(app).post('/api/paintings').set('Origin', origin).send({})).status).toBe(401);
    expect((await customer.post('/api/paintings').set('Origin', origin).send({
      title: 'No', description: 'Not allowed', priceMinor: 100,
    })).status).toBe(403);

    const invalid = await studio.post('/api/paintings').set('Origin', origin).send({
      title: '', description: '', priceMinor: 10.5, imageUrl: 'file:///secret',
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const painting = await createPainting(studio);
    const detail = await request(app).get(`/api/paintings/${painting.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      title: 'Evening Banyan', priceMinor: 175000, available: true,
    });

    const edited = await studio.patch(`/api/paintings/${painting.id}`).set('Origin', origin)
      .send({ title: 'Evening Banyan II', priceMinor: 180000 });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ title: 'Evening Banyan II', priceMinor: 180000 });
  });
});

describe('purchase, cancellation, and order authorization', () => {
  it('allows exactly one of two competing purchases and rejects edits while sold', async () => {
    const app = freshApp();
    const studio = await studioAgent(app);
    const first = await registerCustomer(app, 'first@example.com');
    const second = await registerCustomer(app, 'second@example.com');
    const painting = await createPainting(studio);

    const responses = await Promise.all([
      first.post(`/api/paintings/${painting.id}/purchase`).set('Origin', origin),
      second.post(`/api/paintings/${painting.id}/purchase`).set('Origin', origin),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409).body.error.code).toBe('PAINTING_UNAVAILABLE');
    expect(app.locals.db.prepare("SELECT count(*) AS count FROM orders WHERE painting_id = ? AND status = 'placed'")
      .get(painting.id).count).toBe(1);

    const sold = await request(app).get(`/api/paintings/${painting.id}`);
    expect(sold.body.data.available).toBe(false);
    const edit = await studio.patch(`/api/paintings/${painting.id}`).set('Origin', origin).send({ priceMinor: 999999 });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('PAINTING_SOLD');
  });

  it('preserves the price snapshot, hides ownership, and permits cancellation then repurchase', async () => {
    const app = freshApp();
    const studio = await studioAgent(app);
    const owner = await registerCustomer(app, 'owner@example.com');
    const other = await registerCustomer(app, 'other@example.com');
    const painting = await createPainting(studio, { priceMinor: 234500 });

    const bought = await owner.post(`/api/paintings/${painting.id}/purchase`).set('Origin', origin);
    expect(bought.status).toBe(201);
    expect(bought.body.data).toMatchObject({ priceMinor: 234500, status: 'placed' });
    expect(bought.body.data).not.toHaveProperty('customerEmail');
    const orderId = bought.body.data.id;

    expect((await other.get(`/api/orders/${orderId}`)).status).toBe(404);
    expect((await other.post(`/api/orders/${orderId}/cancel`).set('Origin', origin)).status).toBe(404);
    expect((await studio.post(`/api/orders/${orderId}/cancel`).set('Origin', origin)).status).toBe(403);
    const ownerOrders = await owner.get('/api/orders');
    expect(ownerOrders.body.data).toHaveLength(1);
    expect((await other.get('/api/orders')).body.data).toEqual([]);

    const studioDetail = await studio.get(`/api/orders/${orderId}`);
    expect(studioDetail.status).toBe(200);
    expect(studioDetail.body.data.customerEmail).toBe('owner@example.com');

    const cancelled = await owner.post(`/api/orders/${orderId}/cancel`).set('Origin', origin);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect(cancelled.body.data.cancelledAt).toEqual(expect.any(String));
    const secondCancellation = await owner.post(`/api/orders/${orderId}/cancel`).set('Origin', origin);
    expect(secondCancellation.status).toBe(409);
    expect(secondCancellation.body.error.code).toBe('ORDER_NOT_CANCELLABLE');

    const edited = await studio.patch(`/api/paintings/${painting.id}`).set('Origin', origin).send({ priceMinor: 300000 });
    expect(edited.status).toBe(200);
    const repurchased = await other.post(`/api/paintings/${painting.id}/purchase`).set('Origin', origin);
    expect(repurchased.status).toBe(201);
    expect(repurchased.body.data.priceMinor).toBe(300000);
    expect((await owner.get(`/api/orders/${orderId}`)).body.data.priceMinor).toBe(234500);
    expect(app.locals.db.prepare('SELECT count(*) AS count FROM orders WHERE painting_id = ?').get(painting.id).count).toBe(2);
  });
});
