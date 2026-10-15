-- R2 contract only. Apply to a dedicated Hublink development database.
BEGIN;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(80) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'attendant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_sessions_active_user ON sessions (user_id, last_seen_at)
  WHERE revoked_at IS NULL;

CREATE TABLE services (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('sva', 'crm', 'sheet')),
  credential_type VARCHAR(20) NOT NULL
    CHECK (credential_type IN ('shared', 'individual', 'none')),
  target_url VARCHAR(2048) NULL,
  has_action BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_services_action_target CHECK (NOT has_action OR target_url IS NOT NULL),
  CONSTRAINT ck_services_sheet_credential CHECK (category <> 'sheet' OR credential_type = 'none')
);

CREATE TABLE vault_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id VARCHAR(50) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  owner_user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_username BYTEA NOT NULL,
  encrypted_password BYTEA NOT NULL,
  iv BYTEA NOT NULL CHECK (octet_length(iv) = 12),
  auth_tag BYTEA NOT NULL CHECK (octet_length(auth_tag) = 16),
  key_version INT NOT NULL DEFAULT 1 CHECK (key_version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vault_credential UNIQUE (service_id, owner_user_id)
);

-- PostgreSQL UNIQUE permits multiple NULLs. The partial index enforces one
-- shared credential per service; the table constraint covers individual owners.
CREATE UNIQUE INDEX uq_vault_shared_service ON vault_credentials (service_id)
  WHERE owner_user_id IS NULL;

CREATE TABLE opening_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hash VARCHAR(64) NOT NULL UNIQUE CHECK (ticket_hash ~ '^[0-9a-f]{64}$'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  service_id VARCHAR(50) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  CONSTRAINT ck_opening_tickets_expiry CHECK (
    expires_at > created_at AND expires_at <= created_at + INTERVAL '30 seconds'
  )
);

CREATE INDEX idx_opening_tickets_user_expiry ON opening_tickets (user_id, expires_at);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  service_id VARCHAR(50) NULL REFERENCES services(id) ON DELETE SET NULL,
  ip_address VARCHAR(45) NOT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);

COMMIT;
