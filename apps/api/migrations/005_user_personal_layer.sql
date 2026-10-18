ALTER TABLE services
  ADD COLUMN IF NOT EXISTS owner_user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_services_personal_credential_type' AND conrelid = 'services'::regclass) THEN
    ALTER TABLE services ADD CONSTRAINT ck_services_personal_credential_type
      CHECK (owner_user_id IS NULL OR credential_type IN ('individual', 'none'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_services_owner_user ON services (owner_user_id);
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme_overrides JSONB NULL,
  home_layout VARCHAR(20) NOT NULL DEFAULT 'grid' CHECK (home_layout IN ('grid', 'list', 'carousel')),
  show_shortcut_cards BOOLEAN NOT NULL DEFAULT TRUE,
  card_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
