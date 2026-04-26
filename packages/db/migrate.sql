-- ============================================================================
-- Cobain RDP — Consolidated Migration (run once on fresh PostgreSQL)
-- Replaces all 16 Supabase migrations into a single idempotent script.
-- NO RLS, NO auth.users references.
-- ============================================================================

-- ─── USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
  credit_balance NUMERIC DEFAULT 0,
  fail_count INT DEFAULT 0,
  frozen_until TIMESTAMPTZ,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── TRANSACTIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup', 'deduction')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'cancelled')),
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Prevent duplicate refunds
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payment_id_unique
  ON transactions(payment_id) WHERE payment_id IS NOT NULL AND payment_id LIKE 'refund_%';

-- ─── INSTALLATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  install_id TEXT UNIQUE NOT NULL,
  vps_ip TEXT NOT NULL,
  windows_version TEXT NOT NULL,
  rdp_type TEXT NOT NULL CHECK (rdp_type IN ('docker', 'dedicated')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  progress_step INT DEFAULT 0,
  progress_message TEXT,
  rdp_password TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_installations_user_id ON installations(user_id);
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);

-- ─── PAYMENT TRACKING ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  qr_code_url TEXT NOT NULL,
  atlantic_payment_id TEXT NOT NULL,
  poll_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_tracking_transaction_id ON payment_tracking(transaction_id);

-- ─── APP SETTINGS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

-- ─── CHANGELOG ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('update', 'maintenance', 'info')),
  show_popup BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- ─── OS VERSIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS os_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'desktop',
  enabled BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── DIGITALOCEAN ACCOUNTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS do_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  email TEXT,
  status TEXT DEFAULT 'active',
  balance NUMERIC DEFAULT 0,
  droplet_limit INT DEFAULT 0,
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_do_accounts_user ON do_accounts(user_id);

-- ─── DIGITALOCEAN PROXIES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS do_proxies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL DEFAULT 'http',
  host TEXT NOT NULL,
  port INT NOT NULL,
  username TEXT,
  password TEXT,
  is_selected BOOLEAN DEFAULT false,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_do_proxies_user ON do_proxies(user_id);

-- ─── DIGITALOCEAN DROPLETS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS do_droplets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES do_accounts(id) ON DELETE CASCADE,
  droplet_id BIGINT NOT NULL,
  name TEXT,
  ip_address TEXT,
  region TEXT,
  size TEXT,
  image TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_do_droplets_user ON do_droplets(user_id);

-- ─── ACTIVITY LOG ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

-- ─── PASSWORD RESET TOKENS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at);

-- ─── USER SESSIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session ON user_sessions(session_id);

-- ============================================================================
-- STORED FUNCTIONS (atomic balance operations)
-- ============================================================================

-- Atomic balance deduction (prevents race condition double-spend)
CREATE OR REPLACE FUNCTION deduct_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE users
  SET credit_balance = credit_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id AND credit_balance >= p_amount
  RETURNING credit_balance INTO new_balance;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic balance addition (prevents race condition double-credit)
CREATE OR REPLACE FUNCTION add_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE users
  SET credit_balance = credit_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credit_balance;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic payment completion (prevents double-credit)
CREATE OR REPLACE FUNCTION complete_payment(p_transaction_id UUID, p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  was_pending BOOLEAN;
BEGIN
  -- Only update if currently pending (atomic check-and-set)
  UPDATE transactions
  SET status = 'completed', updated_at = now()
  WHERE id = p_transaction_id AND status = 'pending'
  RETURNING TRUE INTO was_pending;

  IF was_pending THEN
    -- Add credit
    UPDATE users SET credit_balance = credit_balance + p_amount, updated_at = now()
    WHERE id = p_user_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Default app settings
INSERT INTO app_settings (key, value) VALUES
  ('install_price', '{"amount": 1000}'),
  ('fee_mode', '{"mode": "user", "fee_percent": 0.7, "fee_flat": 200}'),
  ('maintenance', '{"enabled": false, "scope": "none", "note": "", "show_popup": false}')
ON CONFLICT (key) DO NOTHING;

-- Default OS versions (25 Windows variants)
INSERT INTO os_versions (id, name, category, sort_order) VALUES
  ('win_11revi_h25',   'Windows 11 ReviOS H2 2025',      'desktop', 1),
  ('win_11atlas_h25',  'Windows 11 AtlasOS H2 2025',     'desktop', 2),
  ('win_11atlas_h22',  'Windows 11 AtlasOS H2 2022',     'desktop', 3),
  ('win_11ghost',      'Windows 11 Ghost Spectre',        'desktop', 4),
  ('win_10atlas',      'Windows 10 AtlasOS',              'desktop', 5),
  ('win_10ghost',      'Windows 10 Ghost Spectre',        'desktop', 6),
  ('win_11_pro',       'Windows 11 Pro',                  'desktop', 7),
  ('win_10_ent',       'Windows 10 Enterprise',           'desktop', 8),
  ('win_7',            'Windows 7',                       'desktop', 9),
  ('win_11_uefi',      'Windows 11 UEFI',                 'uefi',   10),
  ('win_10_uefi',      'Windows 10 UEFI',                 'uefi',   11),
  ('win_7_sp1_lite',   'Windows 7 SP1 Lite',              'lite',   12),
  ('win_2025',         'Windows Server 2025',             'server', 13),
  ('win_22',           'Windows Server 2022',             'server', 14),
  ('win_19',           'Windows Server 2019',             'server', 15),
  ('win_2016',         'Windows Server 2016',             'server', 16),
  ('win_2012R2',       'Windows Server 2012 R2',          'server', 17),
  ('win_2008',         'Windows Server 2008',             'server', 18),
  ('win_2022_uefi',    'Windows Server 2022 UEFI',        'uefi',   19),
  ('win_2019_uefi',    'Windows Server 2019 UEFI',        'uefi',   20),
  ('win_2016_uefi',    'Windows Server 2016 UEFI',        'uefi',   21),
  ('win_2012R2_uefi',  'Windows Server 2012 R2 UEFI',     'uefi',   22),
  ('win_2022_lite',    'Windows Server 2022 Lite',        'lite',   23),
  ('win_2016_lite',    'Windows Server 2016 Lite',        'lite',   24),
  ('win_2012R2_lite',  'Windows Server 2012 R2 Lite',     'lite',   25)
ON CONFLICT (id) DO NOTHING;
