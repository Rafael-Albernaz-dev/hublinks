import Fastify from 'fastify';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createHash, randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { hashPassword, verifyPassword } from './auth.js';
import { createPool, initializeDatabase } from './db.js';
import { decryptCredential, encryptCredential } from './vault.js';

type User = { id: string; displayName: string; email: string; role: 'admin' | 'attendant' };
type UserRow = {
  id: string;
  display_name: string;
  email: string;
  role: 'admin' | 'attendant';
};
type CredentialUserRow = UserRow & { password_hash: string };
type SessionRow = UserRow & { session_id: string };
const SESSION_COOKIE = 'hublink_session';
const SESSION_SECONDS = 365 * 24 * 60 * 60;
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_SECONDS,
} as const;

function publicUser(row: UserRow): User {
  return { id: row.id, displayName: row.display_name, email: row.email, role: row.role };
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ticketInput(
  body: unknown,
  exchange = false,
): { serviceId: string; ticket?: string } | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.serviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(input.serviceId))
    return null;
  if (!exchange) return Object.keys(input).length === 1 ? { serviceId: input.serviceId } : null;
  if (Object.keys(input).length !== 2 || typeof input.ticket !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.ticket)) return null;
  return { serviceId: input.serviceId, ticket: input.ticket };
}

function validTarget(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function credentials(body: unknown): { email: string; password: string } | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  if (!('email' in body) || !('password' in body)) return null;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;
  const email = body.email.trim().toLowerCase();
  if (email.length < 3 || email.length > 255 || !/^\S+@\S+\.\S+$/.test(email)) return null;
  return { email, password: body.password };
}

function attendantInput(
  body: unknown,
): { displayName: string; email: string; password: string } | null {
  const account = credentials(body);
  if (!account || typeof body !== 'object' || body === null || !('displayName' in body))
    return null;
  if (typeof body.displayName !== 'string') return null;
  const displayName = body.displayName.trim();
  if (!displayName || displayName.length > 80 || account.password.length < 8) return null;
  return { displayName, ...account };
}

function serviceInput(body: unknown): {
  name: string;
  credentialType: 'shared' | 'individual';
  category: 'sva' | 'crm' | 'sistemas' | 'outros';
  targetUrl: string | null;
} | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['name', 'credentialType', 'category', 'targetUrl'].includes(key),
    ) ||
    typeof input.name !== 'string' ||
    (input.credentialType !== 'shared' && input.credentialType !== 'individual')
  )
    return null;
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return null;
  // Sheet links have no vault credential; these categories support credential-bearing services.
  const category = input.category === undefined ? 'sva' : input.category;
  if (category !== 'sva' && category !== 'crm' && category !== 'sistemas' && category !== 'outros')
    return null;
  let targetUrl: string | null = null;
  if (input.targetUrl !== undefined && input.targetUrl !== null) {
    if (typeof input.targetUrl !== 'string' || input.targetUrl.length > 2048) return null;
    try {
      const url = new URL(input.targetUrl);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
      targetUrl = url.href;
    } catch {
      return null;
    }
  }
  return {
    name,
    credentialType: input.credentialType,
    category,
    targetUrl,
  };
}

type CatalogCategory = 'sva' | 'crm' | 'sheet' | 'sistemas' | 'outros';
type CatalogCredentialType = 'shared' | 'individual' | 'none';
type CatalogRow = {
  id: string;
  name: string;
  description: string | null;
  category: CatalogCategory;
  credential_type: CatalogCredentialType;
  target_url: string | null;
  has_action: boolean;
  logo_data_url: string | null;
  has_credential: boolean;
};

function catalogItem(row: CatalogRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    credentialType: row.credential_type,
    targetUrl: row.target_url,
    hasAction: row.has_action,
    logoDataUrl: row.logo_data_url,
    hasCredential: row.has_credential,
  };
}

function catalogInput(body: unknown) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) =>
        ![
          'name',
          'description',
          'category',
          'credentialType',
          'targetUrl',
          'logoDataUrl',
          'username',
          'password',
        ].includes(key),
    )
  )
    return null;
  if (typeof input.name !== 'string') return null;
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return null;
  if (
    typeof input.category !== 'string' ||
    !['sva', 'crm', 'sheet', 'sistemas', 'outros'].includes(input.category)
  )
    return null;
  if (
    typeof input.credentialType !== 'string' ||
    !['shared', 'individual', 'none'].includes(input.credentialType)
  )
    return null;
  const category = input.category as CatalogCategory;
  const credentialType = input.credentialType as CatalogCredentialType;
  if (category === 'sheet' && credentialType !== 'none') return null;
  if (
    input.description !== undefined &&
    input.description !== null &&
    typeof input.description !== 'string'
  )
    return null;
  const description =
    typeof input.description === 'string' ? input.description.trim() || null : null;
  if (description && description.length > 255) return null;
  let targetUrl: string | null = null;
  if (input.targetUrl !== undefined && input.targetUrl !== null && input.targetUrl !== '') {
    if (typeof input.targetUrl !== 'string' || input.targetUrl.length > 2048) return null;
    try {
      const url = new URL(input.targetUrl);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
      targetUrl = url.href;
    } catch {
      return null;
    }
  }
  let logoDataUrl: string | null;
  try {
    logoDataUrl = image(input.logoDataUrl ?? null, 500_000, 'Card logo');
  } catch {
    return null;
  }
  const hasUsername = input.username !== undefined && input.username !== '';
  const hasPassword = input.password !== undefined && input.password !== '';
  if (credentialType !== 'shared' && (hasUsername || hasPassword)) return null;
  if (hasUsername !== hasPassword) return null;
  const credential = hasUsername
    ? vaultInput({ username: input.username, password: input.password })
    : null;
  if (hasUsername && !credential) return null;
  return { name, description, category, credentialType, targetUrl, logoDataUrl, credential };
}

function vaultInput(
  body: unknown,
): { username: string; password: string; ownerUserId?: string | null } | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.username !== 'string' || typeof b.password !== 'string') return null;
  const username = b.username.trim();
  const password = b.password;
  if (!username || username.length > 255 || !password || password.length > 2048) return null;
  let ownerUserId: string | null = null;
  if ('ownerUserId' in b && b.ownerUserId !== undefined && b.ownerUserId !== null) {
    if (
      typeof b.ownerUserId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.ownerUserId)
    ) {
      return null;
    }
    ownerUserId = b.ownerUserId;
  }
  return { username, password, ownerUserId };
}

function revealInput(body: unknown): { ownerUserId?: string | null } | null {
  if (!body) return { ownerUserId: null };
  if (typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  let ownerUserId: string | null = null;
  if ('ownerUserId' in b && b.ownerUserId !== undefined && b.ownerUserId !== null) {
    if (
      typeof b.ownerUserId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.ownerUserId)
    ) {
      return null;
    }
    ownerUserId = b.ownerUserId;
  }
  return { ownerUserId };
}

async function audit(
  pool: Pool,
  userId: string | null,
  action: string,
  ip: string,
  serviceId: string | null = null,
  details: Record<string, unknown> | null = null,
) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, service_id, ip_address, details) VALUES ($1, $2, $3, $4, $5)',
    [userId, action, serviceId, ip, details ? JSON.stringify(details) : null],
  );
}

const DEFAULT_CONFIG = {
  version: 1,
  companyName: 'Sua empresa',
  subtitle: 'Seus acessos organizados em um só lugar.',
  color: { r: 31, g: 86, b: 139 },
  logoDataUrl: null,
  links: [],
};

const defaultPath =
  process.env.HUB_CONFIG_PATH ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/config.json');

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Configuration must be an object.');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`${name} is invalid.`);
  }
  return value.trim();
}

function image(value: unknown, max: number, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${name} is invalid.`);
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) throw new Error(`${name} is invalid.`);
  const base64 = match[2];
  const bytes =
    (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > max) throw new Error(`${name} exceeds its size limit.`);
  return value;
}

function parseConfig(input: unknown) {
  const config = object(input);
  if (config.version !== 1) throw new Error('Unsupported configuration version.');
  const color = object(config.color);
  for (const key of ['r', 'g', 'b']) {
    if (
      !Number.isInteger(color[key]) ||
      (color[key] as number) < 0 ||
      (color[key] as number) > 255
    ) {
      throw new Error(`Color ${key} must be an integer from 0 to 255.`);
    }
  }
  if (!Array.isArray(config.links) || config.links.length > 30)
    throw new Error('Links are invalid.');
  const ids = new Set<string>();
  const links = config.links.map((entry: unknown) => {
    const link = object(entry);
    const id = string(link.id, 'Link ID', 80);
    if (ids.has(id)) throw new Error('Link IDs must be unique.');
    ids.add(id);
    const url = string(link.url, 'Link URL', 2048);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Link URL must be valid HTTPS.');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Link URL must be public HTTPS without credentials.');
    }
    return {
      id,
      title: string(link.title, 'Link title', 70),
      description: string(link.description, 'Link description', 140, false),
      url: parsed.href,
      ...(link.logoDataUrl === undefined
        ? {}
        : { logoDataUrl: image(link.logoDataUrl, 500_000, 'Card logo') }),
    };
  });
  return {
    version: 1 as const,
    companyName: string(config.companyName, 'Company name', 60),
    subtitle: string(config.subtitle, 'Subtitle', 160, false),
    color: { r: color.r as number, g: color.g as number, b: color.b as number },
    logoDataUrl: image(config.logoDataUrl, 1_000_000, 'Company logo'),
    links,
  };
}

export function createServer(configPath = defaultPath, pool = createPool()) {
  const server = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
  void server.register(cookie);
  server.addHook('onReady', async () => initializeDatabase(pool));
  const DEFAULT_EXTENSION_ID = 'nhodfnpljikjfeoihaimabljdenmfbio';
  const configuredExtensionId = process.env.HUB_EXTENSION_ID || DEFAULT_EXTENSION_ID;
  if (configuredExtensionId && !/^[a-p]{32}$/.test(configuredExtensionId))
    throw new Error('HUB_EXTENSION_ID must be a Chrome extension ID');
  const extensionOrigin = configuredExtensionId
    ? `chrome-extension://${configuredExtensionId}`
    : null;
  server.addHook('onRequest', async (request, reply) => {
    if (request.url !== '/api/vault/exchange') return;
    reply.header('Cache-Control', 'no-store');
    if (extensionOrigin && request.headers.origin === extensionOrigin) {
      reply.header('Access-Control-Allow-Origin', extensionOrigin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }
  });
  server.options('/api/vault/exchange', async (request, reply) => {
    if (!extensionOrigin || request.headers.origin !== extensionOrigin)
      return reply.code(403).send({ error: 'Origem da extensão não autorizada.' });
    return reply.code(204).send();
  });
  server.addHook('onClose', async () => {
    await pool.end();
  });

  function setSessionCookie(reply: FastifyReply, token: string) {
    reply.setCookie(SESSION_COOKIE, token, {
      ...COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === 'production',
    });
  }

  async function activeSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SessionRow | null> {
    const token = request.cookies[SESSION_COOKIE];
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      reply.code(401).send({ error: 'Não autenticado.' });
      return null;
    }
    const result = await pool.query<SessionRow>(
      `UPDATE sessions AS s SET last_seen_at = NOW()
       FROM users AS u
       WHERE s.user_id = u.id AND s.token_hash = $1 AND s.revoked_at IS NULL
         AND s.last_seen_at > NOW() - INTERVAL '365 days'
       RETURNING s.id AS session_id, u.id, u.display_name, u.email, u.role`,
      [tokenHash(token)],
    );
    const session = result.rows[0];
    if (!session) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      reply.code(401).send({ error: 'Não autenticado.' });
      return null;
    }
    setSessionCookie(reply, token);
    return session;
  }

  async function adminSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SessionRow | null> {
    const session = await activeSession(request, reply);
    if (!session) return null;
    if (session.role !== 'admin') {
      reply.code(403).send({ error: 'Acesso negado.' });
      return null;
    }
    return session;
  }

  server.get('/health', async () => ({ status: 'ok' }));

  server.post('/api/auth/login', async (request, reply) => {
    const input = credentials(request.body);
    const found = input
      ? await pool.query<CredentialUserRow>('SELECT * FROM users WHERE email = $1', [input.email])
      : null;
    const user = found?.rows[0];
    if (!input || !user || !(await verifyPassword(input.password, user.password_hash))) {
      await audit(pool, user?.id ?? null, 'login_failed', request.ip);
      return reply.code(401).send({ error: 'Credenciais inválidas.' });
    }
    const token = randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO sessions (user_id, token_hash, last_seen_at) VALUES ($1, $2, NOW())',
      [user.id, tokenHash(token)],
    );
    await audit(pool, user.id, 'login', request.ip);
    setSessionCookie(reply, token);
    return { status: 'ok', user: publicUser(user) };
  });

  server.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token && /^[0-9a-f]{64}$/.test(token)) {
      const result = await pool.query<{ user_id: string }>(
        'UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING user_id',
        [tokenHash(token)],
      );
      if (result.rows[0]) await audit(pool, result.rows[0].user_id, 'logout', request.ip);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { status: 'ok' };
  });

  server.get('/api/auth/me', async (request, reply) => {
    const session = await activeSession(request, reply);
    if (session) return { user: publicUser(session) };
  });

  server.get('/api/admin/users', async (request, reply) => {
    if (!(await adminSession(request, reply))) return;
    const result = await pool.query<UserRow & { created_at: Date }>(
      'SELECT id, display_name, email, role, created_at FROM users ORDER BY created_at, id',
    );
    return {
      users: result.rows.map((row) => ({ ...publicUser(row), createdAt: row.created_at })),
    };
  });

  server.post('/api/admin/users', async (request, reply) => {
    const admin = await adminSession(request, reply);
    if (!admin) return;
    const input = attendantInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do atendente inválidos.' });
    try {
      const result = await pool.query<UserRow & { created_at: Date }>(
        `INSERT INTO users (display_name, email, password_hash, role)
         VALUES ($1, $2, $3, 'attendant')
         RETURNING id, display_name, email, role, created_at`,
        [input.displayName, input.email, await hashPassword(input.password)],
      );
      await audit(pool, admin.id, 'user_created', request.ip);
      const row = result.rows[0];
      if (!row) throw new Error('User creation returned no row');
      return reply.code(201).send({ user: { ...publicUser(row), createdAt: row.created_at } });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        return reply.code(409).send({ error: 'E-mail já cadastrado.' });
      }
      throw error;
    }
  });

  server.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/reset-password',
    async (request, reply) => {
      const admin = await adminSession(request, reply);
      if (!admin) return;
      const body = request.body;
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          request.params.id,
        ) ||
        typeof body !== 'object' ||
        body === null ||
        !('password' in body) ||
        typeof body.password !== 'string' ||
        body.password.length < 8
      )
        return reply.code(400).send({ error: 'Dados inválidos.' });
      const passwordHash = await hashPassword(body.password);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const changed = await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW()
         WHERE id = $2 AND role = 'attendant' RETURNING id`,
          [passwordHash, request.params.id],
        );
        if (changed.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Atendente não encontrado.' });
        }
        await client.query(
          'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [request.params.id],
        );
        await client.query(
          'INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
          [admin.id, 'password_reset', request.ip],
        );
        await client.query('COMMIT');
        return { status: 'ok' };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  async function readCatalogItem(serviceId: string, userId: string) {
    const result = await pool.query<CatalogRow>(
      `SELECT s.id, s.name, s.description, s.category, s.credential_type, s.target_url,
              s.has_action, s.logo_data_url,
              EXISTS (SELECT 1 FROM vault_credentials vc WHERE vc.service_id = s.id
                AND ((s.credential_type = 'shared' AND vc.owner_user_id IS NULL)
                  OR (s.credential_type = 'individual' AND vc.owner_user_id = $2))) AS has_credential
       FROM services s WHERE s.id = $1`,
      [serviceId, userId],
    );
    return result.rows[0] ? catalogItem(result.rows[0]) : null;
  }

  server.get('/api/catalog', async (request, reply) => {
    const session = await activeSession(request, reply);
    if (!session) return;
    const result = await pool.query<CatalogRow>(
      `SELECT s.id, s.name, s.description, s.category, s.credential_type, s.target_url,
              s.has_action, s.logo_data_url,
              EXISTS (SELECT 1 FROM vault_credentials vc WHERE vc.service_id = s.id
                AND ((s.credential_type = 'shared' AND vc.owner_user_id IS NULL)
                  OR (s.credential_type = 'individual' AND vc.owner_user_id = $1))) AS has_credential
       FROM services s ORDER BY s.created_at ASC, s.id ASC`,
      [session.id],
    );
    return { services: result.rows.map(catalogItem) };
  });

  server.post('/api/catalog/services', async (request, reply) => {
    const session = await adminSession(request, reply);
    if (!session) return;
    const input = catalogInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do card inválidos.' });
    const id = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO services (id, name, description, category, credential_type, target_url, has_action, logo_data_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          input.name,
          input.description,
          input.category,
          input.credentialType,
          input.targetUrl,
          input.targetUrl !== null,
          input.logoDataUrl,
        ],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
         VALUES ($1, 'service_created', $2, $3, $4)`,
        [
          session.id,
          id,
          request.ip,
          JSON.stringify({ category: input.category, credentialType: input.credentialType }),
        ],
      );
      if (input.credential) {
        const enc = encryptCredential(
          input.credential.username,
          input.credential.password,
          id,
          null,
          1,
        );
        await client.query(
          `INSERT INTO vault_credentials (service_id, owner_user_id, encrypted_username,
            encrypted_password, iv, auth_tag, key_version) VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
          [id, enc.encryptedUsername, enc.encryptedPassword, enc.iv, enc.authTag, enc.keyVersion],
        );
        await client.query(
          `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
           VALUES ($1, 'credential_saved', $2, $3, $4)`,
          [session.id, id, request.ip, JSON.stringify({ credentialType: 'shared' })],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return reply.code(201).send({ service: await readCatalogItem(id, session.id) });
  });

  server.put<{ Params: { id: string } }>('/api/catalog/services/:id', async (request, reply) => {
    const session = await adminSession(request, reply);
    if (!session) return;
    const input = catalogInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do card inválidos.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ credential_type: CatalogCredentialType }>(
        'SELECT credential_type FROM services WHERE id = $1 FOR UPDATE',
        [request.params.id],
      );
      if (!existing.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Serviço não encontrado.' });
      }
      await client.query(
        `UPDATE services SET name = $2, description = $3, category = $4, credential_type = $5,
          target_url = $6, has_action = $7, logo_data_url = $8 WHERE id = $1`,
        [
          request.params.id,
          input.name,
          input.description,
          input.category,
          input.credentialType,
          input.targetUrl,
          input.targetUrl !== null,
          input.logoDataUrl,
        ],
      );
      if (existing.rows[0].credential_type !== input.credentialType) {
        await client.query('DELETE FROM vault_credentials WHERE service_id = $1', [
          request.params.id,
        ]);
      }
      if (input.credential) {
        const enc = encryptCredential(
          input.credential.username,
          input.credential.password,
          request.params.id,
          null,
          1,
        );
        await client.query(
          `INSERT INTO vault_credentials (service_id, owner_user_id, encrypted_username,
            encrypted_password, iv, auth_tag, key_version, updated_at)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (service_id) WHERE owner_user_id IS NULL DO UPDATE SET
            encrypted_username = EXCLUDED.encrypted_username,
            encrypted_password = EXCLUDED.encrypted_password, iv = EXCLUDED.iv,
            auth_tag = EXCLUDED.auth_tag, key_version = EXCLUDED.key_version, updated_at = NOW()`,
          [
            request.params.id,
            enc.encryptedUsername,
            enc.encryptedPassword,
            enc.iv,
            enc.authTag,
            enc.keyVersion,
          ],
        );
        await client.query(
          `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
           VALUES ($1, 'credential_saved', $2, $3, $4)`,
          [session.id, request.params.id, request.ip, JSON.stringify({ credentialType: 'shared' })],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
         VALUES ($1, 'service_updated', $2, $3, $4)`,
        [
          session.id,
          request.params.id,
          request.ip,
          JSON.stringify({ category: input.category, credentialType: input.credentialType }),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { service: await readCatalogItem(request.params.id, session.id) };
  });

  server.delete<{ Params: { id: string } }>('/api/catalog/services/:id', async (request, reply) => {
    const session = await adminSession(request, reply);
    if (!session) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const deleted = await client.query('DELETE FROM services WHERE id = $1 RETURNING id', [
        request.params.id,
      ]);
      if (!deleted.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Serviço não encontrado.' });
      }
      await client.query(
        `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
         VALUES ($1, 'service_deleted', NULL, $2, $3)`,
        [session.id, request.ip, JSON.stringify({ serviceId: request.params.id })],
      );
      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  server.post('/api/vault/services', async (request, reply) => {
    const session = await adminSession(request, reply);
    if (!session) return;
    const input = serviceInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do serviço inválidos.' });

    // UUIDs fit the existing VARCHAR(50) primary key and remain unique across workers.
    const id = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string;
        name: string;
        category: string;
        credential_type: 'shared' | 'individual';
        target_url: string | null;
      }>(
        `INSERT INTO services (id, name, category, credential_type, target_url, has_action)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING id, name, category, credential_type, target_url`,
        [id, input.name, input.category, input.credentialType, input.targetUrl],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
         VALUES ($1, 'service_created', $2, $3, $4)`,
        [
          session.id,
          id,
          request.ip,
          JSON.stringify({
            name: input.name,
            credentialType: input.credentialType,
            category: input.category,
          }),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Service creation returned no row');
      await client.query('COMMIT');
      return reply.code(201).send({
        service: {
          id: row.id,
          name: row.name,
          category: row.category,
          credentialType: row.credential_type,
          targetUrl: row.target_url,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  server.get('/api/vault/credentials', async (request, reply) => {
    const session = await activeSession(request, reply);
    if (!session) return;

    if (session.role === 'admin') {
      const result = await pool.query<{
        service_id: string;
        service_name: string;
        category: string;
        credential_type: string;
        credential_id: string | null;
        owner_user_id: string | null;
        owner_name: string | null;
        key_version: number | null;
        updated_at: Date | null;
      }>(
        `SELECT
          s.id AS service_id,
          s.name AS service_name,
          s.category,
          s.credential_type,
          vc.id AS credential_id,
          vc.owner_user_id,
          u.display_name AS owner_name,
          vc.key_version,
          vc.updated_at
        FROM services s
        LEFT JOIN vault_credentials vc ON s.id = vc.service_id
        LEFT JOIN users u ON vc.owner_user_id = u.id
        WHERE s.credential_type IN ('shared', 'individual')
        ORDER BY s.id, u.display_name NULLS FIRST`,
      );
      return {
        credentials: result.rows.map((r) => ({
          serviceId: r.service_id,
          serviceName: r.service_name,
          category: r.category,
          credentialType: r.credential_type,
          credentialId: r.credential_id,
          ownerUserId: r.owner_user_id,
          ownerName: r.owner_name,
          keyVersion: r.key_version,
          updatedAt: r.updated_at,
        })),
      };
    } else {
      const result = await pool.query<{
        service_id: string;
        service_name: string;
        category: string;
        credential_type: string;
        credential_id: string | null;
        owner_user_id: string | null;
        owner_name: string | null;
        key_version: number | null;
        updated_at: Date | null;
      }>(
        `SELECT
          s.id AS service_id,
          s.name AS service_name,
          s.category,
          s.credential_type,
          vc.id AS credential_id,
          vc.owner_user_id,
          u.display_name AS owner_name,
          vc.key_version,
          vc.updated_at
        FROM services s
        LEFT JOIN vault_credentials vc ON s.id = vc.service_id AND (vc.owner_user_id IS NULL OR vc.owner_user_id = $1)
        LEFT JOIN users u ON vc.owner_user_id = u.id
        WHERE s.credential_type IN ('shared', 'individual')
        ORDER BY s.id`,
        [session.id],
      );
      return {
        credentials: result.rows.map((r) => ({
          serviceId: r.service_id,
          serviceName: r.service_name,
          category: r.category,
          credentialType: r.credential_type,
          credentialId: r.credential_id,
          ownerUserId: r.owner_user_id,
          ownerName: r.owner_name,
          keyVersion: r.key_version,
          updatedAt: r.updated_at,
        })),
      };
    }
  });

  server.put<{ Params: { serviceId: string } }>(
    '/api/vault/credentials/:serviceId',
    async (request, reply) => {
      const session = await activeSession(request, reply);
      if (!session) return;

      const input = vaultInput(request.body);
      if (!input) {
        return reply.code(400).send({ error: 'Dados de credencial inválidos.' });
      }

      const serviceRes = await pool.query<{
        id: string;
        name: string;
        credential_type: string;
      }>('SELECT id, name, credential_type FROM services WHERE id = $1', [
        request.params.serviceId,
      ]);
      const service = serviceRes.rows[0];
      if (!service) {
        return reply.code(404).send({ error: 'Serviço não encontrado.' });
      }
      if (service.credential_type === 'none') {
        return reply.code(400).send({ error: 'Este serviço não utiliza credenciais no cofre.' });
      }

      let targetOwnerUserId: string | null = null;
      if (service.credential_type === 'shared') {
        if (session.role !== 'admin') {
          return reply
            .code(403)
            .send({ error: 'Apenas administradores podem gerenciar credenciais compartilhadas.' });
        }
      } else if (service.credential_type === 'individual') {
        if (session.role === 'attendant') {
          targetOwnerUserId = session.id;
        } else {
          targetOwnerUserId = input.ownerUserId || session.id;
          const userRes = await pool.query('SELECT 1 FROM users WHERE id = $1', [
            targetOwnerUserId,
          ]);
          if (userRes.rowCount === 0) {
            return reply.code(404).send({ error: 'Usuário não encontrado.' });
          }
        }
      }

      const enc = encryptCredential(
        input.username,
        input.password,
        service.id,
        targetOwnerUserId,
        1,
      );

      let result;
      if (targetOwnerUserId === null) {
        result = await pool.query<{ id: string; updated_at: Date }>(
          `INSERT INTO vault_credentials (
            service_id, owner_user_id, encrypted_username, encrypted_password, iv, auth_tag, key_version, updated_at
          ) VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (service_id) WHERE owner_user_id IS NULL DO UPDATE SET
            encrypted_username = EXCLUDED.encrypted_username,
            encrypted_password = EXCLUDED.encrypted_password,
            iv = EXCLUDED.iv,
            auth_tag = EXCLUDED.auth_tag,
            key_version = EXCLUDED.key_version,
            updated_at = NOW()
          RETURNING id, updated_at`,
          [
            service.id,
            enc.encryptedUsername,
            enc.encryptedPassword,
            enc.iv,
            enc.authTag,
            enc.keyVersion,
          ],
        );
      } else {
        result = await pool.query<{ id: string; updated_at: Date }>(
          `INSERT INTO vault_credentials (
            service_id, owner_user_id, encrypted_username, encrypted_password, iv, auth_tag, key_version, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (service_id, owner_user_id) DO UPDATE SET
            encrypted_username = EXCLUDED.encrypted_username,
            encrypted_password = EXCLUDED.encrypted_password,
            iv = EXCLUDED.iv,
            auth_tag = EXCLUDED.auth_tag,
            key_version = EXCLUDED.key_version,
            updated_at = NOW()
          RETURNING id, updated_at`,
          [
            service.id,
            targetOwnerUserId,
            enc.encryptedUsername,
            enc.encryptedPassword,
            enc.iv,
            enc.authTag,
            enc.keyVersion,
          ],
        );
      }

      await audit(pool, session.id, 'credential_saved', request.ip, service.id, {
        credentialType: service.credential_type,
        isShared: targetOwnerUserId === null,
        ownerUserId: targetOwnerUserId,
      });

      const savedRow = result.rows[0];
      return { status: 'ok', id: savedRow?.id, updatedAt: savedRow?.updated_at };
    },
  );

  server.post<{ Params: { serviceId: string } }>(
    '/api/vault/credentials/:serviceId/reveal',
    async (request, reply) => {
      const session = await activeSession(request, reply);
      if (!session) return;

      const input = revealInput(request.body);
      if (!input) return reply.code(400).send({ error: 'Parâmetros inválidos.' });

      const serviceRes = await pool.query<{
        id: string;
        name: string;
        credential_type: string;
      }>('SELECT id, name, credential_type FROM services WHERE id = $1', [
        request.params.serviceId,
      ]);
      const service = serviceRes.rows[0];
      if (!service) {
        return reply.code(404).send({ error: 'Serviço não encontrado.' });
      }

      let targetOwnerUserId: string | null = null;
      if (service.credential_type === 'shared') {
        if (session.role !== 'admin') {
          return reply.code(403).send({
            error: 'Atendentes não têm permissão para revelar credenciais compartilhadas no Hub.',
          });
        }
      } else if (service.credential_type === 'individual') {
        if (session.role === 'attendant') {
          targetOwnerUserId = session.id;
        } else {
          targetOwnerUserId = input.ownerUserId || session.id;
        }
      } else {
        return reply.code(400).send({ error: 'Este serviço não possui credenciais.' });
      }

      let credRes;
      if (targetOwnerUserId === null) {
        credRes = await pool.query<{
          encrypted_username: Buffer;
          encrypted_password: Buffer;
          iv: Buffer;
          auth_tag: Buffer;
          key_version: number;
        }>(
          'SELECT encrypted_username, encrypted_password, iv, auth_tag, key_version FROM vault_credentials WHERE service_id = $1 AND owner_user_id IS NULL',
          [service.id],
        );
      } else {
        credRes = await pool.query<{
          encrypted_username: Buffer;
          encrypted_password: Buffer;
          iv: Buffer;
          auth_tag: Buffer;
          key_version: number;
        }>(
          'SELECT encrypted_username, encrypted_password, iv, auth_tag, key_version FROM vault_credentials WHERE service_id = $1 AND owner_user_id = $2',
          [service.id, targetOwnerUserId],
        );
      }

      const cred = credRes.rows[0];
      if (!cred) {
        return reply.code(404).send({ error: 'Nenhuma credencial cadastrada para este serviço.' });
      }

      const plaintext = decryptCredential(
        cred.encrypted_username,
        cred.encrypted_password,
        cred.iv,
        cred.auth_tag,
        service.id,
        targetOwnerUserId,
        cred.key_version,
      );

      await audit(pool, session.id, 'credential_revealed', request.ip, service.id, {
        isShared: targetOwnerUserId === null,
        ownerUserId: targetOwnerUserId,
      });

      return plaintext;
    },
  );

  server.post('/api/vault/tickets', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = await activeSession(request, reply);
    if (!session) return;
    const input = ticketInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Serviço inválido.' });
    const service = (
      await pool.query<{
        id: string;
        target_url: string | null;
        credential_type: CatalogCredentialType;
      }>(
        `SELECT id, target_url, credential_type FROM services
       WHERE id = $1 AND has_action = TRUE`,
        [input.serviceId],
      )
    ).rows[0];
    if (!service || !validTarget(service.target_url) || service.credential_type === 'none')
      return reply.code(404).send({ error: 'Serviço indisponível.' });
    const owner = service.credential_type === 'shared' ? null : session.id;
    const credential = await pool.query(
      `SELECT 1 FROM vault_credentials
       WHERE service_id = $1 AND owner_user_id IS NOT DISTINCT FROM $2`,
      [service.id, owner],
    );
    if (!credential.rowCount) return reply.code(404).send({ error: 'Credencial indisponível.' });
    const ticket = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO opening_tickets (ticket_hash, user_id, session_id, service_id, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 seconds')`,
      [tokenHash(ticket), session.id, session.session_id, service.id],
    );
    await audit(pool, session.id, 'ticket_issued', request.ip, service.id);
    // This bounded cleanup runs only on issuance and never removes a live ticket.
    await pool.query("DELETE FROM opening_tickets WHERE created_at < NOW() - INTERVAL '24 hours'");
    return { ticket, serviceId: service.id, targetUrl: service.target_url };
  });

  server.post('/api/vault/exchange', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!extensionOrigin || request.headers.origin !== extensionOrigin)
      return reply.code(403).send({ error: 'Origem da extensão não autorizada.' });
    const input = ticketInput(request.body, true);
    if (!input?.ticket) return reply.code(400).send({ error: 'Bilhete inválido.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ticket = (
        await client.query<{
          id: string;
          user_id: string;
          session_id: string;
          service_id: string;
          used_at: Date | null;
          is_live: boolean;
        }>(
          'SELECT *, expires_at > NOW() AS is_live FROM opening_tickets WHERE ticket_hash = $1 FOR UPDATE',
          [tokenHash(input.ticket)],
        )
      ).rows[0];
      if (!ticket || ticket.used_at || !ticket.is_live || ticket.service_id !== input.serviceId) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'Bilhete indisponível.' });
      }
      const session = (
        await client.query<{ id: string }>(
          `SELECT id FROM sessions WHERE id = $1 AND user_id = $2
         AND revoked_at IS NULL AND last_seen_at > NOW() - INTERVAL '365 days' FOR SHARE`,
          [ticket.session_id, ticket.user_id],
        )
      ).rows[0];
      const service = (
        await client.query<{
          target_url: string | null;
          credential_type: CatalogCredentialType;
        }>('SELECT target_url, credential_type FROM services WHERE id = $1 AND has_action = TRUE', [
          ticket.service_id,
        ])
      ).rows[0];
      if (
        !session ||
        !service ||
        !validTarget(service.target_url) ||
        service.credential_type === 'none'
      ) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'Bilhete indisponível.' });
      }
      const owner = service.credential_type === 'shared' ? null : ticket.user_id;
      const credential = (
        await client.query<{
          encrypted_username: Buffer;
          encrypted_password: Buffer;
          iv: Buffer;
          auth_tag: Buffer;
          key_version: number;
        }>(
          `SELECT encrypted_username, encrypted_password, iv, auth_tag, key_version
         FROM vault_credentials WHERE service_id = $1
         AND owner_user_id IS NOT DISTINCT FROM $2`,
          [ticket.service_id, owner],
        )
      ).rows[0];
      if (!credential) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'Bilhete indisponível.' });
      }
      const plaintext = decryptCredential(
        credential.encrypted_username,
        credential.encrypted_password,
        credential.iv,
        credential.auth_tag,
        ticket.service_id,
        owner,
        credential.key_version,
      );
      await client.query('UPDATE opening_tickets SET used_at = NOW() WHERE id = $1', [ticket.id]);
      await client.query(
        'INSERT INTO audit_logs (user_id, action, service_id, ip_address) VALUES ($1, $2, $3, $4)',
        [ticket.user_id, 'ticket_exchanged', ticket.service_id, request.ip],
      );
      await client.query('COMMIT');
      return { ...plaintext, targetUrl: service.target_url };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  server.get('/api/config', async (_request, reply) => {
    try {
      await mkdir(dirname(configPath), { recursive: true });
      try {
        await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      return parseConfig(JSON.parse(await readFile(configPath, 'utf8')));
    } catch {
      return reply.code(500).send({ error: 'Could not read configuration.' });
    }
  });

  server.put('/api/config', async (request, reply) => {
    let config: ReturnType<typeof parseConfig>;
    try {
      config = parseConfig(request.body);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid configuration.' });
    }
    const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(config, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporaryPath, configPath);
      return { status: 'ok', config };
    } catch {
      await unlink(temporaryPath).catch(() => undefined);
      return reply.code(500).send({ error: 'Could not save configuration.' });
    }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.HUB_API_PORT ?? 3177);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('HUB_API_PORT must be a valid TCP port');
  }
  await createServer().listen({ host: '127.0.0.1', port });
}
