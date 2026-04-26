-- DigitalOcean accounts (user's DO tokens)
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

-- User proxies
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

-- Tracked droplets
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

-- RLS
ALTER TABLE do_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE do_proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE do_droplets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "do_accounts_own" ON do_accounts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "do_proxies_own" ON do_proxies FOR ALL USING (user_id = auth.uid());
CREATE POLICY "do_droplets_own" ON do_droplets FOR ALL USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_do_accounts_user ON do_accounts(user_id);
CREATE INDEX idx_do_proxies_user ON do_proxies(user_id);
CREATE INDEX idx_do_droplets_user ON do_droplets(user_id);
