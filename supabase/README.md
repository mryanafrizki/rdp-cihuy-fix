# Supabase Setup Instructions

This directory contains database migrations for the RDP Web Panel project.

## Prerequisites

1. Create a Supabase account at https://supabase.com
2. Create a new project via the Supabase dashboard
3. Note down your project credentials from Settings → API:
   - `DATABASE_URL` (PostgreSQL connection string)
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_ANON_KEY` (Public anonymous key)
   - `SUPABASE_SERVICE_KEY` (Service role key - keep secret!)

## Running Migrations

### Option 1: Using Supabase Dashboard (Recommended for first-time setup)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the contents of `migrations/001_initial_schema.sql`
5. Paste into the SQL editor
6. Click **Run** to execute the migration

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

### Option 3: Using psql

```bash
# Set your DATABASE_URL environment variable
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Run the migration
psql $DATABASE_URL -f migrations/001_initial_schema.sql
```

## Verifying the Migration

After running the migration, verify the tables were created:

```bash
# Using psql
psql $DATABASE_URL -c "\dt"

# Expected output: users, transactions, installations, payment_tracking
```

Check table structure:

```bash
psql $DATABASE_URL -c "\d users"
psql $DATABASE_URL -c "\d transactions"
psql $DATABASE_URL -c "\d installations"
psql $DATABASE_URL -c "\d payment_tracking"
```

Check indexes:

```bash
psql $DATABASE_URL -c "\di"
```

## Database Schema

### Tables

1. **users** - User accounts with credit balance and role
   - `id` (UUID, PK)
   - `email` (TEXT, UNIQUE)
   - `role` (TEXT: user, admin, super_admin)
   - `credit_balance` (NUMERIC, default 0)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. **transactions** - Financial transactions (top-ups and deductions)
   - `id` (UUID, PK)
   - `user_id` (UUID, FK → users)
   - `amount` (NUMERIC)
   - `type` (TEXT: topup, deduction)
   - `status` (TEXT: pending, completed, failed)
   - `payment_id` (TEXT, nullable)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

3. **installations** - RDP installation records with progress tracking
   - `id` (UUID, PK)
   - `user_id` (UUID, FK → users)
   - `install_id` (TEXT, UNIQUE)
   - `vps_ip` (TEXT)
   - `windows_version` (TEXT)
   - `rdp_type` (TEXT: docker, dedicated)
   - `status` (TEXT: pending, in_progress, completed, failed)
   - `progress_step` (INT, 0-11)
   - `progress_message` (TEXT, nullable)
   - `created_at`, `updated_at`, `completed_at` (TIMESTAMPTZ)

4. **payment_tracking** - Payment gateway tracking for Atlantic H2H QRIS
   - `id` (UUID, PK)
   - `transaction_id` (UUID, FK → transactions)
   - `qr_code_url` (TEXT)
   - `atlantic_payment_id` (TEXT)
   - `poll_count` (INT, default 0)
   - `expires_at` (TIMESTAMPTZ)
   - `created_at` (TIMESTAMPTZ)

### Indexes

- `idx_users_email` on users(email)
- `idx_transactions_user_id` on transactions(user_id)
- `idx_transactions_status` on transactions(status)
- `idx_installations_user_id` on installations(user_id)
- `idx_installations_status` on installations(status)
- `idx_payment_tracking_transaction_id` on payment_tracking(transaction_id)

## Next Steps

After running the migration:

1. Update your `.env` files with Supabase credentials (see root README.md)
2. Run the environment setup script: `bash scripts/setup-env.sh`
3. Proceed to Task 3: RLS policies setup

## Troubleshooting

**Error: "relation already exists"**
- The migration has already been run. Skip to verification step.

**Error: "permission denied"**
- Make sure you're using the correct DATABASE_URL with proper credentials
- Check that your Supabase project is active and accessible

**Error: "could not connect to server"**
- Verify your DATABASE_URL is correct
- Check your internet connection
- Ensure your Supabase project is not paused
