const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { RDP_PORT } = require('../config/constants');

// ============================================================================
// SECURE IMAGE DISTRIBUTION SYSTEM
// ============================================================================
// New flow:
// 1. Bot calls /api/installation/init (with secret key)
// 2. Backend creates encrypted image, returns installId
// 3. Bot downloads encrypted image from /api/installation/download/:installId
// 4. Bot SCPs encrypted image to VPS
// 5. Bot SCPs decrypt-and-install.sh to VPS (with embedded key)
// 6. Bot executes decrypt-and-install.sh on VPS
// 7. VPS decrypts, installs, reports back
// 8. Bot calls /api/installation/complete/:installId to cleanup
// ============================================================================

// Backend API URL - bisa diubah via environment variable
const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3001';

// API Secret Key - REQUIRED for secure image distribution
const API_SECRET_KEY = process.env.API_SECRET_KEY || '';

// Enable secure mode (use encrypted image distribution)
// Set to 'true' to use new secure flow, 'false' for legacy flow
const USE_SECURE_MODE = process.env.USE_SECURE_IMAGE_DISTRIBUTION !== 'false'; // Default: true

/**
 * Call backend API untuk generate token
 */
async function callBackendAPI(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BACKEND_URL);
        const client = url.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Download file from URL (with headers extraction)
 * Returns { filePath, headers }
 */
async function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        const req = client.get(url, (res) => {
            if (res.statusCode === 200) {
                const file = fs.createWriteStream(destPath);
                const totalSize = parseInt(res.headers['content-length'], 10);
                let downloaded = 0;
                
                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (onProgress && totalSize) {
                        const percent = ((downloaded / totalSize) * 100).toFixed(1);
                        onProgress(`📥 Downloading: ${percent}% (${(downloaded / 1024 / 1024).toFixed(2)}MB / ${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
                    }
                });
                
                res.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    resolve({
                        filePath: destPath,
                        headers: res.headers
                    });
                });
            } else {
                reject(new Error(`Failed to download: ${res.statusCode} ${res.statusMessage}`));
            }
        });
        
        req.on('error', reject);
        req.setTimeout(10 * 60 * 1000); // 10 minute timeout
    });
}

/**
 * SCP file to remote server using SSH
 */
async function scpFileToRemote(conn, localPath, remotePath, onLog) {
    return new Promise((resolve, reject) => {
        const fileContent = fs.readFileSync(localPath);
        const fileSize = fileContent.length;
        
        onLog && onLog(`📤 Uploading ${path.basename(localPath)} (${(fileSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        // Use SCP protocol
        conn.exec(`cat > ${remotePath}`, (err, stream) => {
            if (err) {
                reject(err);
                return;
            }
            
            stream.on('close', (code) => {
                if (code === 0) {
                    onLog && onLog(`✅ Upload complete: ${remotePath}`);
                    resolve();
                } else {
                    reject(new Error(`SCP failed with exit code: ${code}`));
                }
            });
            
            stream.on('data', (data) => {
                // SCP progress
            });
            
            stream.stderr.on('data', (data) => {
                onLog && onLog(`⚠️ [scp] ${data.toString().trim()}`);
            });
            
            // Write file content
            stream.write(fileContent);
            stream.end();
        });
    });
}

/**
 * Create decrypt-and-install.sh script
 * This script will be executed on VPS to decrypt and install
 */
function createDecryptScript(installId, encryptionKey, backendUrl, rdpPassword, rdpPort, osVersion) {
    return `#!/bin/bash
# Secure RDP Installer - Decrypt and Install Script
# This script decrypts the encrypted image and runs installation
# Auto-generated for installation: ${installId}

set -e  # Exit on error

INSTALL_ID="${installId}"
ENCRYPTION_KEY="${encryptionKey}"
BACKEND_URL="${backendUrl}"
RDP_PASSWORD="${rdpPassword}"
RDP_PORT="${rdpPort}"
OS_VERSION="${osVersion}"
ENCRYPTED_FILE="/tmp/rdp-encrypted.img.enc"
DECRYPTED_FILE="/tmp/rdp-installer-azovest.img"

echo "🔐 RDP Secure Installer"
echo "========================"
echo "Install ID: \${INSTALL_ID}"
echo "OS Version: \${OS_VERSION}"
echo ""

# Check if encrypted file exists
if [ ! -f "\$ENCRYPTED_FILE" ]; then
    echo "❌ Error: Encrypted file not found: \$ENCRYPTED_FILE"
    exit 1
fi

echo "📦 Encrypted file size: \$(du -h \$ENCRYPTED_FILE | cut -f1)"
echo ""

# Decrypt image using openssl
echo "🔓 Decrypting image..."
echo "   This may take a few minutes for large images..."

# Extract IV (first 16 bytes)
dd if="\$ENCRYPTED_FILE" of=/tmp/iv.bin bs=16 count=1 2>/dev/null

# Extract Auth Tag (bytes 16-32)
dd if="\$ENCRYPTED_FILE" of=/tmp/tag.bin bs=16 skip=1 count=1 2>/dev/null

# Extract encrypted data (after byte 32)
dd if="\$ENCRYPTED_FILE" of=/tmp/encrypted.dat bs=32 skip=1 2>/dev/null

# Convert key and IV to hex
KEY_HEX=\$(echo -n "\$ENCRYPTION_KEY" | base64 -d 2>/dev/null | xxd -p -c 256 | tr -d '\\n')
IV_HEX=\$(xxd -p -c 256 /tmp/iv.bin | tr -d '\\n')

# Decrypt using AES-256-GCM
openssl enc -aes-256-gcm -d \\
    -K "\$KEY_HEX" \\
    -iv "\$IV_HEX" \\
    -in /tmp/encrypted.dat \\
    -out "\$DECRYPTED_FILE" 2>/dev/null

if [ \$? -ne 0 ]; then
    echo "❌ Decryption failed!"
    echo "   This could mean:"
    echo "   - Incorrect encryption key"
    echo "   - Corrupted encrypted file"
    echo "   - Installation already used (replay attack detected)"
    
    # Cleanup
    rm -f /tmp/iv.bin /tmp/tag.bin /tmp/encrypted.dat
    exit 1
fi

echo "✅ Decryption successful!"
echo "📦 Decrypted file size: \$(du -h \$DECRYPTED_FILE | cut -f1)"
echo ""

# Securely delete encrypted file and decryption components
echo "🗑️  Securely deleting encrypted files..."
shred -vfz -n 3 "\$ENCRYPTED_FILE" /tmp/iv.bin /tmp/tag.bin /tmp/encrypted.dat 2>/dev/null || rm -f "\$ENCRYPTED_FILE" /tmp/iv.bin /tmp/tag.bin /tmp/encrypted.dat

# Clear encryption key from memory
unset ENCRYPTION_KEY KEY_HEX IV_HEX

echo "✅ Encrypted files deleted"
echo ""

# Make installer executable
chmod +x "\$DECRYPTED_FILE"

# Run installer
echo "🚀 Starting installation..."
echo "   Password: \$(printf '%s' "\$RDP_PASSWORD" | sed 's/./*/g')"
echo "   Port: \$RDP_PORT"
echo ""

cd /root
timeout 3600 "\$DECRYPTED_FILE" "\$RDP_PASSWORD" "\$BACKEND_URL" "\$RDP_PORT" 2>&1
EXIT_CODE=\$?

echo ""
echo "INSTALL_EXIT_CODE:\$EXIT_CODE"

# Cleanup decrypted installer
echo ""
echo "🗑️  Cleaning up installer files..."
shred -vfz -n 3 "\$DECRYPTED_FILE" 2>/dev/null || rm -f "\$DECRYPTED_FILE"
rm -f /root/rdp-installer-azovest.img

# Report completion to backend
if [ -n "\$BACKEND_URL" ]; then
    echo "📡 Reporting completion to backend..."
    curl -s -X POST "\${BACKEND_URL}/api/installation/complete/\${INSTALL_ID}" \\
        -H "Content-Type: application/json" \\
        -d "{\\"exitCode\\":\$EXIT_CODE}" >/dev/null 2>&1 || true
fi

echo ""
if [ \$EXIT_CODE -eq 0 ]; then
    echo "✅ Installation completed successfully!"
else
    echo "❌ Installation failed with exit code: \$EXIT_CODE"
fi

exit \$EXIT_CODE
`;
}

/**
 * Install Dedicated RDP using binary .img installer
 * Binary .img berisi semua script (tele.sh, reinstall.sh, trans.sh, dll)
 * 
 * This function now supports two modes:
 * 1. SECURE MODE (default): Uses encrypted image distribution with R2
 * 2. LEGACY MODE: Uses direct binary download (kept for backward compatibility)
 * 
 * To use SECURE MODE (recommended):
 * - Set environment variable: API_SECRET_KEY=<your-secret-key>
 * - Backend must be deployed with R2 bucket configured
 * 
 * To use LEGACY MODE:
 * - Set environment variable: USE_SECURE_IMAGE_DISTRIBUTION=false
 */
async function installDedicatedRDP(host, username, password, config, onLog) {
    // Check if secure mode is enabled and API_SECRET_KEY is set
    if (USE_SECURE_MODE && API_SECRET_KEY) {
        onLog && onLog(`🔐 Using SECURE MODE (encrypted image distribution)`);
        onLog && onLog(``);
        
        // Use secure mode installer
        const { installDedicatedRDP_Secure } = require('./dedicatedRdpInstaller_secure');
        return installDedicatedRDP_Secure(host, username, password, config, onLog);
    }
    
    // Legacy mode
    onLog && onLog(`⚠️  Using LEGACY MODE (direct download)`);
    onLog && onLog(`   Tip: Enable SECURE MODE by setting API_SECRET_KEY`);
    onLog && onLog(``);
    
    return new Promise(async (resolve, reject) => {
        const conn = new Client();
        
        conn.on('ready', async () => {
            try {
                // Display IP information
                onLog && onLog(`🌐 Server IP: ${host}`);
                onLog && onLog(`🔧 OS Version: ${config.osVersion}`);
                onLog && onLog(`🔑 Password: ${'*'.repeat(config.password.length)}`);
                onLog && onLog(`📡 Port: ${RDP_PORT} (Custom Security Port)`);
                onLog && onLog(`⏳ Starting installation process...`);
                
                // Binary .img URL (update ini dengan URL server kamu)
                const BINARY_IMG_URL = process.env.RDP_BINARY_IMG_URL || 'https://api.eov.my.id/azovest/rdp-installer-azovest.img';
                
                // Get token untuk image URL dari backend API (untuk encrypt path .img)
                // WAJIB pakai backend - kalau gagal, batalkan instalasi
                let imgToken;
                onLog && onLog(`🔐 Generating encrypted token for image...`);
                onLog && onLog(`   Backend URL: ${BACKEND_URL}`);
                
                try {
                    // Use obfuscated path for extra security
                    const imgTokenResponse = await callBackendAPI('/x/gi', 'POST', {
                        osVersion: config.osVersion
                    });
                    if (imgTokenResponse.success && imgTokenResponse.token) {
                        imgToken = imgTokenResponse.token;
                        onLog && onLog(`✅ Token generated successfully`);
                        onLog && onLog(`   Token: ${imgToken.substring(0, 16)}...`);
                    } else {
                        throw new Error('Backend API returned invalid response: ' + JSON.stringify(imgTokenResponse));
                    }
                } catch (error) {
                    console.error('[Backend API] Error getting image token:', error.message);
                    onLog && onLog(`❌ Backend API Error: ${error.message}`);
                    onLog && onLog(`❌ Installation CANCELLED - Backend API is required`);
                    conn.end();
                    reject(new Error(`Backend API unavailable: ${error.message}. Installation cancelled.`));
                    return;
                }
                
                onLog && onLog(`📥 Downloading binary installer...`);
                onLog && onLog(`   URL: ${BINARY_IMG_URL}`);
                
                // Delete old binary first (force fresh download, no cache)
                // Then download binary .img ke VPS dengan cache busting
                const timestamp = Date.now();
                const downloadCommand = `cd /root && rm -f rdp-installer-azovest.img && curl -fL --progress-bar -o rdp-installer-azovest.img "${BINARY_IMG_URL}?t=${timestamp}" || wget -O rdp-installer-azovest.img "${BINARY_IMG_URL}?t=${timestamp}"`;
                
                onLog && onLog(`📥 Starting download...`);
                await new Promise((resolve, reject) => {
                    // Add timeout untuk download (5 minutes untuk large file)
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout: Download took too long (>5 minutes)'));
                    }, 5 * 60 * 1000);
                    
                    conn.exec(downloadCommand, (err, stream) => {
                        if (err) {
                            clearTimeout(timeout);
                            onLog && onLog(`❌ Error starting download: ${err.message}`);
                            reject(err);
                            return;
                        }
                        
                        let output = '';
                        stream.on('data', (data) => {
                            const text = data.toString();
                            output += text;
                            // Show download progress
                            if (text.includes('%') || text.includes('bytes') || text.includes('Downloading')) {
                                onLog && onLog(`   ${text.trim()}`);
                            }
                        });
                        
                        stream.stderr.on('data', (data) => {
                            const text = data.toString();
                            // wget/curl progress goes to stderr
                            if (text.includes('%') || text.includes('bytes') || text.includes('Downloading')) {
                                onLog && onLog(`   ${text.trim()}`);
                            } else if (text.trim().length > 0 && !text.includes('curl') && !text.includes('wget')) {
                                // Log other stderr messages
                                onLog && onLog(`⚠️ [download stderr] ${text.trim()}`);
                            }
                        });
                        
                        stream.on('close', (code) => {
                            clearTimeout(timeout);
                            if (code !== 0) {
                                onLog && onLog(`❌ Download failed with exit code: ${code}`);
                                onLog && onLog(`   Last output: ${output.split('\n').slice(-5).join('\n')}`);
                                reject(new Error(`Download failed with exit code ${code}`));
                                return;
                            }
                            onLog && onLog(`✅ Download completed`);
                            resolve();
                        });
                    });
                });
                
                // Verify binary downloaded
                onLog && onLog(`🔍 Verifying binary...`);
                await new Promise((resolve, reject) => {
                    // Add timeout
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout: Binary verification took too long (>10s)'));
                    }, 10000);
                    
                    conn.exec('test -f /root/rdp-installer-azovest.img && ls -lh /root/rdp-installer-azovest.img', (err, stream) => {
                        if (err) {
                            clearTimeout(timeout);
                            onLog && onLog(`❌ Error verifying binary: ${err.message}`);
                            reject(err);
                            return;
                        }
                        
                        let output = '';
                        stream.on('data', (data) => {
                            output += data.toString();
                        });
                        
                        stream.stderr.on('data', (data) => {
                            const text = data.toString();
                            if (text.trim().length > 0) {
                                onLog && onLog(`⚠️ [verify stderr] ${text.trim()}`);
                            }
                        });
                        
                        stream.on('close', (code) => {
                            clearTimeout(timeout);
                            if (code !== 0) {
                                onLog && onLog(`❌ Binary verification failed (exit code: ${code})`);
                                onLog && onLog(`   Output: ${output.trim() || 'No output'}`);
                                reject(new Error('Binary file not found after download'));
                                return;
                            }
                            onLog && onLog(`✅ Binary verified: ${output.trim()}`);
                            resolve();
                        });
                    });
                });
                
                // Make binary executable
                onLog && onLog(`🔧 Making binary executable...`);
                await new Promise((resolve, reject) => {
                    // Add timeout untuk prevent hang
                    const timeout = setTimeout(() => {
                        onLog && onLog(`⚠️ chmod timeout - trying alternative method...`);
                        // Try alternative: use stat to check if already executable, then chmod with explicit output
                        conn.exec('stat -c "%a" /root/rdp-installer-azovest.img 2>/dev/null || echo "0"', (err2, stream2) => {
                            if (err2) {
                                reject(new Error('Timeout: chmod command took too long and alternative check failed'));
                                return;
                            }
                            let statOutput = '';
                            stream2.on('data', (d) => { statOutput += d.toString(); });
                            stream2.on('close', (code2) => {
                                const perms = parseInt(statOutput.trim()) || 0;
                                if ((perms & 0o111) !== 0) {
                                    // Already executable
                                    onLog && onLog(`✅ Binary is already executable (perms: ${perms.toString(8)})`);
                                    resolve();
                                } else {
                                    // Force chmod dengan explicit echo
                                    conn.exec('chmod +x /root/rdp-installer-azovest.img && echo "CHMOD_SUCCESS" || echo "CHMOD_FAILED"', (err3, stream3) => {
                                        if (err3) {
                                            reject(new Error('Timeout: chmod command failed'));
                                            return;
                                        }
                                        let chmodOutput = '';
                                        stream3.on('data', (d) => { chmodOutput += d.toString(); });
                                        stream3.on('close', (code3) => {
                                            if (chmodOutput.includes('CHMOD_SUCCESS') || code3 === 0) {
                                                onLog && onLog(`✅ Binary is now executable (alternative method)`);
                                                resolve();
                                            } else {
                                                reject(new Error('Failed to make binary executable (alternative method failed)'));
                                            }
                                        });
                                    });
                                }
                            });
                        });
                    }, 10000); // 10 seconds timeout
                    
                    // Try chmod dengan explicit output untuk ensure command completes
                    conn.exec('chmod +x /root/rdp-installer-azovest.img && echo "CHMOD_SUCCESS" || echo "CHMOD_FAILED"', (err, stream) => {
                        if (err) {
                            clearTimeout(timeout);
                            onLog && onLog(`❌ Error executing chmod: ${err.message}`);
                            reject(err);
                            return;
                        }
                        
                        let output = '';
                        stream.on('data', (data) => {
                            output += data.toString();
                        });
                        
                        stream.stderr.on('data', (data) => {
                            const text = data.toString();
                            if (text.trim().length > 0) {
                                onLog && onLog(`⚠️ [chmod stderr] ${text.trim()}`);
                            }
                        });
                        
                        stream.on('close', (code) => {
                            clearTimeout(timeout);
                            if (code !== 0 || output.includes('CHMOD_FAILED')) {
                                onLog && onLog(`❌ chmod failed with exit code: ${code}`);
                                onLog && onLog(`   Output: ${output.trim() || 'No output'}`);
                                reject(new Error(`Failed to make binary executable (exit code: ${code})`));
                                return;
                            }
                            if (output.includes('CHMOD_SUCCESS') || code === 0) {
                                onLog && onLog(`✅ Binary is now executable`);
                                resolve();
                            } else {
                                // No explicit success message, but exit code is 0 - assume success
                                onLog && onLog(`✅ Binary chmod completed (exit code: ${code})`);
                                resolve();
                            }
                        });
                    });
                });
                
                // Run binary installer with encrypted token
                // WAJIB pakai encrypted mode - backend API sudah validated di atas
                onLog && onLog(`🚀 Executing binary installer...`);
                onLog && onLog(`   Mode: Encrypted with obfuscated paths`);
                onLog && onLog(`   Command: ./rdp-installer-azovest.img [password] [token] [backend] [port]`);
                
                // Build command dengan token (tidak expose URL asli)
                // Binary installer akan extract tele.sh dan pass token untuk encrypted link
                const command = `cd /root && timeout 3600 ./rdp-installer-azovest.img "${config.password}" "${imgToken}" "${BACKEND_URL}" "${RDP_PORT}" 2>&1; EXIT_CODE=$?; echo "INSTALL_EXIT_CODE:$EXIT_CODE"; rm -f /root/rdp-installer-azovest.img; exit $EXIT_CODE`;
                
                let allOutput = '';
                let allErrors = '';
                let lastActivityTime = Date.now();
                
                conn.exec(command, (err, stream) => {
                    if (err) {
                        onLog && onLog(`❌ Failed to execute command: ${err.message}`);
                        conn.end();
                        reject(err);
                        return;
                    }
                    
                    // Add activity timeout (30 minutes untuk installation)
                    const activityTimeout = setTimeout(() => {
                        const inactiveTime = Math.floor((Date.now() - lastActivityTime) / 1000);
                        onLog && onLog(`⚠️ No activity for ${inactiveTime} seconds. Installation may be stuck.`);
                        onLog && onLog(`   Last output: ${allOutput.split('\n').slice(-3).join(' | ')}`);
                    }, 30 * 60 * 1000); // 30 minutes

                    stream.on('data', (data) => {
                        const output = data.toString();
                        allOutput += output;
                        lastActivityTime = Date.now(); // Update activity time
                        
                        // Log semua output dengan prefix
                        const lines = output.split('\n').filter(line => line.trim().length > 0);
                        lines.forEach(line => {
                            const trimmed = line.trim();
                            
                            // Skip empty lines
                            if (trimmed.length === 0) return;
                            
                            // Log important messages dengan emoji
                            if (trimmed.includes('Starting binary extraction')) {
                                onLog && onLog(`🔨 ${trimmed}`);
                            } else if (trimmed.includes('Extraction successful')) {
                                onLog && onLog(`✅ ${trimmed}`);
                            } else if (trimmed.includes('Starting Dedicated RDP installation')) {
                                onLog && onLog(`🎯 ${trimmed}`);
                            } else if (trimmed.includes('Using reinstall.sh from binary package')) {
                                onLog && onLog(`✅ ${trimmed}`);
                            } else if (trimmed.includes('Using trans.sh from binary package')) {
                                onLog && onLog(`✅ ${trimmed}`);
                            } else if (trimmed.includes('Downloading') || trimmed.includes('download')) {
                                onLog && onLog(`📥 ${trimmed}`);
                            } else if (trimmed.includes('Running reinstall.sh')) {
                                onLog && onLog(`⚙️ ${trimmed}`);
                            } else if (trimmed.includes('Installation completed successfully')) {
                                onLog && onLog(`🎉 ${trimmed}`);
                            } else if (trimmed.includes('Rebooting system')) {
                                onLog && onLog(`🔄 ${trimmed}`);
                            } else if (trimmed.includes('ERROR') || trimmed.includes('Error') || trimmed.includes('error:')) {
                                onLog && onLog(`❌ ${trimmed}`);
                            } else if (trimmed.includes('Warning') || trimmed.includes('warning')) {
                                onLog && onLog(`⚠️ ${trimmed}`);
                            } else if (trimmed.includes('RDP_SCRIPTS_DIR')) {
                                onLog && onLog(`📁 ${trimmed}`);
                            } else {
                                // Log semua output lainnya (tapi skip yang terlalu verbose)
                                if (!trimmed.match(/^\s*$/) && trimmed.length > 0) {
                                    onLog && onLog(trimmed);
                                }
                            }
                        });
                    });

                    stream.stderr.on('data', (data) => {
                        const text = data.toString();
                        allErrors += text;
                        
                        // Log semua stderr dengan detail
                        const lines = text.split('\n').filter(line => line.trim().length > 0);
                        lines.forEach(line => {
                            const trimmed = line.trim();
                            if (trimmed.length > 0) {
                                onLog && onLog(`⚠️ [STDERR] ${trimmed}`);
                            }
                        });
                    });

                    stream.on('close', (code) => {
                        clearTimeout(activityTimeout);
                        
                        // Extract exit code dari output jika ada
                        let actualExitCode = code;
                        if (allOutput.includes('INSTALL_EXIT_CODE:')) {
                            const match = allOutput.match(/INSTALL_EXIT_CODE:(\d+)/);
                            if (match) {
                                actualExitCode = parseInt(match[1], 10);
                                onLog && onLog(`📊 Extracted exit code from output: ${actualExitCode}`);
                            }
                        }
                        
                        // Log final status
                        if (actualExitCode !== 0 && actualExitCode !== undefined && actualExitCode !== null) {
                            onLog && onLog(`❌ Installation failed with exit code: ${actualExitCode}`);
                            onLog && onLog(`📋 Last 20 lines of output:`);
                            
                            // Show last 20 lines untuk debugging
                            const outputLines = allOutput.split('\n').filter(l => l.trim().length > 0);
                            const lastLines = outputLines.slice(-20);
                            lastLines.forEach(line => {
                                onLog && onLog(`   ${line.trim()}`);
                            });
                            
                            if (allErrors.trim().length > 0) {
                                onLog && onLog(`📋 Error output:`);
                                const errorLines = allErrors.split('\n').filter(l => l.trim().length > 0);
                                errorLines.slice(-10).forEach(line => {
                                    onLog && onLog(`   ${line.trim()}`);
                                });
                            }
                            
                            conn.end();
                            reject(new Error(`Installation failed with exit code ${actualExitCode}. Check logs above for details.`));
                            return;
                        }

                        // Success atau exit code 0/undefined (mungkin connection terputus karena reboot)
                        // Check jika ada "Installation completed successfully" di output
                        if (allOutput.includes('Installation completed successfully') || 
                            allOutput.includes('Rebooting system') ||
                            actualExitCode === 0 ||
                            (actualExitCode === undefined && allOutput.length > 100)) {
                            onLog && onLog(`✅ Installation completed successfully!`);
                            onLog && onLog(`🌐 Server: ${host}:${RDP_PORT}`);
                            onLog && onLog(`👤 Username: administrator`);
                            onLog && onLog(`🔑 Password: ${config.password}`);
                            onLog && onLog(`🔄 System will reboot automatically...`);
                            
                            // Connection mungkin sudah terputus karena reboot, jadi tidak perlu conn.end()
                            try {
                                conn.end();
                            } catch (e) {
                                // Ignore error jika connection sudah terputus
                            }
                            resolve(true);
                        } else {
                            // Exit code undefined tapi tidak ada success message - mungkin connection terputus
                            onLog && onLog(`⚠️ Connection closed (exit code: ${code || 'undefined'})`);
                            onLog && onLog(`📋 Last 10 lines of output:`);
                            const outputLines = allOutput.split('\n').filter(l => l.trim().length > 0);
                            const lastLines = outputLines.slice(-10);
                            lastLines.forEach(line => {
                                onLog && onLog(`   ${line.trim()}`);
                            });
                            
                            // Jika ada progress yang bagus, anggap success
                            if (allOutput.includes('Starting binary extraction') || 
                                allOutput.includes('Extraction successful') ||
                                allOutput.includes('Running reinstall.sh')) {
                                onLog && onLog(`✅ Installation appears to be progressing. Connection may have been lost due to reboot.`);
                                try {
                                    conn.end();
                                } catch (e) {
                                    // Ignore
                                }
                                resolve(true);
                            } else {
                                try {
                                    conn.end();
                                } catch (e) {
                                    // Ignore
                                }
                                reject(new Error(`Installation may have failed. Exit code: ${code || 'undefined'}. Check logs above.`));
                            }
                        }
                    });
                });
            } catch (error) {
                conn.end();
                reject(error);
            }
        });

        conn.on('error', (err) => {
            onLog && onLog(`❌ Connection error: ${err.message}`);
            reject(err);
        });

        onLog && onLog(`🔌 Connecting to server ${host}...`);
        conn.connect({
            host,
            port: 22,
            username,
            password,
            readyTimeout: 30000,
            tryKeyboard: false
        });
    });
}

module.exports = {
    installDedicatedRDP
};
