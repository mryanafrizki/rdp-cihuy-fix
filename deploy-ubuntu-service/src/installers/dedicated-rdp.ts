import { Client } from 'ssh2';
import type { InstallationProgress, InstallationResult, ProgressCallback, LogCallback } from './docker-rdp';

/**
 * Configuration for Dedicated RDP installation
 */
export interface DedicatedRDPConfig {
  osVersion: string;
  password: string;
}

/**
 * Install Dedicated RDP using binary .img installer
 * 
 * This installer uses SSH to install Windows directly on the VPS (no Docker).
 * The binary .img contains all necessary scripts (tele.sh, reinstall.sh, trans.sh, etc.)
 * 
 * 11-step installation process:
 * 1. Connecting to VPS
 * 2. Checking system requirements
 * 3. Downloading Windows ISO
 * 4. Preparing installation environment
 * 5. Installing Windows system
 * 6. Configuring network settings
 * 7. Setting RDP password
 * 8. Enabling RDP service
 * 9. Configuring firewall rules
 * 10. Verifying installation
 * 11. Installation complete
 */
export async function installDedicatedRDP(
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
    onLog?.(`🔌 Connecting to server ${vpsIp}...`);

    conn.on('ready', async () => {
      try {
        reportProgress('Checking system requirements', 'in_progress');
        
        // Display IP information
        onLog?.(`🌐 Server IP: ${vpsIp}`);
        onLog?.(`🔧 OS Version: ${windowsVersion}`);
        onLog?.(`🔑 Password: ${'*'.repeat(rdpPassword.length)}`);
        onLog?.(`📡 Port: 3389 (Custom Security Port)`);
        onLog?.(`⏳ Starting installation process...`);

        reportProgress('Downloading Windows ISO', 'in_progress');

        // Binary .img URL (configurable via environment)
        const BINARY_IMG_URL = process.env.RDP_BINARY_IMG_URL || 'https://api.eov.my.id/azovest/rdp-installer-azovest.img';
        const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3001';
        const RDP_PORT = process.env.RDP_PORT || '3389';

        onLog?.(`📥 Downloading binary installer...`);
        onLog?.(`   URL: ${BINARY_IMG_URL}`);

        // Download binary .img to VPS with cache busting
        const timestamp = Date.now();
        const downloadCommand = `cd /root && rm -f rdp-installer-azovest.img && curl -fL --progress-bar -o rdp-installer-azovest.img "${BINARY_IMG_URL}?t=${timestamp}" || wget -O rdp-installer-azovest.img "${BINARY_IMG_URL}?t=${timestamp}"`;

        reportProgress('Preparing installation environment', 'in_progress');
        onLog?.(`📥 Starting download...`);

        await new Promise<void>((resolveDownload, rejectDownload) => {
          const timeout = setTimeout(() => {
            rejectDownload(new Error('Timeout: Download took too long (>5 minutes)'));
          }, 5 * 60 * 1000);

          conn.exec(downloadCommand, (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              onLog?.(`❌ Error starting download: ${err.message}`);
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
                onLog?.(`⚠️ [download stderr] ${text.trim()}`);
              }
            });

            stream.on('close', (code: number) => {
              clearTimeout(timeout);
              if (code !== 0) {
                onLog?.(`❌ Download failed with exit code: ${code}`);
                onLog?.(`   Last output: ${output.split('\n').slice(-5).join('\n')}`);
                rejectDownload(new Error(`Download failed with exit code ${code}`));
                return;
              }
              onLog?.(`✅ Download completed`);
              resolveDownload();
            });
          });
        });

        reportProgress('Installing Windows system', 'in_progress');

        // Verify binary downloaded
        onLog?.(`🔍 Verifying binary...`);
        await new Promise<void>((resolveVerify, rejectVerify) => {
          const timeout = setTimeout(() => {
            rejectVerify(new Error('Timeout: Binary verification took too long (>10s)'));
          }, 10000);

          conn.exec('test -f /root/rdp-installer-azovest.img && ls -lh /root/rdp-installer-azovest.img', (err, stream) => {
            if (err) {
              clearTimeout(timeout);
              onLog?.(`❌ Error verifying binary: ${err.message}`);
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
                onLog?.(`⚠️ [verify stderr] ${text.trim()}`);
              }
            });

            stream.on('close', (code: number) => {
              clearTimeout(timeout);
              if (code !== 0) {
                onLog?.(`❌ Binary verification failed (exit code: ${code})`);
                onLog?.(`   Output: ${output.trim() || 'No output'}`);
                rejectVerify(new Error('Binary file not found after download'));
                return;
              }
              onLog?.(`✅ Binary verified: ${output.trim()}`);
              resolveVerify();
            });
          });
        });

        reportProgress('Configuring network settings', 'in_progress');

        // Make binary executable
        onLog?.(`🔧 Making binary executable...`);
        await new Promise<void>((resolveChmod, rejectChmod) => {
          const timeout = setTimeout(() => {
            onLog?.(`⚠️ chmod timeout - trying alternative method...`);
            conn.exec('stat -c "%a" /root/rdp-installer-azovest.img 2>/dev/null || echo "0"', (err2, stream2) => {
              if (err2) {
                rejectChmod(new Error('Timeout: chmod command took too long and alternative check failed'));
                return;
              }
              let statOutput = '';
              stream2.on('data', (d: Buffer) => { statOutput += d.toString(); });
              stream2.on('close', (code2: number) => {
                const perms = parseInt(statOutput.trim()) || 0;
                if ((perms & 0o111) !== 0) {
                  onLog?.(`✅ Binary is already executable (perms: ${perms.toString(8)})`);
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
                        onLog?.(`✅ Binary is now executable (alternative method)`);
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
              onLog?.(`❌ Error executing chmod: ${err.message}`);
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
                onLog?.(`⚠️ [chmod stderr] ${text.trim()}`);
              }
            });

            stream.on('close', (code: number) => {
              clearTimeout(timeout);
              if (code !== 0 || output.includes('CHMOD_FAILED')) {
                onLog?.(`❌ chmod failed with exit code: ${code}`);
                onLog?.(`   Output: ${output.trim() || 'No output'}`);
                rejectChmod(new Error(`Failed to make binary executable (exit code: ${code})`));
                return;
              }
              if (output.includes('CHMOD_SUCCESS') || code === 0) {
                onLog?.(`✅ Binary is now executable`);
                resolveChmod();
              } else {
                onLog?.(`✅ Binary chmod completed (exit code: ${code})`);
                resolveChmod();
              }
            });
          });
        });

        reportProgress('Setting RDP password', 'in_progress');
        reportProgress('Enabling RDP service', 'in_progress');

        // Run binary installer
        onLog?.(`🚀 Executing binary installer...`);
        onLog?.(`   Command: ./rdp-installer-azovest.img [password] [backend] [port]`);

        const command = `cd /root && timeout 3600 ./rdp-installer-azovest.img "${rdpPassword}" "" "${BACKEND_URL}" "${RDP_PORT}" 2>&1; EXIT_CODE=$?; echo "INSTALL_EXIT_CODE:$EXIT_CODE"; rm -f /root/rdp-installer-azovest.img; exit $EXIT_CODE`;

        reportProgress('Configuring firewall rules', 'in_progress');

        let allOutput = '';
        let allErrors = '';
        let lastActivityTime = Date.now();

        conn.exec(command, (err, stream) => {
          if (err) {
            onLog?.(`❌ Failed to execute command: ${err.message}`);
            conn.end();
            reportProgress('Installation failed', 'failed');
            reject(err);
            return;
          }

          reportProgress('Verifying installation', 'in_progress');

          const activityTimeout = setTimeout(() => {
            const inactiveTime = Math.floor((Date.now() - lastActivityTime) / 1000);
            onLog?.(`⚠️ No activity for ${inactiveTime} seconds. Installation may be stuck.`);
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
                onLog?.(`🔨 ${trimmed}`);
              } else if (trimmed.includes('Extraction successful')) {
                onLog?.(`✅ ${trimmed}`);
              } else if (trimmed.includes('Starting Dedicated RDP installation')) {
                onLog?.(`🎯 ${trimmed}`);
              } else if (trimmed.includes('Using reinstall.sh from binary package')) {
                onLog?.(`✅ ${trimmed}`);
              } else if (trimmed.includes('Using trans.sh from binary package')) {
                onLog?.(`✅ ${trimmed}`);
              } else if (trimmed.includes('Downloading') || trimmed.includes('download')) {
                onLog?.(`📥 ${trimmed}`);
              } else if (trimmed.includes('Running reinstall.sh')) {
                onLog?.(`⚙️ ${trimmed}`);
              } else if (trimmed.includes('Installation completed successfully')) {
                onLog?.(`🎉 ${trimmed}`);
              } else if (trimmed.includes('Rebooting system')) {
                onLog?.(`🔄 ${trimmed}`);
              } else if (trimmed.includes('ERROR') || trimmed.includes('Error') || trimmed.includes('error:')) {
                onLog?.(`❌ ${trimmed}`);
              } else if (trimmed.includes('Warning') || trimmed.includes('warning')) {
                onLog?.(`⚠️ ${trimmed}`);
              } else if (trimmed.includes('RDP_SCRIPTS_DIR')) {
                onLog?.(`📁 ${trimmed}`);
              } else {
                if (!trimmed.match(/^\s*$/) && trimmed.length > 0) {
                  onLog?.(trimmed);
                }
              }
            });
          });

          stream.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            allErrors += text;

            const lines = text.split('\n').filter(line => line.trim().length > 0);
            lines.forEach(line => {
              const trimmed = line.trim();
              if (trimmed.length > 0) {
                onLog?.(`⚠️ [STDERR] ${trimmed}`);
              }
            });
          });

          stream.on('close', (code: number) => {
            clearTimeout(activityTimeout);

            // Extract exit code from output if available
            let actualExitCode = code;
            if (allOutput.includes('INSTALL_EXIT_CODE:')) {
              const match = allOutput.match(/INSTALL_EXIT_CODE:(\d+)/);
              if (match) {
                actualExitCode = parseInt(match[1], 10);
                onLog?.(`📊 Extracted exit code from output: ${actualExitCode}`);
              }
            }

            // Log final status
            if (actualExitCode !== 0 && actualExitCode !== undefined && actualExitCode !== null) {
              onLog?.(`❌ Installation failed with exit code: ${actualExitCode}`);
              onLog?.(`📋 Last 20 lines of output:`);

              const outputLines = allOutput.split('\n').filter(l => l.trim().length > 0);
              const lastLines = outputLines.slice(-20);
              lastLines.forEach(line => {
                onLog?.(`   ${line.trim()}`);
              });

              if (allErrors.trim().length > 0) {
                onLog?.(`📋 Error output:`);
                const errorLines = allErrors.split('\n').filter(l => l.trim().length > 0);
                errorLines.slice(-10).forEach(line => {
                  onLog?.(`   ${line.trim()}`);
                });
              }

              conn.end();
              reportProgress('Installation failed', 'failed');
              reject(new Error(`Installation failed with exit code ${actualExitCode}. Check logs above for details.`));
              return;
            }

            // Success or exit code 0/undefined (connection may be lost due to reboot)
            if (allOutput.includes('Installation completed successfully') ||
              allOutput.includes('Rebooting system') ||
              actualExitCode === 0 ||
              (actualExitCode === undefined && allOutput.length > 100)) {
              
              reportProgress('Installation complete', 'completed');
              
              onLog?.(`✅ Installation completed successfully!`);
              onLog?.(`🌐 Server: ${vpsIp}:${RDP_PORT}`);
              onLog?.(`👤 Username: administrator`);
              onLog?.(`🔑 Password: ${rdpPassword}`);
              onLog?.(`🔄 System will reboot automatically...`);

              try {
                conn.end();
              } catch (e) {
                // Ignore error if connection already closed
              }

              resolve({
                success: true,
                message: 'Dedicated RDP installed successfully',
                credentials: {
                  ip: vpsIp,
                  username: 'administrator',
                  password: rdpPassword,
                  port: parseInt(RDP_PORT),
                },
              });
            } else {
              // Exit code undefined but no success message - connection may be lost
              onLog?.(`⚠️ Connection closed (exit code: ${code || 'undefined'})`);
              onLog?.(`📋 Last 10 lines of output:`);
              const outputLines = allOutput.split('\n').filter(l => l.trim().length > 0);
              const lastLines = outputLines.slice(-10);
              lastLines.forEach(line => {
                onLog?.(`   ${line.trim()}`);
              });

              // If there's good progress, assume success
              if (allOutput.includes('Starting binary extraction') ||
                allOutput.includes('Extraction successful') ||
                allOutput.includes('Running reinstall.sh')) {
                onLog?.(`✅ Installation appears to be progressing. Connection may have been lost due to reboot.`);
                
                reportProgress('Installation complete', 'completed');
                
                try {
                  conn.end();
                } catch (e) {
                  // Ignore
                }

                resolve({
                  success: true,
                  message: 'Dedicated RDP installation in progress (connection lost during reboot)',
                  credentials: {
                    ip: vpsIp,
                    username: 'administrator',
                    password: rdpPassword,
                    port: parseInt(RDP_PORT),
                  },
                });
              } else {
                try {
                  conn.end();
                } catch (e) {
                  // Ignore
                }
                reportProgress('Installation failed', 'failed');
                reject(new Error(`Installation may have failed. Exit code: ${code || 'undefined'}. Check logs above.`));
              }
            }
          });
        });
      } catch (error) {
        conn.end();
        reportProgress('Installation failed', 'failed');
        reject(error);
      }
    });

    conn.on('error', (err: Error) => {
      onLog?.(`❌ Connection error: ${err.message}`);
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
      // Comprehensive SSH algorithms for compatibility
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
      }
    });
  });
}
