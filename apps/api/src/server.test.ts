import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server.js';
import { createPool } from './db.js';
import { createHash, randomBytes } from 'node:crypto';
import { encryptCredential } from './vault.js';

process.env.HUB_EXTENSION_ID = 'a'.repeat(32);
const extensionOrigin = `chrome-extension://${process.env.HUB_EXTENSION_ID}`;

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

test('opening tickets: issuance, atomic exchange, replay, expiry and session revocation', async () => {
  const serviceId = `ticket-${randomBytes(8).toString('hex')}`;
  const cookie = await adminLogin();
  const me = await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  const userId: string = me.json().user.id;
  const encrypted = encryptCredential('synthetic-user', 'synthetic-password', serviceId, null, 1);
  await pool.query(
    `INSERT INTO services (id, name, category, credential_type, target_url, has_action)
     VALUES ($1, 'Ticket test', 'sva', 'shared', 'https://example.test/login', TRUE)`,
    [serviceId],
  );
  try {
    await pool.query(
      `INSERT INTO vault_credentials (service_id, owner_user_id, encrypted_username,
       encrypted_password, iv, auth_tag, key_version)
       VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
      [
        serviceId,
        encrypted.encryptedUsername,
        encrypted.encryptedPassword,
        encrypted.iv,
        encrypted.authTag,
        encrypted.keyVersion,
      ],
    );
    const issue = () =>
      server.inject({
        method: 'POST',
        url: '/api/vault/tickets',
        headers: { cookie },
        payload: { serviceId },
      });
    assert.equal(
      (
        await server.inject({
          method: 'POST',
          url: '/api/vault/tickets',
          payload: { serviceId },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await server.inject({
          method: 'POST',
          url: '/api/vault/tickets',
          headers: { cookie },
          payload: { serviceId: 'unknown-service' },
        })
      ).statusCode,
      404,
    );
    const exchange = (ticket: string, origin = extensionOrigin) =>
      server.inject({
        method: 'POST',
        url: '/api/vault/exchange',
        headers: { origin },
        payload: { ticket, serviceId },
      });
    const issued = await issue();
    assert.equal(issued.statusCode, 200);
    assert.equal(issued.headers['cache-control'], 'no-store');
    const ticket: string = issued.json().ticket;
    assert.match(ticket, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(Object.keys(issued.json()).sort(), ['serviceId', 'targetUrl', 'ticket']);
    const stored = await pool.query<{ ticket_hash: string; session_id: string }>(
      'SELECT ticket_hash, session_id FROM opening_tickets WHERE service_id = $1 AND ticket_hash = $2',
      [serviceId, createHash('sha256').update(ticket).digest('hex')],
    );
    assert.equal(stored.rowCount, 1);
    assert.notEqual(stored.rows[0]?.ticket_hash, ticket);
    assert.equal(
      (
        await server.inject({
          method: 'OPTIONS',
          url: '/api/vault/exchange',
          headers: { origin: extensionOrigin },
        })
      ).statusCode,
      204,
    );
    assert.equal((await exchange(ticket, 'https://evil.test')).statusCode, 403);
    const concurrent = await Promise.all([exchange(ticket), exchange(ticket)]);
    assert.deepEqual(concurrent.map((item) => item.statusCode).sort(), [200, 403]);
    assert.deepEqual(concurrent.find((item) => item.statusCode === 200)?.json(), {
      username: 'synthetic-user',
      password: 'synthetic-password',
      targetUrl: 'https://example.test/login',
    });
    assert.equal((await exchange(ticket)).statusCode, 403);
    const expired = (await issue()).json().ticket as string;
    await pool.query(
      `UPDATE opening_tickets SET created_at = NOW() - INTERVAL '31 seconds',
       expires_at = NOW() - INTERVAL '1 second' WHERE ticket_hash = $1`,
      [createHash('sha256').update(expired).digest('hex')],
    );
    assert.equal((await exchange(expired)).statusCode, 403);
    const revoked = (await issue()).json().ticket as string;
    await server.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    assert.equal((await exchange(revoked)).statusCode, 403);
    const audits = await pool.query<{ action: string; details: unknown }>(
      `SELECT action, details FROM audit_logs WHERE service_id = $1 AND user_id = $2`,
      [serviceId, userId],
    );
    assert.equal(audits.rows.filter((row) => row.action === 'ticket_issued').length, 3);
    assert.equal(audits.rows.filter((row) => row.action === 'ticket_exchanged').length, 1);
    assert.ok(
      audits.rows.every((row) => !JSON.stringify(row.details).includes('synthetic-password')),
    );
  } finally {
    await pool.query('DELETE FROM services WHERE id = $1', [serviceId]);
  }
});

test('individual opening ticket is bound to the authenticated credential owner', async () => {
  const adminCookie = await adminLogin();
  const serviceId = `individual-${randomBytes(8).toString('hex')}`;
  const owners: Array<{ id: string; cookie: string }> = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `ticket-owner-${index}-${randomBytes(5).toString('hex')}@example.test`;
      const created = await server.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: { cookie: adminCookie },
        payload: { displayName: `Ticket Owner ${index}`, email, password: 'synthetic-pass-123' },
      });
      assert.equal(created.statusCode, 201);
      const login = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'synthetic-pass-123' },
      });
      owners.push({ id: created.json().user.id, cookie: sessionCookie(login) });
    }
    await pool.query(
      `INSERT INTO services (id, name, category, credential_type, target_url, has_action)
       VALUES ($1, 'Individual ticket test', 'sva', 'individual', 'https://example.test/owner', TRUE)`,
      [serviceId],
    );
    const first = owners[0]!;
    const second = owners[1]!;
    const encrypted = encryptCredential('first-owner', 'first-password', serviceId, first.id, 1);
    await pool.query(
      `INSERT INTO vault_credentials (service_id, owner_user_id, encrypted_username,
       encrypted_password, iv, auth_tag, key_version) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        serviceId,
        first.id,
        encrypted.encryptedUsername,
        encrypted.encryptedPassword,
        encrypted.iv,
        encrypted.authTag,
        encrypted.keyVersion,
      ],
    );
    const issue = (cookie: string) =>
      server.inject({
        method: 'POST',
        url: '/api/vault/tickets',
        headers: { cookie },
        payload: { serviceId },
      });
    assert.equal((await issue(second.cookie)).statusCode, 404);
    const issued = await issue(first.cookie);
    assert.equal(issued.statusCode, 200);
    const ticket = issued.json().ticket as string;
    assert.equal(
      (
        await server.inject({
          method: 'POST',
          url: '/api/vault/exchange',
          headers: { origin: extensionOrigin },
          payload: { serviceId: 'other-service', ticket },
        })
      ).statusCode,
      403,
    );
    const exchanged = await server.inject({
      method: 'POST',
      url: '/api/vault/exchange',
      headers: { origin: extensionOrigin },
      payload: { serviceId, ticket },
    });
    assert.equal(exchanged.statusCode, 200);
    assert.equal(exchanged.json().username, 'first-owner');
    assert.equal(exchanged.json().password, 'first-password');
    assert.equal(
      (
        await server.inject({
          method: 'POST',
          url: '/api/vault/exchange',
          headers: { origin: extensionOrigin },
          payload: { serviceId, ticket },
        })
      ).statusCode,
      403,
    );
  } finally {
    await pool.query('DELETE FROM services WHERE id = $1', [serviceId]);
    for (const owner of owners) await pool.query('DELETE FROM users WHERE id = $1', [owner.id]);
  }
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

test('vault: shared credentials managed and revealed by admin, blocked for attendant', async () => {
  const adminCookie = await adminLogin();

  // Create an attendant
  const attendantRes = await server.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: { cookie: adminCookie },
    payload: {
      displayName: 'Attendant Vault Test',
      email: `vault-attendant-${process.pid}@example.test`,
      password: 'password-12345',
    },
  });
  assert.equal(attendantRes.statusCode, 201);
  const attendantId = attendantRes.json().user.id;

  const attendantLoginRes = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email: `vault-attendant-${process.pid}@example.test`,
      password: 'password-12345',
    },
  });
  const attendantCookie = sessionCookie(attendantLoginRes);

  // 1. Attendant cannot save shared credential (PARTIU!)
  const attSaveShared = await server.inject({
    method: 'PUT',
    url: '/api/vault/credentials/partiu',
    headers: { cookie: attendantCookie },
    payload: { username: 'shared_user', password: 'shared_password' },
  });
  assert.equal(attSaveShared.statusCode, 403);

  // 2. Admin saves shared credential (PARTIU!)
  const adminSaveShared = await server.inject({
    method: 'PUT',
    url: '/api/vault/credentials/partiu',
    headers: { cookie: adminCookie },
    payload: { username: 'partiu_shared_user', password: 'partiu_secret_123' },
  });
  assert.equal(adminSaveShared.statusCode, 200);

  // 3. Attendant CANNOT reveal shared credential in Hub
  const attRevealShared = await server.inject({
    method: 'POST',
    url: '/api/vault/credentials/partiu/reveal',
    headers: { cookie: attendantCookie },
  });
  assert.equal(attRevealShared.statusCode, 403);

  // 4. Admin CAN reveal shared credential
  const adminRevealShared = await server.inject({
    method: 'POST',
    url: '/api/vault/credentials/partiu/reveal',
    headers: { cookie: adminCookie },
  });
  assert.equal(adminRevealShared.statusCode, 200);
  assert.equal(adminRevealShared.json().username, 'partiu_shared_user');
  assert.equal(adminRevealShared.json().password, 'partiu_secret_123');

  // 5. Attendant saves their own individual credential (Fullcam)
  const attSaveIndiv = await server.inject({
    method: 'PUT',
    url: '/api/vault/credentials/fullcam',
    headers: { cookie: attendantCookie },
    payload: { username: 'fullcam_my_operator', password: 'operator_pass_456' },
  });
  assert.equal(attSaveIndiv.statusCode, 200);

  // 6. Attendant reveals their own individual credential
  const attRevealIndiv = await server.inject({
    method: 'POST',
    url: '/api/vault/credentials/fullcam/reveal',
    headers: { cookie: attendantCookie },
  });
  assert.equal(attRevealIndiv.statusCode, 200);
  assert.equal(attRevealIndiv.json().username, 'fullcam_my_operator');
  assert.equal(attRevealIndiv.json().password, 'operator_pass_456');

  // 7. Admin reveals attendant individual credential for support
  const adminRevealIndiv = await server.inject({
    method: 'POST',
    url: '/api/vault/credentials/fullcam/reveal',
    headers: { cookie: adminCookie },
    payload: { ownerUserId: attendantId },
  });
  assert.equal(adminRevealIndiv.statusCode, 200);
  assert.equal(adminRevealIndiv.json().username, 'fullcam_my_operator');
  assert.equal(adminRevealIndiv.json().password, 'operator_pass_456');

  // 8. Audit logs check: verify action logged and no secrets in details
  const auditRes = await pool.query<{ action: string; details: string | null }>(
    "SELECT action, details::text AS details FROM audit_logs WHERE action IN ('credential_saved', 'credential_revealed') ORDER BY id DESC LIMIT 4",
  );
  assert.ok(auditRes.rows.length >= 2);
  for (const row of auditRes.rows) {
    if (row.details) {
      assert.equal(row.details.includes('partiu_secret_123'), false);
      assert.equal(row.details.includes('operator_pass_456'), false);
    }
  }

  // Cleanup attendant
  await pool.query('DELETE FROM users WHERE id = $1', [attendantId]);
});

test('admin creates vault services in supported categories with audit and no action', async () => {
  const cookie = await adminLogin();
  const createdIds: string[] = [];
  try {
    for (const entry of [
      { credentialType: 'shared', category: undefined, targetUrl: null },
      { credentialType: 'individual', category: 'crm', targetUrl: 'https://example.test/login' },
      { credentialType: 'individual', category: 'sistemas', targetUrl: null },
      { credentialType: 'shared', category: 'outros', targetUrl: null },
    ] as const) {
      const category = entry.category ?? 'sva';
      const name = `  New ${category} service  `;
      const response = await server.inject({
        method: 'POST',
        url: '/api/vault/services',
        headers: { cookie },
        payload: { name, ...entry },
      });
      assert.equal(response.statusCode, 201);
      const service = response.json().service;
      createdIds.push(service.id);
      assert.match(service.id, /^[0-9a-f-]{36}$/);
      assert.deepEqual(service, {
        id: service.id,
        name: name.trim(),
        category,
        credentialType: entry.credentialType,
        targetUrl: entry.targetUrl,
      });
      const stored = await pool.query<{
        has_action: boolean;
        credential_type: string;
        target_url: string | null;
      }>('SELECT has_action, credential_type, target_url FROM services WHERE id = $1', [
        service.id,
      ]);
      assert.equal(stored.rows[0]?.has_action, false);
      assert.equal(stored.rows[0]?.credential_type, entry.credentialType);
      assert.equal(stored.rows[0]?.target_url, service.targetUrl);
      const logged = await pool.query<{
        user_id: string;
        action: string;
        details: { name: string; credentialType: string; category: string };
      }>('SELECT user_id, action, details FROM audit_logs WHERE service_id = $1', [service.id]);
      assert.equal(logged.rows[0]?.action, 'service_created');
      assert.equal(logged.rows[0]?.details.name, name.trim());
      assert.equal(logged.rows[0]?.details.credentialType, entry.credentialType);
      assert.equal(logged.rows[0]?.details.category, service.category);
      assert.equal(typeof logged.rows[0]?.user_id, 'string');
      const list = await server.inject({
        method: 'GET',
        url: '/api/vault/credentials',
        headers: { cookie },
      });
      assert.equal(list.statusCode, 200);
      assert.ok(
        list
          .json()
          .credentials.some((entry: { serviceId: string }) => entry.serviceId === service.id),
      );
    }
    assert.notEqual(createdIds[0], createdIds[1]);
  } finally {
    for (const id of createdIds) await pool.query('DELETE FROM services WHERE id = $1', [id]);
  }
});

test('attendant cannot create a vault service', async () => {
  const adminCookie = await adminLogin();
  const email = `service-attendant-${process.pid}@example.test`;
  const created = await server.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: { cookie: adminCookie },
    payload: { displayName: 'Service Test', email, password: 'test-password-123' },
  });
  assert.equal(created.statusCode, 201);
  try {
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'test-password-123' },
    });
    assert.equal(login.statusCode, 200);
    const denied = await server.inject({
      method: 'POST',
      url: '/api/vault/services',
      headers: { cookie: sessionCookie(login) },
      payload: { name: 'Denied Service', credentialType: 'shared' },
    });
    assert.equal(denied.statusCode, 403);
    const found = await pool.query('SELECT 1 FROM services WHERE name = $1', ['Denied Service']);
    assert.equal(found.rowCount, 0);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [created.json().user.id]);
  }
});

test('vault service creation rejects invalid names, types, categories and URLs', async () => {
  const cookie = await adminLogin();
  for (const payload of [
    { name: '   ', credentialType: 'shared' },
    { name: 'x', credentialType: 'individual' },
    { name: 'x'.repeat(61), credentialType: 'shared' },
    { name: 'Valid Service', credentialType: 'none' },
    { name: 'Valid Service', credentialType: 'shared', category: 'sheet' },
    { name: 'Valid Service', credentialType: 'shared', targetUrl: 'http://example.test' },
    { name: 'Valid Service', credentialType: 'shared', targetUrl: 'https://u:p@example.test' },
    { name: 'Valid Service', credentialType: 'shared', password: 'unexpected' },
  ]) {
    const response = await server.inject({
      method: 'POST',
      url: '/api/vault/services',
      headers: { cookie },
      payload,
    });
    assert.equal(response.statusCode, 400);
  }
});

test('catalog migration, private listing, CRUD, and role isolation', async () => {
  const columns = await pool.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name IN ('description', 'logo_data_url')",
  );
  assert.deepEqual(columns.rows.map((row) => row.column_name).sort(), [
    'description',
    'logo_data_url',
  ]);
  assert.equal((await server.inject('/api/catalog')).statusCode, 401);
  const adminCookie = await adminLogin();
  const token = randomBytes(32).toString('hex');
  const attendant = await pool.query<{ id: string }>(
    `INSERT INTO users (display_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'attendant') RETURNING id`,
    ['Catalog Attendant', `catalog-${process.pid}@example.test`, 'unused-hash'],
  );
  const userId = attendant.rows[0]?.id;
  assert.ok(userId);
  await pool.query('INSERT INTO sessions (user_id, token_hash) VALUES ($1, $2)', [
    userId,
    createHash('sha256').update(token).digest('hex'),
  ]);
  const attendantCookie = `hublink_session=${token}`;
  const ids: string[] = [];
  try {
    const common = {
      name: 'Synthetic link',
      description: 'Public example',
      category: 'sheet',
      credentialType: 'none',
      targetUrl: 'https://example.test/form',
      logoDataUrl: null,
    };
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      const denied = await server.inject({
        method,
        url: method === 'POST' ? '/api/catalog/services' : '/api/catalog/services/partiu',
        headers: { cookie: attendantCookie },
        payload: method === 'DELETE' ? undefined : common,
      });
      assert.equal(denied.statusCode, 403);
    }
    const createdCard = await server.inject({
      method: 'POST',
      url: '/api/catalog/services',
      headers: { cookie: adminCookie },
      payload: common,
    });
    assert.equal(createdCard.statusCode, 201);
    const item = createdCard.json().service;
    ids.push(item.id);
    assert.equal(item.name, common.name);
    assert.equal(item.hasAction, true);
    assert.equal(item.hasCredential, false);
    const list = await server.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { cookie: attendantCookie },
    });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(
      list.json().services.find((service: { id: string }) => service.id === item.id),
      item,
    );
    assert.equal(JSON.stringify(list.json()).includes('encrypted_password'), false);
    const edited = await server.inject({
      method: 'PUT',
      url: `/api/catalog/services/${item.id}`,
      headers: { cookie: adminCookie },
      payload: { ...common, name: 'Edited link', targetUrl: null },
    });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().service.hasAction, false);
    const deleted = await server.inject({
      method: 'DELETE',
      url: `/api/catalog/services/${item.id}`,
      headers: { cookie: adminCookie },
    });
    assert.equal(deleted.statusCode, 204);
    ids.pop();
    assert.equal((await pool.query('SELECT 1 FROM services WHERE id = $1', [item.id])).rowCount, 0);
    const individual = await server.inject({
      method: 'POST',
      url: '/api/catalog/services',
      headers: { cookie: adminCookie },
      payload: { name: 'Individual example', category: 'sva', credentialType: 'individual' },
    });
    assert.equal(individual.statusCode, 201);
    const individualId: string = individual.json().service.id;
    ids.push(individualId);
    await pool.query(
      `INSERT INTO vault_credentials (service_id, owner_user_id, encrypted_username,
        encrypted_password, iv, auth_tag) VALUES ($1, $2, $3, $4, $5, $6)`,
      [individualId, userId, Buffer.alloc(1), Buffer.alloc(1), Buffer.alloc(12), Buffer.alloc(16)],
    );
    const attendantList = await server.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { cookie: attendantCookie },
    });
    const adminList = await server.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { cookie: adminCookie },
    });
    assert.equal(
      attendantList.json().services.find((service: { id: string }) => service.id === individualId)
        .hasCredential,
      true,
    );
    assert.equal(
      adminList.json().services.find((service: { id: string }) => service.id === individualId)
        .hasCredential,
      false,
    );
  } finally {
    for (const id of ids) await pool.query('DELETE FROM services WHERE id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
});

test('catalog rejects invalid URLs, category combinations and logos', async () => {
  const cookie = await adminLogin();
  const base = { name: 'Synthetic service', category: 'sva', credentialType: 'shared' };
  for (const payload of [
    { ...base, name: 'x' },
    { ...base, category: 'sheet' },
    { ...base, targetUrl: 'http://example.test/' },
    { ...base, targetUrl: 'https://name:secret@example.test/' },
    { ...base, logoDataUrl: 'data:image/svg+xml;base64,AAAA' },
    { ...base, logoDataUrl: `data:image/png;base64,${'AAAA'.repeat(166_667)}` },
    { ...base, username: 'only-one-field' },
  ]) {
    const result = await server.inject({
      method: 'POST',
      url: '/api/catalog/services',
      headers: { cookie },
      payload,
    });
    assert.equal(result.statusCode, 400);
  }
});

test('catalog atomically creates shared service with encrypted vault credentials and audit', async () => {
  const adminCookie = await adminLogin();
  const syntheticPass = `test-shared-${randomBytes(8).toString('hex')}`;
  const payload = {
    name: 'Atomic Shared Service',
    description: 'Service with immediate shared vault credential',
    category: 'sva',
    credentialType: 'shared',
    targetUrl: 'https://example.test/sva',
    username: 'synthetic_operator',
    password: syntheticPass,
  };
  const response = await server.inject({
    method: 'POST',
    url: '/api/catalog/services',
    headers: { cookie: adminCookie },
    payload,
  });
  assert.equal(response.statusCode, 201);
  const item = response.json().service;
  assert.equal(item.name, 'Atomic Shared Service');
  assert.equal(item.hasCredential, true);
  try {
    const credRow = await pool.query<{
      owner_user_id: string | null;
      iv: Buffer;
      auth_tag: Buffer;
      key_version: number;
    }>(
      'SELECT owner_user_id, iv, auth_tag, key_version FROM vault_credentials WHERE service_id = $1',
      [item.id],
    );
    assert.equal(credRow.rowCount, 1);
    assert.equal(credRow.rows[0]?.owner_user_id, null);
    assert.equal(credRow.rows[0]?.iv.length, 12);
    assert.equal(credRow.rows[0]?.auth_tag.length, 16);

    const auditRows = await pool.query<{ action: string; details: string | null }>(
      'SELECT action, details FROM audit_logs WHERE service_id = $1 ORDER BY created_at ASC',
      [item.id],
    );
    assert.ok(auditRows.rows.some((r) => r.action === 'service_created'));
    assert.ok(auditRows.rows.some((r) => r.action === 'credential_saved'));
    for (const row of auditRows.rows) {
      if (row.details) assert.equal(JSON.stringify(row.details).includes(syntheticPass), false);
    }

    const reveal = await server.inject({
      method: 'POST',
      url: `/api/vault/credentials/${item.id}/reveal`,
      headers: { cookie: adminCookie },
      payload: { ownerUserId: null },
    });
    assert.equal(reveal.statusCode, 200);
    assert.deepEqual(reveal.json(), { username: 'synthetic_operator', password: syntheticPass });
  } finally {
    await pool.query('DELETE FROM services WHERE id = $1', [item.id]);
  }
});

test('security headers apply to success, authorization errors, not-found and preflight', async () => {
  const expected = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  };
  for (const response of await Promise.all([
    server.inject('/health'),
    server.inject('/api/auth/me'),
    server.inject('/missing'),
    server.inject({
      method: 'OPTIONS',
      url: '/api/vault/exchange',
      headers: { origin: extensionOrigin },
    }),
    server.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    }),
  ])) {
    for (const [header, value] of Object.entries(expected))
      assert.equal(response.headers[header], value);
  }
});

test('login limiter rejects excess attempts, isolates IPs and server instances, and expires its window', async () => {
  const limited = createServer(path, createPool(), { loginRateLimit: { max: 2, windowMs: 200 } });
  const independent = createServer(path, createPool(), { loginRateLimit: { max: 2 } });
  try {
    await Promise.all([limited.ready(), independent.ready()]);
    const attempt = (remoteAddress = '127.0.0.10') =>
      limited.inject({ method: 'POST', url: '/api/auth/login', remoteAddress, payload: {} });
    assert.equal((await attempt()).statusCode, 401);
    assert.equal((await attempt()).statusCode, 401);
    const blocked = await attempt();
    assert.equal(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers['retry-after']) >= 1);
    assert.equal(blocked.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(blocked.json(), {
      error: 'Muitas tentativas. Aguarde antes de tentar novamente.',
    });
    assert.equal((await attempt('127.0.0.11')).statusCode, 401);
    assert.equal(
      (
        await independent.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: '127.0.0.10',
          payload: {},
        })
      ).statusCode,
      401,
    );
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal((await attempt()).statusCode, 401);
  } finally {
    await Promise.all([limited.close(), independent.close()]);
  }
});

test('ticket limiter stops issuance after the configured budget without leaking or creating another ticket', async () => {
  const limited = createServer(path, createPool(), { ticketRateLimit: { max: 2 } });
  let id: string | undefined;
  try {
    const login = await limited.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
        password: process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456',
      },
    });
    assert.equal(login.statusCode, 200);
    const cookie = sessionCookie(login);
    const created = await limited.inject({
      method: 'POST',
      url: '/api/catalog/services',
      headers: { cookie },
      payload: {
        name: 'Synthetic rate limit service',
        category: 'sva',
        credentialType: 'shared',
        targetUrl: 'https://example.test/login',
        username: 'synthetic-user',
        password: 'synthetic-password',
      },
    });
    assert.equal(created.statusCode, 201);
    id = created.json().service.id;
    const attempt = () =>
      limited.inject({
        method: 'POST',
        url: '/api/vault/tickets',
        headers: { cookie },
        payload: { serviceId: id },
      });
    assert.equal((await attempt()).statusCode, 200);
    assert.equal((await attempt()).statusCode, 200);
    const blocked = await attempt();
    assert.equal(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers['retry-after']) >= 1);
    assert.equal(blocked.headers['cache-control'], 'no-store');
    assert.equal(blocked.json().ticket, undefined);
    const count = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM opening_tickets WHERE service_id = $1',
      [id],
    );
    assert.equal(count.rows[0]?.count, '2');
  } finally {
    if (id) await pool.query('DELETE FROM services WHERE id = $1', [id]);
    await limited.close();
  }
});

test('admin updates user role, deactivates user and revokes sessions, and blocks self-demotion', async () => {
  const adminLoginRes = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress: '10.99.0.1',
    payload: {
      email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
      password: process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456',
    },
  });
  assert.equal(adminLoginRes.statusCode, 200);
  const adminCookie = sessionCookie(adminLoginRes);
  const me = await server.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie: adminCookie },
  });
  const adminId: string = me.json().user.id;
  const email = `managed-${randomBytes(6).toString('hex')}@example.test`;
  let userId: string | undefined;
  try {
    const created = await server.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: {
        displayName: 'Managed Member',
        email,
        password: 'password-123456',
        role: 'user',
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.role, 'attendant');
    assert.equal(created.json().user.active, true);
    userId = created.json().user.id;

    // Self-demotion or self-deactivation is blocked
    const selfDeactivate = await server.inject({
      method: 'PUT',
      url: `/api/admin/users/${adminId}`,
      headers: { cookie: adminCookie },
      payload: {
        displayName: 'Admin',
        email: me.json().user.email,
        role: 'admin',
        active: false,
      },
    });
    assert.equal(selfDeactivate.statusCode, 400);

    // User logs in
    const userLogin = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.99.0.2',
      payload: { email, password: 'password-123456' },
    });
    assert.equal(userLogin.statusCode, 200);
    const userCookie = sessionCookie(userLogin);

    // Promote user to admin and update displayName
    const promoted = await server.inject({
      method: 'PUT',
      url: `/api/admin/users/${userId}`,
      headers: { cookie: adminCookie },
      payload: {
        displayName: 'Promoted Admin',
        email,
        role: 'admin',
        active: true,
      },
    });
    assert.equal(promoted.statusCode, 200);
    assert.equal(promoted.json().user.role, 'admin');
    assert.equal(promoted.json().user.displayName, 'Promoted Admin');

    // Deactivate user -> revokes active session and blocks new login
    const deactivated = await server.inject({
      method: 'PUT',
      url: `/api/admin/users/${userId}`,
      headers: { cookie: adminCookie },
      payload: {
        displayName: 'Promoted Admin',
        email,
        role: 'attendant',
        active: false,
      },
    });
    assert.equal(deactivated.statusCode, 200);
    assert.equal(deactivated.json().user.active, false);

    const meAfterDeactivate = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: userCookie },
    });
    assert.equal(meAfterDeactivate.statusCode, 401);

    const loginAfterDeactivate = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.99.0.2',
      payload: { email, password: 'password-123456' },
    });
    assert.equal(loginAfterDeactivate.statusCode, 401);
  } finally {
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
});

test('catalog favicon endpoint enforces admin auth and blocks non-HTTPS or private hosts (SSRF)', async () => {
  const adminLoginRes = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress: '10.99.0.3',
    payload: {
      email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local',
      password: process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456',
    },
  });
  assert.equal(adminLoginRes.statusCode, 200);
  const adminCookie = sessionCookie(adminLoginRes);
  assert.equal(
    (await server.inject('/api/catalog/favicon?url=https://example.com')).statusCode,
    401,
  );
  for (const unsafeUrl of [
    'http://example.com',
    'https://localhost/admin',
    'https://127.0.0.1/secret',
    'https://10.0.0.1/internal',
    'https://192.168.1.1/router',
    'https://169.254.169.254/latest/meta-data/',
  ]) {
    const res = await server.inject({
      method: 'GET',
      url: `/api/catalog/favicon?url=${encodeURIComponent(unsafeUrl)}`,
      headers: { cookie: adminCookie },
    });
    assert.equal(res.statusCode, 400);
  }
});
