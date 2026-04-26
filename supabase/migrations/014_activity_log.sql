CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_select_admin" ON activity_log FOR SELECT 
  USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "activity_log_insert_authenticated" ON activity_log FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);
