import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

export interface InstallationProgress {
  step: number;
  totalSteps: number;
  message: string;
  status: 'in_progress' | 'completed' | 'failed';
}

export interface InstallationResult {
  success: boolean;
  message?: string;
  error?: string;
  credentials?: {
    ip: string;
    username: string;
    password: string;
    port: number;
  };
}

export type ProgressCallback = (progress: InstallationProgress) => void;
export type LogCallback = (message: string) => void;

/**
 * Docker OS versions — maps web panel IDs to numeric IDs expected by rdp.sh.
 * rdp.sh case mapping (line 183-203):
 *   1->11(Win11Pro) 2->11l(Win11LTSC) 3->11e(Win11Ent)
 *   4->10(Win10Pro) 5->10l(Win10LTSC) 6->10e(Win10Ent)
 *   7->8e(Win8.1) 8->7u(Win7) 9->vu(Vista) 10->xp 11->2k
 *   12->2022 13->2019 14->2016 15->2012 16->2008 17->2025 18->2003
 *   19->tiny11 (dockur built-in)
 */
const DOCKER_OS_MAP: Record<string, number> = {
  'docker_win11_pro': 1,
  'docker_win11_ltsc': 2,
  'docker_win11_ent': 3,
  'docker_win10_pro': 4,
  'docker_win10_ltsc': 5,
  'docker_win10_ent': 6,
  'docker_win81_ent': 7,
  'docker_win7': 8,
  'docker_vista': 9,
  'docker_xp': 10,
  'docker_2000': 11,
  'docker_srv2022': 12,
  'docker_srv2019': 13,
  'docker_srv2016': 14,
  'docker_srv2012': 15,
  'docker_srv2008': 16,
  'docker_srv2025': 17,
  'docker_srv2003': 18,
  'docker_tiny11': 19,
};

/** All valid Docker OS IDs */
export const DOCKER_VALID_OS = Object.keys(DOCKER_OS_MAP);

/** Upload string content as file via SFTP */
function sftpUpload(conn: Client, remotePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', () => resolve());
      ws.on('error', reject);
      ws.write(content);
      ws.end();
    });
  });
}

/**
 * Install Docker RDP on VPS using the original rdp.sh script.
 *
 * rdp.sh reads 5 stdin lines:
 *   1. windowsId (numeric 1-20)
 *   2. ram (number, e.g. 4 — script appends "G")
 *   3. cpu (number, e.g. 2)
 *   4. storage (number, e.g. 50 — script appends "G")
 *   5. password
 *
 * rdp.sh installs Docker if missing, creates docker-compose.yml,
 * pulls dockurr/windows image, starts container.
 * Ports: 8006 (noVNC web viewer) + 3389 (RDP)
 * Credentials: username=Administrator, password=<provided>
 */
export async function installDockerRDP(
  vpsIp: string,
  rootPassword: string,
  windowsVersion: string,
  rdpPassword: string,
  onProgress?: ProgressCallback,
  onLog?: LogCallback,
): Promise<InstallationResult> {
  // Total steps: 100 (percentage-based, matching rdp.sh output)
  const totalSteps = 100;

  const progress = (step: number, message: string, status: 'in_progress' | 'completed' | 'failed' = 'in_progress') => {
    onProgress?.({ step, totalSteps, message, status });
  };

  // Map web panel OS ID to numeric ID for rdp.sh
  const numericId = DOCKER_OS_MAP[windowsVersion];
  if (!numericId) {
    progress(1, `Invalid Docker OS version: ${windowsVersion}`, 'failed');
    return { success: false, error: `Invalid Docker OS version: ${windowsVersion}` };
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch { /* ignore */ }
      reject(new Error(msg));
    };

    const timeout = setTimeout(() => fail('SSH connection timeout (60s)'), 60000);

    conn.on('error', (err: Error) => {
      clearTimeout(timeout);
      fail(`Connection failed: ${err.message}`);
    });

    conn.on('ready', async () => {
      clearTimeout(timeout);

      try {
        // Step 1: Connected
        progress(2, 'Connected to VPS');
        onLog?.(`Connected to ${vpsIp}`);

        // Step 2: Upload rdp.sh script
        progress(5, 'Uploading installer script');
        const scriptPath = path.join(__dirname, '../../scripts/rdp.sh');
        let scriptContent: string;
        try {
          scriptContent = fs.readFileSync(scriptPath, 'utf8');
        } catch (e: any) {
          fail(`Cannot read rdp.sh: ${e.message}. Path: ${scriptPath}`);
          return;
        }
        await sftpUpload(conn, '/root/rdp.sh', scriptContent);
        onLog?.('Script uploaded to /root/rdp.sh');

        // Step 3: Detect VPS specs (CPU + RAM)
        progress(8, 'Detecting VPS specs');

        const specs = await new Promise<{ cpu: number; ram: number }>((res) => {
          conn.exec('nproc && grep MemTotal /proc/meminfo | awk \'{print int($2/1024/1024)}\'', (err, stream) => {
            if (err) { res({ cpu: 2, ram: 4 }); return; }
            let out = '';
            stream.on('data', (d: Buffer) => { out += d.toString(); });
            stream.on('close', () => {
              const lines = out.trim().split('\n');
              const cpu = parseInt(lines[0]) || 2;
              const ram = parseInt(lines[1]) || 4;
              res({ cpu, ram });
            });
          });
        });
        onLog?.(`Detected: ${specs.cpu} vCPU, ${specs.ram}G RAM`);

        // Step 4: Execute rdp.sh with stdin parameters
        progress(10, 'Starting Docker RDP installation');

        // rdp.sh expects: windowsId\nram\ncpu\nstorage\npassword
        // ram/storage as numbers (script appends "G")
        // Disk=0 means auto-detect (rdp.sh uses available disk minus 10GB for OS)
        const cmd = `chmod +x /root/rdp.sh && printf '${numericId}\\n${specs.ram}\\n${specs.cpu}\\n0\\n${rdpPassword}\\n' | bash /root/rdp.sh 2>&1; EXIT_CODE=$?; sleep 1; echo "RDPSH_EXIT=$EXIT_CODE"`;

        onLog?.(`Running rdp.sh with OS ID=${numericId}, RAM=${specs.ram}G, CPU=${specs.cpu}, Disk=auto`);

        conn.exec(cmd, (err, stream) => {
          if (err) {
            fail(`SSH exec error: ${err.message}`);
            return;
          }

          let lastProgress = 8;
          let fullOutput = '';

          stream.on('data', (data: Buffer) => {
            const text = data.toString();
            fullOutput += text;
            onLog?.(text);

            // Parse progress from rdp.sh output: "Setup process : [####...] XX%"
            const progressMatch = text.match(/Setup process\s*:\s*\[.*?\]\s*(\d+)%/);
            if (progressMatch) {
              const pct = parseInt(progressMatch[1]);
              // Map rdp.sh 0-100% to our 10-90 range
              const mappedStep = Math.floor(10 + (pct * 0.8));
              if (mappedStep > lastProgress) {
                lastProgress = mappedStep;
                progress(mappedStep, `Installing: ${pct}%`);
              }
            }

            // Parse other status messages
            if (text.includes('Installing Docker')) {
              if (lastProgress < 12) { lastProgress = 12; progress(12, 'Installing Docker'); }
            } else if (text.includes('Downloading Windows image')) {
              if (lastProgress < 20) { lastProgress = 20; progress(20, 'Downloading Windows image'); }
            } else if (text.includes('Starting Windows container')) {
              if (lastProgress < 85) { lastProgress = 85; progress(85, 'Starting Windows container'); }
            } else if (text.includes('Container started successfully')) {
              if (lastProgress < 92) { lastProgress = 92; progress(92, 'Container started'); }
            } else if (text.includes('Installation completed successfully')) {
              if (lastProgress < 95) { lastProgress = 95; progress(95, 'Installation completed'); }
            }
          });

          stream.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            fullOutput += text;
            onLog?.(text);
          });

          stream.on('close', () => {
            // Clean up script
            conn.exec('rm -f /root/rdp.sh', () => {
              try { conn.end(); } catch { /* ignore */ }
            });

            // Check exit code from output
            const exitMatch = fullOutput.match(/RDPSH_EXIT=(\d+)/);
            const exitCode = exitMatch ? parseInt(exitMatch[1]) : -1;

            // Consider success if: explicit exit 0, OR we saw completion markers in output
            const sawCompletion = fullOutput.includes('Installation completed successfully') ||
                                  fullOutput.includes('Container started successfully');
            const isSuccess = exitCode === 0 || (exitCode === -1 && sawCompletion);

            if (!isSuccess) {
              fail(`rdp.sh failed (exit=${exitCode}, sawCompletion=${sawCompletion})`);
              return;
            }

            if (settled) return;
            settled = true;

            // Success — do NOT call progress('completed'), let index.ts .then() do it
            resolve({
              success: true,
              message: 'Docker RDP installed successfully',
              credentials: {
                ip: vpsIp,
                username: 'Administrator',
                password: rdpPassword,
                port: 22,
              },
            });
          });
        });
      } catch (error: any) {
        fail(`Installation error: ${error.message}`);
      }
    });

    conn.connect({
      host: vpsIp,
      port: 22,
      username: 'root',
      password: rootPassword,
      readyTimeout: 30000,
      tryKeyboard: false,
    });
  });
}
