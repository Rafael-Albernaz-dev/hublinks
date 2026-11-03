BEGIN;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS in_catalog BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_services_in_catalog ON services (in_catalog);

COMMIT;
