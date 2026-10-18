import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  SessionRow,
  CatalogRow,
  CatalogItem,
  CatalogCredentialType,
  CatalogInput,
} from '../types/index.js';
import { encryptCredential } from '../vault.js';
import type { ServiceResult } from './result.js';

export function catalogItem(row: CatalogRow): CatalogItem {
  return {
    ownerUserId: row.owner_user_id ?? null,
    scope: row.owner_user_id ? 'personal' : 'global',
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

export async function readCatalogItem(
  pool: Pool,
  serviceId: string,
  userId: string,
): Promise<CatalogItem | null> {
  const result = await pool.query<CatalogRow>(
    `SELECT s.id, s.name, s.description, s.category, s.credential_type, s.target_url,
              s.has_action, s.logo_data_url, s.owner_user_id,
              EXISTS (SELECT 1 FROM vault_credentials vc WHERE vc.service_id = s.id
                AND ((s.credential_type = 'shared' AND vc.owner_user_id IS NULL)
                  OR (s.credential_type = 'individual' AND vc.owner_user_id = $2))) AS has_credential
       FROM services s WHERE s.id = $1 AND (s.owner_user_id IS NULL OR s.owner_user_id = $2)`,
    [serviceId, userId],
  );
  return result.rows[0] ? catalogItem(result.rows[0]) : null;
}

export async function listCatalogServices(pool: Pool, userId: string): Promise<CatalogItem[]> {
  const result = await pool.query<CatalogRow>(
    `SELECT s.id, s.name, s.description, s.category, s.credential_type, s.target_url,
              s.has_action, s.logo_data_url, s.owner_user_id,
              EXISTS (SELECT 1 FROM vault_credentials vc WHERE vc.service_id = s.id
                AND ((s.credential_type = 'shared' AND vc.owner_user_id IS NULL)
                  OR (s.credential_type = 'individual' AND vc.owner_user_id = $1))) AS has_credential
       FROM services s WHERE s.owner_user_id IS NULL OR s.owner_user_id = $1 ORDER BY s.created_at ASC, s.id ASC`,
    [userId],
  );
  return result.rows.map(catalogItem);
}

export async function createCatalogService(
  pool: Pool,
  input: CatalogInput,
  session: SessionRow,
  ip: string,
): Promise<ServiceResult<CatalogItem | null>> {
  const userId = session.id;
  const personal = session.role !== 'admin' || input.scope === 'personal';
  if (personal && input.credentialType === 'shared')
    return {
      ok: false,
      statusCode: 403,
      error:
        session.role !== 'admin'
          ? 'Usuários comuns não podem criar credenciais compartilhadas.'
          : 'Serviços pessoais não suportam cofre compartilhado.',
    };
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO services (id, name, description, category, credential_type, target_url, has_action, logo_data_url, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.name,
        input.description,
        input.category,
        input.credentialType,
        input.targetUrl,
        input.targetUrl !== null,
        input.logoDataUrl,
        personal ? userId : null,
      ],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
         VALUES ($1, 'service_created', $2, $3, $4)`,
      [
        userId,
        id,
        ip,
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
        [userId, id, ip, JSON.stringify({ credentialType: 'shared' })],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { ok: true, value: await readCatalogItem(pool, id, userId) };
}

export async function updateCatalogService(
  pool: Pool,
  serviceId: string,
  input: CatalogInput,
  session: SessionRow,
  ip: string,
): Promise<ServiceResult<CatalogItem | null>> {
  const userId = session.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{
      credential_type: CatalogCredentialType;
      owner_user_id: string | null;
    }>('SELECT credential_type, owner_user_id FROM services WHERE id = $1 FOR UPDATE', [serviceId]);
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return { ok: false, statusCode: 404, error: 'Serviço não encontrado.' };
    }
    const denial = catalogMutationDenial(existing.rows[0].owner_user_id, session);
    if (denial) {
      await client.query('ROLLBACK');
      return denial;
    }
    if (existing.rows[0].owner_user_id && input.credentialType === 'shared') {
      await client.query('ROLLBACK');
      return {
        ok: false,
        statusCode: 400,
        error: 'Serviços pessoais não suportam cofre compartilhado.',
      };
    }
    await client.query(
      `UPDATE services SET name = $2, description = $3, category = $4, credential_type = $5,
          target_url = $6, has_action = $7, logo_data_url = $8 WHERE id = $1`,
      [
        serviceId,
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
      await client.query('DELETE FROM vault_credentials WHERE service_id = $1', [serviceId]);
    }
    if (input.credential) {
      const enc = encryptCredential(
        input.credential.username,
        input.credential.password,
        serviceId,
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
          serviceId,
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
        [userId, serviceId, ip, JSON.stringify({ credentialType: 'shared' })],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
         VALUES ($1, 'service_updated', $2, $3, $4)`,
      [
        userId,
        serviceId,
        ip,
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
  return { ok: true, value: await readCatalogItem(pool, serviceId, userId) };
}

export async function deleteCatalogService(
  pool: Pool,
  serviceId: string,
  session: SessionRow,
  ip: string,
): Promise<ServiceResult<void>> {
  const userId = session.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ owner_user_id: string | null }>(
      'SELECT credential_type, owner_user_id FROM services WHERE id = $1 FOR UPDATE',
      [serviceId],
    );
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return { ok: false, statusCode: 404, error: 'Serviço não encontrado.' };
    }
    const denial = catalogMutationDenial(existing.rows[0].owner_user_id, session);
    if (denial) {
      await client.query('ROLLBACK');
      return denial;
    }
    const deleted = await client.query('DELETE FROM services WHERE id = $1 RETURNING id', [
      serviceId,
    ]);
    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return { ok: false, statusCode: 404, error: 'Serviço não encontrado.' };
    }
    await client.query(
      `INSERT INTO audit_logs (user_id, action, service_id, ip_address, details)
         VALUES ($1, 'service_deleted', NULL, $2, $3)`,
      [userId, ip, JSON.stringify({ serviceId: serviceId })],
    );
    await client.query('COMMIT');
    return { ok: true, value: undefined };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function catalogMutationDenial(
  owner: string | null,
  session: SessionRow,
): Extract<ServiceResult<never>, { ok: false }> | null {
  if (owner === null && session.role !== 'admin')
    return {
      ok: false,
      statusCode: 403,
      error: 'Apenas administradores podem alterar serviços globais da equipe.',
    };
  if (owner !== null && owner !== session.id)
    return {
      ok: false,
      statusCode: 403,
      error: 'Você só pode gerenciar seus próprios serviços pessoais.',
    };
  return null;
}
