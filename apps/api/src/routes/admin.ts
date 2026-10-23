import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { hashPassword } from '../auth.js';
import type { UserRow } from '../types/index.js';
import { attendantInput, userUpdateInput } from '../validators/index.js';
import { adminSession, publicUser } from '../services/session.js';
import { audit } from '../services/audit.js';

export function registerAdminRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool } = context;
  server.get<{ Querystring: Record<string, string> }>(
    '/api/admin/audit',
    async (request, reply) => {
      if (!(await adminSession(pool, request, reply))) return;
      reply.header('Cache-Control', 'no-store');
      const q = request.query;
      const integer = (value: string | undefined, fallback: number) =>
        value === undefined ? fallback : /^\d+$/.test(value) ? Number(value) : NaN;
      const limit = integer(q.limit, 50),
        offset = integer(q.offset, 0);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 200 ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (q.action !== undefined && !/^[a-zA-Z0-9_.-]{1,50}$/.test(q.action)) ||
        (q.userId !== undefined && !uuid.test(q.userId)) ||
        [q.from, q.to].some(
          (date) =>
            date !== undefined &&
            (!/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date))),
        ) ||
        (q.from && q.to && Date.parse(q.from) > Date.parse(q.to))
      )
        return reply.code(400).send({ error: 'Filtros de auditoria inválidos.' });
      const values = [q.action ?? null, q.userId ?? null, q.from ?? null, q.to ?? null];
      const where = `WHERE ($1::text IS NULL OR a.action = $1)
      AND ($2::uuid IS NULL OR a.user_id = $2)
      AND ($3::timestamptz IS NULL OR a.created_at >= $3)
      AND ($4::timestamptz IS NULL OR a.created_at <= $4)`;
      // One statement gives page and count the same MVCC snapshot, including empty pages.
      const result = await pool.query<{ events: unknown[]; total: number }>(
        `
      SELECT (SELECT count(*)::int FROM audit_logs a ${where}) AS total,
        COALESCE((SELECT json_agg(event ORDER BY event."createdAt" DESC, event."id"::bigint DESC)
        FROM (SELECT a.id::text AS id, a.user_id AS "actorUserId", u.email AS "actorEmail",
          a.action, CASE WHEN a.service_id IS NOT NULL THEN 'service'
            WHEN a.details->>'targetUserId' IS NOT NULL THEN 'user' ELSE 'system' END AS "targetType",
          COALESCE(a.service_id, a.details->>'targetUserId') AS "targetId",
          a.ip_address AS ip, NULL::text AS "userAgent", a.created_at AS "createdAt"
          FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ${where}
          ORDER BY a.created_at DESC, a.id DESC LIMIT $5 OFFSET $6) event), '[]'::json) AS events`,
        [...values, limit, offset],
      );
      return result.rows[0];
    },
  );
  server.get('/api/admin/users', async (request, reply) => {
    if (!(await adminSession(pool, request, reply))) return;
    const result = await pool.query<UserRow & { created_at: Date }>(
      'SELECT id, display_name, email, role, active, created_at FROM users ORDER BY created_at, id',
    );
    return {
      users: result.rows.map((row) => ({ ...publicUser(row), createdAt: row.created_at })),
    };
  });

  server.post('/api/admin/users', async (request, reply) => {
    const admin = await adminSession(pool, request, reply);
    if (!admin) return;
    const input = attendantInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do usuário inválidos.' });
    try {
      const result = await pool.query<UserRow & { created_at: Date }>(
        `INSERT INTO users (display_name, email, password_hash, role, active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, display_name, email, role, active, created_at`,
        [
          input.displayName,
          input.email,
          await hashPassword(input.password),
          input.role ?? 'attendant',
        ],
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

  server.put<{ Params: { id: string } }>('/api/admin/users/:id', async (request, reply) => {
    const admin = await adminSession(pool, request, reply);
    if (!admin) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id))
      return reply.code(400).send({ error: 'Dados inválidos.' });
    const input = userUpdateInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Dados do usuário inválidos.' });
    if (request.params.id === admin.id && (!input.active || input.role !== 'admin')) {
      return reply.code(400).send({
        error: 'Não é permitido remover o próprio cargo de admin ou desativar a própria conta.',
      });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<UserRow & { created_at: Date }>(
        `UPDATE users SET display_name = $1, email = $2, role = $3, active = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, display_name, email, role, active, created_at`,
        [input.displayName, input.email, input.role, input.active, request.params.id],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Usuário não encontrado.' });
      }
      if (!input.active) {
        await client.query(
          'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [request.params.id],
        );
      }
      await client.query(
        'INSERT INTO audit_logs (user_id, action, ip_address, details) VALUES ($1, $2, $3, $4)',
        [
          admin.id,
          'user_updated',
          request.ip,
          JSON.stringify({ targetUserId: row.id, role: row.role, active: row.active }),
        ],
      );
      await client.query('COMMIT');
      return { user: { ...publicUser(row), createdAt: row.created_at } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        return reply.code(409).send({ error: 'E-mail já cadastrado.' });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  server.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/reset-password',
    async (request, reply) => {
      const admin = await adminSession(pool, request, reply);
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
         WHERE id = $2 RETURNING id`,
          [passwordHash, request.params.id],
        );
        if (changed.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Usuário não encontrado.' });
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
}
