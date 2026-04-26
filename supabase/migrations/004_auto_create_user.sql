-- Auto-create public.users row when a new user signs up via Supabase Auth
-- This trigger fires AFTER INSERT on auth.users

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, credit_balance)
  VALUES (NEW.id, NEW.email, 'user', 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Also backfill any existing auth users that don't have a public.users row
INSERT INTO public.users (id, email, role, credit_balance)
SELECT id, email, 'user', 0
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO NOTHING;
