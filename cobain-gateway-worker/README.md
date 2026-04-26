# Cobain Gateway Worker

Cloudflare Worker sebagai API gateway untuk Cobain RDP Panel.

## Endpoints

| Path | Method | Fungsi |
|------|--------|--------|
| `/health` | GET | Health check |
| `/do/*` | ANY | DigitalOcean API proxy |
| `/payment/create` | POST | Create Atlantic deposit (QRIS) |
| `/payment/status` | POST | Check Atlantic payment status |
| `/payment/cancel` | POST | Cancel Atlantic payment |
| `/webhook/atlantic` | POST | Atlantic webhook receiver |

## Auth

Semua endpoint (kecuali `/webhook/atlantic` dan `/health`) memerlukan header:
```
x-gateway-secret: <GATEWAY_SECRET>
```

DO API proxy juga memerlukan:
```
x-do-token: <DigitalOcean API token>
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set secrets
```bash
wrangler secret put ATLANTIC_API_KEY
wrangler secret put ATLANTIC_USERNAME
wrangler secret put GATEWAY_SECRET
wrangler secret put COBAIN_WEB_URL
```

Values:
- `ATLANTIC_API_KEY`: API key dari Atlantic H2H
- `ATLANTIC_USERNAME`: Username Atlantic (untuk verify webhook signature)
- `GATEWAY_SECRET`: Shared secret antara Worker dan cobain-web (generate: `openssl rand -hex 32`)
- `COBAIN_WEB_URL`: URL cobain-web (e.g. `https://rdp.cobain.dev`)

### 3. Setup domain
Di Cloudflare dashboard:
1. DNS: CNAME `gate1` -> `cobain-gateway.<account>.workers.dev`
2. Atau di wrangler.toml set routes

### 4. Deploy
```bash
npm run deploy
```

### 5. Set webhook di Atlantic H2H
Di halaman API Atlantic H2H, set callback URL:
```
https://gate1.eov.my.id/webhook/atlantic
```

## Routing Webhook

Worker route webhook berdasarkan `reff_id` prefix:

| Prefix | Target |
|--------|--------|
| `topup_*` | cobain-web `/api/topup/webhook` |
| (default) | cobain-web `/api/topup/webhook` |

Tambah project baru: edit `resolveTarget()` di `src/index.ts`.

## DO API Proxy

Contoh call dari cobain-web:
```typescript
// Sebelum (direct ke DO):
fetch('https://api.digitalocean.com/v2/droplets', {
  headers: { Authorization: 'Bearer DO_TOKEN' }
})

// Sesudah (lewat Worker):
fetch('https://gate1.eov.my.id/do/droplets', {
  headers: {
    'x-gateway-secret': 'GATEWAY_SECRET',
    'x-do-token': 'DO_TOKEN'
  }
})
```

DO melihat request dari IP Cloudflare, bukan IP VPS kita.
