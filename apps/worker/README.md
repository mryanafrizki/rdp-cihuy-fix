# Worker App

Cloudflare Workers application for background tasks and processing.

## Setup

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### Wrangler Secrets

For production deployments, use Wrangler to manage secrets securely:

```bash
# Set secrets for production
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put ATLANTIC_API_KEY
wrangler secret put UBUNTU_WEBHOOK_URL
wrangler secret put UBUNTU_API_KEY
```

Each command will prompt you to enter the secret value.

### Development

```bash
# Start development server
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Environment Variables

See root README.md for complete environment variables documentation.
