# Cloudflare Workers Secrets Setup

This document describes how to configure secrets for the RDP Web Panel Worker in Cloudflare.

## Overview

Secrets are sensitive values (API keys, passwords, URLs) that should never be committed to version control. They are managed via the Wrangler CLI and stored securely in Cloudflare.

## Development Environment

Set development secrets locally:

```bash
wrangler secret put SUPABASE_SERVICE_KEY --env development
wrangler secret put ATLANTIC_API_KEY --env development
wrangler secret put UBUNTU_API_KEY --env development
```

When prompted, paste the actual secret value. It will be encrypted and stored in your local Wrangler configuration.

## Production Environment

Set production secrets in Cloudflare:

```bash
wrangler secret put SUPABASE_URL --env production
wrangler secret put SUPABASE_ANON_KEY --env production
wrangler secret put SUPABASE_SERVICE_KEY --env production
wrangler secret put ATLANTIC_API_KEY --env production
wrangler secret put UBUNTU_WEBHOOK_URL --env production
wrangler secret put UBUNTU_API_KEY --env production
```

Each command will prompt you to enter the secret value. These are stored securely in Cloudflare and are not accessible via the dashboard.

## Required Secrets

| Secret | Environment | Description | Source |
|--------|-------------|-------------|--------|
| `SUPABASE_URL` | production | Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | production | Supabase anonymous key | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_KEY` | both | Supabase service role key | Supabase Dashboard → Settings → API |
| `ATLANTIC_API_KEY` | both | Atlantic API authentication key | Atlantic Account Settings |
| `UBUNTU_WEBHOOK_URL` | production | Ubuntu service webhook endpoint | Ubuntu Service Configuration |
| `UBUNTU_API_KEY` | both | Ubuntu service API key | Ubuntu Service Configuration |

## Verification

List all secrets for an environment:

```bash
wrangler secret list --env development
wrangler secret list --env production
```

## Deployment

Deploy with production secrets:

```bash
wrangler deploy --env production
```

The worker will automatically use the production secrets when running in the production environment.

## Security Best Practices

1. **Never commit secrets** - `.env` files are in `.gitignore`
2. **Use strong values** - Generate random API keys when possible
3. **Rotate regularly** - Update secrets periodically
4. **Limit access** - Only share secrets with authorized team members
5. **Use environment separation** - Keep development and production secrets separate
