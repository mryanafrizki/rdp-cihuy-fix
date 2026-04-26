-- Atomic balance deduction (prevents race condition double-spend)
CREATE OR REPLACE FUNCTION deduct_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE users 
  SET credit_balance = credit_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id AND credit_balance >= p_amount
  RETURNING credit_balance INTO new_balance;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic balance addition (prevents race condition double-credit)
CREATE OR REPLACE FUNCTION add_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE users 
  SET credit_balance = credit_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credit_balance;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic payment completion (prevents double-credit)
CREATE OR REPLACE FUNCTION complete_payment(p_transaction_id UUID, p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  was_pending BOOLEAN;
BEGIN
  -- Only update if currently pending (atomic check-and-set)
  UPDATE transactions 
  SET status = 'completed', updated_at = now()
  WHERE id = p_transaction_id AND status = 'pending'
  RETURNING TRUE INTO was_pending;
  
  IF was_pending THEN
    -- Add credit
    UPDATE users SET credit_balance = credit_balance + p_amount, updated_at = now()
    WHERE id = p_user_id;
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
