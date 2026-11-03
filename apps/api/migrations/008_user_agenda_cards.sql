BEGIN;

CREATE TABLE IF NOT EXISTS user_agenda_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  column_id VARCHAR(30) NOT NULL DEFAULT 'todo' CHECK (column_id IN ('todo', 'in_progress', 'done')),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_agenda_cards ON user_agenda_cards (user_id, column_id, position);

COMMIT;
