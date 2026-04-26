-- Add email_confirmed column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Mark all existing users as confirmed
UPDATE users SET email_confirmed = true;

-- Create email_confirm_tokens table
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
