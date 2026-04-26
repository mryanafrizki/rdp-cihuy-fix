const { getDedicatedOSVersions, DEDICATED_INSTALLATION_COST, RDP_PORT } = require('../config/constants');
const rdpPriceManager = require('../utils/rdpPriceManager');
const moment = require('moment-timezone');

const { checkVPSSupport } = require('../utils/vpsChecker');
const { detectVPSSpecs, checkVPSRequirements } = require('../utils/vpsSpecs');
const { installDedicatedRDP } = require('../utils/dedicatedRdpInstaller');

const { deductBalance, isAdmin } = require('../utils/userManager');
const RDPMonitor = require('../utils/rdpMonitor');
const safeMessageEditor = require('../utils/safeMessageEdit');

/**
 * Helper function to format estimated completion time
 * @param {number} startTime - Timestamp saat instalasi dimulai
 * @param {number} minMinutes - Estimasi minimal (menit)
 * @param {number} maxMinutes - Estimasi maksimal (menit)
 * @returns {string} Formatted string seperti "Estimasi 5-15menit (10:05-10:15)"
 */
function formatEstimatedTime(startTime, minMinutes, maxMinutes) {
  const startDate = moment(startTime).tz('Asia/Jakarta');
  const minEndDate = moment(startDate).add(minMinutes, 'minutes');
  const maxEndDate = moment(startDate).add(maxMinutes, 'minutes');
  
  const startTimeStr = startDate.format('HH:mm');
  const minEndTimeStr = minEndDate.format('HH:mm');
  const maxEndTimeStr = maxEndDate.format('HH:mm');
  
  return `Estimasi ${minMinutes}-${maxMinutes}menit (${minEndTimeStr}-${maxEndTimeStr})`;
}

async function handleInstallDedicatedRDP(bot, chatId, messageId, sessionManager) {
  // Get current price from rdpPrice.json
  const prices = rdpPriceManager.getRdpPrices();
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const pricePerQuota = prices.pricePerQuota || 3000;
  
  let dedicatedPrice;
  if (quotaMode) {
    dedicatedPrice = pricePerQuota; // Dedicated = 1 kuota (fixed)
  } else {
    dedicatedPrice = prices.dedicatedRdpPrice || 3000;
  }
  
  // Hanya cek saldo, jangan potong dulu (akan dipotong setelah installation completed)
  const session = sessionManager.getUserSession(chatId) || {};
  
  if (!isAdmin(chatId)) {
    const { getBalance } = require('../utils/userManager');
    const currentBalance = await getBalance(chatId);
    const balance = typeof currentBalance === 'string' ? 0 : currentBalance;
    
    if (balance < dedicatedPrice) {
      let priceText;
      if (quotaMode) {
        priceText = `1 kuota`;
      } else {
        priceText = dedicatedPrice === 0 ? 'Gratis' : `Rp ${dedicatedPrice.toLocaleString('id-ID')}`;
      }
      
      const insufficientBalanceText = `💰 *Saldo tidak mencukupi untuk Dedicated RDP (${priceText})*\n\n` +
        `Silakan deposit terlebih dahulu untuk melanjutkan instalasi.`;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Deposit', callback_data: 'deposit' }, { text: '🏠 Kembali', callback_data: 'back_to_menu' }]
          ]
        }
      };
      
      // PENTING: Coba edit message dulu, jika gagal kirim pesan baru
      // Clear cache untuk force update setiap kali (memastikan pesan selalu muncul)
      safeMessageEditor.clearMessageCache(chatId, messageId);
      
      const editResult = await safeMessageEditor.editMessage(bot, chatId, messageId, insufficientBalanceText, {
        parse_mode: 'Markdown',
        ...keyboard
      });
      
      // PENTING: Jika edit gagal, kirim pesan baru sebagai fallback
      if (!editResult || !editResult.success) {
        try {
          // Delete message lama dulu (jika ada)
          try {
            await bot.deleteMessage(chatId, messageId).catch(() => {});
          } catch (deleteErr) {
            // Ignore jika message sudah dihapus
          }
          
          // Kirim pesan baru dengan info saldo tidak cukup
          await bot.sendMessage(chatId, insufficientBalanceText, {
            parse_mode: 'Markdown',
            ...keyboard
          });
        } catch (sendErr) {
          console.error('[DEDICATED RDP] Error sending fallback message:', sendErr.message);
          // Last resort: coba edit lagi tanpa cache
          try {
            await bot.editMessageText(insufficientBalanceText, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              ...keyboard
            });
          } catch (lastErr) {
            console.error('[DEDICATED RDP] All fallbacks failed:', lastErr.message);
          }
        }
      }
      
      return;
    }
  }

  session.installType = 'dedicated';
  session.installationCost = dedicatedPrice; // Simpan cost untuk dipotong setelah password RDP dimasukkan
  session.balanceDeducted = false; // Flag untuk track apakah saldo sudah dipotong

  let messageText;
  if (quotaMode) {
    // Quota mode: don't show price
    messageText = `🖥️ Instalasi RDP Dedicated\n\n` +
      `⚡ Fitur: Windows langsung di VPS (bukan Docker)\n` +
      `🔒 Port: ${RDP_PORT} (custom untuk keamanan)\n\n` +
      '📋 Spesifikasi Minimal:\n' +
      '• ⚡ CPU: 1 Core\n' +
      '• 💾 RAM: 1 GB\n' +
      '• 💽 Storage: 20 GB\n\n' +
      '🌐 IP VPS:\n' +
      'IP akan dihapus otomatis setelah dikirim\n\n' +
      '⚠️ PENTING: VPS Wajib Fresh Install Ubuntu 24.04 LTS';
  } else {
    // Saldo mode: show price
    const priceText = dedicatedPrice === 0 ? 'Gratis' : `Rp ${dedicatedPrice.toLocaleString('id-ID')}/install`;
    messageText = `🖥️ Instalasi RDP Dedicated\n\n` +
      `💰 Harga: ${priceText}\n` +
      `⚡ Fitur: Windows langsung di VPS (bukan Docker)\n` +
      `🔒 Port: ${RDP_PORT} (custom untuk keamanan)\n\n` +
      '📋 Spesifikasi Minimal:\n' +
      '• ⚡ CPU: 1 Core\n' +
      '• 💾 RAM: 1 GB\n' +
      '• 💽 Storage: 20 GB\n\n' +
      '🌐 IP VPS:\n' +
      'IP akan dihapus otomatis setelah dikirim\n\n' +
      '⚠️ PENTING: VPS Wajib Fresh Install Ubuntu 24.04 LTS';
  }

  const msg = await bot.editMessageText(messageText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Batal', callback_data: 'cancel_installation' }]
        ]
      }
    }
  );

  session.step = 'waiting_ip';
  session.startTime = Date.now();
  session.messageId = msg.message_id;
  sessionManager.setUserSession(chatId, session);
  
  // Debug: Verify session was saved correctly
  const savedSession = sessionManager.getUserSession(chatId);
  if (savedSession && savedSession.step === 'waiting_ip' && savedSession.installType === 'dedicated') {
    console.info(`[DEDICATED RDP] ✅ Session saved successfully for chatId: ${chatId}, step: ${savedSession.step}, installType: ${savedSession.installType}`);
  } else {
    console.error(`[DEDICATED RDP] ❌ Session NOT saved correctly! chatId: ${chatId}`, {
      saved: !!savedSession,
      step: savedSession?.step,
      installType: savedSession?.installType
    });
  }
}

async function handleDedicatedVPSCredentials(bot, msg, sessionManager) {
  const chatId = msg.chat.id;
  let session = sessionManager.getUserSession(chatId);
  
  // Try different formats if session not found
  if (!session) {
    session = sessionManager.getUserSession(String(chatId));
  }
  if (!session) {
    session = sessionManager.getUserSession(Number(chatId));
  }

  if (!session || session.installType !== 'dedicated') {
    // Tidak perlu kirim pesan "SESSION EXPIRED, restart"
    if (!session) {
      console.warn(`[DEDICATED RDP] No session found for chatId: ${chatId}`);
    } else if (session.installType !== 'dedicated') {
      console.warn(`[DEDICATED RDP] Session installType mismatch. Expected: dedicated, Got: ${session.installType}, ChatId: ${chatId}`);
    }
    return;
  }

  // Hapus pesan HANYA saat mode masukan IP, password root VPS, atau password RDP
  // Jangan hapus jika instalasi sudah berjalan (installation_in_progress)
  const shouldDeleteMessage = (session.step === 'waiting_ip' || session.step === 'waiting_password' || session.step === 'waiting_rdp_password') && session.step !== 'installation_in_progress';
  if (shouldDeleteMessage) {
  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (error) {
    // console.info('Gagal menghapus pesan:', error.message);
    }
  }
  
  // Jika instalasi sudah berjalan, jangan proses input apa-apa
  if (session.step === 'installation_in_progress') {
    return; // Jangan proses pesan apa-apa selama instalasi berjalan
  }

  switch (session.step) {
    case 'waiting_ip':
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(msg.text)) {
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          '❌ Format IP tidak valid.\n\n' +
          '🖥️ Instalasi RDP Dedicated\n\n' +
          '🌐 IP VPS:\n' +
          'IP akan dihapus otomatis setelah dikirim\n\n' +
          '⚠️ PENTING: VPS Wajib Fresh Install Ubuntu 24.04 LTS',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Batal', callback_data: 'cancel_installation' }]
              ]
            }
          }
        );
        return;
      }

      session.ip = msg.text;
      
      // Ambil hostname dan location info dari ip-api.com langsung saat IP dimasukkan
      try {
        const { getIPInfoWithHostname } = require('../utils/ipApiChecker');
        const ipInfo = await getIPInfoWithHostname(session.ip);
        if (ipInfo.success) {
          // Simpan VPS Name
          if (ipInfo.hostname && ipInfo.hostname !== 'N/A') {
            session.hostname = ipInfo.hostname;
            // console.info(`[RDP] Got VPS Name from ip-api.com for ${session.ip}: ${ipInfo.hostname}`);
          } else {
            session.hostname = `RDP-${session.ip.split('.').join('')}`;
          }
          
          // Simpan location info untuk ditampilkan di success/error message dan channel notification
          if (ipInfo.country && ipInfo.country !== 'N/A') {
            const countryCode = ipInfo.countryCode && ipInfo.countryCode !== 'N/A' ? `(${ipInfo.countryCode})` : '';
            const regionName = ipInfo.region && ipInfo.region !== 'N/A' ? ` - ${ipInfo.region}` : '';
            session.locationInfo = `${ipInfo.country} ${countryCode}${regionName}`.trim();
            // console.info(`[RDP] Got location info from ip-api.com for ${session.ip}: ${session.locationInfo}`);
          }
        } else {
          // Fallback jika API gagal
          session.hostname = `RDP-${session.ip.split('.').join('')}`;
          session.locationInfo = 'N/A';
          // console.info(`[RDP] Using fallback VPS Name for ${session.ip}: ${session.hostname}`);
        }
      } catch (e) {
        console.error('[RDP] Error getting info from ip-api.com:', e);
        // Fallback jika API error
        session.hostname = `RDP-${session.ip.split('.').join('')}`;
        session.locationInfo = 'N/A';
      }
      
      session.step = 'waiting_password';
      sessionManager.setUserSession(chatId, session);

      await safeMessageEditor.editMessage(bot, chatId, session.messageId,
        '🔑 Password Root VPS:\nPassword akan dihapus otomatis',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Batal', callback_data: 'cancel_installation' }]
            ]
          }
        }
      );
      break;

    case 'waiting_password':
      session.password = msg.text;
      session.step = 'checking_vps';
      sessionManager.setUserSession(chatId, session);

      await safeMessageEditor.editMessage(bot, chatId, session.messageId, '🔍 Memeriksa VPS...');

      try {
        const vpsCheck = await checkVPSRequirements(session.ip, 'root', session.password);
        
        if (!vpsCheck.success) {
          throw new Error(vpsCheck.error || 'Gagal memeriksa VPS');
        }

        session.rawSpecs = vpsCheck.specs;
        
        // Hostname sudah diambil dari ip-api.com saat IP dimasukkan (case waiting_ip)
        // Jika belum ada (misalnya dari flow lama), ambil sekarang
        if (!session.hostname || session.hostname === 'N/A' || session.hostname.startsWith('RDP-')) {
          // Coba ambil hostname dari ip-api.com terlebih dahulu
          try {
            const { getIPInfoWithHostname } = require('../utils/ipApiChecker');
            const ipInfo = await getIPInfoWithHostname(session.ip);
            if (ipInfo.success && ipInfo.hostname && ipInfo.hostname !== 'N/A') {
              session.hostname = ipInfo.hostname;
              // console.info(`[RDP] Got VPS Name from ip-api.com for ${session.ip}: ${ipInfo.hostname}`);
            }
          } catch (e) {
            console.error('[RDP] Error getting VPS Name from ip-api.com:', e);
          }
        }
        
        // Jika masih belum ada hostname, coba dari VPS check sebagai fallback
        if (!session.hostname || session.hostname === 'N/A' || session.hostname.startsWith('RDP-')) {
          let hostname = vpsCheck.specs.hostname_short || vpsCheck.specs.hostname || null;
          
          // Jika masih tidak ada, coba ambil dari VPS langsung via SSH
          if (!hostname || hostname.trim() === '' || hostname === 'unknown') {
            try {
              const { Client } = require('ssh2');
              const conn = new Client();
              hostname = await new Promise((resolve, reject) => {
                conn.on('ready', () => {
                  conn.exec('hostname -f || hostname', (err, stream) => {
                    if (err) {
                      conn.end();
                      resolve(null);
                      return;
                    }
                    
                    let output = '';
                    stream.on('data', (data) => {
                      output += data.toString();
                    });
                    
                    stream.on('close', (code) => {
                      conn.end();
                      const hostnameResult = output.trim();
                      resolve(hostnameResult || null);
                    });
                  });
                });
                
                conn.on('error', () => {
                  resolve(null);
                });
                
                conn.connect({
                  host: session.ip,
                  port: 22,
                  username: 'root',
                  password: session.password,
                  readyTimeout: 10000
                });
              });
            } catch (e) {
              console.error('[RDP] Error fetching hostname from VPS:', e);
              hostname = null;
            }
          }
          
          // Final fallback jika masih tidak ada hostname
          if (!hostname || hostname.trim() === '' || hostname === 'unknown' || hostname === 'N/A') {
          hostname = `RDP-${session.ip.split('.').join('')}`;
        }
          
          session.hostname = hostname.trim();
        }

        if (!vpsCheck.meets_requirements) {
          const reqDetails = vpsCheck.requirements_details;
          
          // Jika ada error connection, tampilkan error message yang lebih jelas
          let errorMessage;
          if (!vpsCheck.success && vpsCheck.error) {
            errorMessage = 
              `❌ Gagal terhubung ke VPS\n\n` +
              `📋 Detail Error:\n${vpsCheck.error}\n\n` +
              `🔍 Kemungkinan penyebab:\n` +
              `• SSH tidak berjalan di port 22\n` +
              `• Firewall memblokir koneksi\n` +
              `• Password atau IP salah\n` +
              `• VPS sedang down/tidak merespon\n\n` +
              `💡 Solusi:\n` +
              `• Pastikan SSH service berjalan: \`systemctl status sshd\`\n` +
              `• Cek firewall: \`ufw status\` atau \`iptables -L\`\n` +
              `• Pastikan port 22 terbuka\n` +
              `• Test koneksi: \`ssh root@${session.ip}\``;
          } else {
            // VPS terhubung tapi spesifikasi tidak memenuhi
            errorMessage = 
              `❌ VPS tidak memenuhi spesifikasi minimal\n\n` +
              `🖥️ Spesifikasi VPS saat ini:\n` +
              `${reqDetails.memory.status} RAM: ${reqDetails.memory.current} GB (min: ${reqDetails.memory.required} GB)\n` +
              `${reqDetails.disk.status} Storage: ${reqDetails.disk.current} GB (min: ${reqDetails.disk.required} GB)\n` +
              `${reqDetails.cpu.status} CPU: ${reqDetails.cpu.current} Core (min: ${reqDetails.cpu.required} Core)\n\n` +
              `⚠️ Silakan gunakan VPS dengan spesifikasi yang lebih tinggi.`;
          }
          
          await safeMessageEditor.editMessage(bot, chatId, session.messageId,
            errorMessage,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                  [{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]
                ]
              }
            }
          );
          sessionManager.clearUserSession(chatId);
          return;
        }

        // Format location info jika ada
        const locationInfo = session.locationInfo || 'N/A';
        const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';

        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          `🖥️ VPS siap untuk instalasi RDP dedicated\n\n` +
          `🌐 IP Server: ${session.ip}\n` +
          `🏷️ Server: ${session.hostname || 'N/A'}${locationText}\n` +
		  `🏷️ Hostname: ${vpsCheck.specs.hostname_short || 'N/A'}\n` +
          `💾 RAM: ${vpsCheck.specs.memory} (${vpsCheck.specs.memoryGB} GB)\n` +
          `💽 Storage: ${vpsCheck.specs.disk} (${vpsCheck.specs.diskGB} GB)\n` +
          `⚡ CPU: ${vpsCheck.specs.cpu}\n` +
          `🖧 OS: ${vpsCheck.specs.os}\n\n` +
          `✅ Semua spesifikasi memenuhi requirement\n\n` +
          `Silakan pilih OS Windows:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Lanjutkan', callback_data: 'show_dedicated_os_selection' }],
                [{ text: '❌ Batal', callback_data: 'cancel_installation' }]
              ]
            }
          }
        );
      } catch (error) {
        // Gagal sebelum line 83 (VPS check) - belum potong saldo, tidak perlu refund
        // Mark installation as failed if exists
        if (session.installId) {
          try {
            const { failInstallation } = require('../utils/statistics');
            await failInstallation(session.installId, error.message || 'VPS connection failed');
            // console.info(`[RDP] Failed installation ID ${session.installId}: ${error.message}`);
          } catch (e) {
            console.error('[RDP] Error failing installation:', e);
          }
        }
        
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          '❌ Gagal terhubung ke VPS. Pastikan IP dan password benar.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                [{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]
              ]
            }
          }
        );
        sessionManager.clearUserSession(chatId);
      }
      break;

    case 'waiting_rdp_password':
      if (msg.text.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@#$%^&+=]{8,}$/.test(msg.text)) {
        // Get price per quota - semua dedicated = 1 kuota (fixed)
        const prices = rdpPriceManager.getRdpPrices();
        const pricePerQuota = prices.pricePerQuota || 3000;
        
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          '❌ Password tidak memenuhi syarat. Harus minimal 8 karakter dan mengandung huruf dan angka.\n\n' +
          `⚙️ Konfigurasi yang dipilih:\n\n` +
          `🏷️ VPS Name: ${session.hostname || 'N/A'}\n` +
		  `🏷️ Hostname: ${session.rawSpecs?.hostname_short || session.rawSpecs?.hostname || 'N/A'}\n` +
          `🌍 Lokasi: ${session.locationInfo || 'N/A'}\n` +
          `💿 OS: ${session.selectedOS?.name || 'N/A'}\n` +
          `💰 Harga: Rp ${pricePerQuota.toLocaleString('id-ID')} (1 kuota)\n\n` +
          `🔑 Masukkan password untuk RDP Windows:\n` +
          `(Min. 8 karakter, kombinasi huruf dan angka)`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '⬅️ Kembali', callback_data: 'back_to_dedicated_os' }]
              ]
            }
          }
        );
        return;
      }

      session.rdpPassword = msg.text;

      // Generate Install ID saat instalasi dimulai (setelah password RDP dimasukkan)
      // IMPORTANT: Always generate install_id, even for admin/owner
      let installId = session.installId;
      if (!installId) {
        try {
          const { startInstallation } = require('../utils/statistics');
          installId = await startInstallation(chatId, session.ip, session.selectedOS?.name || 'Windows', 'dedicated', session.installationCost || 0);
          if (!installId) {
            // Retry once if failed
            installId = await startInstallation(chatId, session.ip, session.selectedOS?.name || 'Windows', 'dedicated', session.installationCost || 0);
          }
          if (installId) {
            session.installId = installId;
            console.info(`[RDP] Generated Install ID ${installId} at installation start for user ${chatId}`);
          } else {
            console.error(`[RDP] Failed to generate Install ID for user ${chatId} after retry`);
          }
        } catch (e) {
          console.error('[RDP] Error generating Install ID:', e);
          // Retry once on error
          try {
            const { startInstallation } = require('../utils/statistics');
            installId = await startInstallation(chatId, session.ip, session.selectedOS?.name || 'Windows', 'dedicated', session.installationCost || 0);
            if (installId) {
              session.installId = installId;
              console.info(`[RDP] Generated Install ID ${installId} at installation start for user ${chatId} (retry)`);
            }
          } catch (retryError) {
            console.error('[RDP] Error generating Install ID on retry:', retryError);
          }
        }
      }
      
      // Potong saldo saat instalasi dimulai
      if (!isAdmin(chatId) && session.installationCost && !session.balanceDeducted) {
        try {
          const deducted = await deductBalance(chatId, session.installationCost);
          if (deducted) {
            session.balanceDeducted = true;
            // console.info(`[RDP] Deducted ${session.installationCost} from user ${chatId} at installation start`);
          } else {
            // Saldo tidak cukup
      await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              '❌ Saldo tidak mencukupi. Deposit terlebih dahulu.',
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '💳 Deposit', callback_data: 'deposit' }],
                    [{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]
                  ]
                }
              }
            );
            sessionManager.clearUserSession(chatId);
            return;
          }
        } catch (e) {
          console.error('[RDP] Error deducting balance:', e);
          await safeMessageEditor.editMessage(bot, chatId, session.messageId,
            '❌ Gagal memproses pembayaran. Silakan coba lagi.',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                  [{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]
                ]
              }
            }
          );
          sessionManager.clearUserSession(chatId);
          return;
        }
      }
      
      // Flag untuk track apakah sudah sampai line 70 (Installation completed successfully)
      session.reachedInstallationSuccess = false;
      
      // Update session step ke installation_in_progress agar tidak menerima input lagi
      session.step = 'installation_in_progress';
      sessionManager.setUserSession(chatId, session);

      const installIdText = installId ? `\n🆔 **Install ID:** \`${installId}\`\n` : '';
      const startTime = session.startTime || Date.now();
      const estimatedTime = formatEstimatedTime(startTime, 5, 15);
      await safeMessageEditor.editMessage(bot, chatId, session.messageId,
        `🚀 Memulai instalasi Windows Dedicated...${installIdText}\n` +
        `⏰ ${estimatedTime}\n\n` +
        `📊 Status: Instalasi sedang berjalan...\n` +
        `🔔 Catatan: Anda akan mendapat notifikasi ketika RDP siap!`
      );

      try {
        // Start installation - this will run in background
        // console.info(`[RDP] Starting dedicated installation for user ${chatId}, IP: ${session.ip}, OS: ${session.selectedOS?.name || 'N/A'}`);
        
        // Handle installPromise rejection (installation failed)
        // New monitoring method: Monitor for reboot detection, then reconnect SSH
        // Flow: 
        //   - If no reboot detected in 3 min → reconnect SSH (1 min interval, 10x attempts)
        //   - If reboot detected → wait 1 min → reconnect SSH (1 min interval, 10x attempts)
        //   - If connected after reboot → monitor until disconnect (max 15 min after connect)
        let rebootDetectionTimeoutId = null;
        let reconnectTimeoutId = null;
        let sshMonitorInstance = null;
        let rebootDetected = false;
        let reconnectInProgress = false;
        const installationStartTime = Date.now();
        
        // Function to reconnect SSH with new password (RDP password)
        const reconnectSSH = async (maxAttempts = 10) => {
          const { Client } = require('ssh2');
          let attempts = 0;
          
          while (attempts < maxAttempts) {
            attempts++;
            console.info(`[SSH RECONNECT] Attempt ${attempts}/${maxAttempts} to reconnect to ${session.ip} with new password`);
            
            const connected = await new Promise((resolve) => {
              const testClient = new Client();
              let resolved = false;
              
              const cleanup = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  try {
                    testClient.end();
                  } catch (e) {
                    // Ignore cleanup errors
                  }
                  resolve(false);
                }
              };
              
              const timeout = setTimeout(() => {
                console.warn(`[SSH RECONNECT] Timeout connecting to ${session.ip}`);
                cleanup();
              }, 10000); // 10 second timeout
              
              testClient.once('ready', () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  console.info(`[SSH RECONNECT] ✅ SSH connected with new password!`);
                  sshMonitorInstance = testClient;
                  resolve(true);
                }
              });
              
              testClient.once('error', (err) => {
                if (!resolved) {
                  console.warn(`[SSH RECONNECT] Connection error: ${err.message}`);
                  cleanup();
                }
              });
              
              // Handle connection close/end before handshake
              testClient.once('close', () => {
                if (!resolved) {
                  console.warn(`[SSH RECONNECT] Connection closed before handshake to ${session.ip}`);
                  cleanup();
                }
              });
              
              testClient.once('end', () => {
                if (!resolved) {
                  console.warn(`[SSH RECONNECT] Connection ended before ready to ${session.ip}`);
                  cleanup();
                }
              });
              
              try {
                testClient.connect({
                  host: session.ip,
                  port: 22,
                  username: 'root',
                  password: session.rdpPassword, // Use NEW password
                  readyTimeout: 18000
                });
              } catch (err) {
                console.error(`[SSH RECONNECT] Error initiating connection: ${err.message}`);
                cleanup();
              }
            });
            
            if (connected) {
              return { success: true, attempts };
            }
            
            // Wait 1 minute before next attempt
            if (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 60 * 1000));
            }
          }
          
          return { success: false, attempts };
        };
        
        // Function to monitor SSH connection until disconnect (max 15 min after connect)
        const monitorSSHUntilDisconnect = async () => {
          return new Promise((resolve) => {
            if (!sshMonitorInstance) {
              resolve({ success: false, error: 'No SSH connection to monitor' });
              return;
            }
            
            let monitoringActive = true;
            const connectTime = Date.now();
            const maxMonitorTime = 15 * 60 * 1000; // 15 minutes max after connect
            
            // Setup disconnect handler
            sshMonitorInstance.on('close', () => {
              if (monitoringActive) {
                const totalTime = Math.round((Date.now() - connectTime) / 60000);
                console.info(`[SSH MONITOR] SSH disconnected after ${totalTime} minutes - installation complete`);
                monitoringActive = false;
                resolve({
                  success: true,
                  rdpReady: true,
                  totalTime: totalTime,
                  responseTime: 1
                });
              }
            });
            
            // Timeout handler
            setTimeout(() => {
              if (monitoringActive) {
                console.info(`[SSH MONITOR] Monitoring timeout after ${maxMonitorTime / 60000} minutes`);
                monitoringActive = false;
                sshMonitorInstance.end();
                resolve({
                  success: true,
                  rdpReady: true,
                  totalTime: Math.round(maxMonitorTime / 60000),
                  responseTime: 1
                });
              }
            }, maxMonitorTime);
          });
        };
        
        // Function to handle SSH reconnect after reboot detection or timeout
        const handleSSHReconnect = async () => {
          // Prevent multiple simultaneous reconnects
          if (reconnectInProgress) {
            console.info(`[SSH RECONNECT] Reconnect already in progress, skipping...`);
            return;
          }
          
          reconnectInProgress = true;
          
          try {
            // Get fresh session
            let currentSession = sessionManager.getUserSession(chatId);
            if (!currentSession) {
              currentSession = sessionManager.getUserSession(String(chatId));
            }
            if (!currentSession) {
              currentSession = session;
            }
            
            // Clear any pending timeouts
            if (rebootDetectionTimeoutId) {
              clearTimeout(rebootDetectionTimeoutId);
              rebootDetectionTimeoutId = null;
            }
            if (reconnectTimeoutId) {
              clearTimeout(reconnectTimeoutId);
              reconnectTimeoutId = null;
            }
            
            const installIdText = installId ? `\n🆔 **Install ID:** \`${installId}\`\n` : '';
            await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              `⚙️ Instalasi Windows sedang berlangsung...${installIdText}\n` +
              '🔄 Status: Validating...\n\n' +
              '📝 Catatan:\n' +
              '• Memvalidasi os support/tidak'
            );
            
            // Reconnect SSH (10 attempts, 1 minute interval)
            const reconnectResult = await reconnectSSH(10);
            
            if (!reconnectResult.success) {
              // Failed to reconnect after 10 attempts - error, no refund
              console.error(`[SSH RECONNECT] ❌ Failed to reconnect after ${reconnectResult.attempts} attempts`);
              
              // IMPORTANT: Clear all pending timeouts since we're stopping
              if (rebootDetectionTimeoutId) {
                clearTimeout(rebootDetectionTimeoutId);
                rebootDetectionTimeoutId = null;
                console.info('[RDP] Cleared reboot detection timeout due to SSH reconnect failure');
              }
              if (reconnectTimeoutId) {
                clearTimeout(reconnectTimeoutId);
                reconnectTimeoutId = null;
                console.info('[RDP] Cleared reconnect timeout due to SSH reconnect failure');
              }
              if (sshMonitorInstance) {
                try {
                  sshMonitorInstance.end();
                  console.info('[RDP] Closed SSH monitor instance due to SSH reconnect failure');
                } catch (e) {
                  // Ignore errors when closing
                }
              }
              
              // Mark installation as failed
              if (currentSession.installId) {
                try {
                  const { failInstallation } = require('../utils/statistics');
                  await failInstallation(currentSession.installId, `SSH reconnect failed after ${reconnectResult.attempts} attempts`);
                } catch (e) {
                  console.error('[RDP] Error failing installation:', e);
                }
              }
              
              // Format location info
              const locationInfo = currentSession.locationInfo || 'N/A';
              const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
              
              await safeMessageEditor.editMessage(bot, chatId, currentSession.messageId || session.messageId,
                `❌ Terjadi kesalahan saat instalasi${locationText}\n\n` +
                `🚨 SSH tidak dapat terhubung setelah ${reconnectResult.attempts} attempts\n\n` +
                `⚠️ Saldo/kuota tidak dikembalikan\n\n` +
                `🔧 Silakan hubungi admin untuk bantuan.`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                      [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                    ]
                  }
                }
              );
              
              safeMessageEditor.clearMessageCache(chatId, currentSession.messageId || session.messageId);
              sessionManager.clearUserSession(chatId);
              return;
            }
            
            // SSH connected - show "✅ Analyzing.." and monitor until disconnect
            await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              `✅ Validasi berhasil!${installIdText}\n` +
              '⚙ Analyzing..\n' +
              '🔄 Menunggu proses finalisasi...\n\n' +
              '⏳ Tunggu hingga proses selesai...'
            );
            
            // Monitor SSH connection until disconnect (max 15 min after connect)
            const rdpResult = await monitorSSHUntilDisconnect();
            
            if (sshMonitorInstance) {
              sshMonitorInstance.end();
            }
            
            // Continue with existing success handling (same as RDPMonitor flow)
            // This will handle completeInstallation, sendChannelNotification, etc.
            if (rdpResult && rdpResult.success && rdpResult.rdpReady) {
                // Get installId from session first
                let installId = session.installId;
                
                // Fallback: get from database if not in session
                if (!installId && session.ip && chatId) {
                  try {
                    const { getLatestInstallationId } = require('../utils/statistics');
                    installId = await getLatestInstallationId(chatId, session.ip);
                    if (installId) {
                      session.installId = installId;
                    }
                  } catch (e) {
                    console.error('[RDP] Error retrieving Install ID from database:', e);
                  }
                }
                
                // Delay 1 menit setelah detect reboot ke-2 sebelum kirim pesan sukses (di background)
                await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // Delay 1 menit
                
                // Get OS name (define early to ensure it's available everywhere)
                const osNameToSave = session.selectedOS?.name || 'Windows';
                
                if (installId) {
                  try {
                    const { completeInstallation, updateInstallationIP } = require('../utils/statistics');
                    
                    if (session.ip) {
                      await updateInstallationIP(installId, session.ip);
                    }
                    
                    const hostnameToSave = session.hostname && session.hostname !== 'unknown' && session.hostname.trim() !== '' && !session.hostname.startsWith('RDP-')
                      ? session.hostname 
                      : (session.rawSpecs?.hostname_short || session.rawSpecs?.hostname || `RDP-${session.ip.split('.').join('')}`);
                    const locationInfoToSave = session.locationInfo && session.locationInfo !== 'N/A' 
                      ? session.locationInfo 
                      : null;
                    
                    const rdpUsername = 'administrator';
                    const rdpPassword = session.rdpPassword || null;
                    
                    const completedSuccessfully = await completeInstallation(installId, hostnameToSave.trim(), osNameToSave, locationInfoToSave, rdpUsername, rdpPassword);
                    
                    if (completedSuccessfully) {
                      session.installId = installId;
                    }
                  } catch (e) {
                    console.error('[RDP] Error completing installation:', e);
                  }
                }
                
                // Get balance and cost info
                const { getBalance } = require('../utils/userManager');
                const currentBalance = await getBalance(chatId);
                const balanceText = typeof currentBalance === 'string' ? currentBalance : `Rp ${currentBalance.toLocaleString('id-ID')}`;
                const costText = session.installationCost ? `Rp ${session.installationCost.toLocaleString('id-ID')}` : 'Gratis';
                
                // Calculate installation time
                let installTimeText = 'N/A';
                let installTimeMinutes = null;
                const installIdForTime = session.installId || installId;
                if (installIdForTime) {
                  try {
                    const dbAsync = require('../config/database');
                    const installation = await dbAsync.get(
                      `SELECT created_at, completed_at FROM rdp_installations WHERE install_id = ?`,
                      [installIdForTime]
                    );
                    if (installation && installation.created_at && installation.completed_at) {
                      const createdDate = new Date(installation.created_at);
                      const completedDate = new Date(installation.completed_at);
                      const diffMs = completedDate.getTime() - createdDate.getTime();
                      const diffMinutes = Math.floor(diffMs / 60000);
                      installTimeMinutes = diffMinutes;
                      const diffHours = Math.floor(diffMinutes / 60);
                      const remainingMinutes = diffMinutes % 60;
                      
                      if (diffHours > 0) {
                        installTimeText = `${diffHours} jam ${remainingMinutes} menit`;
                      } else {
                        installTimeText = `${diffMinutes} menit`;
                      }
                    }
                  } catch (e) {
                    console.error('[RDP] Error calculating installation time from database:', e);
                    installTimeText = rdpResult.totalTime ? `${rdpResult.totalTime} menit` : 'N/A';
                    installTimeMinutes = rdpResult.totalTime || null;
                  }
                }
                
                // Ensure hostname is set
                if (!session.hostname || session.hostname === 'unknown') {
                  session.hostname = `RDP-${session.ip.split('.').join('')}`;
                }
                
                // Format location info
                const locationInfo = session.locationInfo || 'N/A';
                const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
                
                // Send channel notification
                let installIdForChannel = session.installId || installId;
                if (!installIdForChannel && session.ip && chatId) {
                  try {
                    const { getLatestInstallationId } = require('../utils/statistics');
                    installIdForChannel = await getLatestInstallationId(chatId, session.ip);
                    if (!installIdForChannel) {
                      installIdForChannel = await getLatestInstallationId(chatId, null);
                    }
                  } catch (e) {
                    console.error('[RDP] Error retrieving Install ID from database for channel notification:', e);
                  }
                }
                
                installIdForChannel = installIdForChannel || 'N/A';
                try {
                  const { sendChannelNotification, createInstallationNotification } = require('../utils/adminNotifications');
                  const { getUserStats } = require('../utils/statistics');
                  
                  const userStats = await getUserStats(chatId);
                  const totalInstallations = userStats.installCount || 0;
                  
                  const osName = osNameToSave; // Use osNameToSave instead of redefining
                  const installTime = installTimeMinutes !== null ? installTimeMinutes : (rdpResult.totalTime || 'N/A');
                  const locationInfoForChannel = session.locationInfo || 'N/A';
                  const installationCost = session.installationCost || 0;
                  
                  const notificationMsg = await createInstallationNotification(
                    bot,
                    chatId,
                    installIdForChannel,
                    'dedicated',
                    currentBalance,
                    totalInstallations,
                    osName,
                    installTime,
                    locationInfoForChannel,
                    installationCost
                  );
                  
                  const telegramBot = bot.telegram || bot;
                  await sendChannelNotification(telegramBot, notificationMsg);
                } catch (e) {
                  console.error('[RDP] Error sending channel notification:', e);
                }
                
                // Delete old message
                try {
                  const telegramBot = bot.telegram || bot;
                  if (telegramBot && typeof telegramBot.deleteMessage === 'function') {
                    await telegramBot.deleteMessage(chatId, session.messageId);
                  } else if (telegramBot && telegramBot.telegram && typeof telegramBot.telegram.deleteMessage === 'function') {
                    await telegramBot.telegram.deleteMessage(chatId, session.messageId);
                  }
                } catch (deleteError) {
                  // Silent error
                }

                // Generate and send RDP file
                try {
                  const { generateRdpFile } = require('../utils/rdpFileGenerator');
                  const shopName = process.env.SHOP_NAME || process.env.STORE_NAME || 'cobain';
                  const rdpFilePath = generateRdpFile(shopName, installId || 'N/A', session.ip, RDP_PORT, 'administrator');
                  
                  const BotAdapter = require('../utils/botAdapter');
                  let botAdapterInstance;
                  
                  if (bot && typeof bot === 'object') {
                    try {
                      if (bot instanceof BotAdapter) {
                        botAdapterInstance = bot;
                      } else if (bot.ctx || bot.telegram) {
                        botAdapterInstance = new BotAdapter(bot);
                      } else {
                        botAdapterInstance = new BotAdapter({ telegram: bot });
                      }
                    } catch (instanceofError) {
                      if (bot.ctx || bot.telegram) {
                        botAdapterInstance = new BotAdapter(bot);
                      } else {
                        botAdapterInstance = new BotAdapter({ telegram: bot });
                      }
                    }
                  } else {
                    botAdapterInstance = new BotAdapter({ telegram: bot });
                  }
                  
                  await botAdapterInstance.sendDocument(chatId, rdpFilePath, {
                    caption: `✅ **Instalasi Windows Berhasil!**${locationText}\n\n` +
                      `🆔 **Install ID:** \`${installIdForChannel}\`\n` +
                      `🌐 **IP:** \`${session.ip}:22\`\n` +
                      `🖥️ **Hostname:** \`${session.hostname}\`\n` +
                      `💻 **OS:** ${osNameToSave}\n` +
                      `👤 **Username:** \`administrator\`\n` +
                      `🔑 **Password:** \`${session.rdpPassword}\`\n` +
                      `🔌 **Port:** ${RDP_PORT}\n` +
                      `⏱️ **Waktu Instalasi:** ${installTimeText}\n` +
                      `💰 **Biaya:** ${costText}\n` +
                      `💵 **Saldo:** ${balanceText}\n\n` +
                      `📎 File RDP sudah dilampirkan. Buka dengan Remote Desktop Connection.`
                  });
                  
                  // Cleanup RDP file
                  try {
                    const fs = require('fs');
                    if (fs.existsSync(rdpFilePath)) {
                      fs.unlinkSync(rdpFilePath);
                    }
                  } catch (cleanupError) {
                    // Ignore cleanup errors
                  }
                  
                  // Send congratulations message with Install Lagi button
                  try {
                    const telegramBot = bot.telegram || bot;
                    if (telegramBot && typeof telegramBot.sendMessage === 'function') {
                      await telegramBot.sendMessage(chatId, 
                        '🎉 Congratulations, proses install telah berhasil!\n\n' +
                        '✅ RDP sudah siap digunakan\n' +
                        '📎 File RDP sudah dikirim di atas', 
                        {
                          parse_mode: 'Markdown',
                          reply_markup: {
                            inline_keyboard: [
                              [{ text: '🔄 Install Lagi', callback_data: 'back_to_menu' }]
                            ]
                          }
                        }
                      );
                    } else if (telegramBot && telegramBot.telegram && typeof telegramBot.telegram.sendMessage === 'function') {
                      await telegramBot.telegram.sendMessage(chatId, 
                        '🎉 Congratulations, proses install telah berhasil!\n\n' +
                        '✅ RDP sudah siap digunakan\n' +
                        '📎 File RDP sudah dikirim di atas', 
                        {
                          parse_mode: 'Markdown',
                          reply_markup: {
                            inline_keyboard: [
                              [{ text: '🔄 Install Lagi', callback_data: 'back_to_menu' }]
                            ]
                          }
                        }
                      );
                    }
                  } catch (congratsError) {
                    console.error('[RDP] Error sending congratulations message:', congratsError);
                  }
                } catch (rdpFileError) {
                  console.error('[RDP] Error sending RDP file:', rdpFileError);
                }
                
                // Clear session
                safeMessageEditor.clearMessageCache(chatId, session.messageId);
                sessionManager.clearUserSession(chatId);
              }
          } catch (monitorError) {
            console.error('[SSH MONITOR] Error during SSH reconnect/monitoring:', monitorError);
            
            // Get fresh session
            let currentSession = sessionManager.getUserSession(chatId);
            if (!currentSession) {
              currentSession = sessionManager.getUserSession(String(chatId));
            }
            if (!currentSession) {
              currentSession = session;
            }
            
            // Mark installation as failed
            if (currentSession.installId) {
              try {
                const { failInstallation } = require('../utils/statistics');
                await failInstallation(currentSession.installId, monitorError.message || 'SSH monitoring error');
              } catch (e) {
                console.error('[RDP] Error failing installation:', e);
              }
            }
            
            // Format location info
            const locationInfo = currentSession.locationInfo || 'N/A';
            const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
            
            await safeMessageEditor.editMessage(bot, chatId, currentSession.messageId || session.messageId,
              `❌ Terjadi kesalahan saat instalasi${locationText}\n\n` +
              `🚨 Error: ${monitorError.message || 'Unknown error'}\n\n` +
              `⚠️ Saldo/kuota tidak dikembalikan\n\n` +
              `🔧 Silakan hubungi admin untuk bantuan.`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                    [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                  ]
                }
              }
            );
            
            safeMessageEditor.clearMessageCache(chatId, currentSession.messageId || session.messageId);
            sessionManager.clearUserSession(chatId);
          } finally {
            reconnectInProgress = false;
          }
        };
        
        // Monitor for reboot detection (3 minutes timeout if not detected)
        rebootDetectionTimeoutId = setTimeout(async () => {
          // Get fresh session
          let currentSession = sessionManager.getUserSession(chatId);
          if (!currentSession) {
            currentSession = sessionManager.getUserSession(String(chatId));
          }
          if (!currentSession) {
            currentSession = session;
          }
          
          // Check if reboot was already detected
          if (currentSession.reachedReboot) {
            // Reboot already detected, skip this timeout
            return;
          }
          
          // No reboot detected in 3 minutes - start reconnect immediately
          console.info(`[REBOOT MONITOR] No reboot detected in 3 minutes, starting SSH reconnect...`);
          rebootDetected = false;
          await handleSSHReconnect();
        }, 1 * 60 * 1000); // 3 minutes timeout
        
        const installPromise = installDedicatedRDP(session.ip, 'root', session.password, {
          osVersion: session.selectedOS.version,
          password: session.rdpPassword
        }, async (logMessage) => {
          // Log semua output dari installation dengan detail
          const timestamp = new Date().toISOString();
          console.log(`[RDP INSTALL] [${timestamp}] [${session.ip}] ${logMessage}`);
          
          // Track apakah sudah sampai line 70 ("Installation completed successfully") - sebelum reboot
          if (logMessage.includes('Installation completed successfully')) {
            console.log(`[RDP INSTALL] ✅ [${session.ip}] Installation completed successfully detected!`);
            
            // Get fresh session to avoid stale data
            let currentSession = sessionManager.getUserSession(chatId);
            if (!currentSession) {
              currentSession = sessionManager.getUserSession(String(chatId));
            }
            if (!currentSession) {
              currentSession = session;
            }
            
            // Mark bahwa sudah sampai line 70 (sebelum reboot)
            currentSession.reachedInstallationSuccess = true;
            sessionManager.setUserSession(chatId, currentSession);
          }
          
          // Track jika ada "Rebooting system" - trigger reconnect setelah 1 menit
          if (logMessage.includes('Rebooting system') || logMessage.includes('Reboot to start DD')) {
            console.log(`[RDP INSTALL] 🔄 [${session.ip}] Rebooting detected!`);
            
            // Get fresh session
            let currentSession = sessionManager.getUserSession(chatId);
            if (!currentSession) {
              currentSession = sessionManager.getUserSession(String(chatId));
            }
            if (!currentSession) {
              currentSession = session;
            }
            
            // Mark bahwa sudah sampai reboot
            currentSession.reachedReboot = true;
            rebootDetected = true;
            sessionManager.setUserSession(chatId, currentSession);
            
            // Clear reboot detection timeout since reboot was detected
            if (rebootDetectionTimeoutId) {
              clearTimeout(rebootDetectionTimeoutId);
              rebootDetectionTimeoutId = null;
            }
            
            // Update status menjadi "process" di teks
            const installIdText = currentSession.installId ? `\n🆔 **Install ID:** \`${currentSession.installId}\`\n` : '';
            safeMessageEditor.editMessage(bot, chatId, currentSession.messageId || session.messageId,
              `⚙️ Instalasi Windows sedang berlangsung...${installIdText}\n` +
              '🔄 Status: Reboot terdeteksi, menunggu 1 menit...\n\n' +
              '📝 Catatan:\n' +
              '• Estimasi total: 5-15 menit'
            ).catch(e => console.error('[RDP] Error updating message:', e));
            
            // Wait 1 minute after reboot detection, then reconnect SSH
            reconnectTimeoutId = setTimeout(async () => {
              console.info(`[REBOOT MONITOR] Reboot detected, waiting 1 minute then reconnecting SSH...`);
              await handleSSHReconnect();
            }, 30 * 1000); // Wait 1 minute after reboot detection
          }
        });
        
        // Handle installation failure (catch installPromise rejection)
        // Installation runs in background - don't await here
        // The monitor below will handle waiting for RDP to be ready
        installPromise.catch(async (installError) => {
          console.error('[RDP] Installation failed:', installError);
          
          // IMPORTANT: Clear all pending timeouts to stop reconnection attempts
          if (rebootDetectionTimeoutId) {
            clearTimeout(rebootDetectionTimeoutId);
            rebootDetectionTimeoutId = null;
            console.info('[RDP] Cleared reboot detection timeout due to installation failure');
          }
          if (reconnectTimeoutId) {
            clearTimeout(reconnectTimeoutId);
            reconnectTimeoutId = null;
            console.info('[RDP] Cleared reconnect timeout due to installation failure');
          }
          if (sshMonitorInstance) {
            try {
              sshMonitorInstance.end();
              console.info('[RDP] Closed SSH monitor instance due to installation failure');
            } catch (e) {
              // Ignore errors when closing
            }
          }
          
          // Get fresh session untuk check apakah sudah sampai line 70
          let currentSession = sessionManager.getUserSession(chatId);
          if (!currentSession) {
            currentSession = sessionManager.getUserSession(String(chatId));
          }
          if (!currentSession) {
            currentSession = session;
          }
          
          // Jika sudah sampai installation completed, instalasi sudah berhasil, jangan kirim error
          if (currentSession.reachedInstallationSuccess === true) {
            // console.info(`[RDP] Installation already completed successfully, ignoring error after completion`);
            return; // Jangan kirim pesan error, instalasi sudah berhasil
          }
          
          // Check apakah sudah sampai line 70 ("Installation completed successfully")
          // Jika TIDAK sampai line 70, refund saldo dan beritahu gagal
          let refundMessage = '';
          if (!currentSession.reachedInstallationSuccess && !isAdmin(chatId) && currentSession.balanceDeducted && currentSession.installationCost) {
            try {
              const { addBalance } = require('../utils/userManager');
              await addBalance(chatId, currentSession.installationCost);
              refundMessage = `\n💰 Saldo telah dikembalikan sebesar Rp ${currentSession.installationCost.toLocaleString('id-ID')} karena instalasi gagal sebelum mencapai tahap installation completed.\n`;
              // console.info(`[RDP] Refunded ${currentSession.installationCost} to user ${chatId} - Installation failed before reaching line 70`);
            } catch (e) {
              console.error('[RDP] Error refunding balance:', e);
              refundMessage = `\n⚠️ Gagal mengembalikan saldo. Silakan hubungi admin.\n`;
            }
          }
          
          // Mark installation as failed
          if (currentSession.installId) {
            try {
              const { failInstallation } = require('../utils/statistics');
              await failInstallation(currentSession.installId, installError.message || 'Installation failed');
              // console.info(`[RDP] Failed installation ID ${currentSession.installId}: ${installError.message}`);
            } catch (e) {
              console.error('[RDP] Error failing installation:', e);
            }
          }
          
           // Format location info jika ada
           const locationInfo = currentSession.locationInfo || 'N/A';
           const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
           
           // Hanya tampilkan error jika BELUM sampai installation completed
           await safeMessageEditor.editMessage(bot, chatId, currentSession.messageId || session.messageId,
             `❌ Instalasi gagal sebelum mencapai tahap installation completed${refundMessage}\n` +
             `🚨 Error: ${installError.message || 'Unknown error'}${locationText}\n\n` +
             `🔍 Kemungkinan penyebab:\n` +
             `🔌 Koneksi ke VPS terputus\n` +
             `⚠️ VPS tidak memenuhi requirement\n` +
             `🐛 Masalah dengan script instalasi\n\n` +
             `🔄 Silakan coba lagi dengan VPS yang berbeda.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                  [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                ]
              }
            }
          );
          
          safeMessageEditor.clearMessageCache(chatId, currentSession.messageId || session.messageId);
          sessionManager.clearUserSession(chatId);
        });
        
        // Installation is now running in background
        // The monitor below will handle waiting for RDP to be ready
        // installPromise.catch() above will handle installation failures
        
        // console.info(`[RDP] Dedicated installation promise created for user ${chatId}, IP: ${session.ip}`);

      } catch (error) {
        // This catch handles errors outside installation promise (e.g., monitor setup errors)
        // Installation promise errors are handled by installPromise.catch() above
        console.error('Error setting up installation:', error);
        
        // IMPORTANT: Clear all pending timeouts to stop reconnection attempts
        if (rebootDetectionTimeoutId) {
          clearTimeout(rebootDetectionTimeoutId);
          rebootDetectionTimeoutId = null;
          console.info('[RDP] Cleared reboot detection timeout due to setup error');
        }
        if (reconnectTimeoutId) {
          clearTimeout(reconnectTimeoutId);
          reconnectTimeoutId = null;
          console.info('[RDP] Cleared reconnect timeout due to setup error');
        }
        if (sshMonitorInstance) {
          try {
            sshMonitorInstance.end();
            console.info('[RDP] Closed SSH monitor instance due to setup error');
          } catch (e) {
            // Ignore errors when closing
          }
        }
        
        // Get fresh session untuk check reachedInstallationSuccess
        let currentSession = sessionManager.getUserSession(chatId);
        if (!currentSession) {
          currentSession = sessionManager.getUserSession(String(chatId));
        }
        if (!currentSession) {
          currentSession = session;
        }
        
        // Jika sudah sampai installation completed, instalasi sudah berhasil, jangan kirim error
        if (currentSession.reachedInstallationSuccess === true) {
          // console.info(`[RDP] Installation already completed successfully, ignoring setup error after completion`);
          return; // Jangan kirim pesan error, instalasi sudah berhasil
        }
        
        // Refund saldo jika sudah dipotong dan TIDAK sampai line 70
        let refundMessage = '';
        if (!currentSession.reachedInstallationSuccess && !isAdmin(chatId) && currentSession.balanceDeducted && currentSession.installationCost) {
          try {
            const { addBalance } = require('../utils/userManager');
            await addBalance(chatId, currentSession.installationCost);
            refundMessage = `\n💰 Saldo telah dikembalikan sebesar Rp ${currentSession.installationCost.toLocaleString('id-ID')} karena instalasi gagal sebelum mencapai tahap installation completed.\n`;
            // console.info(`[RDP] Refunded ${currentSession.installationCost} to user ${chatId} due to setup error (before line 70)`);
          } catch (e) {
            console.error('[RDP] Error refunding balance:', e);
            refundMessage = `\n⚠️ Gagal mengembalikan saldo. Silakan hubungi admin.\n`;
          }
        }
        
        // Mark installation as failed
        if (currentSession.installId) {
          try {
            const { failInstallation } = require('../utils/statistics');
            await failInstallation(currentSession.installId, error.message || 'Setup error');
            // console.info(`[RDP] Failed installation ID ${currentSession.installId}: ${error.message}`);
          } catch (e) {
            console.error('[RDP] Error failing installation:', e);
          }
        }

         // Format location info jika ada
         const locationInfo = currentSession.locationInfo || session.locationInfo || 'N/A';
         const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
         
         // Hanya tampilkan error jika BELUM sampai installation completed
         await safeMessageEditor.editMessage(bot, chatId, currentSession.messageId || session.messageId,
           `❌ Instalasi gagal (sebelum tahap installation completed)${refundMessage}\n` +
           `🚨 Error: ${error.message || 'Unknown error'}${locationText}\n\n` +
           `🔍 Silakan coba lagi atau hubungi support.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
              ]
            }
          }
        );

        safeMessageEditor.clearMessageCache(chatId, session.messageId);
        sessionManager.clearUserSession(chatId);
      }
      break;
  }
}

async function showDedicatedOSSelection(bot, chatId, messageId, page = 0) {
  // Get fresh DEDICATED_OS_VERSIONS using function (avoid circular dependency)
  const osVersions = getDedicatedOSVersions();
  
  if (!osVersions || !Array.isArray(osVersions)) {
    console.error('DEDICATED_OS_VERSIONS tidak terdefinisi atau bukan array');
    await safeMessageEditor.editMessage(bot, chatId, messageId,
      '❌ Terjadi kesalahan sistem. OS versions tidak terdefinisi.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
    return;
  }

  // Get current price per quota - semua dedicated = 1 kuota (fixed)
  const prices = rdpPriceManager.getRdpPrices();
  const pricePerQuota = prices.pricePerQuota || 3000;

  // Helper function untuk memperpendek nama OS untuk button
  function shortenOSName(name) {
    // Singkatan untuk nama yang panjang
    let shortName = name
      .replace('Windows Server', 'WS')
      .replace('Windows', 'Win')
      .replace('Enterprise', 'Ent')
      .replace('Professional', 'Pro')
      .replace('AtlasOS', 'Atlas')
      .replace('Ghost', 'Ghost')
      .replace(' Lite', '') // Hapus " Lite" dari nama karena akan ditambahkan di type
      .replace(' UEFI', ''); // Hapus " UEFI" dari nama karena akan ditambahkan di type
    
    return shortName;
  }
  
  // Helper function untuk mengelompokkan buttons 2 per baris
  function addButtonsToKeyboard(buttons, buttonsPerRow = 2) {
    const result = [];
    for (let i = 0; i < buttons.length; i += buttonsPerRow) {
      const row = buttons.slice(i, i + buttonsPerRow);
      result.push(row);
    }
    return result;
  }
  
  // Build message text (selalu tampilkan semua teks)
  let messageText = '💿 Pilih OS Windows untuk RDP Dedicated:\n\n';
  messageText += `💰 Harga: Rp ${pricePerQuota.toLocaleString('id-ID')} (1 kuota) - Semua OS sama\n\n`;
  
  // STANDARD VERSIONS
  messageText += '🏆 **STANDARD VERSIONS**\n';
  const standardButtons = [];
  osVersions.filter(os => !os.version.includes('lite') && !os.version.includes('uefi')).forEach(os => {
    let displayName = os.name;
    let buttonText = '';

    if (os.version === 'win_10atlas') {
      displayName = `${os.name} (AtlasOS)`;
      buttonText = `${os.id}. Win 10 Atlas`;
    } else if (os.version === 'win_10ghost') {
      displayName = `${os.name} (Ghost)`;
      buttonText = `${os.id}. Win 10 Ghost`;
    } else {
      buttonText = `${os.id}. ${shortenOSName(os.name)}`;
    }

    messageText += `${os.id}. ${displayName} - Rp ${pricePerQuota.toLocaleString('id-ID')} (1 kuota)\n`;
    standardButtons.push({ 
      text: buttonText,
      callback_data: `dedicated_os_${os.id}`
    });
  });

  // LITE VERSIONS
  messageText += '\n💎 **LITE VERSIONS** (Hemat Resource)\n';
  const liteButtons = [];
  osVersions.filter(os => os.version.includes('lite')).forEach(os => {
    messageText += `${os.id}. ${os.name} - Rp ${pricePerQuota.toLocaleString('id-ID')} (1 kuota)\n`;
    liteButtons.push({
      text: `${os.id}. ${shortenOSName(os.name)} Lite`,
      callback_data: `dedicated_os_${os.id}`
    });
  });

  // UEFI VERSIONS
  messageText += '\n🚀 **UEFI VERSIONS** (Modern Boot)\n';
  const uefiButtons = [];
  osVersions.filter(os => os.version.includes('uefi')).forEach(os => {
    messageText += `${os.id}. ${os.name} - Rp ${pricePerQuota.toLocaleString('id-ID')} (1 kuota)\n`;
    uefiButtons.push({
      text: `${os.id}. ${shortenOSName(os.name)} UEFI`,
      callback_data: `dedicated_os_${os.id}`
    });
  });

  // Build keyboard berdasarkan page (0 = Standard, 1 = Lite, 2 = UEFI)
  const keyboard = [];
  const totalPages = 3;
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  
  if (currentPage === 0) {
    // Page 1: Standard Versions
    const standardRows = addButtonsToKeyboard(standardButtons, 2);
    keyboard.push(...standardRows);
  } else if (currentPage === 1) {
    // Page 2: Lite Versions
    const liteRows = addButtonsToKeyboard(liteButtons, 2);
    keyboard.push(...liteRows);
  } else if (currentPage === 2) {
    // Page 3: UEFI Versions
    const uefiRows = addButtonsToKeyboard(uefiButtons, 2);
    keyboard.push(...uefiRows);
  }
  
  // Add navigation buttons
  const navRow = [];
  if (currentPage > 0) {
    navRow.push({ text: '« Back', callback_data: `dedicated_os_page_${currentPage - 1}` });
  }
  if (currentPage < totalPages - 1) {
    navRow.push({ text: 'Next »', callback_data: `dedicated_os_page_${currentPage + 1}` });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }
  
  // Add page indicator
  if (totalPages > 1) {
    const pageNames = ['🏆 Standard', '💎 Lite', '🚀 UEFI'];
    keyboard.push([{ 
      text: `${pageNames[currentPage]} (${currentPage + 1}/${totalPages})`, 
      callback_data: 'dedicated_os_page_info' 
    }]);
  }
  
  keyboard.push([{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]);

  await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, {
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function handleDedicatedOSSelection(bot, query, sessionManager) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const session = sessionManager.getUserSession(chatId);

  if (!session) {
    // Tidak perlu kirim pesan "SESSION EXPIRED, restart"
    await bot.answerCallbackQuery(query.id).catch(() => {});
    return;
  }

  const osId = parseInt(query.data.split('_')[2]);
  // Get fresh OS versions dengan harga terbaru
  const osVersions = getDedicatedOSVersions();
  const selectedOS = osVersions.find(os => os.id === osId);

  if (!selectedOS) {
    await bot.answerCallbackQuery(query.id, {
      text: '❌ OS tidak valid. Silakan pilih kembali.',
      show_alert: true
    });
    return;
  }

  session.selectedOS = selectedOS;
  session.step = 'waiting_rdp_password';
  sessionManager.setUserSession(chatId, session);

  // Format location info jika ada
  const locationInfo = session.locationInfo || 'N/A';

  // Get price per quota - semua dedicated = 1 kuota (fixed)
  const prices = rdpPriceManager.getRdpPrices();
  const pricePerQuota = prices.pricePerQuota || 3000;
  
  await safeMessageEditor.editMessage(bot, chatId, messageId,
    `⚙️ Konfigurasi yang dipilih:\n\n` +
    `🏷️ VPS Name: ${session.hostname || 'N/A'}\n` +
    `🌍 Lokasi: ${locationInfo}\n` +
    `💿 OS: ${selectedOS.name}\n` +
    `💰 Harga: Rp ${pricePerQuota.toLocaleString('id-ID')} (1 kuota)\n\n` +
    `🔑 Masukkan password untuk RDP Windows:\n` +
    `(Min. 8 karakter, kombinasi huruf dan angka)`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Kembali', callback_data: 'back_to_dedicated_os' }]
        ]
      }
    }
  );
}

async function handleRDPCallbacks(bot, query, userSessions) {
  const callbackData = query.data;
  const session = userSessions.getUserSession(query.message.chat.id);

  if (callbackData.startsWith('copy_rdp_')) {
    const parts = callbackData.split('_');
    const ip = parts[2];
    const password = parts[3];
    const hostname = parts[4] || 'unknown';

    await bot.answerCallbackQuery(query.id, {
      text: `🎉 RDP Details:\n\n🏷️ VPS Name: ${session.hostname || 'N/A'}\n🌐 Server: ${ip}:${RDP_PORT}\n👤 Username: administrator\n🔑 Password: ${password}\n\n✅  Detail sudah ditampilkan!`, 
      show_alert: true
    });
  }
  else if (callbackData.startsWith('copy_server_')) {
    const server = callbackData.replace('copy_server_', '');

    await bot.answerCallbackQuery(query.id, {
      text: `🌐 Server: ${server}\n\n📋 Copy alamat server ini`,
      show_alert: true
    });
  }
  else if (callbackData.startsWith('copy_pass_')) {
    const password = callbackData.replace('copy_pass_', '');

    await bot.answerCallbackQuery(query.id, {
      text: `🔑 Password: ${password}\n\n📋 Copy password ini`,
      show_alert: true
    });
  }
  else if (callbackData.startsWith('copy_hostname_')) {
    const hostname = callbackData.replace('copy_hostname_', '');

    await bot.answerCallbackQuery(query.id, {
      text: `🏷️ VPS Name: ${session.hostname || 'N/A'}\n\n📋 Copy VPS Name ini`,
      show_alert: true
    });
  }
  else if (callbackData === 'rdp_connection_guide') {
    await bot.answerCallbackQuery(query.id, {
      text: `📖 Panduan Koneksi RDP:\n\n1️⃣ Buka Remote Desktop Connection\n2️⃣ Masukkan IP:Port (contoh: 1.2.3.4:${RDP_PORT})\n3️⃣ Username: administrator\n4️⃣ Password: [your password]\n5️⃣ Connect dan enjoy!`,
      show_alert: true
    });
  }
  else if (callbackData.startsWith('test_rdp_')) {
    const parts = callbackData.split('_');
    const ip = parts[2];
    const port = parts[3];

    try {
      const monitor = new RDPMonitor(ip, '', '', '', parseInt(port));
      const testResult = await monitor.testRDPConnection();

      await bot.answerCallbackQuery(query.id, {
        text: `🔍 Test RDP ${ip}:${port}\n\n${testResult.success ? '✅ RDP Siap!' : '❌ RDP Belum Siap'}\n\n${testResult.message}`,
        show_alert: true
      });
    } catch (error) {
      await bot.answerCallbackQuery(query.id, {
        text: `❌ Error testing RDP: ${error.message}`,
        show_alert: true
      });
    }
  }
}

module.exports = {
  handleInstallDedicatedRDP,
  handleDedicatedVPSCredentials,
  showDedicatedOSSelection,
  handleDedicatedOSSelection,
  handleRDPCallbacks
};