# Cobain RDP Panel

Automated Windows RDP provisioning platform — web panel + Cloudflare Workers.

## Architecture

```
                    ┌─────────────────────────────────┐
                    │  Cloudflare Workers              │
                    │                                  │
                    │  saweria-pg ─── saweria-proxy    │
                    │  (payment)      (VPS/Dokploy)    │
                    │       ↑                          │
                    │  cobain-gateway                  │
                    │  (proxy: payment + DO API)       │
                    │       ↑                          │
                    │  worker-rotate                   │
                    │  (OS image tokens + scripts)     │
                    └──────┬──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│  VPS (Dokploy)                                       │
│                                                      │
│  cobain-web (Next.js :3000) ── PostgreSQL :5432      │
│       │                                              │
│  ubuntu-service (:3001) ── SSH ── VPS Target         │
└──────────────────────────────────────────────────────┘
```

## Minimum Specs

### Single VPS (All-in-One)

| Resource | Minimum | Recommended |
|---|---|---|
| **RAM** | 4 GB | 8 GB |
| **CPU** | 2 vCPU | 4 vCPU |
| **Disk** | 40 GB SSD | 60 GB SSD |
| **OS** | Ubuntu 22.04+ | Ubuntu 24.04 |

> ⚠️ **2 GB RAM TIDAK CUKUP** — Next.js build butuh ~1.5 GB, PostgreSQL + Docker overhead ~1 GB. VPS akan crash saat build.

### Dual VPS (Recommended for Production)

**VPS 1 — Frontend + Database:**

| Resource | Spec |
|---|---|
| RAM | 4 GB+ |
| CPU | 2 vCPU+ |
| Fungsi | cobain-web (Next.js) + PostgreSQL |

**VPS 2 — Backend (SSH Service):**

| Resource | Spec |
|---|---|
| RAM | 2 GB+ |
| CPU | 1 vCPU+ |
| Fungsi | ubuntu-service + saweria-proxy |

> Keuntungan 2 VPS: isolasi security (backend SSH tidak exposed ke internet), build tidak ganggu SSH operations, bisa scale independent.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind 4 |
| Backend | Next.js API Routes + Express (ubuntu-service) |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Auth.js v5 (credentials, bcrypt) |
| Payment | Saweria PG (QRIS) via Cloudflare Gateway Worker |
| Captcha | Cloudflare Turnstile |
| Encryption | AES-256-GCM (data at rest) |
| Deploy | Dokploy (Docker/Nixpacks) |
| Monorepo | Turborepo |

## Key Features

- User registration + email verification (SMTP)
- Free credit on email confirmation (7-day expiry)
- Auto-delete unconfirmed accounts after 3 days
- QRIS topup via Saweria PG
- Order RDP — dedicated (full OS reinstall) or Docker
- OS options: Windows 7-11, Server 2003-2025, Lite editions
- Cloud Manager — DigitalOcean droplets, accounts, proxies
- Admin panel — users, transactions, installations, changelog
- Realtime installation progress tracking
- HMAC request signing (web ↔ ubuntu-service)
- Turnstile captcha (fail-closed)
- Rate limiting on all critical endpoints
- Security headers (HSTS, CSP, X-Frame-Options)
- Telegram notifications

---

## Setup dari 0 (Single VPS)

### Prerequisites

- VPS dengan minimum 4 GB RAM
- Domain yang sudah di-pointing ke Cloudflare DNS
- `wrangler` CLI terinstall di PC lokal (`npm install -g wrangler`)
- Akun Saweria untuk payment gateway

### Urutan Setup

```
Step 1 → Install Dokploy          VPS                 curl install
Step 2 → saweria-proxy            VPS (Dokploy)       Nixpacks app
Step 3 → saweria-pg worker        PC Lokal → CF       Cloudflare Worker + D1
Step 4 → cobain-gateway worker    PC Lokal → CF       Cloudflare Worker
Step 5 → PostgreSQL               VPS (Dokploy)       Database service
Step 6 → ubuntu-service           VPS (Dokploy)       Nixpacks app
Step 7 → cobain-web               VPS (Dokploy)       Nixpacks app
Step 8 → Database migrations      SSH ke VPS          SQL
Step 9 → Create admin             SSH ke VPS          SQL INSERT
Step 10 → Setup cron jobs         cron-job.org        3 cron jobs
```

### Step 1: Install Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Buka `http://VPS_IP:3000`, register admin.

### Step 2: Saweria Proxy (Dokploy)

1. Create Project → Create Application
2. Git: `https://github.com/YOUR_REPO/saweria-pg.git`, branch `main`, build path `/saweria-proxy`
3. Build: **Nixpacks**
4. Environment:
   ```
   PROXY_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))">
   PORT=3001
   ```
5. Domains → tambah domain → port `3001` → HTTPS + Let's Encrypt
6. Deploy

### Step 3: Saweria PG Worker (PC Lokal)

```bash
git clone YOUR_SAWERIA_PG_REPO
cd saweria-pg && npm install
npx wrangler login
npx wrangler d1 create your-db-name
```

Edit `wrangler.jsonc`:
- `name`: nama worker unik
- `database_id`: dari output d1 create
- `PROXY_URL`: domain saweria-proxy dari Step 2
- `PROXY_SECRET`: sama dengan Step 2

Buat tabel D1:
```bash
npx wrangler d1 execute YOUR_DB_NAME --remote --file=schema.sql
npx wrangler d1 execute YOUR_DB_NAME --remote --command="CREATE TABLE IF NOT EXISTS proxies (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))); ALTER TABLE merchants ADD COLUMN proxy_id TEXT REFERENCES proxies(id); ALTER TABLE merchants ADD COLUMN webintercept_url TEXT; ALTER TABLE merchants ADD COLUMN webintercept_secret TEXT;"
```

```bash
npx wrangler secret put ADMIN_API_KEY
npx wrangler deploy
```

Set custom domain di CF dashboard → Workers → Settings → Domains & Routes.

Buat merchant di `/panel` → **Catat**: `spg_xxx` (API key), `whsec_xxx` (webhook secret)

### Step 4: Cobain Gateway Worker (PC Lokal)

```bash
cd cobain-gateway-worker && npm install
```

Edit `wrangler.toml` → ubah `name` ke nama unik.

```bash
npx wrangler secret put SAWERIA_PG_URL          # URL saweria-pg worker
npx wrangler secret put SAWERIA_API_KEY          # spg_xxx dari Step 3
npx wrangler secret put SAWERIA_WEBHOOK_SECRET   # whsec_xxx dari Step 3
npx wrangler secret put GATEWAY_SECRET           # generate random hex 64 chars
npx wrangler secret put COBAIN_WEB_URL           # https://your-domain
npx wrangler deploy
```

Set custom domain di CF dashboard.

### Step 5-7: Dokploy (PostgreSQL + ubuntu-service + cobain-web)

Buat di Dokploy dashboard.

#### PostgreSQL
- Create Database → PostgreSQL 16
- Catat: hostname, username, password, database name

#### ubuntu-service
- Git: repo kamu, branch `main`, build path `/apps/ubuntu-service`
- Build: Nixpacks
- Environment:
  ```
  API_KEY=<generate 64 char hex>
  DATABASE_URL=postgresql://USER:PASS@POSTGRES_HOSTNAME:5432/DBNAME
  WORKER_URL=https://rotate.eov.my.id
  WORKER_API_SECRET=<worker secret>
  PORT=3001
  NODE_ENV=production
  ```

#### cobain-web
- Git: repo kamu, branch `main`, build path `/apps/web`
- Build: Nixpacks
- Domain: your-domain → port 3000 → HTTPS + Let's Encrypt
- Environment:
  ```
  DATABASE_URL=postgresql://USER:PASS@POSTGRES_HOSTNAME:5432/DBNAME
  AUTH_SECRET=<generate base64 32 bytes>
  AUTH_TRUST_HOST=true
  AUTH_URL=https://your-domain
  NEXT_PUBLIC_API_URL=http://localhost:3000
  UBUNTU_WEBHOOK_URL=http://UBUNTU_HOSTNAME:3001
  UBUNTU_SERVICE_URL=http://UBUNTU_HOSTNAME:3001
  UBUNTU_API_KEY=<sama dengan API_KEY di ubuntu-service>
  GATEWAY_URL=https://gateway-worker-domain
  GATEWAY_SECRET=<sama dengan gateway worker>
  WORKER_URL=https://rotate.eov.my.id
  WORKER_API_SECRET=<worker secret>
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=<dari Cloudflare Turnstile>
  TURNSTILE_SECRET_KEY=<dari Cloudflare Turnstile>
  NEXT_PUBLIC_SITE_URL=https://your-domain
  DATA_ENCRYPTION_KEY=<generate 64 char hex — WAJIB>
  CRON_SECRET=<generate 64 char hex — WAJIB>
  SMTP_HOST=smtp.resend.com
  SMTP_PORT=587
  SMTP_USER=resend
  SMTP_PASS=<resend API key>
  SMTP_FROM=noreply@your-domain
  ENVIRONMENT=production
  NODE_ENV=production
  PORT=3000
  ```

> ⚠️ **SEMUA env var WAJIB diisi SEBELUM deploy pertama.**
>
> `DATA_ENCRYPTION_KEY` dan `CRON_SECRET` adalah env var BARU — app crash tanpa ini.
>
> `TURNSTILE_SECRET_KEY` WAJIB — captcha akan reject semua request kalau kosong.

### Step 8: Database Migrations

```bash
ssh root@VPS_IP
CONTAINER=$(docker ps --format "{{.Names}}" | grep YOUR_POSTGRES_CONTAINER)
git clone YOUR_REPO /tmp/rdp
for f in $(ls /tmp/rdp/supabase/migrations/*.sql | sort); do
  echo "Running $(basename $f)..."
  docker exec -i $CONTAINER psql -U DB_USER -d DB_NAME < "$f" 2>/dev/null || true
done
rm -rf /tmp/rdp
```

### Step 9: Create Super Admin

Generate hash (PC lokal):
```bash
node -e "const b=require('bcryptjs');console.log(b.hashSync('YourPassword',12))"
```

Insert (SSH ke VPS):
```bash
docker exec -i $CONTAINER psql -U DB_USER -d DB_NAME -c \
  "INSERT INTO users (email, password_hash, role, email_confirmed) \
   VALUES ('admin@email.com', 'PASTE_HASH', 'super_admin', true) \
   ON CONFLICT (email) DO UPDATE SET password_hash='PASTE_HASH', role='super_admin', email_confirmed=true;"
```

### Step 10: Setup Cron Jobs

Buka [cron-job.org](https://cron-job.org) → Sign Up → buat 3 jobs:

| Job | URL | Schedule | Header |
|---|---|---|---|
| expire-free-credits | `POST https://your-domain/api/cron/expire-free-credits` | Every 1 hour | `x-cron-secret: <CRON_SECRET>` |
| cleanup-unconfirmed | `POST https://your-domain/api/cron/cleanup-unconfirmed` | Every 6 hours | `x-cron-secret: <CRON_SECRET>` |
| process-pending-rdp | `POST https://your-domain/api/cron/process-pending-rdp` | Every 2 minutes | `x-cron-secret: <CRON_SECRET>` |

Tambah header `Content-Type: application/json` di setiap job.

---

## Setup 2 VPS (Production)

### VPS 1 — Frontend + Database

Install Dokploy, deploy:
- PostgreSQL
- cobain-web

### VPS 2 — Backend

Install Dokploy, deploy:
- ubuntu-service
- saweria-proxy

### Konfigurasi

1. **VPS 2** harus bisa diakses dari VPS 1 via internal network atau public IP
2. Di cobain-web env vars, ubah:
   ```
   UBUNTU_SERVICE_URL=http://VPS2_IP:3001    # atau internal hostname
   UBUNTU_WEBHOOK_URL=http://VPS2_IP:3001
   ```
3. Di ubuntu-service env vars, `DATABASE_URL` harus pointing ke PostgreSQL di VPS 1:
   ```
   DATABASE_URL=postgresql://USER:PASS@VPS1_IP:5432/DBNAME
   ```
4. PostgreSQL di VPS 1 perlu expose external port (Dokploy → Database → External Port → set port, misal 5432)
5. PostgreSQL `pg_hba.conf` perlu allow connection dari VPS 2 IP

### Keuntungan 2 VPS

- **Security**: ubuntu-service (yang SSH ke target VPS) terisolasi dari frontend
- **Performance**: Next.js build tidak ganggu SSH operations
- **Scaling**: bisa upgrade VPS frontend tanpa affect backend, dan sebaliknya
- **Reliability**: kalau satu VPS down, yang lain tetap jalan

---

## DNS Setup (Cloudflare)

| Subdomain | Type | Content | Proxy |
|---|---|---|---|
| `your-web-domain` | A | VPS IP | DNS only (grey) |
| `your-proxy-domain` | A | VPS IP | DNS only (grey) |
| `your-gateway-domain` | — | *(CF Worker custom domain)* | — |
| `your-saweria-pg-domain` | — | *(CF Worker custom domain)* | — |

> ⚠️ **Jangan pakai Cloudflare Proxy (orange cloud)** untuk domain Dokploy — akan conflict dengan Let's Encrypt ACME challenge. Pakai **DNS only (grey cloud)**.

---

## SMTP (Email Verification)

| Provider | Host | Port | Password |
|---|---|---|---|
| **Resend** | `smtp.resend.com` | `587` | API key dari resend.com |
| **Gmail** | `smtp.gmail.com` | `465` | App Password |
| **Brevo** | `smtp-relay.brevo.com` | `587` | SMTP key dari brevo.com |

---

## Turnstile (Captcha)

1. Cloudflare Dashboard → Turnstile → Add Site
2. Update cobain-web environment:
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key
   TURNSTILE_SECRET_KEY=your-secret-key
   ```
3. Redeploy cobain-web

> ⚠️ `TURNSTILE_SECRET_KEY` WAJIB di-set. Kalau kosong, semua request yang butuh captcha akan ditolak.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `relation "users" does not exist` | Jalankan migrations (Step 8) |
| `DATA_ENCRYPTION_KEY environment variable is required` | Set `DATA_ENCRYPTION_KEY` di env vars |
| Turnstile "Security verification failed" | Cek `TURNSTILE_SECRET_KEY` sudah di-set |
| Payment QR not showing | Cek `GATEWAY_URL` + `GATEWAY_SECRET` |
| OS versions dropdown empty | Jalankan migration 017 |
| Domain 404 di Dokploy | Matikan Cloudflare Proxy (pakai DNS only) |
| `wrangler login` gagal di VPS | Normal — deploy workers dari PC lokal saja |
| Build OOM killed | VPS RAM kurang — minimum 4 GB, tambah swap 4 GB |
| Saweria 403 | saweria-proxy perlu pakai curl mode (bukan fetch) |
| Free credit tidak muncul | Cek migration 018 sudah jalan + `free_credit` setting enabled di admin |

---

## Ports After RDP Install

| Service | Port | Protocol | Credentials |
|---|---|---|---|
| **RDP** | `22` | Remote Desktop | `administrator` / password dari order |
| **SSH** | `2222` | OpenSSH Server | `administrator` / password sama |
