-- Activity log for tracking all cloud actions
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_own" ON activity_log FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "activity_insert" ON activity_log FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "activity_admin" ON activity_log FOR SELECT USING (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'super_admin')
);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);
