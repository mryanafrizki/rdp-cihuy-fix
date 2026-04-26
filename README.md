# Cobain RDP Panel

Automated Windows RDP provisioning platform — web panel + Cloudflare Workers.

> 🇮🇩 [Versi Bahasa Indonesia](#versi-bahasa-indonesia) ada di bawah.

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
│  Dokploy VPS                                         │
│                                                      │
│  cobain-web (Next.js :3000) ── PostgreSQL :5432      │
│       │                                              │
│  ubuntu-service (:3001) ── SSH ── VPS Target         │
└──────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind 4 |
| Backend | Next.js API Routes + Express (ubuntu-service) |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Auth.js v5 (credentials, bcrypt) |
| Payment | Saweria PG (QRIS) via Cloudflare Gateway Worker |
| Captcha | Cloudflare Turnstile (env var configurable) |
| Deploy | Dokploy (Docker/Nixpacks) |
| Monorepo | Turborepo |

## Setup Order (from scratch)

```
Step 1 → saweria-proxy         Dokploy VPS           Docker container
Step 2 → saweria-pg            Local PC → CF         Cloudflare Worker + D1
Step 3 → cobain-gateway        Local PC → CF         Cloudflare Worker
Step 4 → PostgreSQL            Dokploy VPS           Database service
Step 5 → ubuntu-service        Dokploy VPS           Nixpacks application
Step 6 → cobain-web            Dokploy VPS           Nixpacks application
Step 7 → Database migrations   SSH to VPS            SQL
Step 8 → Create admin          SSH to VPS            SQL INSERT
```

> **Workers** (Step 1-3): deploy from **local PC** — requires `wrangler login` + browser.
> **VPS** (Step 4-8): setup via **Dokploy dashboard** + **SSH**.

---

### Step 1: Saweria Proxy (Dokploy)

1. Install Dokploy: `curl -sSL https://dokploy.com/install.sh | sh`
2. Open `http://VPS_IP:3000`, register admin
3. Create Project → Create Application
4. Git: `https://github.com/mryanafrizki/saweria-pg.git`, branch `main`, build path `/saweria-proxy`
5. Build: **Dockerfile**
6. Environment:
   ```
   PROXY_SECRET=your_proxy_secret
   PORT=3001
   ```
7. Domains → Generate → port `3001`
8. Deploy

**Save:** `PROXY_URL` (domain) + `PROXY_SECRET`

### Step 2: Saweria PG Worker (Local PC)

```bash
git clone https://github.com/mryanafrizki/saweria-pg.git
cd saweria-pg && npm install
npx wrangler login
npx wrangler d1 create your-db-name
```

Edit `wrangler.jsonc` → set `database_id`, `PROXY_URL`, `PROXY_SECRET`.

Create tables in **Cloudflare Dashboard → D1 → Console** (see SQL in full guide below).

```bash
npx wrangler secret put ADMIN_API_KEY
npx wrangler deploy
```

Create merchant at `/panel` → **Save:** `spg_xxx` (API key) + `whsec_xxx` (webhook secret)

### Step 3: Cobain Gateway Worker (Local PC)

```bash
cd cobain-gateway-worker && npm install
npx wrangler secret put SAWERIA_PG_URL          # from Step 2
npx wrangler secret put SAWERIA_API_KEY          # spg_xxx from Step 2
npx wrangler secret put SAWERIA_WEBHOOK_SECRET   # whsec_xxx from Step 2
npx wrangler secret put GATEWAY_SECRET           # generate random hex
npx wrangler secret put COBAIN_WEB_URL           # https://your-domain
npx wrangler deploy
```

**Save:** gateway URL + `GATEWAY_SECRET`

### Step 4-6: Dokploy (PostgreSQL + ubuntu-service + cobain-web)

Create in Dokploy dashboard. **Full environment variables below.**

#### ubuntu-service Environment

```
API_KEY=your_shared_api_key
DATABASE_URL=postgresql://USER:PASS@POSTGRES_HOSTNAME:5432/DBNAME
WORKER_URL=https://rotate.eov.my.id
WORKER_API_SECRET=your_worker_secret
PORT=3001
NODE_ENV=production
```

#### cobain-web Environment

> **⚠️ ALL variables must be set BEFORE first deploy.**

```
DATABASE_URL=postgresql://USER:PASS@POSTGRES_HOSTNAME:5432/DBNAME
AUTH_SECRET=random_base64_string
AUTH_TRUST_HOST=true
AUTH_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=http://localhost:3000
UBUNTU_WEBHOOK_URL=http://UBUNTU_SERVICE_HOSTNAME:3001
UBUNTU_SERVICE_URL=http://UBUNTU_SERVICE_HOSTNAME:3001
UBUNTU_API_KEY=same_as_ubuntu_service_API_KEY
ENVIRONMENT=production
NODE_ENV=production
PORT=3000
GATEWAY_URL=https://your-gateway-worker-url
GATEWAY_SECRET=your_gateway_secret
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
NEXT_PUBLIC_SITE_URL=https://your-domain.com
WORKER_URL=https://rotate.eov.my.id
WORKER_API_SECRET=your_worker_secret
```

**Checklist before deploy:**
- [ ] `DATABASE_URL` — PostgreSQL internal hostname from Step 4
- [ ] `UBUNTU_SERVICE_URL` — ubuntu-service internal hostname from Step 5
- [ ] `UBUNTU_API_KEY` — matches `API_KEY` in ubuntu-service
- [ ] `GATEWAY_URL` — gateway worker URL from Step 3
- [ ] `GATEWAY_SECRET` — secret from Step 3
- [ ] `WORKER_URL` — worker-rotate URL (for dedicated RDP install)
- [ ] `WORKER_API_SECRET` — worker-rotate secret

#### Production Example

```
DATABASE_URL=postgresql://aiserve:Bakso123@rdp-aiserve-jgg9ch:5432/aiserve
AUTH_SECRET=k9Xm2pL7vR4wQ8nJ3hF6tY1bA5cE0gUi
AUTH_TRUST_HOST=true
AUTH_URL=https://rdp.ceo-aiserve.web.id
NEXT_PUBLIC_API_URL=http://localhost:3000
UBUNTU_WEBHOOK_URL=http://rdp-ubuntusvice-sxshsg:3001
UBUNTU_SERVICE_URL=http://rdp-ubuntusvice-sxshsg:3001
UBUNTU_API_KEY=fd18875900a62f0e89464dfb505567d450694cc77d835f1345e1e45074348f2f
ENVIRONMENT=production
NODE_ENV=production
PORT=3000
GATEWAY_URL=https://gate.ceo-aiserve.web.id
GATEWAY_SECRET=5ff62de724cba90765d9869673dbc4bd8f9d9c9b49ebe027fd36dea03b61207c
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
NEXT_PUBLIC_SITE_URL=https://rdp.ceo-aiserve.web.id
WORKER_URL=https://rotate.eov.my.id
WORKER_API_SECRET=cd5d63a6bfaea35d4623a0728e694437
```

### Step 7: Database Migrations

```bash
ssh root@VPS_IP
CONTAINER=$(docker ps --format "{{.Names}}" | grep postgres | grep -v dokploy)
git clone https://github.com/mryanafrizki/rdp-cihuy.git /tmp/rdp
for f in $(ls /tmp/rdp/supabase/migrations/*.sql | sort); do
  echo "Running $(basename $f)..."
  docker exec -i $CONTAINER psql -U DB_USER -d DB_NAME < "$f" 2>/dev/null || true
done
rm -rf /tmp/rdp
```

### Step 8: Create Super Admin

Generate hash (local PC):
```bash
node -e "const b=require('bcryptjs');console.log(b.hashSync('YourPassword',12))"
```

Insert (SSH to VPS):
```bash
docker exec -i $CONTAINER psql -U DB_USER -d DB_NAME -c \
  "INSERT INTO users (email, password_hash, role, email_confirmed) \
   VALUES ('admin@email.com', 'PASTE_HASH', 'super_admin', true) \
   ON CONFLICT (email) DO UPDATE SET password_hash='PASTE_HASH', role='super_admin', email_confirmed=true;"
```

---

## Additional Guides

- **[BUILD-GUIDE.md](./BUILD-GUIDE.md)** — Compile RDP installer binary (.img), encrypt scripts, change PC name
- **[saweria-pg API Docs](https://github.com/mryanafrizki/saweria-pg)** — Payment gateway API

## SMTP (Email Verification)

Optional. Add to cobain-web environment:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
SMTP_FROM=noreply@yourdomain.com
```

| Provider | Host | Port | Password |
|---|---|---|---|
| **Resend** | `smtp.resend.com` | `465` | API key from resend.com |
| **Gmail** | `smtp.gmail.com` | `465` | App Password (not regular password) |
| **Brevo** | `smtp-relay.brevo.com` | `587` | SMTP key from brevo.com |

## Turnstile (Production Captcha)

Default: test keys (always passes). For production:

1. Cloudflare Dashboard → Turnstile → Add Site
2. Update cobain-web environment:
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-real-site-key
   TURNSTILE_SECRET_KEY=your-real-secret-key
   ```
3. Redeploy cobain-web

## Change PC Name

Edit `rdp/scripts/windows-change-rdp-port.bat` line 12:
```bat
set "NEWNAME=COBAIN-DEV"
```
Change `COBAIN-DEV` to your desired name, then rebuild binary (see [BUILD-GUIDE.md](./BUILD-GUIDE.md)).

## Ports After RDP Install

After dedicated RDP installation completes:

| Service | Port | Protocol | Credentials |
|---|---|---|---|
| **RDP** | `22` | Remote Desktop | `administrator` / password from order |
| **SSH** | `2222` | OpenSSH Server | `administrator` / same password |

SSH is auto-installed (OpenSSH Server) on Windows during post-install. To change ports, edit `rdp/scripts/windows-change-rdp-port.bat` and rebuild binary.

## Troubleshooting

| Error | Fix |
|---|---|
| `relation "users" does not exist` | Run migrations (Step 7) |
| `Missing HMAC headers` | Fixed in repo — redeploy cobain-web |
| Turnstile "Security verification failed" | Check Turnstile env vars match |
| Payment QR not showing | Check `GATEWAY_URL` + `GATEWAY_SECRET` |
| OS versions dropdown empty | Run migration 017 — fixes categories |
| Domain 404 in Dokploy | HTTPS ON + Certificate Provider = None → use Let's Encrypt or disable HTTPS |
| `wrangler login` fails on VPS | Normal — deploy workers from local PC only |
| `bash: syntax error near &&` | Fixed in repo — redeploy ubuntu-service |
| Install killed mid-progress | Don't redeploy during active RDP installation |
| `invalid email pass` | Password hash wrong — regenerate with bcryptjs (Step 8) |
| `Cannot read properties (prepare)` | D1 database_id wrong in wrangler.jsonc |
| Saweria `404 Not Found` | User ID must be UUID — repo auto-resolves username |

---

## Key Features

- User registration + email verification
- QRIS topup via Saweria PG
- Order RDP — dedicated (full OS reinstall) or Docker
- OS options: Windows 7-11, Server 2003-2025, Lite editions
- Cloud Manager — DigitalOcean droplets, accounts, proxies
- Admin panel — users, transactions, installations, changelog
- Realtime installation progress tracking
- HMAC request signing (web ↔ ubuntu-service)
- Turnstile captcha (configurable via env var)
- Rate limiting on all critical endpoints
- Telegram notifications

---

---

# Versi Bahasa Indonesia

## Setup dari 0 (Urutan Wajib)

```
Step 1 → saweria-proxy         VPS Dokploy           Docker container
Step 2 → saweria-pg            PC Lokal → CF         Cloudflare Worker + D1
Step 3 → cobain-gateway        PC Lokal → CF         Cloudflare Worker
Step 4 → PostgreSQL            VPS Dokploy           Database service
Step 5 → ubuntu-service        VPS Dokploy           Aplikasi Nixpacks
Step 6 → cobain-web            VPS Dokploy           Aplikasi Nixpacks
Step 7 → Migrasi database      SSH ke VPS            SQL
Step 8 → Buat admin            SSH ke VPS            SQL INSERT
```

> **Workers** (Step 1-3): deploy dari **PC lokal** — butuh `wrangler login` + browser.
> **VPS** (Step 4-8): setup via **Dokploy dashboard** + **SSH**.

### Step 1: Saweria Proxy (Dokploy)

1. Install Dokploy di VPS: `curl -sSL https://dokploy.com/install.sh | sh`
2. Buka `http://IP_VPS:3000`, daftar admin
3. Buat Project → Buat Application
4. Git: `https://github.com/mryanafrizki/saweria-pg.git`, branch `main`, build path `/saweria-proxy`
5. Build: **Dockerfile**
6. Environment:
   ```
   PROXY_SECRET=secret_proxy_kamu
   PORT=3001
   ```
7. Domains → Generate → port `3001`
8. Deploy
9. Test: buka domain → harus return `{"status":"ok","service":"saweria-proxy"}`

**Catat:** `PROXY_URL` (domain) + `PROXY_SECRET`

### Step 2: Saweria PG Worker (PC Lokal)

```bash
git clone https://github.com/mryanafrizki/saweria-pg.git
cd saweria-pg && npm install
npx wrangler login
npx wrangler d1 create nama-db-kamu
```

Edit `wrangler.jsonc` → isi `database_id`, `PROXY_URL`, `PROXY_SECRET`.

Buat tabel di **Cloudflare Dashboard → D1 → database → Console** — jalankan SQL satu per satu (lihat guide lengkap di atas).

```bash
npx wrangler secret put ADMIN_API_KEY    # password panel admin
npx wrangler deploy
```

Buat merchant di panel (`/panel`):
- Saweria User ID: username saweria (auto-resolve ke UUID)

**Catat:** URL worker, `spg_xxx` (API key), `whsec_xxx` (webhook secret)

### Step 3: Cobain Gateway Worker (PC Lokal)

```bash
cd cobain-gateway-worker && npm install
npx wrangler secret put SAWERIA_PG_URL          # URL dari Step 2
npx wrangler secret put SAWERIA_API_KEY          # spg_xxx dari Step 2
npx wrangler secret put SAWERIA_WEBHOOK_SECRET   # whsec_xxx dari Step 2
npx wrangler secret put GATEWAY_SECRET           # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put COBAIN_WEB_URL           # https://domain-kamu
npx wrangler deploy
```

**Catat:** URL gateway + `GATEWAY_SECRET`

### Step 4-6: Dokploy (PostgreSQL + ubuntu-service + cobain-web)

Buat di Dokploy dashboard. Environment variables lengkap ada di bagian English di atas.

> **⚠️ SEMUA environment variable WAJIB diisi SEBELUM deploy pertama kali.**

**Checklist sebelum deploy cobain-web:**
- [ ] `DATABASE_URL` — hostname PostgreSQL internal dari Step 4
- [ ] `UBUNTU_SERVICE_URL` — hostname ubuntu-service internal dari Step 5
- [ ] `UBUNTU_API_KEY` — harus sama dengan `API_KEY` di ubuntu-service
- [ ] `GATEWAY_URL` — URL gateway worker dari Step 3
- [ ] `GATEWAY_SECRET` — secret dari Step 3
- [ ] `WORKER_URL` — URL worker-rotate (untuk install RDP dedicated)
- [ ] `WORKER_API_SECRET` — secret worker-rotate

### Step 7: Migrasi Database

```bash
ssh root@IP_VPS
CONTAINER=$(docker ps --format "{{.Names}}" | grep postgres | grep -v dokploy)
git clone https://github.com/mryanafrizki/rdp-cihuy.git /tmp/rdp
for f in $(ls /tmp/rdp/supabase/migrations/*.sql | sort); do
  echo "Running $(basename $f)..."
  docker exec -i $CONTAINER psql -U USER_DB -d NAMA_DB < "$f" 2>/dev/null || true
done
rm -rf /tmp/rdp
```

### Step 8: Buat Super Admin

Generate hash (PC lokal):
```bash
node -e "const b=require('bcryptjs');console.log(b.hashSync('PasswordKamu',12))"
```

Insert (SSH ke VPS):
```bash
docker exec -i $CONTAINER psql -U USER_DB -d NAMA_DB -c \
  "INSERT INTO users (email, password_hash, role, email_confirmed) \
   VALUES ('admin@email.com', 'PASTE_HASH', 'super_admin', true) \
   ON CONFLICT (email) DO UPDATE SET password_hash='PASTE_HASH', role='super_admin', email_confirmed=true;"
```

### Ganti Nama PC

Edit `rdp/scripts/windows-change-rdp-port.bat` baris 12:
```bat
set "NEWNAME=COBAIN-DEV"
```
Ganti `COBAIN-DEV` ke nama yang kamu mau, lalu rebuild binary (lihat [BUILD-GUIDE.md](./BUILD-GUIDE.md)).

### Port Setelah Install RDP

Setelah install RDP dedicated selesai:

| Service | Port | Akses | Credentials |
|---|---|---|---|
| **RDP** | `22` | Remote Desktop Client | `administrator` / password dari order |
| **SSH** | `2222` | Terminal/PuTTY | `administrator` / password sama |

SSH (OpenSSH Server) otomatis di-install di Windows saat post-install. Untuk ganti port, edit `rdp/scripts/windows-change-rdp-port.bat` lalu rebuild binary.

### SMTP (Email Verifikasi)

Opsional. Tambah di environment cobain-web:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
SMTP_FROM=noreply@domain-kamu.com
```

### Turnstile (Captcha Production)

Default: test keys (selalu lolos). Untuk production:

1. Cloudflare Dashboard → Turnstile → Add Site
2. Update environment cobain-web:
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=site-key-asli
   TURNSTILE_SECRET_KEY=secret-key-asli
   ```
3. Redeploy cobain-web

### Troubleshooting

| Error | Solusi |
|---|---|
| `relation "users" does not exist` | Jalankan migrasi (Step 7) |
| `Missing HMAC headers` | Sudah fix di repo — redeploy cobain-web |
| Turnstile "Security verification failed" | Cek env var Turnstile cocok |
| QR pembayaran gak muncul | Cek `GATEWAY_URL` + `GATEWAY_SECRET` |
| Dropdown OS kosong | Jalankan migrasi 017 — fix kategori |
| Domain 404 di Dokploy | HTTPS ON + Certificate Provider = None → pakai Let's Encrypt atau matikan HTTPS |
| `wrangler login` gagal di VPS | Normal — deploy workers dari PC lokal saja |
| `bash: syntax error near &&` | Sudah fix di repo — redeploy ubuntu-service |
| Install RDP mati di tengah | Jangan redeploy saat instalasi aktif |
| `invalid email pass` | Hash password salah — generate ulang dengan bcryptjs (Step 8) |
| Saweria `404 Not Found` | User ID harus UUID — repo sudah auto-resolve dari username |

> **⚠️ PENTING:** Jangan redeploy service apapun di Dokploy saat instalasi RDP sedang berjalan — container restart akan membunuh proses install.
