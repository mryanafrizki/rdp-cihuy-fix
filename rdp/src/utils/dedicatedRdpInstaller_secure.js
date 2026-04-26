const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const { RDP_PORT } = require('../config/constants');

// ============================================================================
// SECURE IMAGE DISTRIBUTION SYSTEM
// ============================================================================
// Flow:
// 1. Bot calls /api/installation/init (with secret key)
// 2. Backend returns installId + encryptionKey
// 3. Bot encrypts local rdp-installer-azovest.img (/dist/rdp-installer-azovest.img) with encryptionKey
// 4. Bot SCPs encrypted rdp-installer-azovest.img to VPS
// 5. Bot SCPs decrypt-and-install.sh to VPS (with embedded key)
// 6. Bot executes decrypt-and-install.sh on VPS
// 7. VPS decrypts rdp-installer-azovest.img, installs, reports back
// 8. Bot calls /api/installation/complete/:installId to cleanup
// ============================================================================

// Backend API URL - bisa diubah via environment variable
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://rotate.eov.my.id';

// API Secret Key - REQUIRED for secure image distribution
const API_SECRET_KEY = process.env.API_SECRET_KEY || 'cd5d63a6bfaea35d4623a0728e694437';

/**
 * Call backend API
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} body - Request body (will be JSON stringified)
 * @param {Object} customHeaders - Custom headers to add
 */
async function callBackendAPI(endpoint, method = 'GET', body = null, customHeaders = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BACKEND_URL);
        const client = url.protocol === 'https:' ? https : http;
        
        const headers = {
            'Content-Type': 'application/json',
            ...customHeaders
        };
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            headers
        };

        const req = client.request(options, (res) => {
            let data = '';
            let headers = res.headers;
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ data: jsonData, headers });
                } catch (e) {
                    resolve({ data, headers });
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
 * Download file from URL to local filesystem
 * @param {string} url - URL to download from
 * @param {string} destPath - Local file path to save to
 * @param {Function} onProgress - Progress callback
 * @param {Object} headers - Optional headers to send (e.g., X-Api-Secret)
 */
async function downloadFile(url, destPath, onProgress, headers = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (url.startsWith('https') ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: headers
        };
        
        const req = client.request(options, (res) => {
            if (res.statusCode === 200) {
                const file = fs.createWriteStream(destPath);
                const totalSize = parseInt(res.headers['content-length'], 10);
                let downloaded = 0;
                let lastLog = 0;
                
                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    const now = Date.now();
                    if (onProgress && totalSize && (now - lastLog > 1000)) { // Log every 1 second
                        const percent = ((downloaded / totalSize) * 100).toFixed(1);
                        const downloadedMB = (downloaded / 1024 / 1024).toFixed(2);
                        const totalMB = (totalSize / 1024 / 1024).toFixed(2);
                        onProgress(`📥 Downloading: ${percent}% (${downloadedMB}MB / ${totalMB}MB)`);
                        lastLog = now;
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
        req.end(); // Send the request
    });
}

/**
 * SCP file to remote server using SSH - Direct binary write with cat
 * More reliable for binary files
 */
async function scpFileToRemote(conn, localPath, remotePath, onLog) {
    return new Promise((resolve, reject) => {
        const fileSize = fs.statSync(localPath).size;
        const fileName = path.basename(localPath);
        
        onLog && onLog(`📤 Uploading ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        // Read file into buffer
        const fileContent = fs.readFileSync(localPath);
        
        // Use cat with direct binary write
        // This is more reliable than base64 encoding for binary files
        const uploadTimeout = setTimeout(() => {
            reject(new Error(`Upload timeout after 5 minutes`));
        }, 5 * 60 * 1000); // 5 minute timeout
        
        conn.exec(`cat > ${remotePath}`, (err, stream) => {
            if (err) {
                clearTimeout(uploadTimeout);
                reject(err);
                return;
            }
            
            let stderr = '';
            let uploadedBytes = 0;
            const totalBytes = fileContent.length;
            let lastProgressLog = Date.now();
            let isComplete = false;
            
            // Write file in chunks to avoid memory issues
            const chunkSize = 64 * 1024; // 64KB chunks
            let offset = 0;
            
            function writeChunk() {
                if (offset >= totalBytes) {
                    // All data written, end stream
                    if (!isComplete) {
                        isComplete = true;
                        stream.end();
                    }
                    return;
                }
                
                const chunk = fileContent.slice(offset, Math.min(offset + chunkSize, totalBytes));
                const canContinue = stream.write(chunk);
                
                uploadedBytes += chunk.length;
                offset += chunk.length;
                
                // Log progress
                const now = Date.now();
                if (now - lastProgressLog > 1000) { // Log every 1 second
                    const percent = ((uploadedBytes / totalBytes) * 100).toFixed(1);
                    onLog && onLog(`   Progress: ${percent}% (${(uploadedBytes / 1024 / 1024).toFixed(2)}MB / ${(totalBytes / 1024 / 1024).toFixed(2)}MB)`);
                    lastProgressLog = now;
                }
                
                if (canContinue) {
                    // Stream is ready, continue writing
                    setImmediate(writeChunk);
                } else {
                    // Stream is full, wait for drain
                    stream.once('drain', writeChunk);
                }
            }
            
            stream.on('close', (code) => {
                clearTimeout(uploadTimeout);
                
                if (code === 0) {
                    // Set executable permission
                    conn.exec(`chmod +x ${remotePath} && echo "UPLOAD_OK"`, (chmodErr, chmodStream) => {
                        if (chmodErr) {
                            onLog && onLog(`⚠️ Warning: Failed to set permission: ${chmodErr.message}`);
                            // Still resolve if file was uploaded
                            onLog && onLog(`✅ Upload complete: ${remotePath}`);
                            resolve();
                            return;
                        }
                        
                        let chmodOutput = '';
                        chmodStream.on('data', (data) => {
                            chmodOutput += data.toString();
                        });
                        
                        chmodStream.on('close', (chmodCode) => {
                            if (chmodOutput.includes('UPLOAD_OK')) {
                                onLog && onLog(`✅ Upload complete: ${remotePath}`);
                                resolve();
                            } else {
                                onLog && onLog(`⚠️ Warning: Permission check failed, but file uploaded`);
                                resolve(); // Still resolve, file is uploaded
                            }
                        });
                    });
                } else {
                    reject(new Error(`Upload failed with exit code: ${code}. Error: ${stderr}`));
                }
            });
            
            stream.stderr.on('data', (data) => {
                stderr += data.toString();
                if (stderr.length > 1000) {
                    // Limit stderr size
                    stderr = stderr.slice(-1000);
                }
            });
            
            stream.on('error', (streamErr) => {
                clearTimeout(uploadTimeout);
                reject(new Error(`Stream error: ${streamErr.message}`));
            });
            
            // Start writing chunks
            writeChunk();
        });
    });
}

/**
 * Encrypt file using AES-256-GCM
 * @param {string} filePath - Path to file to encrypt
 * @param {string} keyBase64 - Base64 encoded encryption key
 * @returns {Promise<{encryptedPath: string, iv: Buffer, authTag: Buffer}>}
 */
async function encryptFile(filePath, keyBase64) {
    return new Promise((resolve, reject) => {
        const key = Buffer.from(keyBase64, 'base64');
        const iv = crypto.randomBytes(16); // 128-bit IV
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const input = fs.createReadStream(filePath);
        const encryptedPath = filePath + '.enc';
        const output = fs.createWriteStream(encryptedPath);
        
        input.pipe(cipher).pipe(output);
        
        output.on('finish', () => {
            const authTag = cipher.getAuthTag();
            resolve({
                encryptedPath,
                iv,
                authTag
            });
        });
        
        output.on('error', reject);
        input.on('error', reject);
    });
}

/**
 * Create encrypted file structure: [IV (16 bytes)][AuthTag (16 bytes)][Encrypted Data]
 */
async function createEncryptedFile(originalPath, encryptedPath, iv, authTag) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(encryptedPath);
        
        // Write IV first
        output.write(iv);
        
        // Write Auth Tag
        output.write(authTag);
        
        // Append encrypted data
        const encryptedData = fs.createReadStream(originalPath + '.enc');
        encryptedData.pipe(output);
        
        output.on('finish', () => {
            // Delete temporary encrypted file
            fs.unlinkSync(originalPath + '.enc');
            resolve(encryptedPath);
        });
        
        output.on('error', reject);
        encryptedData.on('error', reject);
    });
}

/**
 * Upload encrypted file to R2 via backend API
 */
async function uploadEncryptedFile(uploadUrl, encryptedFilePath, onLog) {
    return new Promise((resolve, reject) => {
        const fileContent = fs.readFileSync(encryptedFilePath);
        const fileSize = fileContent.length;
        
        onLog && onLog(`📤 Uploading encrypted file to R2 (${(fileSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        const url = new URL(uploadUrl);
        const client = url.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileSize,
                'X-Api-Secret': API_SECRET_KEY
            }
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk.toString();
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        onLog && onLog(`✅ Upload complete`);
                        resolve(result);
                    } catch (e) {
                        resolve({ success: true });
                    }
                } else {
                    reject(new Error(`Upload failed: ${res.statusCode} ${res.statusMessage}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(fileContent);
        req.end();
    });
}

/**
 * Create download script for VPS
 * VPS downloads decrypted .img from backend (backend decrypts on-the-fly)
 */
function createDownloadScript(installId, downloadUrl, backendUrl, rdpPassword, rdpPort) {
    return `#!/bin/bash
# Secure RDP Installer - Download Script
# VPS downloads decrypted .img from backend (backend handles decryption)
# Installation ID: ${installId}

set -e

INSTALL_ID="${installId}"
DOWNLOAD_URL="${downloadUrl}"
BACKEND_URL="${backendUrl}"
RDP_PASSWORD="${rdpPassword}"
RDP_PORT="${rdpPort}"
INSTALLER_FILE="/tmp/rdp-installer-azovest.img"

echo "🔐 RDP Secure Installer"
echo "========================"
echo "Install ID: \${INSTALL_ID}"
echo ""

# Download decrypted .img from backend (backend decrypts on-the-fly)
echo "📥 Downloading installer from backend..."
echo "   URL: \${DOWNLOAD_URL}"
echo "   Backend will decrypt the file automatically"

# Download with curl/wget
if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "\${INSTALLER_FILE}" "\${DOWNLOAD_URL}" 2>&1
    
    if [ \$? -ne 0 ]; then
        echo "❌ Download failed!"
        exit 1
    fi
elif command -v wget >/dev/null 2>&1; then
    wget -O "\${INSTALLER_FILE}" "\${DOWNLOAD_URL}" 2>&1
    
    if [ \$? -ne 0 ]; then
        echo "❌ Download failed!"
        exit 1
    fi
else
    echo "❌ Error: curl or wget not found"
    exit 1
fi

if [ ! -f "\${INSTALLER_FILE}" ]; then
    echo "❌ Error: Installer file not downloaded"
    exit 1
fi

echo "✅ Download complete"
echo "📦 Installer file: \$(du -h \$INSTALLER_FILE | cut -f1)"
echo ""

chmod +x "\${INSTALLER_FILE}"

# Execute installer
echo "🚀 Starting installation..."
cd /root
timeout 3600 "\${INSTALLER_FILE}" "\${RDP_PASSWORD}" "\${BACKEND_URL}" "\${RDP_PORT}" 2>&1
EXIT_CODE=\$?

echo ""
echo "INSTALL_EXIT_CODE:\$EXIT_CODE"

# Cleanup installer
echo ""
echo "🗑️  Cleaning up installer files..."
shred -vfz -n 3 "\${INSTALLER_FILE}" 2>/dev/null || rm -f "\${INSTALLER_FILE}"
rm -f /root/rdp-installer-azovest.img

# Report completion to backend
if [ -n "\${BACKEND_URL}" ]; then
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
 * Create decrypt-and-install.sh script (legacy, not used in new flow)
 */
function createDecryptScript(installId, encryptionKey, backendUrl, rdpPassword, rdpPort, osVersion) {
    return `#!/bin/bash
# Secure RDP Installer - Decrypt and Install Script
# Installation ID: ${installId}

set -e

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

if [ ! -f "\$ENCRYPTED_FILE" ]; then
    echo "❌ Error: Encrypted file not found"
    exit 1
fi

echo "📦 Encrypted file: \$(du -h \$ENCRYPTED_FILE | cut -f1)"
echo "🔓 Decrypting image..."

# Extract components
dd if="\$ENCRYPTED_FILE" of=/tmp/iv.bin bs=16 count=1 2>/dev/null
dd if="\$ENCRYPTED_FILE" of=/tmp/tag.bin bs=16 skip=1 count=1 2>/dev/null
dd if="\$ENCRYPTED_FILE" of=/tmp/encrypted.dat bs=32 skip=1 2>/dev/null

# Decrypt
KEY_HEX=\$(echo -n "\$ENCRYPTION_KEY" | base64 -d 2>/dev/null | xxd -p -c 256 | tr -d '\\n')
IV_HEX=\$(xxd -p -c 256 /tmp/iv.bin | tr -d '\\n')

openssl enc -aes-256-gcm -d -K "\$KEY_HEX" -iv "\$IV_HEX" -in /tmp/encrypted.dat -out "\$DECRYPTED_FILE" 2>/dev/null

if [ \$? -ne 0 ]; then
    echo "❌ Decryption failed!"
    rm -f /tmp/iv.bin /tmp/tag.bin /tmp/encrypted.dat
    exit 1
fi

echo "✅ Decryption successful!"
echo "📦 Decrypted: \$(du -h \$DECRYPTED_FILE | cut -f1)"

# Cleanup encrypted files
echo "🗑️  Deleting encrypted files..."
shred -vfz -n 3 "\$ENCRYPTED_FILE" /tmp/iv.bin /tmp/tag.bin /tmp/encrypted.dat 2>/dev/null || rm -f "\$ENCRYPTED_FILE" /tmp/iv.bin /tmp/tag.bin /tmp/encrypted.dat
unset ENCRYPTION_KEY KEY_HEX IV_HEX

chmod +x "\$DECRYPTED_FILE"

echo "🚀 Starting installation..."
cd /root
timeout 3600 "\$DECRYPTED_FILE" "\$RDP_PASSWORD" "\$BACKEND_URL" "\$RDP_PORT" 2>&1
EXIT_CODE=\$?

echo "INSTALL_EXIT_CODE:\$EXIT_CODE"

# Cleanup
shred -vfz -n 3 "\$DECRYPTED_FILE" 2>/dev/null || rm -f "\$DECRYPTED_FILE"

# Report completion
if [ -n "\$BACKEND_URL" ]; then
    curl -s -X POST "\${BACKEND_URL}/api/installation/complete/\${INSTALL_ID}" \\
        -H "Content-Type: application/json" \\
        -d "{\\"exitCode\\":\$EXIT_CODE}" >/dev/null 2>&1 || true
fi

exit \$EXIT_CODE
`;
}

/**
 * Install Dedicated RDP using Secure Image Distribution
 */
async function installDedicatedRDP_Secure(host, username, password, config, onLog) {
    const conn = new Client();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdp-install-'));
    
    return new Promise((resolve, reject) => {
        let installId = null;
        let encryptionKey = null;
        
        const cleanup = () => {
            // Cleanup local temporary files
            try {
                fs.readdirSync(tmpDir).forEach(file => {
                    const filePath = path.join(tmpDir, file);
                    fs.unlinkSync(filePath);
                });
                fs.rmdirSync(tmpDir);
            } catch (e) {
                console.error('Cleanup error:', e);
            }
        };
        
        conn.on('ready', async () => {
            try {
                // onLog && onLog(`🌐 Server IP: ${host}`);
                // onLog && onLog(`🔧 OS Version: ${config.osVersion}`);
                // onLog && onLog(`🔑 Password: ${'*'.repeat(config.password.length)}`);
                // onLog && onLog(`📡 Port: ${RDP_PORT}`);
                // onLog && onLog(`🔐 Mode: Secure Image Distribution`);
                // onLog && onLog(``);
                
                // Validate API secret key
                if (!API_SECRET_KEY) {
                    throw new Error('API_SECRET_KEY is not set. Please set environment variable API_SECRET_KEY.');
                }
                
                // Step 1: Initialize installation on backend
                // onLog && onLog(`🔐 Initializing secure installation...`);
                // onLog && onLog(`   Backend: ${BACKEND_URL}`);
                
                const initResponse = await callBackendAPI('/api/installation/init', 'POST', {
                    secret: API_SECRET_KEY,
                    vpsIp: host,
                    osVersion: config.osVersion,
                    rdpPort: RDP_PORT,
                    metadata: {
                        timestamp: Date.now(),
                        source: 'telegram-bot'
                    }
                });
                
                if (!initResponse.data || !initResponse.data.success) {
                    throw new Error(`Backend init failed: ${JSON.stringify(initResponse.data)}`);
                }
                
                installId = initResponse.data.installId;
                const downloadUrl = initResponse.data.downloadUrl;
                const imageToken = initResponse.data.imageToken;
                
                if (!downloadUrl) {
                    throw new Error('Download URL not received from backend');
                }
                
                if (!imageToken) {
                    throw new Error('Image token not received from backend');
                }
                
                // onLog && onLog(`✅ Installation initialized`);
                // onLog && onLog(`   Install ID: ${installId}`);
                // onLog && onLog(`   Download URL: ${downloadUrl}`);
                // onLog && onLog(`   Image Token: ${imageToken.substring(0, 16)}...`);
                // onLog && onLog(``);
                
                // Step 2: Execute download and install directly on VPS
                // VPS will download .img from backend (tokenized URL)
                // tele.sh needs: password, imgToken, backendUrl, rdpPort
                // onLog && onLog(`🚀 Starting secure installation...`);
                // onLog && onLog(`   VPS will download installer from backend (tokenized URL)`);
                // onLog && onLog(`   This process takes 10-15 minutes`);
                // onLog && onLog(``);
                
                // Direct download and execute command (no SCP needed)
                // LEGACY BINARY MODE: Download binary directly from juhuw.store (not encrypted)
                // But all URLs (image, reinstall.sh, confhome) still encrypted via backend
                const LEGACY_BINARY_MODE = process.env.LEGACY_BINARY_MODE === 'true' || false;
                
                let binaryDownloadUrl;
                if (LEGACY_BINARY_MODE) {
                    // Legacy mode: Direct download from juhuw.store (not encrypted)
                    binaryDownloadUrl = 'https://api.eov.my.id/azovest/rdp-installer-azovest.img';
                    // onLog && onLog(`⚠️  Using LEGACY BINARY MODE (binary not encrypted)`);
                    // onLog && onLog(`   Binary URL: ${binaryDownloadUrl}`);
                    // onLog && onLog(`   All other URLs: Still encrypted via backend`);
                } else {
                    // Encrypted mode: Download from backend (tokenized URL)
                    binaryDownloadUrl = `${BACKEND_URL}${downloadUrl}`;
                    // onLog && onLog(`🔐 Using ENCRYPTED BINARY MODE`);
                    // onLog && onLog(`   Binary URL: [Encrypted via backend]`);
                }
                
                // tele.sh needs 4 parameters: password, imgToken, backendUrl, rdpPort
                // All URLs (image, reinstall.sh, confhome) are still encrypted via backend
                // Note: legacyFlag is no longer needed since we use encrypted mode only
                // Pass RDP_PORT as separate argument (4th parameter)
                const executeCommand = `cd /tmp && curl -fL -o /tmp/rdp-installer-azovest.img "${binaryDownloadUrl}" && chmod +x /tmp/rdp-installer-azovest.img && timeout 3600 /tmp/rdp-installer-azovest.img "${config.password}" "${imageToken}" "${BACKEND_URL}" "${RDP_PORT}" 2>&1; EXIT_CODE=$?; echo ""; echo "INSTALL_EXIT_CODE:$EXIT_CODE"; rm -f /tmp/rdp-installer-azovest.img; curl -s -X POST "${BACKEND_URL}/api/installation/complete/${installId}" -H "Content-Type: application/json" -d "{\\"exitCode\\":$EXIT_CODE}" >/dev/null 2>&1 || true; exit $EXIT_CODE`;
                
                conn.exec(executeCommand, (err, stream) => {
                    if (err) {
                        cleanup();
                        reject(err);
                        return;
                    }
                    
                    let lastLines = [];
                    const MAX_LAST_LINES = 20;
                    
                    stream.on('data', (data) => {
                        const text = data.toString();
                        const lines = text.split('\n');
                        lines.forEach(line => {
                            if (line.trim()) {
                                onLog && onLog(`   ${line}`);
                                lastLines.push(line);
                                if (lastLines.length > MAX_LAST_LINES) {
                                    lastLines.shift();
                                }
                            }
                        });
                    });
                    
                    stream.stderr.on('data', (data) => {
                        const text = data.toString();
                        if (text.trim()) {
                            onLog && onLog(`   [stderr] ${text.trim()}`);
                        }
                    });
                    
                    stream.on('close', async (exitCode) => {
    const allOutput = lastLines.join('\n');
    const exitCodeMatch = allOutput.match(/INSTALL_EXIT_CODE:(\d+)/);
    const actualExitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : exitCode;

    const hasSuccessMessage = allOutput.includes('Installation completed successfully');
    const isRebooting =
        allOutput.includes('Rebooting system') ||
        allOutput.includes('Reboot to start DD');

    // -------------------------------
    // 1. Normal sukses (exit code 0)
    // -------------------------------
    if (actualExitCode === 0 || hasSuccessMessage || isRebooting) {
        try { conn.end(); } catch (e) {}
        return resolve({
            success: true,
            installId,
            rebooting: true,
            message: 'Installation completed successfully, server rebooting'
        });
    }

    // ----------------------------------------------
    // 2. Exit code undefined → anggap sukses (reboot)
    // ----------------------------------------------
    if (typeof actualExitCode === 'undefined' || actualExitCode === null) {
        onLog && onLog('⚠️ INSTALL: Exit code undefined, assuming reboot/success');
        onLog && onLog('   (this usually means SSH dropped while VPS was rebooting)');
        try { conn.end(); } catch (e) {}
        return resolve({
            success: true,
            installId,
            rebooting: true,
            message: 'Installation likely successful, server rebooting (exit code undefined)'
        });
    }

    // -------------------------------
    // 3. Beneran gagal
    // -------------------------------
    onLog && onLog(`❌ Installation failed`);
    onLog && onLog(`   Last lines of output:`);
    lastLines.slice(-10).forEach(line => {
        onLog && onLog(`   ${line}`);
    });

    cleanup();
    conn.end();
    reject(new Error(`Installation failed with exit code ${actualExitCode}`));
});
                });
                
            } catch (error) {
                cleanup();
                conn.end();
                onLog && onLog(`❌ Error: ${error.message}`);
                reject(error);
            }
        });
        
        conn.on('error', (err) => {
            cleanup();
            onLog && onLog(`❌ SSH Connection Error: ${err.message}`);
            reject(err);
        });
        
        // Connect to VPS
        onLog && onLog(`🔌 Connecting to VPS...`);
        conn.connect({
            host,
            port: 22,
            username,
            password,
            readyTimeout: 30000
        });
    });
}

module.exports = {
    installDedicatedRDP_Secure
};

