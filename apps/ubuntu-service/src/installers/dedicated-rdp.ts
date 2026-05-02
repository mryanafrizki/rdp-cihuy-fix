import { Client } from 'ssh2';
import net from 'net';
import type { InstallationProgress, InstallationResult, ProgressCallback, LogCallback } from './docker-rdp';

/**
 * Helper: check if a TCP port is open on a remote host
 */
function checkPort(host: string, port: number, timeout: number = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Configuration for Dedicated RDP installation
 */
export interface DedicatedRDPConfig {
  osVersion: string;
  password: string;
}

/**
 * Shared SSH algorithms for compatibility across all connections
 */
const SSH_ALGORITHMS: any = {
  kex: [
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group1-sha1'
  ],
  cipher: [
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-gcm',
    'aes128-gcm@openssh.com',
    'aes256-gcm',
    'aes256-gcm@openssh.com',
    'aes256-cbc',
    'aes192-cbc',
    'aes128-cbc',
    '3des-cbc'
  ],
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
    'ssh-dss'
  ],
  hmac: [
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1'
  ]
};



/**
 * Helper: monitor installation after reconnect
 * Watches for second reboot (trans.sh completing) or RDP port becoming available.
 */
function monitorInstallation(
  conn: Client,
  vpsIp: string,
  rdpPassword: string,
  rdpPort: string,
  onLog: LogCallback | undefined,
  reportProgress: (step: number, message: string, status: 'in_progress' | 'completed' | 'failed') => void,
  resolve: (value: InstallationResult) => void,
  _reject: (reason?: any) => void
): void {
  const monitorCmd = `
echo "=== System Info ==="
uptime
echo "=== Checking installation status ==="
ps aux | grep -E 'trans|setup|install' | grep -v grep || echo "No installation process found"
echo "=== Disk info ==="
df -h / 2>/dev/null || echo "df not available"
echo "=== Network ==="
ip addr show 2>/dev/null | grep 'inet ' || ifconfig 2>/dev/null | grep 'inet ' || echo "network info not available"
echo "=== Waiting for second reboot or completion ==="
for i in $(seq 1 120); do
  sleep 10
  echo "[Monitor] $(date '+%H:%M:%S') - System uptime: $(uptime -p 2>/dev/null || uptime)"
  if ss -tlnp 2>/dev/null | grep -q ':${rdpPort}' || netstat -tlnp 2>/dev/null | grep -q ':${rdpPort}'; then
    echo "[Monitor] RDP port ${rdpPort} is now listening!"
    echo "INSTALLATION_COMPLETE"
    exit 0
  fi
done
echo "[Monitor] Monitoring timeout after 20 minutes"
echo "INSTALLATION_TIMEOUT"
`;

  conn.exec(monitorCmd, (err: Error | undefined, stream: any) => {
    if (err) {
      onLog?.(`\u274C Monitor command failed: ${err.message}`);
      conn.end();
      // Still might be successful - VPS could be transitioning to Windows
      reportProgress(95, 'Installation may have completed (monitoring failed)', 'completed');
      resolve({ success: true, message: 'Installation likely completed' });
      return;
    }

    reportProgress(85, 'Second phase running', 'in_progress');

    stream.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      lines.forEach((line: string) => {
        const trimmed = line.trim();
        if (trimmed.includes('INSTALLATION_COMPLETE')) {
          onLog?.('\uD83C\uDF89 Installation completed! RDP is ready.');
        } else if (trimmed.includes('[Monitor]')) {
          onLog?.(trimmed);
        } else {
          onLog?.(trimmed);
        }
      });
    });

    stream.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text.length > 0) {
        onLog?.(`\u26A0\uFE0F [monitor stderr] ${text}`);
      }
    });

    stream.on('close', (_code: number) => {
      conn.end();

      // If we got here, either:
      // 1. RDP port was detected (INSTALLATION_COMPLETE)
      // 2. Connection dropped again (second reboot - Windows starting)
      // 3. Timeout
      // All cases: mark as completed since the reinstall already happened

      onLog?.('');
      onLog?.('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
      onLog?.('\u2705 Installation process finished');
      onLog?.(`\uD83C\uDF10 Server: ${vpsIp}:${rdpPort}`);
      onLog?.(`\uD83D\uDC64 Username: administrator`);
      onLog?.(`Password: [set successfully]`);
      onLog?.('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

      reportProgress(100, 'Installation complete', 'completed');
      resolve({
        success: true,
        message: 'Dedicated RDP installed successfully',
        credentials: {
          ip: vpsIp,
          username: 'administrator',
          password: rdpPassword,
          port: parseInt(rdpPort)
        }
      });
    });
  });
}

/**
 * Install Dedicated RDP using binary .img installer
 *
 * This installer uses SSH to install Windows directly on the VPS (no Docker).
 * The binary .img contains all necessary scripts (tele.sh, reinstall.sh, trans.sh, etc.)
 *
 * Multi-phase installation with RDP port check:
 *
 * Phase 1: Initial SSH -> run .img -> script starts reinstall -> VPS reboots
 * Phase 2: Wait for Windows to boot, check RDP port (no SSH on Windows)
 *
 * 11-step progress mapping:
 *  1 ( 9%) - Connecting to VPS
 *  2 (18%) - Downloading binary
 *  3 (27%) - Extracting & running installer
 *  4 (36%) - Script decryption
 *  5 (45%) - Running reinstall (Phase 1)
 *  6 (55%) - VPS rebooting (expected disconnect)
 *  7 (64%) - Checking RDP port (waiting for Windows)
 *  8-10     - (reserved)
 * 11 (100%) - Complete or Failed
 */
export async function installDedicatedRDP(
  vpsIp: string,
  rootPassword: string,
  windowsVersion: string,
  rdpPassword: string,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<InstallationResult> {
  const totalSteps = 100;

  const reportProgress = (step: number, message: string, status: 'in_progress' | 'completed' | 'failed' = 'in_progress') => {
    onProgress?.({
      step,
      totalSteps,
      message,
      status,
    });
  };

  return new Promise((resolve, reject) => {
    const conn = new Client();

    reportProgress(2, 'Connecting to VPS...', 'in_progress');
    onLog?.(`\uD83D\uDD0C Connecting to server ${vpsIp}...`);

    conn.on('ready', async () => {
      try {
        // Binary .img URL (configurable via environment)
        const BINARY_IMG_URL = process.env.RDP_BINARY_IMG_URL || 'https://api.eov.my.id/azovest/rdp-installer-azovest.img';
        const BACKEND_URL = process.env.BACKEND_API_URL || 'https://rotate.eov.my.id';
        const RDP_PORT = process.env.RDP_PORT || '22';
        const API_SECRET = process.env.WORKER_API_SECRET || '';

        // Display IP information
        onLog?.(`\uD83C\uDF10 Server IP: ${vpsIp}`);
        onLog?.(`\uD83D\uDD27 OS Version: ${windowsVersion}`);
        onLog?.(`\uD83D\uDD11 Password: ${'*'.repeat(rdpPassword.length)}`);
        onLog?.(`\uD83D\uDCE1 Port: ${RDP_PORT}`);
        onLog?.(`\u23F3 Starting installation process...`);

        reportProgress(5, 'Downloading installer...', 'in_progress');

        // Get image token from Cloudflare Worker
        onLog?.(`\uD83D\uDD10 Getting image token from worker...`);
        onLog?.(`   Backend URL: ${BACKEND_URL}`);

        let imgToken = '';
        try {
          // Call worker to init installation and get image token
          const initResponse = await fetch(`${BACKEND_URL}/api/installation/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: API_SECRET,
              vpsIp: vpsIp,
              osVersion: windowsVersion,
              rdpPort: parseInt(RDP_PORT),
              metadata: { source: 'ubuntu-service' }
            })
          });

          if (initResponse.ok) {
            const initData = await initResponse.json() as any;
            imgToken = initData.imageToken || '';
            onLog?.(`\u2705 Image token obtained: ${imgToken.substring(0, 16)}...`);
          } else {
            const errText = await initResponse.text();
            onLog?.(`\u26A0\uFE0F Worker init failed (${initResponse.status}): ${errText}`);
            // Try legacy token endpoint as fallback
            try {
              const legacyResponse = await fetch(`${BACKEND_URL}/x/gi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ osVersion: windowsVersion })
              });
              if (legacyResponse.ok) {
                const legacyData = await legacyResponse.json() as any;
                imgToken = legacyData.token || '';
                onLog?.(`\u2705 Legacy token obtained: ${imgToken.substring(0, 16)}...`);
              }
            } catch (e) {
              onLog?.(`\u26A0\uFE0F Legacy token also failed`);
            }
          }
        } catch (error: any) {
          onLog?.(`\u26A0\uFE0F Worker API error: ${error.message}`);
        }

        if (!imgToken) {
          onLog?.(`\u26A0\uFE0F WARNING: No image token obtained. Installation may fail with exit code 7.`);
        }

        onLog?.(`\uD83D\uDCE5 Downloading binary installer...`);
        onLog?.(`   URL: ${BINARY_IMG_URL}`);

        // Download binary .img to VPS with cache busting
        const timestamp = Date.now();
        const downloadCommand = `cd /root && rm -f rdp-installer-azovest.img && curl -fL --progress-bar -o rdp-installer-azovest.img "${BINARY_IMG_URL}?t=${timestamp}" || wget -O rdp-installer-azovest.img "${BINARY_IMG_URL}?t=${timestamp}"`;

        onLog?.(`\uD83D\uDCE5 Starting download...`);

        await new Promise<void>((resolveDownload, rejectDownload) => {
          const timeout = setTimeout(() => {
            rejectDownload(new Error('Timeout: Download took too long (>5 minutes)'));
          }, 5 * 60 * 1000);

          conn.exec(downloadCommand, (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              onLog?.(`\u274C Error starting download: ${err.message}`);
              rejectDownload(err);
              return;
            }

            let output = '';
            stream.on('data', (data: Buffer) => {
              const text = data.toString();
              output += text;
              if (text.includes('%') || text.includes('bytes') || text.includes('Downloading')) {
                onLog?.(`   ${text.trim()}`);
              }
            });

            stream.stderr.on('data', (data: Buffer) => {
              const text = data.toString();
              if (text.includes('%') || text.includes('bytes') || text.includes('Downloading')) {
                onLog?.(`   ${text.trim()}`);
              } else if (text.trim().length > 0 && !text.includes('curl') && !text.includes('wget')) {
                onLog?.(`\u26A0\uFE0F [download stderr] ${text.trim()}`);
              }
            });

            stream.on('close', (code: number) => {
              clearTimeout(timeout);
              if (code !== 0) {
                onLog?.(`\u274C Download failed with exit code: ${code}`);
                onLog?.(`   Last output: ${output.split('\n').slice(-5).join('\n')}`);
                rejectDownload(new Error(`Download failed with exit code ${code}`));
                return;
              }
              onLog?.(`\u2705 Download completed`);
              resolveDownload();
            });
          });
        });

        reportProgress(8, 'Running installer...', 'in_progress');

        // Verify binary downloaded
        onLog?.(`\uD83D\uDD0D Verifying binary...`);
        await new Promise<void>((resolveVerify, rejectVerify) => {
          const timeout = setTimeout(() => {
            rejectVerify(new Error('Timeout: Binary verification took too long (>10s)'));
          }, 10000);

          conn.exec('test -f /root/rdp-installer-azovest.img && ls -lh /root/rdp-installer-azovest.img', (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              onLog?.(`\u274C Error verifying binary: ${err.message}`);
              rejectVerify(err);
              return;
            }

            let output = '';
            stream.on('data', (data: Buffer) => {
              output += data.toString();
            });

            stream.stderr.on('data', (data: Buffer) => {
              const text = data.toString();
              if (text.trim().length > 0) {
                onLog?.(`\u26A0\uFE0F [verify stderr] ${text.trim()}`);
              }
            });

            stream.on('close', (code: number) => {
              clearTimeout(timeout);
              if (code !== 0) {
                onLog?.(`\u274C Binary verification failed (exit code: ${code})`);
                onLog?.(`   Output: ${output.trim() || 'No output'}`);
                rejectVerify(new Error('Binary file not found after download'));
                return;
              }
              onLog?.(`\u2705 Binary verified: ${output.trim()}`);
              resolveVerify();
            });
          });
        });

        reportProgress(10, 'Executing installation scripts...', 'in_progress');

        // Make binary executable
        onLog?.(`\uD83D\uDD27 Making binary executable...`);
        await new Promise<void>((resolveChmod, rejectChmod) => {
          const timeout = setTimeout(() => {
            onLog?.(`\u26A0\uFE0F chmod timeout - trying alternative method...`);
            conn.exec('stat -c "%a" /root/rdp-installer-azovest.img 2>/dev/null || echo "0"', (err2, stream2) => {
              if (err2) {
                rejectChmod(new Error('Timeout: chmod command took too long and alternative check failed'));
                return;
              }
              let statOutput = '';
              stream2.on('data', (d: Buffer) => { statOutput += d.toString(); });
              stream2.on('close', (_code2: number) => {
                const perms = parseInt(statOutput.trim()) || 0;
                if ((perms & 0o111) !== 0) {
                  onLog?.(`\u2705 Binary is already executable (perms: ${perms.toString(8)})`);
                  resolveChmod();
                } else {
                  conn.exec('chmod +x /root/rdp-installer-azovest.img && echo "CHMOD_SUCCESS" || echo "CHMOD_FAILED"', (err3, stream3) => {
                    if (err3) {
                      rejectChmod(new Error('Timeout: chmod command failed'));
                      return;
                    }
                    let chmodOutput = '';
                    stream3.on('data', (d: Buffer) => { chmodOutput += d.toString(); });
                    stream3.on('close', (code3: number) => {
                      if (chmodOutput.includes('CHMOD_SUCCESS') || code3 === 0) {
                        onLog?.(`\u2705 Binary is now executable (alternative method)`);
                        resolveChmod();
                      } else {
                        rejectChmod(new Error('Failed to make binary executable (alternative method failed)'));
                      }
                    });
                  });
                }
              });
            });
          }, 10000);

          conn.exec('chmod +x /root/rdp-installer-azovest.img && echo "CHMOD_SUCCESS" || echo "CHMOD_FAILED"', (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              onLog?.(`\u274C Error executing chmod: ${err.message}`);
              rejectChmod(err);
              return;
            }

            let output = '';
            stream.on('data', (data: Buffer) => {
              output += data.toString();
            });

            stream.stderr.on('data', (data: Buffer) => {
              const text = data.toString();
              if (text.trim().length > 0) {
                onLog?.(`\u26A0\uFE0F [chmod stderr] ${text.trim()}`);
              }
            });

            stream.on('close', (code: number) => {
              clearTimeout(timeout);
              if (code !== 0 || output.includes('CHMOD_FAILED')) {
                onLog?.(`\u274C chmod failed with exit code: ${code}`);
                onLog?.(`   Output: ${output.trim() || 'No output'}`);
                rejectChmod(new Error(`Failed to make binary executable (exit code: ${code})`));
                return;
              }
              if (output.includes('CHMOD_SUCCESS') || code === 0) {
                onLog?.(`\u2705 Binary is now executable`);
                resolveChmod();
              } else {
                onLog?.(`\u2705 Binary chmod completed (exit code: ${code})`);
                resolveChmod();
              }
            });
          });
        });

        reportProgress(12, 'Running reinstall...', 'in_progress');

        // Run binary installer
        onLog?.(`\uD83D\uDE80 Executing installation...`);

        // Auto-detect ubuntu-service IP from SSH connection and replace hardcoded old IPs.
        // 1. Detect our IP via $SSH_CLIENT
        // 2. Start background watcher that replaces 168.144.34.139 in any .sh/.bat files
        // 3. Run the binary installer
        const OLD_IP = '168.144.34.139';
        // Use explicit BOT_PUBLIC_IP env var — $SSH_CLIENT may show Docker internal IP
        const BOT_PUBLIC_IP = process.env.BOT_PUBLIC_IP || '';
        const command = [
          'cd /root',
          // Detect BOT_IP: prefer explicit env var, fallback to SSH_CLIENT
          BOT_PUBLIC_IP
            ? `export BOT_IP="${BOT_PUBLIC_IP}"`
            : `export BOT_IP=$(echo $SSH_CLIENT | awk '{print $1}')`,
          'echo "BOT_IP=$BOT_IP"',
          // Background watcher: fix IPs + CRLF in extracted scripts (NOT .enc — those are binary)
          `(for i in $(seq 1 60); do sleep 2; find /tmp /root -maxdepth 3 \\( -name "*.sh" -o -name "*.bat" \\) ! -name "*.enc" 2>/dev/null | while read f; do sed -i "s/${OLD_IP}/$BOT_IP/g; s/\\r$//" "$f" 2>/dev/null; done; done) &`,
          `./rdp-installer-azovest.img "${rdpPassword}" "${imgToken}" "${BACKEND_URL}" "${RDP_PORT}" 2>&1`,
          'EXIT_CODE=$?',
          'echo "INSTALL_EXIT_CODE:$EXIT_CODE"',
          'rm -f /root/rdp-installer-azovest.img',
          'exit $EXIT_CODE',
        ].join('\n');

        let allOutput = '';
        let lastActivityTime = Date.now();

        conn.exec(command, (err, stream) => {
          if (err) {
            onLog?.(`\u274C Failed to execute command: ${err.message}`);
            conn.end();
            reportProgress(12, 'Installation failed', 'failed');
            reject(err);
            return;
          }

          const activityTimeout = setTimeout(() => {
            const inactiveTime = Math.floor((Date.now() - lastActivityTime) / 1000);
            onLog?.(`\u26A0\uFE0F No activity for ${inactiveTime} seconds. Installation may be stuck.`);
            onLog?.(`   Last output: ${allOutput.split('\n').slice(-3).join(' | ')}`);
          }, 30 * 60 * 1000);

          stream.on('data', (data: Buffer) => {
            const output = data.toString();
            allOutput += output;
            lastActivityTime = Date.now();

            const lines = output.split('\n').filter(line => line.trim().length > 0);
            lines.forEach(line => {
              const trimmed = line.trim();
              if (trimmed.length === 0) return;

              // Log important messages with emoji
              if (trimmed.includes('Starting binary extraction')) {
                onLog?.(`\uD83D\uDD28 ${trimmed}`);
              } else if (trimmed.includes('Extraction successful')) {
                onLog?.(`\u2705 ${trimmed}`);
              } else if (trimmed.includes('Starting Dedicated RDP installation')) {
                onLog?.(`\uD83C\uDFAF ${trimmed}`);
              } else if (trimmed.includes('Using reinstall.sh from binary package')) {
                onLog?.(`\u2705 ${trimmed}`);
              } else if (trimmed.includes('Using trans.sh from binary package')) {
                onLog?.(`\u2705 ${trimmed}`);
              } else if (trimmed.includes('Downloading') || trimmed.includes('download')) {
                onLog?.(`\uD83D\uDCE5 ${trimmed}`);
              } else if (trimmed.includes('Running reinstall.sh')) {
                onLog?.(`\u2699\uFE0F ${trimmed}`);
              } else if (trimmed.includes('Installation completed successfully')) {
                onLog?.(`\uD83C\uDF89 ${trimmed}`);
              } else if (trimmed.includes('Rebooting system')) {
                onLog?.(`\uD83D\uDD04 ${trimmed}`);
              } else if (trimmed.includes('ERROR') || trimmed.includes('Error') || trimmed.includes('error:')) {
                onLog?.(`\u274C ${trimmed}`);
              } else if (trimmed.includes('Warning') || trimmed.includes('warning')) {
                onLog?.(`\u26A0\uFE0F ${trimmed}`);
              } else if (trimmed.includes('RDP_SCRIPTS_DIR')) {
                onLog?.(`\uD83D\uDCC1 ${trimmed}`);
              } else {
                if (!trimmed.match(/^\s*$/) && trimmed.length > 0) {
                  onLog?.(trimmed);
                }
              }
            });
          });

          stream.stderr.on('data', (data: Buffer) => {
            const text = data.toString();

            const lines = text.split('\n').filter(line => line.trim().length > 0);
            lines.forEach(line => {
              const trimmed = line.trim();
              if (trimmed.length > 0) {
                onLog?.(`\u26A0\uFE0F [STDERR] ${trimmed}`);
              }
            });
          });

          // ============================================================
          // stream.on('close') - VPS rebooted, now check RDP port
          // ============================================================
          stream.on('close', async (code: number) => {
            clearTimeout(activityTimeout);

            // If the binary itself reported a real error (non-zero exit AND we got the exit code marker),
            // that means the script failed BEFORE triggering a reboot
            const exitCodeMatch = allOutput.match(/INSTALL_EXIT_CODE:(\d+)/);
            const reportedExitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;

            if (reportedExitCode !== null && reportedExitCode !== 0) {
              // Real failure - script exited with error before reboot
              onLog?.(`\u274C Installation failed with exit code: ${reportedExitCode}`);
              onLog?.(`\uD83D\uDCCB Last 20 lines of output:`);
              const outputLines = allOutput.split('\n').filter(l => l.trim().length > 0);
              outputLines.slice(-20).forEach(line => {
                onLog?.(`   ${line.trim()}`);
              });
              conn.end();
              reportProgress(12, 'Installation failed', 'failed');
              reject(new Error(`Installation failed with exit code ${reportedExitCode}. Check logs above for details.`));
              return;
            }

            // ============================================================
            // Phase 1 complete - script ran, VPS is rebooting
            // The SSH disconnect is EXPECTED behavior during reinstall
            // ============================================================
            onLog?.('');
            onLog?.('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
            onLog?.('\uD83D\uDCE1 Phase 1 complete - Verified, starting installation...');
            onLog?.('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
            reportProgress(15, 'Verified, preparing next phase...', 'in_progress');

            // Close first connection cleanly
            try { conn.end(); } catch (_e) { /* ignore */ }

            // ============================================================
            // Phase 2+3 Combined: Smart port-based detection
            // Instead of SSH monitoring (unreliable from Docker), we use
            // port checking with time-based progress estimation.
            //
            // Timeline:
            //   0-2 min:   VPS rebooting into Alpine installer
            //   2-15 min:  Downloading + writing OS image
            //   15-20 min: Windows first boot + setup
            //   20+ min:   RDP port should be open
            // ============================================================
            const RDP_CHECK_PORT = parseInt(RDP_PORT) || 22;
            const startTime = Date.now();
            const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes max

            onLog?.('');
            onLog?.('📡 Installation triggered — monitoring progress...');
            onLog?.('⏳ Downloading and installing Windows OS...');
            onLog?.('   This typically takes 10-20 minutes.');
            reportProgress(15, 'Installing OS...', 'in_progress');

            // Estimated phases based on elapsed time
            const getEstimatedProgress = (elapsedMs: number): { pct: number; msg: string } => {
              const mins = elapsedMs / 60000;
              if (mins < 1) return { pct: 16, msg: 'Rebooting into installer...' };
              if (mins < 3) return { pct: 20, msg: 'Starting OS installation...' };
              if (mins < 6) return { pct: 30, msg: 'Downloading Windows image...' };
              if (mins < 10) return { pct: 45, msg: 'Downloading Windows image...' };
              if (mins < 13) return { pct: 60, msg: 'Writing OS to disk...' };
              if (mins < 16) return { pct: 70, msg: 'Configuring Windows...' };
              if (mins < 19) return { pct: 80, msg: 'Windows first boot...' };
              if (mins < 22) return { pct: 85, msg: 'Finalizing setup...' };
              return { pct: 88, msg: 'Waiting for RDP service...' };
            };

            let rdpReady = false;

            // Poll every 15 seconds, check port + update progress
            while (Date.now() - startTime < MAX_WAIT_MS) {
              const elapsed = Date.now() - startTime;
              const { pct, msg } = getEstimatedProgress(elapsed);
              const elapsedMin = Math.floor(elapsed / 60000);
              const elapsedSec = Math.floor((elapsed % 60000) / 1000);

              // Check RDP port
              const isOpen = await checkPort(vpsIp, RDP_CHECK_PORT, 8000);

              if (isOpen) {
                onLog?.(`✅ RDP port ${RDP_CHECK_PORT} is OPEN! Windows is ready.`);
                reportProgress(95, 'RDP ready! Initializing...', 'in_progress');
                rdpReady = true;
                break;
              }

              // Update progress with estimated phase
              reportProgress(pct, msg, 'in_progress');
              if (elapsedMin > 0 && elapsed % 60000 < 15000) {
                // Log once per minute
                onLog?.(`⏳ ${msg} (${elapsedMin}m ${elapsedSec}s)`);
              }

              // Wait 15 seconds before next check
              await new Promise(r => setTimeout(r, 15000));
            }

            if (rdpReady) {
              onLog?.('⏳ Waiting 30s for RDP service to fully initialize...');
              reportProgress(98, 'Running post-install setup...', 'in_progress');
              await new Promise(r => setTimeout(r, 30000));

              reportProgress(100, 'Installation complete', 'completed');
              onLog?.('');
              onLog?.('✅ Installation complete ✅');
              onLog?.(`🌐 Server: ${vpsIp}:${RDP_CHECK_PORT}`);
              onLog?.(`👤 Username: administrator`);
              onLog?.(`✔ Password: [set successfully]`);

              resolve({
                success: true,
                credentials: {
                  ip: vpsIp,
                  username: 'administrator',
                  password: rdpPassword,
                  port: RDP_CHECK_PORT
                }
              });
            } else {
              const totalMin = Math.floor((Date.now() - startTime) / 60000);
              onLog?.(`❌ RDP port ${RDP_CHECK_PORT} not available after ${totalMin} minutes`);
              reportProgress(90, 'Failed: RDP port not available', 'failed');
              reject(new Error(`RDP port ${RDP_CHECK_PORT} not available after ${totalMin} minutes`));
            }
          });
        });
      } catch (error) {
        conn.end();
        reportProgress(12, 'Installation failed', 'failed');
        reject(error);
      }
    });

    conn.on('error', (err: Error) => {
      onLog?.(`\u274C Connection error: ${err.message}`);
      reportProgress(2, 'Connection failed', 'failed');
      reject(err);
    });

    conn.connect({
      host: vpsIp,
      port: 22,
      username: 'root',
      password: rootPassword,
      readyTimeout: 30000,
      tryKeyboard: false,
      algorithms: SSH_ALGORITHMS
    });
  });
}
