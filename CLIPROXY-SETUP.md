# Cara Setup RDP ClipProxy Jadi Public

Expose ClipProxy yang bind di `localhost` agar bisa diakses dari luar via IP public.

> 🇮🇩 Semua step dijalankan di **RDP Windows** (CMD as Administrator).

## Kenapa Perlu Ini

ClipProxy bind ke `127.0.0.1` (localhost only). Meskipun firewall sudah buka port, dari luar tetap gak bisa akses karena app cuma listen di localhost. Solusi: SSH tunnel dari localhost ke `0.0.0.0` (public).

## Prerequisites

- Windows RDP sudah jalan
- OpenSSH Server sudah aktif di port 2222 (lihat [README.md](./README.md#ports-after-rdp-install))
- ClipProxy sudah jalan di `localhost:9000` (atau port lain)

## Architecture

```
Internet → IP_PUBLIC:19000 → SSH Tunnel → 127.0.0.1:9000 (ClipProxy)
Internet → IP_PUBLIC:19001 → SSH Tunnel → 127.0.0.1:9001 (ClipProxy)
Internet → IP_PUBLIC:19002 → SSH Tunnel → 127.0.0.1:9002 (ClipProxy)
```

---

## Step 1: Setup SSH Key (Sekali Aja)

Buka **CMD as Administrator** di RDP, jalankan:

```cmd
ssh-keygen -t ed25519 -f C:\Users\Administrator\.ssh\tunnel_key -N "" -q
```

```cmd
type C:\Users\Administrator\.ssh\tunnel_key.pub >> C:\ProgramData\ssh\administrators_authorized_keys
```

```cmd
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F"
```

> Ini bikin SSH key tanpa password supaya tunnel bisa jalan otomatis tanpa prompt.

---

## Step 2: Buat Script Tunnel

Buat file `C:\proxy-tunnels.bat` dengan isi:

```cmd
@echo off
set KEY=C:\Users\Administrator\.ssh\tunnel_key

echo [i] Starting proxy tunnels...

rem ========= TAMBAH/HAPUS PORT DI SINI =========
rem Format: 0.0.0.0:PORT_PUBLIC -> 127.0.0.1:PORT_CLIPROXY
rem
rem Contoh: ClipProxy jalan di localhost:9000, expose ke public port 19000
rem         ClipProxy jalan di localhost:9001, expose ke public port 19001
rem
rem Mau tambah port? Copy-paste baris di bawah, ganti port-nya.

start /B ssh -N -g -i %KEY% -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -L 0.0.0.0:19000:127.0.0.1:9000 administrator@127.0.0.1 -p 2222
start /B ssh -N -g -i %KEY% -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -L 0.0.0.0:19001:127.0.0.1:9001 administrator@127.0.0.1 -p 2222
start /B ssh -N -g -i %KEY% -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -L 0.0.0.0:19002:127.0.0.1:9002 administrator@127.0.0.1 -p 2222

rem ========= FIREWALL =========
netsh advfirewall firewall add rule name="Tunnel 19000" dir=in action=allow protocol=tcp localport=19000 >nul 2>&1
netsh advfirewall firewall add rule name="Tunnel 19001" dir=in action=allow protocol=tcp localport=19001 >nul 2>&1
netsh advfirewall firewall add rule name="Tunnel 19002" dir=in action=allow protocol=tcp localport=19002 >nul 2>&1

echo.
echo [OK] Proxy tunnels running!
echo.
echo   http://IP_PUBLIC:19000  (ClipProxy localhost:9000)
echo   http://IP_PUBLIC:19001  (ClipProxy localhost:9001)
echo   http://IP_PUBLIC:19002  (ClipProxy localhost:9002)
echo.
```

---

## Step 3: Jalankan

```cmd
C:\proxy-tunnels.bat
```

Test dari luar (PC/HP/mana aja):

```bash
curl -x http://IP_PUBLIC:19000 http://httpbin.org/ip
```

Kalau return IP → proxy jalan.

---

## Step 4: Auto-Start Saat Reboot

Supaya tunnel otomatis jalan setelah Windows restart:

```cmd
schtasks /create /tn "ProxyTunnels" /tr "C:\proxy-tunnels.bat" /sc onstart /ru administrator /rp "PASSWORD_KAMU" /rl highest /f
```

> Ganti `PASSWORD_KAMU` dengan password administrator RDP.

Verify:
```cmd
schtasks /query /tn "ProxyTunnels"
```

---

## Tambah Port Baru

Edit `C:\proxy-tunnels.bat`, tambah baris:

```cmd
start /B ssh -N -g -i %KEY% -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -L 0.0.0.0:19003:127.0.0.1:9003 administrator@127.0.0.1 -p 2222
netsh advfirewall firewall add rule name="Tunnel 19003" dir=in action=allow protocol=tcp localport=19003 >nul 2>&1
```

Lalu restart tunnels:

```cmd
taskkill /F /IM ssh.exe >nul 2>&1
C:\proxy-tunnels.bat
```

---

## Stop Semua Tunnel

```cmd
taskkill /F /IM ssh.exe
```

---

## Hapus Auto-Start

```cmd
schtasks /delete /tn "ProxyTunnels" /f
```

---

## Port Mapping Reference

| Public Port | ClipProxy Port | Akses dari luar |
|---|---|---|
| `19000` | `localhost:9000` | `http://IP_PUBLIC:19000` |
| `19001` | `localhost:9001` | `http://IP_PUBLIC:19001` |
| `19002` | `localhost:9002` | `http://IP_PUBLIC:19002` |

> Port public sengaja pakai `19xxx` supaya gak conflict dengan app lain. Bisa diganti ke port apapun yang available.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Permission denied (publickey)` | SSH key belum di-setup — ulangi Step 1 |
| `bind: Address already in use` | Port public sudah dipakai — ganti ke port lain |
| `Connection refused` dari luar | Firewall provider (DigitalOcean) block port — tambah rule di dashboard |
| `Server disconnected` di browser | Normal — proxy bukan web server, test pakai `curl -x` |
| Tunnel mati setelah reboot | Step 4 belum di-setup — jalankan `schtasks` command |
| `sshd` gak jalan | Cek: `net start sshd`. Kalau error 1067: `echo Port 2222> %ProgramData%\ssh\sshd_config` lalu `ssh-keygen -A` lalu `net start sshd` |

---

## Cara Pakai Proxy

### Browser (Chrome/Firefox)

Setting proxy di browser: `HTTP Proxy: IP_PUBLIC`, Port: `19000`

### curl

```bash
curl -x http://IP_PUBLIC:19000 http://httpbin.org/ip
```

### Python

```python
import requests
proxies = {"http": "http://IP_PUBLIC:19000", "https": "http://IP_PUBLIC:19000"}
r = requests.get("http://httpbin.org/ip", proxies=proxies)
print(r.json())
```

### Node.js

```javascript
const { HttpsProxyAgent } = require('https-proxy-agent');
const agent = new HttpsProxyAgent('http://IP_PUBLIC:19000');
fetch('http://httpbin.org/ip', { agent }).then(r => r.json()).then(console.log);
```
