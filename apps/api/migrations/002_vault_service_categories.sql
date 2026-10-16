-- R4b: allow custom vault services for systems and other tools.
-- Safe to apply more than once to both new and existing Hublink databases.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'services'::regclass AND conname = 'services_category_check'
  ) THEN
    ALTER TABLE services DROP CONSTRAINT services_category_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'services'::regclass AND conname = 'ck_services_category'
  ) THEN
    ALTER TABLE services ADD CONSTRAINT ck_services_category
      CHECK (category IN ('sva', 'crm', 'sheet', 'sistemas', 'outros'));
  END IF;
END $$;

COMMIT;
