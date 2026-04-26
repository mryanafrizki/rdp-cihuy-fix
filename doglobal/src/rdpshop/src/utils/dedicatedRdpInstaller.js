const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

async function installDedicatedRDP(host, username, password, config, onLog) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        
        conn.on('ready', async () => {
            try {
                // Display IP information with emojis
                onLog && onLog(`🌐 Server IP: ${host}`);
                onLog && onLog(`🔧 OS Version: ${config.osVersion}`);
                onLog && onLog(`🔑 Password: ${'*'.repeat(config.password.length)}`);
                onLog && onLog(`📡 Port: 8765 (Custom Security Port)`);
                onLog && onLog(`⏳ Starting installation process...`);
                
                // Read the tele.sh script
                const scriptPath = path.join(__dirname, '../../scripts/tele.sh');
                const scriptContent = fs.readFileSync(scriptPath, 'utf8');
                
                // Upload the script to the remote server
                onLog && onLog(`📤 Uploading installation script...`);
                await new Promise((resolve, reject) => {
                    conn.sftp((err, sftp) => {
                        if (err) reject(err);
                        
                        const writeStream = sftp.createWriteStream('/root/tele.sh');
                        writeStream.write(scriptContent);
                        writeStream.end();
                        writeStream.on('close', () => {
                            onLog && onLog(`✅ Script uploaded successfully!`);
                            resolve();
                        });
                        writeStream.on('error', reject);
                    });
                });

                // Make the script executable and run it
                const command = `chmod +x /root/tele.sh && bash /root/tele.sh "${config.password}" "${config.osVersion}" && rm -f /root/tele.sh`;
                
                onLog && onLog(`🚀 Executing installation command...`);
                conn.exec(command, (err, stream) => {
                    if (err) {
                        conn.end();
                        reject(err);
                        return;
                    }

                    let progress = 0;
                    const progressInterval = setInterval(() => {
                        progress += 2;
                        if (progress <= 100) {
                            const emoji = progress < 30 ? '⏳' : progress < 70 ? '🔄' : '⚡';
                            onLog && onLog(`${emoji} Installation progress: ${progress}%`);
                        } else {
                            clearInterval(progressInterval);
                        }
                    }, 5000);

                    stream.on('data', (data) => {
                        const output = data.toString();
                        // Add emojis to specific log messages
                        if (output.includes('Starting Dedicated RDP installation')) {
                            onLog && onLog(`🎯 ${output.trim()}`);
                        } else if (output.includes('Downloading reinstall.sh')) {
                            onLog && onLog(`📥 ${output.trim()}`);
                        } else if (output.includes('Running reinstall.sh')) {
                            onLog && onLog(`⚙️ ${output.trim()}`);
                        } else if (output.includes('Installation completed successfully')) {
                            onLog && onLog(`🎉 ${output.trim()}`);
                        } else if (output.includes('Rebooting system')) {
                            onLog && onLog(`🔄 ${output.trim()}`);
                        } else {
                            onLog && onLog(output);
                        }
                    });

                    stream.stderr.on('data', (data) => {
                        onLog && onLog(`⚠️ ${data.toString()}`);
                    });

                    stream.on('close', (code) => {
                        clearInterval(progressInterval);
                        conn.end();
                        
                        if (code !== 0) {
                            onLog && onLog(`❌ Installation failed with exit code: ${code}`);
                            reject(new Error('Installation failed with code ' + code));
                            return;
                        }

                        onLog && onLog(`✅ Installation completed successfully!`);
                        onLog && onLog(`🌐 Server: ${host}:8765`);
                        onLog && onLog(`👤 Username: administrator`);
                        onLog && onLog(`🔑 Password: ${config.password}`);
                        onLog && onLog(`🔄 System will reboot automatically...`);
                        resolve(true);
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
