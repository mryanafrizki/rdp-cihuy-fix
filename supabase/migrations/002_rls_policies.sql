-- RLS POLICIES - FIXED (uses JWT app_metadata, no infinite recursion)
-- To set admin: UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = 'admin@example.com';

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_tracking ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_select_admin" ON users FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_update_admin" ON users FOR UPDATE USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "users_insert_service" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_delete_admin" ON users FOR DELETE USING (coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin');

-- TRANSACTIONS
CREATE POLICY "transactions_select_own" ON transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "transactions_select_admin" ON transactions FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "transactions_insert_authenticated" ON transactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "transactions_update_admin" ON transactions FOR UPDATE USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin') OR auth.uid() = user_id);

-- INSTALLATIONS
CREATE POLICY "installations_select_own" ON installations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "installations_select_admin" ON installations FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "installations_insert_authenticated" ON installations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "installations_update_authenticated" ON installations FOR UPDATE USING (user_id = auth.uid() OR coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));

-- PAYMENT_TRACKING
CREATE POLICY "payment_tracking_select_own" ON payment_tracking FOR SELECT USING (EXISTS (SELECT 1 FROM transactions t WHERE t.id = payment_tracking.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "payment_tracking_select_admin" ON payment_tracking FOR SELECT USING (coalesce(auth.jwt()->'app_metadata'->>'role','') IN ('admin','super_admin'));
CREATE POLICY "payment_tracking_insert_authenticated" ON payment_tracking FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "payment_tracking_update_authenticated" ON payment_tracking FOR UPDATE USING (auth.uid() IS NOT NULL);
