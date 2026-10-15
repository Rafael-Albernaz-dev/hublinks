import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server.js';
import { createPool } from './db.js';

const directory = await mkdtemp(join(tmpdir(), 'hublink-api-test-'));
const path = join(directory, 'data', 'config.json');
const pool = createPool();
const server = createServer(path, pool);
const attendantEmail = `attendant-${process.pid}@example.test`;
after(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [attendantEmail]);
  await server.close();
  await assert.rejects(pool.query('SELECT 1'));
  await rm(directory, { recursive: true, force: true });
});

function sessionCookie(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') throw new Error('Missing session cookie');
  const cookie = /^hublink_session=[0-9a-f]{64}/.exec(value);
  assert.ok(cookie);
  assert.match(value, /HttpOnly/i);
  assert.match(value, /SameSite=Lax/i);
  assert.match(value, /Max-Age=31536000/i);
  return cookie[0];
}

async function adminLogin() {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
      password: process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456',
    },
  });
  assert.equal(response.statusCode, 200);
  return sessionCookie(response);
}

test('/health reports readiness', async () => {
  const response = await server.inject('/health');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});

test('GET creates the initial configuration and reads it again', async () => {
  const first = await server.inject('/api/config');
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().version, 1);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), first.json());
  const second = await server.inject('/api/config');
  assert.deepEqual(second.json(), first.json());
});

test('PUT persists a valid configuration and GET returns it', async () => {
  const config = {
    version: 1,
    companyName: 'Example Company',
    subtitle: 'Public links',
    color: { r: 1, g: 2, b: 3 },
    logoDataUrl: null,
    links: [
      {
        id: 'one',
        title: 'Site',
        description: '',
        url: 'https://example.com/',
        logoDataUrl: 'data:image/png;base64,iVBORw==',
      },
    ],
  };
  const response = await server.inject({ method: 'PUT', url: '/api/config', payload: config });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'ok');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), response.json().config);
  assert.deepEqual((await server.inject('/api/config')).json(), response.json().config);
});

test('PUT rejects invalid payloads without replacing the file', async () => {
  const before = await readFile(path, 'utf8');
  for (const payload of [{ version: 2 }, { version: 1, links: [] }]) {
    const response = await server.inject({ method: 'PUT', url: '/api/config', payload });
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.json().error, 'string');
  }
  const valid = JSON.parse(before);
  for (const invalid of [
    { ...valid, color: { r: 256, g: 2, b: 3 } },
    { ...valid, links: [{ ...valid.links[0], logoDataUrl: 'data:image/png;base64,broken!' }] },
    {
      ...valid,
      links: [
        { ...valid.links[0], logoDataUrl: `data:image/png;base64,${'AAAA'.repeat(166_667)}` },
      ],
    },
  ]) {
    const response = await server.inject({ method: 'PUT', url: '/api/config', payload: invalid });
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.json().error, 'string');
  }
  const malformedJson = await server.inject({
    method: 'PUT',
    url: '/api/config',
    headers: { 'content-type': 'application/json' },
    payload: '{',
  });
  assert.equal(malformedJson.statusCode, 400);
  assert.equal(typeof malformedJson.json().error, 'string');
  assert.equal(await readFile(path, 'utf8'), before);
});

test('login, rolling session, failed audit, and logout revocation', async () => {
  const failedBefore = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'login_failed'",
  );
  const wrong = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
      password: 'wrong-password',
    },
  });
  assert.equal(wrong.statusCode, 401);
  const failedAfter = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_logs WHERE action = 'login_failed'",
  );
  assert.equal(Number(failedAfter.rows[0]?.count), Number(failedBefore.rows[0]?.count) + 1);
  assert.equal((await server.inject('/api/auth/me')).statusCode, 401);

  const cookie = await adminLogin();
  const me = await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.role, 'admin');
  assert.ok(me.headers['set-cookie']);
  const logout = await server.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { cookie },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(
    (await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode,
    401,
  );
  const token = cookie.slice('hublink_session='.length);
  const hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
  const revoked = await pool.query<{ revoked_at: Date | null }>(
    'SELECT revoked_at FROM sessions WHERE token_hash = $1',
    [hash],
  );
  assert.ok(revoked.rows[0]?.revoked_at);
});

test('a session inactive for more than 365 days cannot be renewed', async () => {
  const cookie = await adminLogin();
  const token = cookie.slice('hublink_session='.length);
  const hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
  await pool.query(
    "UPDATE sessions SET last_seen_at = NOW() - INTERVAL '366 days' WHERE token_hash = $1",
    [hash],
  );
  const expired = await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  assert.equal(expired.statusCode, 401);
  assert.equal(expired.json().error, 'Não autenticado.');
});

test('admin creates an attendant; reset revokes all prior sessions', async () => {
  const adminCookie = await adminLogin();
  const created = await server.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: { cookie: adminCookie },
    payload: {
      displayName: 'Test Attendant',
      email: attendantEmail,
      password: 'initial-password-123',
    },
  });
  assert.equal(created.statusCode, 201);
  const id: string = created.json().user.id;
  assert.equal(created.json().user.role, 'attendant');
  const list = await server.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { cookie: adminCookie },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().users.some((user: { id: string }) => user.id === id));
  const attendantLogin = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: attendantEmail, password: 'initial-password-123' },
  });
  const attendantCookie = sessionCookie(attendantLogin);
  const forbidden = await server.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { cookie: attendantCookie },
  });
  assert.equal(forbidden.statusCode, 403);
  const reset = await server.inject({
    method: 'POST',
    url: `/api/admin/users/${id}/reset-password`,
    headers: { cookie: adminCookie },
    payload: { password: 'new-password-123' },
  });
  assert.equal(reset.statusCode, 200);
  assert.equal(
    (
      await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: attendantCookie },
      })
    ).statusCode,
    401,
  );
  const oldLogin = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: attendantEmail, password: 'initial-password-123' },
  });
  assert.equal(oldLogin.statusCode, 401);
  const newLogin = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: attendantEmail, password: 'new-password-123' },
  });
  assert.equal(newLogin.statusCode, 200);
  assert.equal(
    (
      await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: sessionCookie(newLogin) },
      })
    ).statusCode,
    200,
  );
});
