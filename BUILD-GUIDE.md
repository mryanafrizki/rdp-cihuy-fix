# Build Guide — RDP Installer Binary + Encrypted Scripts

Panduan compile `rdp-installer-azovest.img` dan encrypt scripts.

## Kapan Perlu Rebuild

- Ganti IP ubuntu-service (hardcoded `168.144.34.139` di scripts)
- Update shell scripts (tele.sh, reinstall.sh, trans.sh)
- Update Windows config files (.bat, .cfg, .yaml)
- Ganti backend URL (hardcoded `https://rotate.eov.my.id` di tele.sh)
- Tambah OS version baru

## Architecture

```
rdp/scripts/
├── tele.sh              ← Entry point (decrypts reinstall.sh, locks SSH, runs install)
├── reinstall.sh         ← Core installer (disk partition, Alpine setup, first reboot)
├── trans.sh             ← Alpine phase (download Windows image, DD to disk, second reboot)
├── windows-*.bat        ← Windows post-install configs
├── *.cfg / *.yaml       ← Linux preseed/cloud-init configs
└── *.sh                 ← Helper scripts (get-xda, resize, fix-eth, etc.)

encrypt-scripts.js       ← Encrypts .sh → .sh.enc (AES-256-GCM)
build-binary-img.js      ← Builds self-extracting .img (bash header + tar.gz)

Output:
rdp/dist/rdp-installer-azovest.img   ← Upload ke CDN
```

## Build Flow

```
Step 1: Edit scripts (kalau perlu)
Step 2: Encrypt scripts → .sh.enc
Step 3: Build binary → .img
Step 4: Upload .img ke CDN
Step 5: Update worker-rotate (kalau tambah OS version)
```

---

## Step 1: Edit Scripts (Kalau Perlu)

### Ganti IP Ubuntu-Service

File yang perlu diedit kalau IP ubuntu-service berubah:

| File | Line | Apa yang diganti |
|---|---|---|
| `apps/ubuntu-service/src/installers/dedicated-rdp.ts` | 491 | `const OLD_IP = '168.144.34.139'` |
| `apps/web/app/api/orders/route.ts` | 44 | `ip === '168.144.34.139'` (whitelist) |
| `apps/web/app/api/orders/check-vps/route.ts` | 30 | `ip === '168.144.34.139'` (whitelist) |

> **Note:** IP replacement di scripts (tele.sh, reinstall.sh) dilakukan **otomatis saat runtime** oleh background watcher di `dedicated-rdp.ts`. Watcher detect `$SSH_CLIENT` IP dan `sed -i` replace `168.144.34.139` → actual IP di semua `.sh` dan `.bat` files.

### Ganti Nama PC (Computer Name)

PC name di-set di `rdp/scripts/windows-change-rdp-port.bat` line 12:

```bat
set "NEWNAME=COBAIN-DEV"
```

Ganti `COBAIN-DEV` ke nama yang kamu mau, lalu rebuild binary (Step 2-4).

Script ini jalan otomatis saat Windows pertama kali boot. Rename pakai PowerShell `Rename-Computer`, fallback ke `wmic`.

---

### Ganti SSH Port (Windows)

OpenSSH Server di-install otomatis di Windows saat post-install. Default port: **2222**.

File: `rdp/scripts/windows-change-rdp-port.bat`:
```bat
set "SshPort=2222"
```

Setelah install selesai, akses:
- **RDP**: `IP:22` (Remote Desktop)
- **SSH**: `IP:2222` (OpenSSH Server, user: `administrator`)

Ganti port kalau perlu, lalu rebuild binary.

---

### Ganti Backend URL

`tele.sh` line 33 hardcode backend URL:
```bash
BACKEND_URL="https://rotate.eov.my.id"
```

Kalau worker-rotate pindah domain, ganti ini lalu rebuild.

### Tambah OS Version

1. Tambah URL di worker-rotate `BASE_IMAGE_URL_MAP`:
   ```javascript
   'win_new_version': 'https://files.example.com/windows_new.gz',
   ```
2. Tambah di database `os_versions` table
3. Tambah di `apps/web/app/api/orders/route.ts` `VALID_OS_VERSIONS` array

---

## Step 2: Encrypt Scripts

### Prerequisites

```bash
cd /path/to/cobain-dev-rdp
npm install   # atau pastikan crypto module available (built-in Node.js)
```

### Encryption Key

Default key (hardcoded di `encrypt-scripts.js`):
```
wmJIl9CxWVZw9kNLsavb/IjbWY+WWgv8t9ly1/tTP/w=
```

Atau set via environment:
```bash
export SCRIPT_ENCRYPTION_KEY="wmJIl9CxWVZw9kNLsavb/IjbWY+WWgv8t9ly1/tTP/w="
```

> **PENTING:** Key ini HARUS sama dengan `SCRIPT_ENCRYPTION_KEY` di worker-rotate (Cloudflare Worker). Worker pakai key ini untuk decrypt `.sh.enc` saat VPS target request.

### Run Encryption

```bash
node encrypt-scripts.js
```

Atau encrypt specific script:
```bash
node encrypt-scripts.js --script tele
node encrypt-scripts.js --script reinstall
node encrypt-scripts.js --script trans
node encrypt-scripts.js --script all
```

### Output

```
rdp/scripts/tele.sh       → rdp/scripts/tele.sh.enc
rdp/scripts/reinstall.sh  → rdp/scripts/reinstall.sh.enc
rdp/scripts/trans.sh      → rdp/scripts/trans.sh.enc
```

### Encryption Format

AES-256-GCM:
```
[IV (16 bytes)] [AuthTag (16 bytes)] [Encrypted Data]
```

---

## Step 3: Build Binary (.img)

### Prerequisites

- `.sh.enc` files harus ada (dari Step 2)
- Node.js 18+

### Run Build

```bash
node build-binary-img.js
```

### Output

```
rdp/dist/rdp-installer-azovest.img
```

Dengan SHA256 checksum.

### Apa yang masuk ke .img

Binary = **bash header** (self-extractor) + **tar.gz archive**

Archive berisi:
- `tele.sh.enc` (encrypted — WAJIB)
- `reinstall.sh.enc` (encrypted — WAJIB)
- `trans.sh.enc` atau `trans.sh` (encrypted atau plaintext)
- Semua helper scripts: `get-xda.sh`, `resize.sh`, `fix-eth-name.sh`, `initrd-network.sh`, dll
- Semua Windows configs: `windows-setup.bat`, `windows-pass.bat`, `windows-change-rdp-port.bat`, dll
- Semua Linux configs: `debian.cfg`, `redhat.cfg`, `ubuntu.yaml`, `cloud-init.yaml`

### Bash Header (Self-Extractor)

Saat `.img` dijalankan di VPS target:

1. Find `__ARCHIVE_BELOW__` marker
2. `tail | tar -xz` ke `/root/.rdp-installer-extracted/`
3. Call worker `POST /x/gs` → get decrypt token
4. Send `tele.sh.enc` (base64) ke `POST /ds/{token}` → get plaintext
5. Execute decrypted `tele.sh` dengan args: `password imgToken backendUrl rdpPort`
6. Cleanup temp files

---

## Step 4: Upload ke CDN

Upload `.img` ke static file host:

```bash
# Contoh: upload ke R2/S3/VPS
scp rdp/dist/rdp-installer-azovest.img user@cdn-server:/path/to/azovest/

# Atau upload ke Cloudflare R2
wrangler r2 object put azovest/rdp-installer-azovest.img --file=rdp/dist/rdp-installer-azovest.img
```

URL final: `https://api.eov.my.id/azovest/rdp-installer-azovest.img`

Kalau URL berubah, update di:
- `apps/ubuntu-service/.env` → `RDP_BINARY_IMG_URL=https://new-url/rdp-installer-azovest.img`
- Atau default di `dedicated-rdp.ts` line 240

---

## Step 5: Update Worker-Rotate (Kalau Perlu)

Worker-rotate (`rotate.eov.my.id`) perlu di-update kalau:
- Tambah OS version baru → update `BASE_IMAGE_URL_MAP`
- Ganti encryption key → update `SCRIPT_ENCRYPTION_KEY` secret
- Ganti script URLs → update `SCRIPT_URLS`

Deploy worker-rotate:
```bash
cd apps/worker   # atau folder worker-rotate
npx wrangler secret put SCRIPT_ENCRYPTION_KEY
npx wrangler secret put API_SECRET_KEY
npx wrangler deploy
```

---

## Quick Rebuild (Cheat Sheet)

```bash
# 1. Edit scripts di rdp/scripts/ kalau perlu

# 2. Encrypt
node encrypt-scripts.js --script all

# 3. Build
node build-binary-img.js

# 4. Upload
scp rdp/dist/rdp-installer-azovest.img user@cdn:/path/to/azovest/

# Done — next install akan pakai binary baru
```

---

## Installation Runtime Flow

Untuk referensi, ini yang terjadi saat user klik "Install RDP":

```
1. cobain-web POST /api/orders
   → Call worker-rotate POST /api/installation/init
   → Get imageToken (IP-bound, 30min TTL)
   → Call ubuntu-service POST /api/trigger-rdp

2. ubuntu-service SSH ke VPS target
   → Download rdp-installer-azovest.img dari CDN
   → chmod +x
   → Start background IP watcher (sed replace 168.144.34.139 → actual BOT_IP)
   → Execute: ./rdp-installer-azovest.img <password> <imgToken> <backendUrl> <rdpPort>

3. Binary self-extracts on VPS
   → Extract tar.gz ke /root/.rdp-installer-extracted/
   → Decrypt tele.sh.enc via worker POST /ds/{token}
   → Execute tele.sh

4. tele.sh on VPS
   → Decrypt reinstall.sh.enc via worker
   → Get confhome token via worker POST /x/gc
   → Lock SSH to BOT_IP only (iptables)
   → Execute reinstall.sh --img=${BACKEND_URL}/i/${IMG_TOKEN}

5. reinstall.sh on VPS
   → Detect disk, network, EFI/BIOS
   → Download Alpine kernel + initramfs
   → Configure GRUB to boot Alpine
   → Copy trans.sh + configs to initrd
   → REBOOT → Alpine

6. trans.sh in Alpine (after reboot)
   → Configure network
   → Re-lock SSH to BOT_IP
   → Download Windows image via ${BACKEND_URL}/i/${IMG_TOKEN}
     (worker validates token + IP, proxies real image URL)
   → DD write image to disk
   → Mount Windows partition
   → Apply configs (password, RDP port, network, drivers)
   → REBOOT → Windows

7. ubuntu-service monitors
   → Wait for SSH reconnect (Alpine phase)
   → Monitor download/write progress
   → Wait for final reboot
   → Check RDP port open (up to 20 attempts x 30s)
   → Report: installation complete ✅
```

---

## Security Layers

| Layer | Mechanism |
|---|---|
| Script encryption | AES-256-GCM, decrypted on-the-fly via worker API |
| Token IP binding | Worker validates CF-Connecting-IP matches vpsIp in token |
| One-time tokens | Deleted from KV after use |
| URL proxying | Real image URLs (Google Drive, meocloud) never exposed to VPS |
| SSH firewall | iptables locks SSH to BOT_IP only during install |
| Background IP watcher | Auto-replace hardcoded IPs in extracted scripts |
| 30-min TTL | All tokens expire after 30 minutes |

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `syntax error near &&` | `& &&` in bash command | Fixed in repo — redeploy ubuntu-service |
| `INSTALL_EXIT_CODE:7` | Invalid/expired imgToken | Token expired (>30min) — retry install |
| `INSTALL_EXIT_CODE:1` | Binary execution failed | Check if .img is corrupt — rebuild |
| `tele.sh.enc not found` | .enc files missing from build | Run `node encrypt-scripts.js` before build |
| `Failed to decrypt` | Encryption key mismatch | `SCRIPT_ENCRYPTION_KEY` in worker must match `encrypt-scripts.js` |
| Download stuck at 0% | Image URL invalid or worker down | Check worker-rotate health: `curl https://rotate.eov.my.id/health` |
| SSH locked out during install | iptables BOT_IP rule | Wait for install to finish, or reboot VPS from provider console |
| `168.144.34.139` still in scripts | Background watcher didn't run | Check `dedicated-rdp.ts` OLD_IP matches, or manually update scripts |
