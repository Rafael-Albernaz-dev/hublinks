import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { hashPassword } from '../auth.js';
import type { UserRow } from '../types/index.js';
import { attendantInput, userUpdateInput } from '../validators/index.js';
import { adminSession, publicUser } from '../services/session.js';
import { audit } from '../services/audit.js';

export function registerAdminRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool } = context;
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
