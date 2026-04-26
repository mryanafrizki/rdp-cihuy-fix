import { z } from 'zod';
import { WINDOWS_VERSIONS } from './constants';

/**
 * IP address validation schema
 * Validates IPv4 format and ensures valid IP ranges
 */
export const ipAddressSchema = z
  .string()
  .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IP address format')
  .refine(
    (ip) => {
      const parts = ip.split('.').map(Number);
      return parts.every((part) => part >= 0 && part <= 255);
    },
    { message: 'IP address octets must be between 0 and 255' }
  );

/**
 * Password validation schema
 * Requires minimum 8 characters with at least one letter and one digit
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/^(?=.*[a-zA-Z])/, 'Password must contain at least one letter')
  .regex(/^(?=.*\d)/, 'Password must contain at least one digit');

/**
 * Email validation schema
 */
export const emailSchema = z.string().email('Invalid email address');

/**
 * Windows version validation schema
 * Validates against available Windows versions
 */
export const windowsVersionSchema = z.enum(
  WINDOWS_VERSIONS.map((v) => v.name) as [string, ...string[]]
);

/**
 * User validation schema
 */
export const userSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  role: z.enum(['user', 'admin', 'super_admin']),
  credit_balance: z.number().nonnegative(),
  created_at: z.date(),
  updated_at: z.date(),
});

/**
 * Transaction validation schema
 */
export const transactionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(['topup', 'deduction']),
  status: z.enum(['pending', 'completed', 'failed']),
  payment_id: z.string().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

/**
 * Installation validation schema
 */
export const installationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  install_id: z.string(),
  vps_ip: ipAddressSchema,
  windows_version: windowsVersionSchema,
  rdp_type: z.enum(['docker', 'dedicated']),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  progress_step: z.number().nonnegative(),
  progress_message: z.string().optional(),
  created_at: z.date(),
  updated_at: z.date(),
  completed_at: z.date().optional(),
});

/**
 * Payment tracking validation schema
 */
export const paymentTrackingSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  qr_code_url: z.string().url(),
  atlantic_payment_id: z.string(),
  poll_count: z.number().nonnegative(),
  expires_at: z.date(),
  created_at: z.date(),
});
