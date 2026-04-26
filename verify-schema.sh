#!/bin/bash

# Supabase Schema Verification Script
# This script verifies that all required tables and indexes exist

echo "=== Supabase Schema Verification ==="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable not set"
  echo "Please set DATABASE_URL in .env.local"
  exit 1
fi

echo "Connecting to database..."
echo ""

# Verify tables exist
echo "=== Verifying Tables ==="
psql $DATABASE_URL -c "\dt" | tee task-2-schema.txt
echo ""

# Verify users table structure
echo "=== Users Table Structure ==="
psql $DATABASE_URL -c "\d users" | tee -a task-2-schema.txt
echo ""

# Verify transactions table structure
echo "=== Transactions Table Structure ==="
psql $DATABASE_URL -c "\d transactions" | tee -a task-2-schema.txt
echo ""

# Verify installations table structure
echo "=== Installations Table Structure ==="
psql $DATABASE_URL -c "\d installations" | tee -a task-2-schema.txt
echo ""

# Verify payment_tracking table structure
echo "=== Payment Tracking Table Structure ==="
psql $DATABASE_URL -c "\d payment_tracking" | tee -a task-2-schema.txt
echo ""

# Verify indexes
echo "=== Verifying Indexes ==="
psql $DATABASE_URL -c "\di" | tee task-2-indexes.txt
echo ""

echo "=== Verification Complete ==="
echo "Schema verification saved to:"
echo "  - task-2-schema.txt"
echo "  - task-2-indexes.txt"
