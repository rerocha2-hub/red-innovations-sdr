import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate the database for this test run BEFORE importing the app.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendapro-test-'));
process.env.DB_FILE = path.join(tmpDir, 'test.sqlite');
process.env.JWT_SECRET = 'test-secret';

const { app } = await import('../server.js');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper that keeps the session cookie between calls.
function makeClient() {
  let cookie = '';
  return async (pathname, { method = 'GET', body } = {}) => {
    const res = await fetch(baseUrl + pathname, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch { /* */ }
    return { status: res.status, data };
  };
}

test('health check responds', async () => {
  const res = await fetch(baseUrl + '/api/health');
  assert.equal(res.status, 200);
});

test('full flow: signup → add service → set hours → public booking', async () => {
  const owner = makeClient();

  // Signup
  const signup = await owner('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Barbearia Teste', email: 'dono@teste.com', password: 'segredo123' },
  });
  assert.equal(signup.status, 201);
  const slug = signup.data.slug;
  assert.ok(slug);

  // me
  const me = await owner('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.subscriptionActive, true); // in trial

  // Add a 60-min service
  const svc = await owner('/api/services', {
    method: 'POST',
    body: { name: 'Corte', duration_min: 60, price_cents: 5000 },
  });
  assert.equal(svc.status, 201);
  const serviceId = svc.data.id;

  // Set hours: open Monday–Sunday 09:00–12:00 so any test date works.
  const hours = Array.from({ length: 7 }, (_, weekday) => ({
    weekday, start_time: '09:00', end_time: '12:00',
  }));
  const setHours = await owner('/api/availability', { method: 'PUT', body: { hours } });
  assert.equal(setHours.status, 200);

  // Public client books — pick a date a week out to avoid past-slot filtering.
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const anon = makeClient();

  const slots = await anon(`/api/public/${slug}/slots?serviceId=${serviceId}&date=${date}`);
  assert.equal(slots.status, 200);
  assert.deepEqual(slots.data.slots, ['09:00', '10:00', '11:00']);

  const booking = await anon(`/api/public/${slug}/book`, {
    method: 'POST',
    body: {
      serviceId, date, time: '10:00',
      customer_name: 'Cliente Feliz', customer_email: 'cliente@teste.com',
    },
  });
  assert.equal(booking.status, 201);

  // The 10:00 slot is now gone for that date.
  const slots2 = await anon(`/api/public/${slug}/slots?serviceId=${serviceId}&date=${date}`);
  assert.deepEqual(slots2.data.slots, ['09:00', '11:00']);

  // Double-booking the same slot is rejected.
  const dup = await anon(`/api/public/${slug}/book`, {
    method: 'POST',
    body: { serviceId, date, time: '10:00', customer_name: 'Outro' },
  });
  assert.equal(dup.status, 409);

  // Owner sees exactly one confirmed appointment.
  const appts = await owner('/api/appointments');
  assert.equal(appts.data.filter((a) => a.status === 'confirmed').length, 1);

  const stats = await owner('/api/appointments/stats/summary');
  assert.equal(stats.data.revenueCents, 5000);
});

test('cannot book a closed day', async () => {
  const owner = makeClient();
  await owner('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Clinica X', email: 'x@teste.com', password: 'segredo123' },
  });
  const svc = await owner('/api/services', {
    method: 'POST',
    body: { name: 'Consulta', duration_min: 30 },
  });
  // Open ONLY on weekday 1 (Monday).
  await owner('/api/availability', {
    method: 'PUT',
    body: { hours: [{ weekday: 1, start_time: '09:00', end_time: '10:00' }] },
  });
  const me = await owner('/api/auth/me');
  const slug = me.data.slug;

  // Find the next Sunday (weekday 0) which is closed.
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // next Sunday
  const sunday = d.toISOString().slice(0, 10);

  const anon = makeClient();
  const slots = await anon(`/api/public/${slug}/slots?serviceId=${svc.data.id}&date=${sunday}`);
  assert.deepEqual(slots.data.slots, []);
});

test('rejects duplicate email signup', async () => {
  const c = makeClient();
  await c('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Dup', email: 'dup@teste.com', password: 'segredo123' },
  });
  const again = await c('/api/auth/signup', {
    method: 'POST',
    body: { name: 'Dup2', email: 'dup@teste.com', password: 'segredo123' },
  });
  assert.equal(again.status, 409);
});
