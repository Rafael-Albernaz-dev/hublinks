import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword } from './auth.js';
import { getMasterKey } from './vault.js';

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations/001_initial_schema.sql',
);
const categoryMigrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations/002_vault_service_categories.sql',
);
const visualMigrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations/003_services_visual_metadata.sql',
);
const usersActiveMigrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations/004_users_active_and_management.sql',
);

export function createPool(): pg.Pool {
  const port = process.env.HUB_DB_PORT ?? '5439';
  return new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ??
      `postgres://hublink:hublink_dev_password@127.0.0.1:${port}/hublink`,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export async function initializeDatabase(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Serialize first boot when the API and an isolated test server start together.
    await client.query('SELECT pg_advisory_lock(7040317)');
    const existing = await client.query<{ users_table: string | null }>(
      "SELECT to_regclass('public.users')::text AS users_table",
    );
    const freshDatabase = existing.rows[0]?.users_table === null;
    if (freshDatabase) {
      await client.query(await readFile(migrationPath, 'utf8'));
    }
    await client.query(await readFile(categoryMigrationPath, 'utf8'));
    const visualColumn = await client.query<{ present: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'description') AS present`,
    );
    const needsVisualBackfill = !visualColumn.rows[0]?.present;
    await client.query(await readFile(visualMigrationPath, 'utf8'));
    await client.query(await readFile(usersActiveMigrationPath, 'utf8'));
    await client.query(
      await readFile(resolve(dirname(migrationPath), '005_user_personal_layer.sql'), 'utf8'),
    );
    await client.query(
      await readFile(resolve(dirname(migrationPath), '006_workspace_presentation.sql'), 'utf8'),
    );
    const existingServices = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM services',
    );
    const seedPilot =
      freshDatabase || (needsVisualBackfill && existingServices.rows[0]?.count === '0');
    getMasterKey();

    const admin = await client.query('SELECT 1 FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (admin.rowCount === 0) {
      const email = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local';
      const password = process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456';
      await client.query(
        'INSERT INTO users (display_name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['Administrador', email.trim().toLowerCase(), await hashPassword(password), 'admin'],
      );
    }

    const PILOT_SERVICES = [
      {
        id: 'partiu',
        name: 'PARTIU!',
        category: 'sva',
        credentialType: 'shared',
        description: 'Partner access',
      },
      {
        id: 'fullcam',
        name: 'Fullcam',
        category: 'sva',
        credentialType: 'individual',
        description: 'Individual partner access',
      },
      {
        id: 'playhub',
        name: 'Playhub',
        category: 'sva',
        credentialType: 'shared',
        description: 'Partner access',
      },
      {
        id: 'iptv',
        name: 'IPTV',
        category: 'sva',
        credentialType: 'shared',
        description: 'Partner access',
      },
      {
        id: 'crm',
        name: 'CRM',
        category: 'crm',
        credentialType: 'none',
        description: 'Awaiting a validated destination',
      },
      {
        id: 'fullarm',
        name: 'Fullarm',
        category: 'sva',
        credentialType: 'none',
        description: 'Awaiting a validated destination',
      },
      {
        id: 'planilha-1',
        name: 'Planilha 1',
        category: 'sheet',
        credentialType: 'none',
        description: 'Consultation sheet',
      },
      {
        id: 'planilha-2',
        name: 'Planilha 2',
        category: 'sheet',
        credentialType: 'none',
        description: 'Consultation sheet',
      },
      {
        id: 'planilha-3',
        name: 'Planilha 3',
        category: 'sheet',
        credentialType: 'none',
        description: 'Consultation sheet',
      },
    ] as const;

    for (const service of PILOT_SERVICES) {
      if (seedPilot) {
        await client.query(
          `INSERT INTO services (id, name, category, credential_type, target_url, has_action, description)
           VALUES ($1, $2, $3, $4, NULL, FALSE, $5)`,
          [service.id, service.name, service.category, service.credentialType, service.description],
        );
      } else if (needsVisualBackfill) {
        await client.query(
          'UPDATE services SET description = $2 WHERE id = $1 AND description IS NULL',
          [service.id, service.description],
        );
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(7040317)');
    } finally {
      client.release();
    }
  }
}
