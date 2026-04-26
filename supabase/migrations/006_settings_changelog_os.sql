-- App Settings (key-value store for admin configuration)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES
  ('install_price', '{"amount": 1000}'),
  ('fee_mode', '{"mode": "user", "fee_percent": 0.7, "fee_flat": 200}'),
  ('maintenance', '{"enabled": false, "scope": "none", "note": "", "show_popup": false}')
ON CONFLICT (key) DO NOTHING;

-- Changelog entries
CREATE TABLE IF NOT EXISTS changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('update', 'maintenance', 'info')),
  show_popup BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- OS Versions (managed by admin, replaces hardcoded list)
CREATE TABLE IF NOT EXISTS os_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'desktop',
  enabled BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default OS versions
INSERT INTO os_versions (id, name, category, sort_order) VALUES
  ('win_11revi_h25', 'Windows 11 ReviOS H2 2025', 'desktop', 1),
  ('win_11atlas_h25', 'Windows 11 AtlasOS H2 2025', 'desktop', 2),
  ('win_11atlas_h22', 'Windows 11 AtlasOS H2 2022', 'desktop', 3),
  ('win_11ghost', 'Windows 11 Ghost Spectre', 'desktop', 4),
  ('win_10atlas', 'Windows 10 AtlasOS', 'desktop', 5),
  ('win_10ghost', 'Windows 10 Ghost Spectre', 'desktop', 6),
  ('win_11_pro', 'Windows 11 Pro', 'desktop', 7),
  ('win_10_ent', 'Windows 10 Enterprise', 'desktop', 8),
  ('win_7', 'Windows 7', 'desktop', 9),
  ('win_11_uefi', 'Windows 11 UEFI', 'uefi', 10),
  ('win_10_uefi', 'Windows 10 UEFI', 'uefi', 11),
  ('win_7_sp1_lite', 'Windows 7 SP1 Lite', 'lite', 12),
  ('win_2025', 'Windows Server 2025', 'server', 13),
  ('win_22', 'Windows Server 2022', 'server', 14),
  ('win_19', 'Windows Server 2019', 'server', 15),
  ('win_2016', 'Windows Server 2016', 'server', 16),
  ('win_2012R2', 'Windows Server 2012 R2', 'server', 17),
  ('win_2008', 'Windows Server 2008', 'server', 18),
  ('win_2022_uefi', 'Windows Server 2022 UEFI', 'uefi', 19),
  ('win_2019_uefi', 'Windows Server 2019 UEFI', 'uefi', 20),
  ('win_2016_uefi', 'Windows Server 2016 UEFI', 'uefi', 21),
  ('win_2012R2_uefi', 'Windows Server 2012 R2 UEFI', 'uefi', 22),
  ('win_2022_lite', 'Windows Server 2022 Lite', 'lite', 23),
  ('win_2016_lite', 'Windows Server 2016 Lite', 'lite', 24),
  ('win_2012R2_lite', 'Windows Server 2012 R2 Lite', 'lite', 25)
ON CONFLICT (id) DO NOTHING;

-- RLS for new tables
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_versions ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings and changelog
CREATE POLICY "settings_read_all" ON app_settings FOR SELECT USING (true);
CREATE POLICY "changelog_read_all" ON changelog FOR SELECT USING (true);
CREATE POLICY "os_read_all" ON os_versions FOR SELECT USING (true);

-- Only admin can write
CREATE POLICY "settings_write_admin" ON app_settings FOR ALL USING (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
);
CREATE POLICY "changelog_write_admin" ON changelog FOR ALL USING (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
);
CREATE POLICY "os_write_admin" ON os_versions FOR ALL USING (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
);
