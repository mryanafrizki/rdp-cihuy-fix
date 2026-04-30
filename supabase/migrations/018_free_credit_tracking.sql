-- Free credit tracking with 7-day expiry
CREATE TABLE IF NOT EXISTS free_credit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  amount NUMERIC NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  expired BOOLEAN NOT NULL DEFAULT FALSE,
  expired_amount NUMERIC DEFAULT '0'
);

CREATE INDEX IF NOT EXISTS idx_fct_user ON free_credit_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_fct_expires ON free_credit_tracking(expires_at);
