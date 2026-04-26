-- 009_security_fixes.sql
-- Fix CRITICAL + HIGH security vulnerabilities

-- Prevent duplicate refunds (atomic constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payment_id_unique 
ON transactions (payment_id) WHERE payment_id IS NOT NULL AND payment_id LIKE 'refund_%';

-- Fix: Users can only insert their own row
DROP POLICY IF EXISTS "users_insert_service" ON users;
CREATE POLICY "users_insert_own" ON users 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Fix: Users can only update safe columns (NOT credit_balance, NOT role)
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users 
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    -- Prevent changing role or credit_balance via direct API
    role = (SELECT role FROM users WHERE id = auth.uid()) AND
    credit_balance = (SELECT credit_balance FROM users WHERE id = auth.uid())
  );

-- Fix: Transactions INSERT must match own user_id
DROP POLICY IF EXISTS "transactions_insert_authenticated" ON transactions;
CREATE POLICY "transactions_insert_own" ON transactions 
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Fix: Installations INSERT must match own user_id
DROP POLICY IF EXISTS "installations_insert_authenticated" ON installations;
CREATE POLICY "installations_insert_own" ON installations 
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Fix: payment_tracking UPDATE restricted to own transactions
DROP POLICY IF EXISTS "payment_tracking_update_authenticated" ON payment_tracking;
CREATE POLICY "payment_tracking_update_own" ON payment_tracking 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM transactions t WHERE t.id = payment_tracking.transaction_id AND t.user_id = auth.uid())
  );
