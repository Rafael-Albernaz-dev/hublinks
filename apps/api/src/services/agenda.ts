import type { Pool } from 'pg';
import type { AgendaCard, AgendaCardInput, AgendaCardUpdateInput } from '../types/index.js';
import type { ServiceResult } from './result.js';

export async function listAgendaCards(pool: Pool, userId: string): Promise<AgendaCard[]> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    title: string;
    column_id: 'todo' | 'in_progress' | 'done';
    position: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, user_id, title, column_id, position, created_at, updated_at
     FROM user_agenda_cards
     WHERE user_id = $1
     ORDER BY column_id, position ASC, created_at ASC`,
    [userId],
  );

  return result.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    columnId: r.column_id,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createAgendaCard(
  pool: Pool,
  userId: string,
  input: AgendaCardInput,
): Promise<AgendaCard> {
  const columnId = input.columnId ?? 'todo';
  const posRes = await pool.query<{ next_pos: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
     FROM user_agenda_cards
     WHERE user_id = $1 AND column_id = $2`,
    [userId, columnId],
  );
  const position = posRes.rows[0]?.next_pos ?? 0;

  const result = await pool.query<{
    id: string;
    user_id: string;
    title: string;
    column_id: 'todo' | 'in_progress' | 'done';
    position: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO user_agenda_cards (user_id, title, column_id, position)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, title, column_id, position, created_at, updated_at`,
    [userId, input.title, columnId, position],
  );

  const row = result.rows[0];
  if (!row) throw new Error('Falha ao criar card de agenda');
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    columnId: row.column_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateAgendaCard(
  pool: Pool,
  userId: string,
  cardId: string,
  input: AgendaCardUpdateInput,
): Promise<ServiceResult<AgendaCard>> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    title: string;
    column_id: 'todo' | 'in_progress' | 'done';
    position: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE user_agenda_cards
     SET title = COALESCE($3, title),
         column_id = COALESCE($4, column_id),
         position = COALESCE($5, position),
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, title, column_id, position, created_at, updated_at`,
    [cardId, userId, input.title ?? null, input.columnId ?? null, input.position ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    return { ok: false, statusCode: 404, error: 'Card não encontrado.' };
  }

  return {
    ok: true,
    value: {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      columnId: row.column_id,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

export async function deleteAgendaCard(
  pool: Pool,
  userId: string,
  cardId: string,
): Promise<ServiceResult<{ id: string; status: string }>> {
  const result = await pool.query(
    'DELETE FROM user_agenda_cards WHERE id = $1 AND user_id = $2 RETURNING id',
    [cardId, userId],
  );

  if (result.rowCount === 0) {
    return { ok: false, statusCode: 404, error: 'Card não encontrado.' };
  }

  return {
    ok: true,
    value: { id: cardId, status: 'deleted' },
  };
}
