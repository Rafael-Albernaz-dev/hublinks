import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth.js';
import type { CredentialUserRow } from '../types/index.js';
import { credentials, profileInput } from '../validators/index.js';
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

  server.put('/api/auth/profile', { bodyLimit: 3 * 1024 * 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = await activeSession(pool, request, reply);
    if (!session) return;
    const input = profileInput(request.body);
    if (!input)
      return reply.code(400).send({
        error:
          'Dados inválidos. Use uma imagem PNG, JPEG ou WebP de até 2 MB e senha de pelo menos 8 caracteres.',
      });
    if (input.newPassword && !rateLimit('login', request, reply)) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<CredentialUserRow>(
        'SELECT * FROM users WHERE id = $1 AND active = TRUE FOR UPDATE',
        [session.id],
      );
      const user = found.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return reply.code(401).send({ error: 'Não autenticado.' });
      }
      if (
        input.newPassword &&
        !(await verifyPassword(input.currentPassword!, user.password_hash))
      ) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Senha atual incorreta.' });
      }
      const updated = await client.query<CredentialUserRow>(
        `UPDATE users SET display_name = $2, email = $3, avatar = $4, password_hash = $5, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          user.id,
          input.displayName ?? user.display_name,
          input.email ?? user.email,
          input.avatar === undefined ? (user.avatar ?? null) : input.avatar,
          input.newPassword ? await hashPassword(input.newPassword) : user.password_hash,
        ],
      );
      await client.query('COMMIT');
      return { user: publicUser(updated.rows[0]!) };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
        return reply.code(409).send({ error: 'Este e-mail já está em uso.' });
      throw error;
    } finally {
      client.release();
    }
  });

  server.get('/api/auth/me', async (request, reply) => {
    const session = await activeSession(pool, request, reply);
    if (session) return { user: publicUser(session) };
  });
}
