import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { randomBytes } from 'node:crypto';
import { verifyPassword } from '../auth.js';
import type { CredentialUserRow } from '../types/index.js';
import { credentials } from '../validators/index.js';
import {
  activeSession,
  publicUser,
  tokenHash,
  setSessionCookie,
  SESSION_COOKIE,
} from '../services/session.js';
import { audit } from '../services/audit.js';

export function registerAuthRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool, rateLimit } = context;
  server.post('/api/auth/login', async (request, reply) => {
    if (!rateLimit('login', request, reply)) return;
    const input = credentials(request.body);
    const found = input
      ? await pool.query<CredentialUserRow>('SELECT * FROM users WHERE email = $1', [input.email])
      : null;
    const user = found?.rows[0];
    if (
      !input ||
      !user ||
      user.active === false ||
      !(await verifyPassword(input.password, user.password_hash))
    ) {
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
    const session = await activeSession(pool, request, reply);
    if (session) return { user: publicUser(session) };
  });
}
