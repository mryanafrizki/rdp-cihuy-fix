-- Add rdp_password column to installations table
-- Stores the RDP password so users/admins can retrieve it later
ALTER TABLE installations ADD COLUMN IF NOT EXISTS rdp_password TEXT;
