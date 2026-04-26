import { Client } from 'ssh2';

/**
 * VPS Validation Utilities
 * Adapted from Telegram bot's VPS checker and specs detector
 */

export interface SSHConnectionResult {
  success: boolean;
  error?: string;
}

export interface KVMSupportResult {
  supported: boolean;
  error?: string;
}

export interface VPSSpecs {
  memory: string;
  memoryMB: number;
  memoryGB: number;
  disk: string;
  diskGB: number;
  cpu: string;
  cpuCores: number;
  cpuModel: string;
  hostname: string;
  hostname_short: string;
  os: string;
  uptime: string;
  meetsMinimumRequirements: {
    memory: boolean;
    disk: boolean;
    cpu: boolean;
    overall: boolean;
  };
  formattedSpecs: {
    memory: string;
    disk: string;
    cpu: string;
  };
}

export interface VPSSpecsResult {
  success: boolean;
  specs?: VPSSpecs;
  error?: string;
}

/**
 * Validates IPv4 format
 * @param ip - IP address to validate
 * @returns true if valid IPv4 format
 */
export function validateIPFormat(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) {
    return false;
  }
  
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Tests SSH connection to VPS
 * @param ip - VPS IP address
 * @param password - SSH password (username is 'root')
 * @returns Connection result with success status
 */
export async function checkSSHConnection(
  ip: string,
  password: string
): Promise<SSHConnectionResult> {
  return new Promise((resolve) => {
    const conn = new Client();
    let connectionTimeout: NodeJS.Timeout;

    connectionTimeout = setTimeout(() => {
      conn.end();
      resolve({
        success: false,
        error: 'Connection timeout - VPS tidak merespon dalam 10 detik'
      });
    }, 10000);

    conn.on('ready', () => {
      clearTimeout(connectionTimeout);
      conn.end();
      resolve({ success: true });
    });

    conn.on('error', (err: any) => {
      clearTimeout(connectionTimeout);
      
      let errorMsg = 'Gagal terhubung ke VPS';
      if (err.level === 'client-authentication') {
        errorMsg = 'Password atau username salah';
      } else if (err.code === 'ECONNREFUSED') {
        errorMsg = 'Koneksi ditolak - Pastikan SSH service berjalan di port 22';
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        errorMsg = 'Timeout - VPS tidak merespon (cek firewall/network)';
      } else if (err.code === 'EHOSTUNREACH') {
        errorMsg = 'Host tidak dapat dijangkau - Periksa IP address';
      } else {
        errorMsg = err.message || 'Unknown error';
      }
      
      resolve({
        success: false,
        error: errorMsg
      });
    });

    conn.on('timeout', () => {
      clearTimeout(connectionTimeout);
      conn.end();
      resolve({
        success: false,
        error: 'Connection timeout - VPS tidak merespon'
      });
    });

    conn.connect({
      host: ip,
      port: 22,
      username: 'root',
      password,
      readyTimeout: 10000
    });
  });
}

/**
 * Checks if VPS supports KVM virtualization
 * @param ip - VPS IP address
 * @param password - SSH password (username is 'root')
 * @returns KVM support result
 */
export async function checkKVMSupport(
  ip: string,
  password: string
): Promise<KVMSupportResult> {
  return new Promise((resolve) => {
    const conn = new Client();
    let connectionTimeout: NodeJS.Timeout;

    connectionTimeout = setTimeout(() => {
      conn.end();
      resolve({
        supported: false,
        error: 'Connection timeout'
      });
    }, 10000);

    conn.on('ready', () => {
      clearTimeout(connectionTimeout);
      
      conn.exec('ls -la /dev/kvm', (err, stream) => {
        if (err) {
          conn.end();
          resolve({
            supported: false,
            error: err.message
          });
          return;
        }

        let output = '';
        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.on('close', (code: number) => {
          conn.end();
          const supported = code === 0 && output.includes('/dev/kvm');
          resolve({ supported });
        });
      });
    });

    conn.on('error', (err: any) => {
      clearTimeout(connectionTimeout);
      resolve({
        supported: false,
        error: err.message || 'Connection error'
      });
    });

    conn.connect({
      host: ip,
      port: 22,
      username: 'root',
      password,
      readyTimeout: 10000
    });
  });
}

/**
 * Detects VPS specifications (RAM, CPU, disk, OS)
 * @param ip - VPS IP address
 * @param password - SSH password (username is 'root')
 * @returns VPS specs result
 */
export async function detectVPSSpecs(
  ip: string,
  password: string
): Promise<VPSSpecsResult> {
  return new Promise((resolve) => {
    const conn = new Client();
    let connectionTimeout: NodeJS.Timeout;

    connectionTimeout = setTimeout(() => {
      conn.end();
      resolve({
        success: false,
        error: 'Connection timeout - VPS tidak merespon dalam 30 detik'
      });
    }, 30000);

    conn.on('ready', () => {
      clearTimeout(connectionTimeout);
      
      const commands = {
        memory: `free -h | grep "Mem:" | awk '{print $2}' && echo "---MB---" && free -m | grep "Mem:" | awk '{print $2}'`,
        disk: `df -h / | tail -1 | awk '{print $2}' && echo "---GB---" && df -BG / | tail -1 | awk '{gsub(/G/, "", $2); print $2}'`,
        cpu: `nproc && echo "---CORES---" && cat /proc/cpuinfo | grep "model name" | head -1 | cut -d':' -f2 | xargs`,
        hostname: `hostname && echo "---SHORT---" && hostname -s`,
        os: `lsb_release -d 2>/dev/null | cut -f2 || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2`,
        uptime: `uptime -p 2>/dev/null || uptime | awk '{print $3,$4}' | sed 's/,//'`
      };

      const results: Record<string, string> = {};
      let completedCommands = 0;
      const totalCommands = Object.keys(commands).length;

      Object.entries(commands).forEach(([key, cmd]) => {
        conn.exec(cmd, (err, stream) => {
          if (err) {
            results[key] = 'Unknown';
            completedCommands++;
            if (completedCommands === totalCommands) {
              conn.end();
              processResults();
            }
            return;
          }

          let output = '';
          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.on('close', () => {
            results[key] = output.trim();
            completedCommands++;

            if (completedCommands === totalCommands) {
              conn.end();
              processResults();
            }
          });
        });
      });

      function processResults() {
        try {
          // Validate results exist
          if (!results.memory || !results.disk || !results.cpu || !results.hostname) {
            throw new Error('Incomplete command results - VPS mungkin tidak memiliki tools standar (free, df, nproc)');
          }

          const memoryData = results.memory.split('---MB---');
          const diskData = results.disk.split('---GB---');
          const hostnameData = results.hostname.split('---SHORT---');
          const cpuData = results.cpu.split('---CORES---');

          // Validate parsed data
          if (memoryData.length < 2 || diskData.length < 2 || cpuData.length < 2) {
            throw new Error('Gagal parsing output VPS - format tidak sesuai');
          }

          const memoryMB = parseFloat(memoryData[1]);
          const diskGB = parseInt(diskData[1], 10);
          const cpuCores = parseInt(cpuData[0], 10);

          // Validate numeric values
          if (isNaN(memoryMB) || isNaN(diskGB) || isNaN(cpuCores)) {
            throw new Error(`Gagal membaca spesifikasi VPS - nilai tidak valid (RAM: ${memoryData[1]}, Disk: ${diskData[1]}, CPU: ${cpuData[0]})`);
          }

          const memoryGB = memoryMB / 1024;

          const specs: VPSSpecs = {
            memory: memoryData[0],
            memoryMB: parseInt(memoryMB.toString(), 10),
            memoryGB: Math.round(memoryGB * 100) / 100,
            disk: diskData[0],
            diskGB: diskGB,
            cpu: `${cpuCores} Core${cpuCores > 1 ? 's' : ''} - ${cpuData[1] || 'Unknown CPU'}`,
            cpuCores: cpuCores,
            cpuModel: cpuData[1] || 'Unknown',
            hostname: hostnameData[0] || 'unknown',
            hostname_short: hostnameData[1] || hostnameData[0] || 'unknown',
            os: results.os || 'Unknown OS',
            uptime: results.uptime || 'Unknown',
            meetsMinimumRequirements: {
              memory: memoryGB >= 1,
              disk: diskGB >= 20,
              cpu: cpuCores >= 1,
              overall: memoryGB >= 1 && diskGB >= 20 && cpuCores >= 1
            },
            formattedSpecs: {
              memory: `💾 RAM: ${memoryData[0]} (${Math.round(memoryGB * 100) / 100} GB)`,
              disk: `💽 Storage: ${diskData[0]} (${diskGB} GB)`,
              cpu: `⚡ CPU: ${cpuCores} Core${cpuCores > 1 ? 's' : ''}`
            }
          };

          resolve({
            success: true,
            specs
          });
        } catch (error: any) {
          resolve({
            success: false,
            error: `Failed to process VPS specs: ${error.message}`
          });
        }
      }
    });

    conn.on('error', (err: any) => {
      clearTimeout(connectionTimeout);

      let errorMsg = 'Gagal terhubung ke VPS';
      if (err.level === 'client-authentication') {
        errorMsg = 'Password atau username salah';
      } else if (err.code === 'ECONNREFUSED') {
        errorMsg = 'Koneksi ditolak - Pastikan SSH service berjalan di port 22';
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        errorMsg = 'Timeout - VPS tidak merespon (cek firewall/network)';
      } else if (err.code === 'EHOSTUNREACH') {
        errorMsg = 'Host tidak dapat dijangkau - Periksa IP address';
      } else {
        errorMsg = err.message || 'Unknown error';
      }

      resolve({
        success: false,
        error: errorMsg
      });
    });

    conn.on('timeout', () => {
      clearTimeout(connectionTimeout);
      conn.end();
      resolve({
        success: false,
        error: 'Connection timeout - VPS tidak merespon'
      });
    });

    conn.connect({
      host: ip,
      port: 22,
      username: 'root',
      password,
      readyTimeout: 30000,
      tryKeyboard: true,
      algorithms: {
        kex: [
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
          'ssh-rsa',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'ssh-ed25519'
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
