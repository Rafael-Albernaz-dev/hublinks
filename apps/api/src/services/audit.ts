import type { Pool } from 'pg';

export async function audit(
  pool: Pick<Pool, 'query'>,
  userId: string | null,
  action: string,
  ip: string,
  serviceId: string | null = null,
  details: Record<string, unknown> | null = null,
) {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, service_id, ip_address, details) VALUES ($1, $2, $3, $4, $5)',
    [userId, action, serviceId, ip, details ? JSON.stringify(details) : null],
  );
}
