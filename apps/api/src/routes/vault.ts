import type { FastifyInstance } from 'fastify';
import type { ApiContext } from '../types/index.js';
import { randomUUID, randomBytes } from 'node:crypto';
import type { CatalogCredentialType } from '../types/index.js';
import {
  serviceInput,
  vaultInput,
  revealInput,
  ticketInput,
  validTarget,
} from '../validators/index.js';
import { activeSession, adminSession, tokenHash } from '../services/session.js';
import { audit } from '../services/audit.js';
import { encryptCredential, decryptCredential } from '../vault.js';

export function registerVaultRoutes(server: FastifyInstance, context: ApiContext): void {
  const { pool, extensionOrigin, rateLimit } = context;
  server.options('/api/vault/exchange', async (request, reply) => {
    if (!extensionOrigin || request.headers.origin !== extensionOrigin)
      return reply.code(403).send({ error: 'Origem da extensão não autorizada.' });
    return reply.code(204).send();
  });
  server.post('/api/vault/services', async (request, reply) => {
    const session = await adminSession(pool, request, reply);
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
    const session = await activeSession(pool, request, reply);
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
      const session = await activeSession(pool, request, reply);
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
      const session = await activeSession(pool, request, reply);
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
    if (!rateLimit('tickets', request, reply)) return;
    reply.header('Cache-Control', 'no-store');
    const session = await activeSession(pool, request, reply);
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
}
