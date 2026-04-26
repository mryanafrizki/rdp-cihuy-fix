/**
 * Secure IMG Installer with Self-Extracting Encrypted Payload
 * 
 * Flow:
 * 1. Call backend API to get user_key, encrypted_master_key, and download token
 * 2. Download self-extracting .img file
 * 3. Execute .img with keys as arguments
 * 4. Script decrypts and extracts installer
 * 5. Continue with installation
 */

const { Client } = require('ssh2');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'https://rotate.eov.my.id';
const API_SECRET_KEY = process.env.API_SECRET_KEY || '';

/**
 * Call backend API to initialize secure installation
 * Returns: { userKey, encryptedMasterKey, downloadUrl, installId }
 */
async function initializeSecureInstallation(vpsIp, osVersion, rdpPort = 3389) {
    const url = new URL(`${BACKEND_URL}/api/installation/init`);
    
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            vpsIp,
            osVersion,
            rdpPort,
            metadata: {
                timestamp: Date.now(),
                secureMode: true
            }
        });
        
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'X-API-Secret': API_SECRET_KEY
            },
            timeout: 30000
        };
        
        const protocol = url.protocol === 'https:' ? https : http;
        const req = protocol.request(url, options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Backend API error: ${res.statusCode} - ${data}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(data);
                    
                    if (!response.success) {
                        reject(new Error(response.error || 'Backend API returned error'));
                        return;
                    }
                    
                    resolve({
                        installId: response.installId,
                        userKey: response.userKey,
                        encryptedMasterKey: response.encryptedMasterKey,
                        downloadUrl: response.downloadUrl, // Tokenized URL for .img download
                        imageToken: response.imageToken, // Token for OS image
                        expiresAt: response.expiresAt
                    });
                } catch (e) {
                    reject(new Error(`Failed to parse backend response: ${e.message}`));
                }
            });
        });
        
        req.on('error', (err) => {
            reject(new Error(`Backend API request failed: ${err.message}`));
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Backend API request timeout'));
        });
        
        req.write(postData);
        req.end();
    });
}

/**
 * Download self-extracting .img file from backend
 */
async function downloadSecureInstaller(downloadUrl, outputPath, onProgress) {
    const url = new URL(downloadUrl.startsWith('http') ? downloadUrl : `${BACKEND_URL}${downloadUrl}`);
    
    return new Promise((resolve, reject) => {
        const protocol = url.protocol === 'https:' ? https : http;
        const file = fs.createWriteStream(outputPath);
        
        const options = {
            timeout: 300000, // 5 minutes timeout
            headers: {
                'User-Agent': 'RDP-Installer/1.0'
            }
        };
        
        const req = protocol.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(outputPath);
                reject(new Error(`Download failed: ${res.statusCode} ${res.statusText}`));
                return;
            }
            
            const totalSize = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedSize = 0;
            
            res.on('data', (chunk) => {
                downloadedSize += chunk.length;
                file.write(chunk);
                
                if (onProgress && totalSize > 0) {
                    const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                    onProgress(downloadedSize, totalSize, percent);
                }
            });
            
            res.on('end', () => {
                file.end();
                resolve({
                    path: outputPath,
                    size: downloadedSize
                });
            });
        });
        
        req.on('error', (err) => {
            file.close();
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            reject(new Error(`Download error: ${err.message}`));
        });
        
        req.on('timeout', () => {
            req.destroy();
            file.close();
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            reject(new Error('Download timeout'));
        });
    });
}

/**
 * Install RDP using secure self-extracting encrypted IMG
 */
async function installDedicatedRDP_SecureIMG(
    host,
    username,
    password,
    config,
    onLog
) {
    const { osVersion, password: rdpPassword } = config;
    const RDP_PORT = config.rdpPort || 3389;
    
    return new Promise(async (resolve, reject) => {
        const conn = new Client();
        let installId = null;
        
        const cleanup = () => {
            try {
                if (conn && !conn.destroyed) {
                    conn.end();
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        };
        
        try {
            // Step 1: Initialize secure installation (get keys and download URL)
            onLog && onLog(`🔐 Initializing secure installation...`);
            onLog && onLog(`   Backend: ${BACKEND_URL}`);
            
            const initData = await initializeSecureInstallation(host, osVersion, RDP_PORT);
            installId = initData.installId;
            const userKey = initData.userKey;
            const encryptedMasterKey = initData.encryptedMasterKey;
            const downloadUrl = initData.downloadUrl;
            const imageToken = initData.imageToken;
            
            onLog && onLog(`✅ Installation initialized`);
            onLog && onLog(`   Install ID: ${installId}`);
            onLog && onLog(`   User Key: ${userKey.substring(0, 16)}... (encrypted)`);
            onLog && onLog(`   Download URL: ${downloadUrl}`);
            
            // Step 2: Download self-extracting .img to local temp
            onLog && onLog(`📥 Downloading secure installer...`);
            const tempImgPath = path.join(__dirname, '../../dist/rdp-installer-secure.img');
            
            await downloadSecureInstaller(
                `${BACKEND_URL}${downloadUrl}`,
                tempImgPath,
                (downloaded, total, percent) => {
                    onLog && onLog(`   Downloading: ${percent}% (${(downloaded / 1024 / 1024).toFixed(2)}MB / ${(total / 1024 / 1024).toFixed(2)}MB)`);
                }
            );
            
            onLog && onLog(`✅ Download complete`);
            
            // Step 3: Upload to VPS and execute
            onLog && onLog(`🚀 Uploading and executing secure installer...`);
            
            conn.on('ready', async () => {
                try {
                    // Upload self-extracting .img to VPS
                    const sftp = await new Promise((resolve, reject) => {
                        conn.sftp((err, sftp) => {
                            if (err) reject(err);
                            else resolve(sftp);
                        });
                    });
                    
                    const remoteImgPath = '/tmp/rdp-installer-secure.img';
                    
                    await new Promise((resolve, reject) => {
                        sftp.fastPut(tempImgPath, remoteImgPath, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    
                    sftp.end();
                    
                    // Make executable
                    await new Promise((resolve, reject) => {
                        conn.exec(`chmod +x ${remoteImgPath}`, (err, stream) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            stream.on('close', (code) => {
                                if (code === 0) resolve();
                                else reject(new Error(`chmod failed with code ${code}`));
                            });
                            
                            stream.stderr.on('data', (data) => {
                                // Ignore stderr for chmod
                            });
                        });
                    });
                    
                    // Execute self-extracting .img with keys
                    // The script will decrypt and extract installer
                    const executeCommand = `${remoteImgPath} ` +
                        `--user-key "${userKey}" ` +
                        `--encrypted-master-key "${encryptedMasterKey}" ` +
                        `--backend-url "${BACKEND_URL}" ` +
                        `--rdp-port "${RDP_PORT}" ` +
                        `--password "${rdpPassword}" ` +
                        `2>&1; EXIT_CODE=$?; echo ""; echo "INSTALL_EXIT_CODE:$EXIT_CODE"; ` +
                        `rm -f ${remoteImgPath}; ` +
                        `curl -s -X POST "${BACKEND_URL}/api/installation/complete/${installId}" ` +
                        `-H "Content-Type: application/json" ` +
                        `-d "{\\"exitCode\\":$EXIT_CODE}" >/dev/null 2>&1 || true; ` +
                        `exit $EXIT_CODE`;
                    
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
                            // Extract exit code from output
                            const allOutput = lastLines.join('\n');
                            const exitCodeMatch = allOutput.match(/INSTALL_EXIT_CODE:(\d+)/);
                            const actualExitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : exitCode;
                            
                            onLog && onLog(``);
                            onLog && onLog(`📊 Installation completed with exit code: ${actualExitCode}`);
                            
                            // Check if installation completed successfully or rebooting
                            const hasSuccessMessage = allOutput.includes('Installation completed successfully');
                            const isRebooting = allOutput.includes('Rebooting system') || allOutput.includes('Reboot to start DD');
                            
                            if (actualExitCode === 0 || hasSuccessMessage || isRebooting) {
                                onLog && onLog(`✅ Installation successful!`);
                                onLog && onLog(`🔄 Server is rebooting into Windows...`);
                                
                                try {
                                    conn.end();
                                } catch (e) {
                                    // Ignore if already disconnected
                                }
                                
                                resolve({
                                    success: true,
                                    installId,
                                    rebooting: true,
                                    message: 'Installation completed successfully, server rebooting'
                                });
                            } else if (actualExitCode === undefined && (hasSuccessMessage || isRebooting)) {
                                onLog && onLog(`✅ Installation appears successful (connection lost due to reboot)`);
                                onLog && onLog(`🔄 Server is rebooting into Windows...`);
                                
                                try {
                                    conn.end();
                                } catch (e) {
                                    // Ignore
                                }
                                
                                resolve({
                                    success: true,
                                    installId,
                                    rebooting: true,
                                    message: 'Installation completed successfully, server rebooting'
                                });
                            } else {
                                onLog && onLog(`❌ Installation failed`);
                                onLog && onLog(`   Last lines of output:`);
                                lastLines.slice(-10).forEach(line => {
                                    onLog && onLog(`   ${line}`);
                                });
                                
                                cleanup();
                                conn.end();
                                reject(new Error(`Installation failed with exit code ${actualExitCode}`));
                            }
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
            
        } catch (error) {
            cleanup();
            onLog && onLog(`❌ Error: ${error.message}`);
            reject(error);
        }
    });
}

module.exports = {
    installDedicatedRDP_SecureIMG,
    initializeSecureInstallation,
    downloadSecureInstaller
};

