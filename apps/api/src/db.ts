import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword } from './auth.js';

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations/001_initial_schema.sql',
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
    if (existing.rows[0]?.users_table === null) {
      await client.query(await readFile(migrationPath, 'utf8'));
    }
    const admin = await client.query('SELECT 1 FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (admin.rowCount === 0) {
      const email = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@hublink.local';
      const password = process.env.INITIAL_ADMIN_PASSWORD ?? 'admin123456';
      await client.query(
        'INSERT INTO users (display_name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['Administrador', email.trim().toLowerCase(), await hashPassword(password), 'admin'],
      );
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(7040317)');
    } finally {
      client.release();
    }
  }
}
