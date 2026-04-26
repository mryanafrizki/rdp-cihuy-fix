/**
 * User entity type
 */
export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin' | 'super_admin';
  credit_balance: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Transaction entity type
 */
export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'topup' | 'deduction';
  status: 'pending' | 'completed' | 'failed';
  payment_id?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Installation entity type
 */
export interface Installation {
  id: string;
  user_id: string;
  install_id: string;
  vps_ip: string;
  windows_version: string;
  rdp_type: 'docker' | 'dedicated';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress_step: number;
  progress_message?: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

/**
 * Payment tracking entity type
 */
export interface PaymentTracking {
  id: string;
  transaction_id: string;
  qr_code_url: string;
  atlantic_payment_id: string;
  poll_count: number;
  expires_at: Date;
  created_at: Date;
}
