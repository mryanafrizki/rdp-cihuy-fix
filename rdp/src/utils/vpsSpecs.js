const { Client } = require('ssh2');

async function detectVPSSpecs(host, username, password) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let connectionTimeout;
    
    // Set timeout untuk mencegah hanging
    connectionTimeout = setTimeout(() => {
      conn.end();
      reject(new Error('Connection timeout - VPS tidak merespon dalam 30 detik'));
    }, 30000);
    
    conn.on('ready', () => {
      clearTimeout(connectionTimeout);
      console.log(`[VPS] Successfully connected to ${host}`);
      const commands = {
        memory: `free -h | grep "Mem:" | awk '{print $2}' && echo "---MB---" && free -m | grep "Mem:" | awk '{print $2}'`,
        disk: `df -h / | tail -1 | awk '{print $2}' && echo "---GB---" && df -BG / | tail -1 | awk '{gsub(/G/, "", $2); print $2}'`,
        cpu: `nproc && echo "---CORES---" && cat /proc/cpuinfo | grep "model name" | head -1 | cut -d':' -f2 | xargs`,
        hostname: `hostname && echo "---SHORT---" && hostname -s`,
        os: `lsb_release -d 2>/dev/null | cut -f2 || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2`,
        uptime: `uptime -p 2>/dev/null || uptime | awk '{print $3,$4}' | sed 's/,//'`
      };

      let results = {};
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
          stream.on('data', (data) => {
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
          console.log('[VPS] Raw command results:', JSON.stringify(results, null, 2));
          
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
            console.error('[VPS] Parsing failed. memoryData:', memoryData, 'diskData:', diskData, 'cpuData:', cpuData);
            throw new Error('Gagal parsing output VPS - format tidak sesuai');
          }

          const memoryMB = parseFloat(memoryData[1]);
          const diskGB = parseInt(diskData[1]);
          const cpuCores = parseInt(cpuData[0]);
          
          // Validate numeric values
          if (isNaN(memoryMB) || isNaN(diskGB) || isNaN(cpuCores)) {
            console.error('[VPS] Invalid numeric values. memoryMB:', memoryMB, 'diskGB:', diskGB, 'cpuCores:', cpuCores);
            throw new Error(`Gagal membaca spesifikasi VPS - nilai tidak valid (RAM: ${memoryData[1]}, Disk: ${diskData[1]}, CPU: ${cpuData[0]})`);
          }
          
          const memoryGB = memoryMB / 1024;

          const specs = {
            memory: memoryData[0],
            memoryMB: parseInt(memoryMB),
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

          console.log('[VPS] Successfully parsed specs:', {
            memoryGB: specs.memoryGB,
            diskGB: specs.diskGB,
            cpuCores: specs.cpuCores
          });
          
          resolve(specs);
        } catch (error) {
          console.error('[VPS] Error in processResults:', error.message);
          reject(new Error(`Failed to process VPS specs: ${error.message}`));
        }
      }
    });

    conn.on('error', (err) => {
      clearTimeout(connectionTimeout);
      console.error(`[VPS] Connection error to ${host}:`, err.message);
      
      // Berikan error message yang lebih deskriptif
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
        errorMsg = `${err.message || 'Unknown error'}`;
      }
      
      reject(new Error(errorMsg));
    });

    conn.on('timeout', () => {
      clearTimeout(connectionTimeout);
      console.error(`[VPS] Connection timeout to ${host}`);
      conn.end();
      reject(new Error('Connection timeout - VPS tidak merespon'));
    });

    console.log(`[VPS] Attempting to connect to ${host}:22 as ${username}...`);
    
    conn.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 30000,
      // Konfigurasi untuk kompatibilitas maksimal
      tryKeyboard: true, // Enable keyboard-interactive auth
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
      },
      // Debug mode - uncomment untuk troubleshooting
      // debug: (msg) => console.log('[SSH DEBUG]', msg)
    });
  });
}

async function checkVPSRequirements(host, username, password) {
  try {
    console.log(`[VPS] Checking requirements for ${host}...`);
    const specs = await detectVPSSpecs(host, username, password);
    
    console.log(`[VPS] Successfully detected specs: RAM=${specs.memoryGB}GB, Disk=${specs.diskGB}GB, CPU=${specs.cpuCores} cores`);
    
    return {
      success: true,
      specs: specs,
      meets_requirements: specs.meetsMinimumRequirements.overall,
      requirements_details: {
        memory: {
          current: specs.memoryGB,
          required: 1,
          status: specs.meetsMinimumRequirements.memory ? '✅' : '❌'
        },
        disk: {
          current: specs.diskGB,
          required: 20,
          status: specs.meetsMinimumRequirements.disk ? '✅' : '❌'
        },
        cpu: {
          current: specs.cpuCores,
          required: 1,
          status: specs.meetsMinimumRequirements.cpu ? '✅' : '❌'
        }
      }
    };
  } catch (error) {
    console.error(`[VPS] Failed to check requirements for ${host}:`, error.message);
    return {
      success: false,
      error: error.message,
      meets_requirements: false,
      requirements_details: {
        memory: {
          current: 0,
          required: 1,
          status: '❌'
        },
        disk: {
          current: 0,
          required: 20,
          status: '❌'
        },
        cpu: {
          current: 0,
          required: 1,
          status: '❌'
        }
      },
      specs: {
        memory: 'Unknown',
        memoryMB: 0,
        memoryGB: 0,
        disk: 'Unknown',
        diskGB: 0,
        cpu: 'Unknown',
        cpuCores: 0,
        cpuModel: 'Unknown',
        hostname: 'unknown',
        hostname_short: 'unknown',
        os: 'Unknown OS',
        uptime: 'Unknown'
      }
    };
  }
}

module.exports = {
  detectVPSSpecs,
  checkVPSRequirements
};