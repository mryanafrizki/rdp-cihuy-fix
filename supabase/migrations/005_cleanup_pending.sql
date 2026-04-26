-- Delete all pending payment tracking records
DELETE FROM payment_tracking 
WHERE transaction_id IN (SELECT id FROM transactions WHERE status = 'pending');

-- Delete all pending transactions
DELETE FROM transactions WHERE status = 'pending';
