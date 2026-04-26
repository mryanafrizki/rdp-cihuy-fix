#!/bin/bash
# Setup environment variables for all apps
# This script copies .env.example files to .env for each app

set -e

echo "Setting up environment files..."

# Copy .env.example to .env for all apps
if [ ! -f "apps/web/.env" ]; then
  cp apps/web/.env.example apps/web/.env
  echo "✓ Created apps/web/.env"
else
  echo "⊘ apps/web/.env already exists (skipped)"
fi

if [ ! -f "apps/worker/.env" ]; then
  cp apps/worker/.env.example apps/worker/.env
  echo "✓ Created apps/worker/.env"
else
  echo "⊘ apps/worker/.env already exists (skipped)"
fi

if [ ! -f "apps/ubuntu-service/.env" ]; then
  cp apps/ubuntu-service/.env.example apps/ubuntu-service/.env
  echo "✓ Created apps/ubuntu-service/.env"
else
  echo "⊘ apps/ubuntu-service/.env already exists (skipped)"
fi

echo ""
echo "Environment files setup complete!"
echo "Please update the .env files with actual values:"
echo "  - Supabase URL and keys from https://supabase.com/dashboard"
echo "  - Atlantic API key from your Atlantic account"
echo "  - Ubuntu webhook URL and API key for your Ubuntu server"
