-- FIX: Drop old RLS policies that cause infinite recursion, then recreate
-- Run this in Supabase SQL Editor if you already ran the old 002_rls_policies.sql
-- To set admin: UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = 'admin@example.com';

DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_select_admin" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_update_admin" ON users;
DROP POLICY IF EXISTS "users_insert_service" ON users;
DROP POLICY IF EXISTS "users_delete_admin" ON users;
DROP POLICY IF EXISTS "transactions_select_own" ON transactions;
DROP POLICY IF EXISTS "transactions_select_admin" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_service" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_authenticated" ON transactions;
DROP POLICY IF EXISTS "transactions_update_service" ON transactions;
DROP POLICY IF EXISTS "transactions_update_admin" ON transactions;
DROP POLICY IF EXISTS "installations_select_own" ON installations;
DROP POLICY IF EXISTS "installations_select_admin" ON installations;
DROP POLICY IF EXISTS "installations_insert_service" ON installations;
DROP POLICY IF EXISTS "installations_insert_authenticated" ON installations;
DROP POLICY IF EXISTS "installations_update_service" ON installations;
DROP POLICY IF EXISTS "installations_update_authenticated" ON installations;
DROP POLICY IF EXISTS "payment_tracking_select_own" ON payment_tracking;
DROP POLICY IF EXISTS "payment_tracking_select_admin" ON payment_tracking;
DROP POLICY IF EXISTS "payment_tracking_insert_authenticated" ON payment_tracking;
DROP POLICY IF EXISTS "payment_tracking_update_authenticated" ON payment_tracking;

-- Recreate all policies (fixed - no infinite recursion)
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_select_admin" ON users FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_update_admin" ON users FOR UPDATE USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "users_insert_service" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_delete_admin" ON users FOR DELETE USING (coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin');

CREATE POLICY "transactions_select_own" ON transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "transactions_select_admin" ON transactions FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "transactions_insert_authenticated" ON transactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "transactions_update_admin" ON transactions FOR UPDATE USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin') OR auth.uid() = user_id);

CREATE POLICY "installations_select_own" ON installations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "installations_select_admin" ON installations FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "installations_insert_authenticated" ON installations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "installations_update_authenticated" ON installations FOR UPDATE USING (user_id = auth.uid() OR coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));

CREATE POLICY "payment_tracking_select_own" ON payment_tracking FOR SELECT USING (EXISTS (SELECT 1 FROM transactions t WHERE t.id = payment_tracking.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "payment_tracking_select_admin" ON payment_tracking FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "payment_tracking_insert_authenticated" ON payment_tracking FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "payment_tracking_update_authenticated" ON payment_tracking FOR UPDATE USING (auth.uid() IS NOT NULL);
