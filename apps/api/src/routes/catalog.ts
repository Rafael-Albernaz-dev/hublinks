import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { randomUUID } from 'node:crypto';
import type { CatalogRow, CatalogItem, CatalogCredentialType } from '../types/index.js';
import { catalogInput } from '../validators/index.js';
import { activeSession, adminSession } from '../services/session.js';
import { encryptCredential } from '../vault.js';

export function registerCatalogRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool } = context;
  function catalogItem(row: CatalogRow): CatalogItem {
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
    const session = await activeSession(pool, request, reply);
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
    const session = await adminSession(pool, request, reply);
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
    const session = await adminSession(pool, request, reply);
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
    const session = await adminSession(pool, request, reply);
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
}
