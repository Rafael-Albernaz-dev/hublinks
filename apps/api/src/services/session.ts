import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { User, UserRow, SessionRow } from '../types/index.js';

export const SESSION_COOKIE = 'hublink_session';
export const SESSION_SECONDS = 365 * 24 * 60 * 60;
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_SECONDS,
} as const;

export function publicUser(row: UserRow): User {
  return { id: row.id, displayName: row.display_name, email: row.email, role: row.role };
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    ...COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function activeSession(
  pool: Pool,
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

export async function adminSession(
  pool: Pool,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionRow | null> {
  const session = await activeSession(pool, request, reply);
  if (!session) return null;
  if (session.role !== 'admin') {
    reply.code(403).send({ error: 'Acesso negado.' });
    return null;
  }
  return session;
}
