import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { config } from './config';
import packageJson from '../package.json';
import { installDockerRDP, type InstallationProgress } from './installers/docker-rdp';
import { installDedicatedRDP } from './installers/dedicated-rdp';
import { publishProgress } from './progress';
import { db, schema } from './db';
import { addBalance } from './db/operations';

/** Verify API key + optional HMAC signature (replay protection) */
function verifyAuth(req: express.Request, res: express.Response): boolean {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey || apiKey !== config.apiKey) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }

  // HMAC verification — if signature headers present, enforce them
  const timestamp = req.headers['x-timestamp'] as string | undefined;
  const signature = req.headers['x-signature'] as string | undefined;
  if (timestamp && signature) {
    // Reject requests older than 60 seconds
    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age > 60000 || age < -5000) {
      res.status(401).json({ success: false, error: 'Request expired' });
      return false;
    }
    // Verify HMAC
    const body = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', config.apiKey).update(timestamp + body).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      res.status(401).json({ success: false, error: 'Invalid signature' });
      return false;
    }
  }
  return true;
}

// Simple telegram notification helper
async function notifyTelegram(message: string) {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch { /* fire-and-forget */ }
}

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ubuntu-service',
    version: packageJson.version,
    timestamp: new Date().toISOString()
  });
});

// Serve the rebuilt .img binary
app.get('/binary/rdp-installer-azovest.img', (req, res) => {
  const imgPath = path.join(__dirname, '..', 'rdp-installer-azovest.img');
  if (!fs.existsSync(imgPath)) {
    return res.status(404).json({ error: 'Binary not found' });
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="rdp-installer-azovest.img"');
  fs.createReadStream(imgPath).pipe(res);
});

// Serve config/bat files (for confhome fallback)
app.get('/confhome/:filename', (req, res) => {
  const filename = req.params.filename;
  // Only allow specific bat/config files
  const allowed = ['windows-change-rdp-port.bat', 'windows-pass.bat', 'windows-allow-ping.bat', 'windows-resize.bat', 'windows-setup.bat', 'windows-del-gpo.bat', 'windows-frpc.bat', 'windows-set-netconf.bat'];
  if (!allowed.includes(filename)) {
    return res.status(404).json({ error: 'File not found' });
  }
  const filePath = path.join(__dirname, '..', 'scripts', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Type', 'text/plain');
  fs.createReadStream(filePath).pipe(res);
});

// Webhook endpoint
app.post('/api/trigger-rdp', async (req, res) => {
  if (!verifyAuth(req, res)) return;

  const { installation_id, vps_ip, root_password, windows_version, rdp_password, rdp_type } = req.body;
  
  if (!installation_id || !vps_ip || !root_password || !windows_version || !rdp_password) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  console.log(`[${installation_id}] Starting ${rdp_type || 'dedicated'} RDP installation for ${vps_ip}`);

  // Collect logs for this installation
  let logBuffer: string[] = [];
  let lastPublishTime = 0;
  let currentStep = 0;
  let currentStatus: string = 'in_progress';
  let installationDone = false; // Flag to stop onLog publishing

  const onProgress = async (progress: InstallationProgress) => {
    currentStep = progress.step;
    if (progress.status === 'completed' || progress.status === 'failed') {
      currentStatus = progress.status;
      installationDone = true; // Stop onLog from publishing
    }
    console.log(`[${installation_id}] Progress: ${progress.message} (${progress.step}/${progress.totalSteps})`);
    // Publish to DB
    await publishProgress(
      installation_id,
      progress.step,
      progress.message,
      progress.status === 'completed' ? 'completed' : progress.status === 'failed' ? 'failed' : 'in_progress'
    );
  };

  const onLog = async (log: string) => {
    // Keep original in server logs
    console.log(`[${installation_id}] ${log}`);
    
    // Filter out internal VPS IPs
    let cleanLog = log.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[server]');
    // Filter paths
    cleanLog = cleanLog.replace(/\/[a-zA-Z0-9_\-\.\/]{3,}/g, '');
    // Filter URLs
    cleanLog = cleanLog.replace(/https?:\/\/[^\s]+/g, '[hidden]');
    // Filter hex tokens (32+ chars)
    cleanLog = cleanLog.replace(/\b[0-9a-f]{32,}\b/gi, '[token]');
    // Filter sensitive filenames (.enc, .sh, .img, script names)
    cleanLog = cleanLog.replace(/\b[\w\-]+\.sh\.enc\b/g, '[script]');
    cleanLog = cleanLog.replace(/\b[\w\-]+\.sh\b/g, '[script]');
    cleanLog = cleanLog.replace(/\b[\w\-]+\.img\b/g, '[binary]');
    // Filter internal operation details
    cleanLog = cleanLog.replace(/via backend API/gi, '');
    cleanLog = cleanLog.replace(/backend(Url)?/gi, '[service]');
    cleanLog = cleanLog.replace(/imgToken/gi, '[param]');
    cleanLog = cleanLog.replace(/rdpPort/gi, 'port');
    cleanLog = cleanLog.replace(/Decrypting|Decrypted/gi, 'Processing');
    cleanLog = cleanLog.replace(/decrypt(ing|ed)?/gi, 'processing');
    cleanLog = cleanLog.replace(/\(.*Token\):/gi, ':');
    cleanLog = cleanLog.replace(/\(.*Url\):/gi, ':');
    // Skip lines that are just noise after filtering
    if (!cleanLog.trim() || cleanLog.trim() === ':' || cleanLog.trim().length < 3) return;
    
    const wib = new Date(Date.now() + 7 * 3600000).toISOString().slice(11,19);
    logBuffer.push(`[${wib}] ${cleanLog.trim()}`);
    
    // Throttle DB updates to every 3 seconds
    const now = Date.now();
    if (!installationDone && now - lastPublishTime > 3000) {
      lastPublishTime = now;
      // Update progress_message with recent logs (last 5 lines)
      const recentLogs = logBuffer.slice(-5).join('\n');
      await publishProgress(
        installation_id,
        currentStep,
        recentLogs,
        'in_progress'
      ).catch(() => {}); // non-fatal
    }
  };

  // Start installation in background
  const installer = (rdp_type === 'docker') ? installDockerRDP : installDedicatedRDP;
  
  // Auto-refund helper: returns credit to user on installation failure
  const autoRefund = async (installId: string) => {
    try {
      // Get installation to find user_id
      const [inst] = await db
        .select({ userId: schema.installations.userId })
        .from(schema.installations)
        .where(eq(schema.installations.id, installId));

      if (!inst?.userId) return;

      // Find the specific deduction transaction linked to this installation
      const [deductionTx] = await db
        .select({ amount: schema.transactions.amount })
        .from(schema.transactions)
        .where(eq(schema.transactions.paymentId, `install_${installId}`));

      const refundAmount = Math.abs(Number(deductionTx?.amount) || 1000); // Fallback to 1000

      // Check if already refunded
      const [existingRefund] = await db
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(eq(schema.transactions.paymentId, `refund_${installId}`));

      if (existingRefund) return;

      // Add credit back atomically
      await addBalance(inst.userId, refundAmount);

      // Create refund transaction
      await db
        .insert(schema.transactions)
        .values({
          userId: inst.userId,
          amount: String(refundAmount),
          type: 'topup',
          status: 'completed',
          paymentId: `refund_${installId}`,
        });

      console.log(`[${installId}] 💰 Auto-refund: Rp ${refundAmount} returned to user ${inst.userId}`);
    } catch (refundErr: any) {
      console.error(`[${installId}] ⚠️ Refund failed:`, refundErr.message);
    }
  };

  // 30-minute global timeout to prevent stuck installations
  const globalTimeout = setTimeout(async () => {
    if (installationDone) return;
    installationDone = true;
    console.error(`[${installation_id}] Installation timed out after 30 minutes`);
    const errorLog = logBuffer.slice(-15).join('\n');
    await publishProgress(installation_id, 11, `Installation timed out (30 min)\n\n--- Last logs ---\n${errorLog}`, 'failed');
    await autoRefund(installation_id);
    notifyTelegram(`[TIMEOUT] <b>RDP Install Timed Out</b>\nVPS: ${vps_ip}\nOS: ${windows_version}`);
  }, 30 * 60 * 1000);

  installer(vps_ip, root_password, windows_version, rdp_password, onProgress, onLog)
    .then(async (result) => {
      clearTimeout(globalTimeout);
      installationDone = true; // STOP onLog publishing immediately
      if (result.success) {
        console.log(`[${installation_id}] ✅ Installation completed successfully`);
        const finalLog = logBuffer.slice(-10).join('\n');
        // Force completion update with retry (3 attempts) to prevent stuck state
        for (let i = 0; i < 3; i++) {
          try {
            await publishProgress(installation_id, 100, `Installation completed\n${finalLog}`, 'completed');
            console.log(`[${installation_id}] Completion published (attempt ${i + 1})`);
            break;
          } catch (e) {
            console.error(`[${installation_id}] Completion publish failed (attempt ${i + 1}):`, e);
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        // Telegram notification for successful install
        notifyTelegram(`✅ <b>RDP Install Complete</b>\nVPS: ${vps_ip}\nOS: ${windows_version}`);
      } else {
        console.error(`[${installation_id}] ❌ Installation failed: ${result.error}`);
        const errorLog = logBuffer.slice(-15).join('\n');
        await publishProgress(installation_id, 11, `Failed: ${result.error}\n\n--- Last logs ---\n${errorLog}`, 'failed');
        // Telegram notification for failed install
        notifyTelegram(`❌ <b>RDP Install Failed</b>\nVPS: ${vps_ip}\nOS: ${windows_version}\nError: <code>${(result.error || '').slice(0, 200)}</code>`);

        // AUTO-REFUND: Return credit to user on failure
        await autoRefund(installation_id);
      }
    })
    .catch(async (error) => {
      clearTimeout(globalTimeout);
      installationDone = true; // STOP onLog publishing immediately
      console.error(`[${installation_id}] ❌ Installation error:`, error);
      const errorLog = logBuffer.slice(-15).join('\n');
      await publishProgress(installation_id, 11, `Error: ${error.message}\n\n--- Last logs ---\n${errorLog}`, 'failed');

      // AUTO-REFUND: Return credit to user on failure
      await autoRefund(installation_id);
    });

  res.status(202).json({ success: true, message: 'Installation started', installation_id });
});

// VPS spec check endpoint (pre-flight before installation)
app.post('/api/check-vps', (req, res) => {
  if (!verifyAuth(req, res)) return;

  const { vps_ip, root_password } = req.body;
  if (!vps_ip || !root_password) {
    return res.status(400).json({ success: false, error: 'Missing vps_ip or root_password' });
  }

  const { Client } = require('ssh2');
  const conn = new Client();
  let responded = false;

  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      conn.end();
      res.json({ success: false, error: 'Connection timeout - VPS not responding' });
    }
  }, 15000);

  conn.on('ready', () => {
    clearTimeout(timeout);

    const cmd = [
      'echo "===MEMORY==="',
      'free -m | grep "Mem:" | awk \'{print $2}\'',
      'echo "===DISK==="',
      'df -BG / | tail -1 | awk \'{gsub(/G/, "", $2); print $2}\'',
      'echo "===CPU==="',
      'nproc',
      'echo "===KVM==="',
      'ls /dev/kvm 2>/dev/null && echo "YES" || echo "NO"',
      'echo "===HOSTNAME==="',
      'hostname',
      'echo "===OS==="',
      'lsb_release -d 2>/dev/null | cut -f2 || cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d\'"\' -f2 || echo "Unknown"',
    ].join(' && ');

    conn.exec(cmd, (err: any, stream: any) => {
      if (err) {
        conn.end();
        if (!responded) {
          responded = true;
          return res.json({ success: false, error: `Command failed: ${err.message}` });
        }
        return;
      }

      let output = '';
      stream.on('data', (data: Buffer) => { output += data.toString(); });
      stream.on('close', () => {
        conn.end();
        if (responded) return;
        responded = true;

        try {
          const sections = output.split('===');
          const memoryMB = parseInt(sections[sections.indexOf('MEMORY') + 1]?.trim()) || 0;
          const diskGB = parseInt(sections[sections.indexOf('DISK') + 1]?.trim()) || 0;
          const cpuCores = parseInt(sections[sections.indexOf('CPU') + 1]?.trim()) || 0;
          const kvmSupported = sections[sections.indexOf('KVM') + 1]?.trim().includes('YES');
          const hostname = sections[sections.indexOf('HOSTNAME') + 1]?.trim() || 'unknown';
          const os = sections[sections.indexOf('OS') + 1]?.trim() || 'Unknown';

          const memoryGB = Math.round(memoryMB / 1024 * 100) / 100;

          const specs = {
            memoryMB, memoryGB, diskGB, cpuCores, kvmSupported, hostname, os,
            meetsRequirements: memoryGB >= 1 && diskGB >= 20 && cpuCores >= 1 && kvmSupported,
          };

          if (!specs.meetsRequirements) {
            const reasons: string[] = [];
            if (memoryGB < 1) reasons.push(`RAM: ${memoryGB}GB (min 1GB)`);
            if (diskGB < 20) reasons.push(`Disk: ${diskGB}GB (min 20GB)`);
            if (cpuCores < 1) reasons.push(`CPU: ${cpuCores} cores (min 1)`);
            if (!kvmSupported) reasons.push('KVM not supported');

            return res.json({
              success: false,
              error: `VPS does not meet minimum requirements: ${reasons.join(', ')}`,
              specs,
            });
          }

          res.json({ success: true, specs });
        } catch (parseErr: any) {
          res.json({ success: false, error: `Failed to parse VPS specs: ${parseErr.message}` });
        }
      });
    });
  });

  conn.on('error', (err: Error) => {
    clearTimeout(timeout);
    if (responded) return;
    responded = true;
    const msg = err.message.includes('authentication') ? 'Wrong password' :
                err.message.includes('ECONNREFUSED') ? 'Connection refused - check IP' :
                err.message.includes('timeout') ? 'Connection timeout' : err.message;
    res.json({ success: false, error: msg });
  });

  conn.connect({
    host: vps_ip,
    port: 22,
    username: 'root',
    password: root_password,
    readyTimeout: 15000,
    algorithms: {
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
    } as any,
  });
});

// Execute arbitrary command on a VPS via SSH
app.post('/api/exec-command', (req, res) => {
  if (!verifyAuth(req, res)) return;

  const { vps_ip, root_password, command } = req.body;
  if (!vps_ip || !root_password || !command) {
    return res.status(400).json({ success: false, error: 'Missing vps_ip, root_password, or command' });
  }

  const { Client } = require('ssh2');
  const conn = new Client();
  let responded = false;

  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      conn.end();
      res.json({ success: false, error: 'Connection timeout - VPS not responding' });
    }
  }, 15000);

  conn.on('ready', () => {
    clearTimeout(timeout);
    conn.exec(command, (err: any, stream: any) => {
      if (err) {
        conn.end();
        if (!responded) {
          responded = true;
          return res.json({ success: false, error: `Command failed: ${err.message}` });
        }
        return;
      }

      let stdout = '';
      let stderr = '';
      stream.on('data', (data: Buffer) => { stdout += data.toString(); });
      stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
      stream.on('close', (code: number) => {
        conn.end();
        if (responded) return;
        responded = true;
        res.json({ success: code === 0, output: stdout.trim(), error: stderr.trim() || undefined, exitCode: code });
      });
    });
  });

  conn.on('error', (err: Error) => {
    clearTimeout(timeout);
    if (responded) return;
    responded = true;
    const msg = err.message.includes('authentication') ? 'Wrong password' :
                err.message.includes('ECONNREFUSED') ? 'Connection refused - check IP' :
                err.message.includes('timeout') ? 'Connection timeout' : err.message;
    res.json({ success: false, error: msg });
  });

  conn.connect({
    host: vps_ip,
    port: 22,
    username: 'root',
    password: root_password,
    readyTimeout: 15000,
    algorithms: {
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
    } as any,
  });
});

app.listen(config.port, () => {
  console.log(`Ubuntu service running on port ${config.port}`);
});
