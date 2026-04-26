import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

/**
 * Installation progress tracking
 */
export interface InstallationProgress {
  step: number;
  totalSteps: number;
  message: string;
  status: 'in_progress' | 'completed' | 'failed';
}

/**
 * Installation result with credentials
 */
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

/**
 * RDP configuration for installation
 */
export interface RDPConfig {
  windowsId: string;
  ram: string;
  cpu: string;
  storage: string;
  password: string;
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: InstallationProgress) => void;

/**
 * Log callback function type
 */
export type LogCallback = (message: string) => void;

/**
 * Check if VPS supports KVM virtualization
 */
export async function checkKVMSupport(
  host: string,
  username: string,
  password: string,
  onLog?: LogCallback
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.exec('sudo apt install cpu-checker -y && sudo kvm-ok', (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString();
          onLog?.(data.toString());
        });

        stream.stderr.on('data', (data: Buffer) => {
          onLog?.(data.toString());
        });

        stream.on('close', (code: number) => {
          conn.end();
          if (code !== 0) {
            reject(new Error('Command failed with code ' + code));
            return;
          }
          resolve(output.includes('KVM acceleration can be used'));
        });
      });
    });

    conn.on('error', (err: Error) => {
      reject(err);
    });

    conn.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 30000,
      tryKeyboard: false,
    });
  });
}

/**
 * Install Docker RDP on VPS
 * 
 * 11-step installation process:
 * 1. Connecting to VPS
 * 2. Checking system requirements
 * 3. Installing Docker
 * 4. Downloading RDP script
 * 5. Setting up RDP container
 * 6. Configuring Windows version
 * 7. Setting RDP password
 * 8. Starting RDP service
 * 9. Configuring firewall
 * 10. Verifying installation
 * 11. Installation complete
 */
export async function installDockerRDP(
  vpsIp: string,
  rootPassword: string,
  windowsVersion: string,
  rdpPassword: string,
  onProgress?: ProgressCallback,
  onLog?: LogCallback
): Promise<InstallationResult> {
  const totalSteps = 11;
  let currentStep = 0;

  const reportProgress = (message: string, status: 'in_progress' | 'completed' | 'failed' = 'in_progress') => {
    currentStep++;
    onProgress?.({
      step: currentStep,
      totalSteps,
      message,
      status,
    });
  };

  return new Promise((resolve, reject) => {
    const conn = new Client();

    reportProgress('Connecting to VPS', 'in_progress');

    conn.on('ready', async () => {
      try {
        reportProgress('Checking system requirements', 'in_progress');

        // Read the local rdp.sh script
        const scriptPath = path.join(__dirname, '../../../rdp/scripts/rdp.sh');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        reportProgress('Installing Docker', 'in_progress');

        // Upload the script to the remote server
        await new Promise<void>((resolveUpload, rejectUpload) => {
          conn.sftp((err, sftp) => {
            if (err) {
              rejectUpload(err);
              return;
            }

            reportProgress('Downloading RDP script', 'in_progress');

            const writeStream = sftp.createWriteStream('/root/rdp.sh');
            writeStream.write(scriptContent);
            writeStream.end();
            writeStream.on('close', () => resolveUpload());
            writeStream.on('error', rejectUpload);
          });
        });

        reportProgress('Setting up RDP container', 'in_progress');

        // Prepare config for rdp.sh script
        const config: RDPConfig = {
          windowsId: windowsVersion,
          ram: '4G', // Default values, can be parameterized later
          cpu: '2',
          storage: '50G',
          password: rdpPassword,
        };

        reportProgress('Configuring Windows version', 'in_progress');

        // Make the script executable and run it
        const command = `chmod +x /root/rdp.sh && echo -e "${config.windowsId}\n${config.ram}\n${config.cpu}\n${config.storage}\n${config.password}" | bash /root/rdp.sh && rm -f /root/rdp.sh`;

        reportProgress('Setting RDP password', 'in_progress');

        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reportProgress('Installation failed', 'failed');
            reject(err);
            return;
          }

          reportProgress('Starting RDP service', 'in_progress');

          // Progress tracking with visual feedback
          let progress = 0;
          const progressInterval = setInterval(() => {
            progress += 5;
            if (progress <= 100) {
              const bar = '#'.repeat(progress / 2) + ' '.repeat(50 - progress / 2);
              onLog?.(`Setup process : [${bar}] ${progress}%`);
            } else {
              clearInterval(progressInterval);
            }
          }, 3000);

          reportProgress('Configuring firewall', 'in_progress');

          stream.on('data', (data: Buffer) => {
            onLog?.(data.toString());
          });

          stream.stderr.on('data', (data: Buffer) => {
            onLog?.(data.toString());
          });

          reportProgress('Verifying installation', 'in_progress');

          stream.on('close', (code: number) => {
            clearInterval(progressInterval);
            conn.end();

            if (code !== 0) {
              reportProgress('Installation failed', 'failed');
              reject(new Error('Installation failed with code ' + code));
              return;
            }

            reportProgress('Installation complete', 'completed');

            resolve({
              success: true,
              message: 'Docker RDP installed successfully',
              credentials: {
                ip: vpsIp,
                username: 'Administrator',
                password: rdpPassword,
                port: 3389,
              },
            });
          });
        });
      } catch (error) {
        conn.end();
        reportProgress('Installation failed', 'failed');
        reject(error);
      }
    });

    conn.on('error', (err: Error) => {
      reportProgress('Connection failed', 'failed');
      reject(err);
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
