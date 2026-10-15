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

async function audit(pool: Pool, userId: string | null, action: string, ip: string) {
  await pool.query('INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, $2, $3)', [
    userId,
    action,
    ip,
  ]);
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
