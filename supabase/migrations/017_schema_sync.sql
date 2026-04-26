-- 017_schema_sync.sql
-- Sync database schema with Drizzle ORM definitions.
-- Fixes tables that failed in earlier migrations (auth.users FK),
-- adds columns that were added to Drizzle schema after initial migrations,
-- and renames atlantic_payment_id to gateway_payment_id (Saweria PG migration).

-- ─── Fix tables that failed due to auth.users FK ─────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

INSERT INTO app_settings (key, value) VALUES
  ('install_price', '{"amount": 1000}'),
  ('fee_mode', '{"mode": "user", "fee_percent": 0.7, "fee_flat": 200}'),
  ('maintenance', '{"enabled": false, "scope": "none", "note": "", "show_popup": false}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('update', 'maintenance', 'info')),
  show_popup BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- ─── users: columns added after initial migrations ───────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS proxy_mode TEXT NOT NULL DEFAULT 'disabled';

-- ─── email_confirm_tokens (new table) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_confirm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ect_token ON email_confirm_tokens(token);
CREATE INDEX IF NOT EXISTS idx_ect_expires ON email_confirm_tokens(expires_at);

-- ─── do_proxies: columns added after initial migration ───────────────────────
ALTER TABLE do_proxies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unchecked';
ALTER TABLE do_proxies ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ;
ALTER TABLE do_proxies ADD COLUMN IF NOT EXISTS response_time INTEGER;

-- ─── do_droplets: columns added after initial migration ──────────────────────
ALTER TABLE do_droplets ADD COLUMN IF NOT EXISTS pending_rdp BOOLEAN DEFAULT false;
ALTER TABLE do_droplets ADD COLUMN IF NOT EXISTS rdp_password TEXT;
ALTER TABLE do_droplets ADD COLUMN IF NOT EXISTS windows_version TEXT;
ALTER TABLE do_droplets ADD COLUMN IF NOT EXISTS rdp_type TEXT DEFAULT 'dedicated';
ALTER TABLE do_droplets ADD COLUMN IF NOT EXISTS rdp_status TEXT;

-- ─── os_versions: fix categories to match frontend ───────────────────────────
UPDATE os_versions SET category = 'windows11' WHERE id IN ('win_11revi_h25', 'win_11atlas_h25', 'win_11atlas_h22', 'win_11ghost', 'win_11_pro') AND category = 'desktop';
UPDATE os_versions SET category = 'windows10' WHERE id IN ('win_10atlas', 'win_10ghost', 'win_10_ent') AND category = 'desktop';
UPDATE os_versions SET category = 'legacy' WHERE id IN ('win_7', 'win_7_sp1_lite') AND category = 'desktop';
UPDATE os_versions SET category = 'server' WHERE id IN ('win_2025', 'win_22', 'win_19', 'win_2016', 'win_2012R2', 'win_2008') AND category NOT IN ('server');
UPDATE os_versions SET category = 'uefi' WHERE id LIKE '%_uefi' AND category NOT IN ('uefi');
UPDATE os_versions SET category = 'lite' WHERE id LIKE '%_lite' AND category NOT IN ('lite', 'legacy');

-- ─── payment_tracking: rename for Saweria PG migration ──────────────────────
-- Safe rename: only runs if old column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_tracking' AND column_name = 'atlantic_payment_id'
  ) THEN
    ALTER TABLE payment_tracking RENAME COLUMN atlantic_payment_id TO gateway_payment_id;
  END IF;
END $$;
