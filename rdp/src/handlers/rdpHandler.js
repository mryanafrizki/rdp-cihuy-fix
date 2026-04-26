const { WINDOWS_VERSIONS, INSTALLATION_COST, RDP_PORT } = require('../config/constants');
const rdpPriceManager = require('../utils/rdpPriceManager');
const { BUTTONS, BUTTON_COMBINATIONS } = require('../config/buttons');
const { checkVPSSupport } = require('../utils/vpsChecker');
const { detectVPSSpecs } = require('../utils/vpsSpecs');
const { installRDP } = require('../utils/rdpInstaller');
const { installDedicatedRDP } = require('../utils/dedicatedRdpInstaller');
const { deductBalance, isAdmin } = require('../utils/userManager');
const { formatVPSSpecs } = require('../utils/messageFormatter');
const ValidationUtils = require('../utils/validation');
const moment = require('moment-timezone');

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

async function handleInstallRDP(bot, chatId, messageId, userSessions) {
    // Get current prices from rdpPrice.json
    const prices = rdpPriceManager.getRdpPrices();
    const quotaMode = rdpPriceManager.isQuotaModeEnabled();
    const pricePerQuota = prices.pricePerQuota || 3000;
    
    let dockerPrice, dedicatedPrice;
    let dockerPriceText, dedicatedPriceText;
    let dockerButtonText, dedicatedButtonText;
    
    if (quotaMode) {
      // Quota mode: semua harga = 1 kuota
      dockerPrice = pricePerQuota;
      dedicatedPrice = pricePerQuota;
      dockerPriceText = '1 kuota';
      dedicatedPriceText = '1 kuota';
      dockerButtonText = '1 kuota';
      dedicatedButtonText = '1 kuota';
    } else {
      // Saldo mode: gunakan harga dari config
      dockerPrice = prices.dockerRdpPrice || 1000;
      dedicatedPrice = prices.dedicatedRdpPrice || 3000;
      dockerPriceText = dockerPrice === 0 ? 'Gratis' : `Rp ${dockerPrice.toLocaleString('id-ID')}/install`;
      dedicatedPriceText = dedicatedPrice === 0 ? 'Gratis' : `Rp ${dedicatedPrice.toLocaleString('id-ID')}/install`;
      dockerButtonText = dockerPrice === 0 ? 'Gratis' : `Rp ${dockerPrice.toLocaleString('id-ID')}`;
      dedicatedButtonText = dedicatedPrice === 0 ? 'Gratis' : `Rp ${dedicatedPrice.toLocaleString('id-ID')}`;
    }
    
    await bot.editMessageText(
        `🖥️ **Pilih Jenis RDP Installation:**\n\n` +
        `🐳 **Docker RDP** - ${dockerPriceText}\n` +
        '• Instalasi cepat (10-15 menit)\n' +
        '• Berbagai versi Windows tersedia\n' +
        '• Port 3389 & 8006 (web interface)\n' +
        '• Cocok untuk testing & development\n\n' +
        `🖥️ **Dedicated RDP** - ${dedicatedPriceText}\n` +
        '• Windows langsung di VPS (15-30 menit)\n' +
        '• Performa optimal\n' +
        `• Port ${RDP_PORT} (custom untuk keamanan)\n` +
        '• Cocok untuk production use',
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: `🐳 Docker RDP (${dockerButtonText})`, callback_data: 'install_docker_rdp' }],
                    [{ text: `🖥️ Dedicated RDP (${dedicatedButtonText})`, callback_data: 'install_dedicated_rdp' }],
                    [BUTTONS.BACK_TO_MENU]
                ]
            }
        }
    );
}

async function handleInstallDockerRDP(bot, chatId, messageId, sessionManager) {
    const session = sessionManager.getUserSession(chatId) || {};
    
    // Get current price from rdpPrice.json
    const prices = rdpPriceManager.getRdpPrices();
    const quotaMode = rdpPriceManager.isQuotaModeEnabled();
    const pricePerQuota = prices.pricePerQuota || 3000;
    
    let dockerPrice;
    if (quotaMode) {
      dockerPrice = pricePerQuota; // Docker = 1 kuota
    } else {
      dockerPrice = prices.dockerRdpPrice || 1000;
    }
    
    // Hanya cek saldo, jangan potong dulu (akan dipotong setelah installation completed)
    if (!isAdmin(chatId)) {
        const { getBalance } = require('../utils/userManager');
        const currentBalance = await getBalance(chatId);
        const balance = typeof currentBalance === 'string' ? 0 : currentBalance;
        
        if (balance < dockerPrice) {
            let priceText;
            if (quotaMode) {
              priceText = `1 kuota`;
            } else {
              priceText = dockerPrice === 0 ? 'Gratis' : `Rp ${dockerPrice.toLocaleString('id-ID')}`;
            }
            
            const insufficientBalanceText = `❌ *Saldo tidak mencukupi untuk Docker RDP (${priceText})*\n\n` +
              `Silakan deposit terlebih dahulu untuk melanjutkan instalasi.`;
            
            const keyboard = {
              reply_markup: {
                inline_keyboard: [BUTTON_COMBINATIONS.DEPOSIT_AND_BACK]
              }
            };
            
            // PENTING: Coba edit message dulu, jika gagal kirim pesan baru
            try {
              await bot.editMessageText(insufficientBalanceText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                ...keyboard
              });
            } catch (editErr) {
              // PENTING: Jika edit gagal, kirim pesan baru sebagai fallback
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
                console.error('[DOCKER RDP] Error sending fallback message:', sendErr.message);
              }
            }
            
            return;
        }
    }

    session.installType = 'docker';
    session.installationCost = dockerPrice; // Simpan cost untuk dipotong saat password RDP dimasukkan
    session.balanceDeducted = false; // Flag untuk track apakah saldo sudah dipotong
    
    // Jangan generate Install ID di sini, akan di-generate saat password RDP dimasukkan (sama seperti Dedicated)
    
    let messageText;
    if (quotaMode) {
      // Quota mode: don't show price
      messageText = `🐳 **Docker RDP Installation**\n\n` +
        `🔧 **Fitur:** Windows di Docker Container\n` +
        '🔌 **Port:** 3389 (RDP) & 8006 (Web Interface)\n\n' +
        '⚡️ **Spesifikasi Minimal:**\n' +
        '• CPU: 2 Core\n' +
        '• RAM: 4 GB\n' +
        '• Storage: 40 GB\n\n' +
        '🌐 **Masukkan IP VPS:**\n' +
        '_IP akan dihapus otomatis setelah dikirim_\n\n' +
        '⚠️ **PENTING:** VPS Wajib Fresh Install Ubuntu 22.04';
    } else {
      // Saldo mode: show price
      const priceText = dockerPrice === 0 ? 'Gratis' : `Rp ${dockerPrice.toLocaleString('id-ID')}/install`;
      messageText = `🐳 **Docker RDP Installation**\n\n` +
        `💰 **Harga:** ${priceText}\n` +
        `🔧 **Fitur:** Windows di Docker Container\n` +
        '🔌 **Port:** 3389 (RDP) & 8006 (Web Interface)\n\n' +
        '⚡️ **Spesifikasi Minimal:**\n' +
        '• CPU: 2 Core\n' +
        '• RAM: 4 GB\n' +
        '• Storage: 40 GB\n\n' +
        '🌐 **Masukkan IP VPS:**\n' +
        '_IP akan dihapus otomatis setelah dikirim_\n\n' +
        '⚠️ **PENTING:** VPS Wajib Fresh Install Ubuntu 22.04';
    }
    
    const msg = await bot.editMessageText(messageText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    BUTTONS.CANCEL
                ]]
            }
        }
    );

    session.step = 'waiting_ip';
    session.startTime = Date.now();
    session.messageId = msg.message_id;
    sessionManager.setUserSession(chatId, session);
}

// REMOVED: handleInstallDedicatedRDP - Dedicated RDP di-handle oleh dedicatedRdpHandler.js
// Function ini menyebabkan konflik dengan handleInstallDedicatedRDP dari dedicatedRdpHandler.js

async function handleVPSCredentials(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    let session = sessionManager.getUserSession(chatId);
    
    // Try different formats if session not found
    if (!session) {
        session = sessionManager.getUserSession(String(chatId));
    }
    if (!session) {
        session = sessionManager.getUserSession(Number(chatId));
    }
    
    if (!session) {
        // Tidak perlu kirim pesan "SESSION EXPIRED, restart"
        console.warn(`[DOCKER RDP] No session found for chatId: ${chatId}`);
        return;
    }
    
    // Additional check: ensure installType is docker
    if (session.installType !== 'docker') {
        console.warn(`[DOCKER RDP] Session installType mismatch. Expected: docker, Got: ${session.installType}, ChatId: ${chatId}`);
        return;
    }

    // Hapus pesan HANYA saat mode masukan IP, password root VPS, atau password RDP
    // Jangan hapus jika instalasi sudah berjalan (installation_in_progress)
    const shouldDeleteMessage = (session.step === 'waiting_ip' || session.step === 'waiting_password' || session.step === 'waiting_rdp_password') && session.step !== 'installation_in_progress';
    if (shouldDeleteMessage) {
        try {
            await bot.deleteMessage(chatId, msg.message_id);
        } catch (error) {
            console.info('Failed to delete message:', error.message);
        }
    }
    
    // Jika instalasi sudah berjalan, jangan proses input apa-apa
    if (session.step === 'installation_in_progress') {
        return; // Jangan proses pesan apa-apa selama instalasi berjalan
    }

    switch (session.step) {
        case 'waiting_ip':
            const ipValidation = ValidationUtils.validateIP(msg.text);
            if (!ipValidation.valid) {
                const errorMessage = session.installType === 'docker' 
                    ? '🐳 **Docker RDP Installation**\n\n🌐 **Masukkan IP VPS:**\n_IP akan dihapus otomatis setelah dikirim_\n\n⚠️ **PENTING:** VPS Wajib Fresh Install Ubuntu 22.04'
                    : '🖥️ **Dedicated RDP Installation**\n\n🌐 **Masukkan IP VPS:**\n_IP akan dihapus otomatis setelah dikirim_\n\n⚠️ **PENTING:** VPS Wajib Fresh Install Ubuntu 24.04 LTS';
                
                await bot.editMessageText(
                    ValidationUtils.createErrorMessage(ipValidation.message, [
                        'Gunakan format: 192.168.1.1',
                        'Pastikan setiap bagian antara 0-255',
                        'Contoh: 1.2.3.4'
                    ]) + '\n\n' + errorMessage,
                    {
                        chat_id: chatId,
                        message_id: session.messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                BUTTONS.CANCEL
                            ]]
                        }
                    }
                );
                return;
            }

            session.ip = msg.text;
            
            // Ambil hostname dan location info dari ip-api.com langsung saat IP dimasukkan (untuk Docker juga)
            try {
                const { getIPInfoWithHostname } = require('../utils/ipApiChecker');
                const ipInfo = await getIPInfoWithHostname(session.ip);
                if (ipInfo.success) {
                    // Simpan VPS Name
                    if (ipInfo.hostname && ipInfo.hostname !== 'N/A') {
                        session.hostname = ipInfo.hostname;
                        console.info(`[RDP DOCKER] Got VPS Name from ip-api.com for ${session.ip}: ${ipInfo.hostname}`);
                    } else {
                        session.hostname = `RDP-${session.ip.split('.').join('')}`;
                    }
                    
                    // Simpan location info untuk ditampilkan di success/error message dan channel notification
                    if (ipInfo.country && ipInfo.country !== 'N/A') {
                        const countryCode = ipInfo.countryCode && ipInfo.countryCode !== 'N/A' ? `(${ipInfo.countryCode})` : '';
                        const regionName = ipInfo.region && ipInfo.region !== 'N/A' ? ` - ${ipInfo.region}` : '';
                        session.locationInfo = `${ipInfo.country} ${countryCode}${regionName}`.trim();
                        console.info(`[RDP DOCKER] Got location info from ip-api.com for ${session.ip}: ${session.locationInfo}`);
                    }
                } else {
                    // Fallback jika API gagal
                    session.hostname = `RDP-${session.ip.split('.').join('')}`;
                    session.locationInfo = 'N/A';
                    console.info(`[RDP DOCKER] Using fallback VPS Name for ${session.ip}: ${session.hostname}`);
                }
            } catch (e) {
                console.error('[RDP DOCKER] Error getting info from ip-api.com:', e);
                // Fallback jika API error
                session.hostname = `RDP-${session.ip.split('.').join('')}`;
                session.locationInfo = 'N/A';
            }
            
            session.step = 'waiting_password';
            
            // Update Install ID with IP address
            if (session.installId) {
                try {
                    const { updateInstallationIP } = require('../utils/statistics');
                    await updateInstallationIP(session.installId, session.ip);
                } catch (e) {
                    console.error('[RDP] Error updating installation IP:', e);
                }
            }
            
            sessionManager.setUserSession(chatId, session);
            
            await bot.editMessageText(
                '🔑 **Password Root VPS:**\n' +
                '_Password akan dihapus otomatis_',
                {
                    chat_id: chatId,
                    message_id: session.messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            BUTTONS.CANCEL
                        ]]
                    }
                }
            );
            break;

        case 'waiting_password':
            session.password = msg.text;
            session.step = 'checking_vps';
            sessionManager.setUserSession(chatId, session);
            
            await bot.editMessageText(
                '🔍 Memeriksa VPS...',
                {
                    chat_id: chatId,
                    message_id: session.messageId,
                    parse_mode: 'Markdown'
                }
            );

            try {
                const [{ supported }, rawSpecs] = await Promise.all([
                    checkVPSSupport(session.ip, 'root', session.password),
                    detectVPSSpecs(session.ip, 'root', session.password)
                ]);

                session.supportsKvm = supported;
                session.rawSpecs = rawSpecs;
                
                if (session.installType === 'docker') {
                    session.vpsConfig = {
                        cpu: rawSpecs.cpuCores,
                        ram: rawSpecs.memoryGB - 2,
                        storage: rawSpecs.diskGB - 10
                    };
                } else {
                    session.vpsConfig = {
                        cpu: rawSpecs.cpuCores,
                        ram: rawSpecs.memoryGB,
                        storage: rawSpecs.diskGB
                    };
                }

                sessionManager.setUserSession(chatId, session);

                const specsMessage = formatVPSSpecs(rawSpecs, session.vpsConfig);

                // Format location info jika ada
                const locationInfo = session.locationInfo || 'N/A';
                const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
                const vpsNameText = session.hostname && session.hostname !== 'N/A' ? `\n🏷️ VPS Name: ${session.hostname}` : '';
                
                if (session.installType === 'docker') {
                    if (!supported) {
                        await bot.editMessageText(
                            '⚠️ VPS Anda tidak mendukung KVM. Performa RDP mungkin akan menurun.\n\n' +
                            `🌐 IP Server: ${session.ip}${vpsNameText}${locationText}\n\n${specsMessage}Ingin melanjutkan?`,
                            {
                                chat_id: chatId,
                                message_id: session.messageId,
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: '✅ Lanjutkan', callback_data: 'continue_no_kvm' },
                                            BUTTONS.CANCEL
                                        ]
                                    ]
                                }
                            }
                        );
                    } else {
                        await bot.editMessageText(
                            `✅ VPS mendukung KVM\n\n` +
                            `🌐 IP Server: ${session.ip}${vpsNameText}${locationText}\n\n${specsMessage}Silakan klik lanjutkan untuk memilih versi Windows:`,
                            {
                                chat_id: chatId,
                                message_id: session.messageId,
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '✅ Lanjutkan', callback_data: 'show_windows_selection' }],
                                        [{ text: '❌ Batal', callback_data: 'cancel_installation' }]
                                    ]
                                }
                            }
                        );
                    }
                } else {
                    await bot.editMessageText(
                        `✅ VPS siap untuk instalasi dedicated RDP\n\n` +
                        `🌐 IP Server: ${session.ip}${vpsNameText}${locationText}\n\n${specsMessage}Silakan pilih OS Windows:`,
                        {
                            chat_id: chatId,
                            message_id: session.messageId,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '✅ Lanjutkan', callback_data: 'show_dedicated_os_selection' }],
                                    [{ text: '❌ Batal', callback_data: 'cancel_installation' }]
                                ]
                            }
                        }
                    );
                }

            } catch (error) {
                const retryCallback = session.installType === 'docker' ? 'install_docker_rdp' : 'install_dedicated_rdp';
                await bot.editMessageText(
                    '❌ Gagal terhubung ke VPS. Pastikan IP dan password benar.',
                    {
                        chat_id: chatId,
                        message_id: session.messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔄 Coba Lagi', callback_data: retryCallback }
                            ]]
                        }
                    }
                );
                sessionManager.clearUserSession(chatId);
            }
            break;

        case 'waiting_rdp_password':
            const passwordValidation = ValidationUtils.validateRDPPassword(msg.text);
            if (!passwordValidation.valid) {
                const ramInfo = session.installType === 'docker' 
                    ? `${session.vpsConfig.ram}GB (dikurangi 2GB untuk host OS)`
                    : `${session.vpsConfig.ram}GB (full spec - no reduction)`;
                
                const storageInfo = session.installType === 'docker'
                    ? `${session.vpsConfig.storage}GB (dikurangi 10GB untuk host OS)`
                    : `${session.vpsConfig.storage}GB (full spec - no reduction)`;

                // Format location info jika ada
                const locationInfo = session.locationInfo || 'N/A';
                const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
                const vpsNameText = session.hostname && session.hostname !== 'N/A' ? `\n🏷️ VPS Name: ${session.hostname}` : '';
                
                await bot.editMessageText(
                    ValidationUtils.createErrorMessage(passwordValidation.message, [
                        'Minimal 8 karakter',
                        'Harus mengandung huruf dan angka',
                        'Contoh: Password123'
                    ]) + '\n\n' +
                    `📋 **Konfigurasi yang dipilih:**\n\n` +
                    `🖥️ ${session.installType === 'docker' ? 'Docker RDP' : 'Dedicated RDP'}${vpsNameText}${locationText}\n` +
                    `🪟 OS: ${session.windowsVersion?.name || session.selectedOS?.name}\n` +
                    `💰 Harga: Rp ${(session.windowsVersion?.price || session.selectedOS?.price).toLocaleString()}\n\n` +
                    `⚙️ **Spesifikasi Setelah Instalasi:**\n` +
                    `• CPU: ${session.vpsConfig.cpu} Core (full)\n` +
                    `• RAM: ${ramInfo}\n` +
                    `• Storage: ${storageInfo}\n\n` +
                    `🔑 Masukkan password untuk RDP Windows:\n` +
                    `_(Min. 8 karakter, kombinasi huruf dan angka)_`,
                    {
                        chat_id: chatId,
                        message_id: session.messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                BUTTONS.BACK_TO_WINDOWS
                            ]]
                        }
                    }
                );
                return;
            }

            session.rdpPassword = msg.text;
            
            // Untuk Docker RDP: Generate Install ID dan potong saldo saat password RDP dimasukkan (sama seperti Dedicated)
            // IMPORTANT: Always generate install_id, even for admin/owner
            if (session.installType === 'docker') {
                // Generate Install ID saat instalasi dimulai (setelah password RDP dimasukkan)
                let installId = session.installId;
                if (!installId) {
                    try {
                        const { startInstallation } = require('../utils/statistics');
                        installId = await startInstallation(chatId, session.ip, session.windowsVersion?.name || 'Windows', 'docker', session.installationCost || 0);
                        if (!installId) {
                            // Retry once if failed
                            installId = await startInstallation(chatId, session.ip, session.windowsVersion?.name || 'Windows', 'docker', session.installationCost || 0);
                        }
                        if (installId) {
                            session.installId = installId;
                            console.info(`[RDP DOCKER] Generated Install ID ${installId} at installation start for user ${chatId}`);
                        } else {
                            console.error(`[RDP DOCKER] Failed to generate Install ID for user ${chatId} after retry`);
                        }
                    } catch (e) {
                        console.error('[RDP DOCKER] Error generating Install ID:', e);
                        // Retry once on error
                        try {
                            const { startInstallation } = require('../utils/statistics');
                            installId = await startInstallation(chatId, session.ip, session.windowsVersion?.name || 'Windows', 'docker', session.installationCost || 0);
                            if (installId) {
                                session.installId = installId;
                                console.info(`[RDP DOCKER] Generated Install ID ${installId} at installation start for user ${chatId} (retry)`);
                            }
                        } catch (retryError) {
                            console.error('[RDP DOCKER] Error generating Install ID on retry:', retryError);
                        }
                    }
                }
                
                // Potong saldo saat instalasi dimulai
                if (!isAdmin(chatId) && session.installationCost && !session.balanceDeducted) {
                    try {
                        const deducted = await deductBalance(chatId, session.installationCost);
                        if (deducted) {
                            session.balanceDeducted = true;
                            console.info(`[RDP DOCKER] Deducted ${session.installationCost} from user ${chatId} at installation start`);
                        } else {
                            // Saldo tidak cukup
                            await bot.editMessageText(
                                '❌ Saldo tidak mencukupi. Deposit terlebih dahulu.',
                                {
                                    chat_id: chatId,
                                    message_id: session.messageId,
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
                        console.error('[RDP DOCKER] Error deducting balance:', e);
                        await bot.editMessageText(
                            '❌ Gagal memproses pembayaran. Silakan coba lagi.',
                            {
                                chat_id: chatId,
                                message_id: session.messageId,
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '🔄 Coba Lagi', callback_data: 'install_docker_rdp' }],
                                        [{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]
                                    ]
                                }
                            }
                        );
                        sessionManager.clearUserSession(chatId);
                        return;
                    }
                }
                
                // Flag untuk track apakah sudah sampai "Installation completed successfully"
                session.reachedInstallationSuccess = false;
                
                // Update session step ke installation_in_progress agar tidak menerima input lagi
                session.step = 'installation_in_progress';
                sessionManager.setUserSession(chatId, session);
                
                // Lanjutkan ke instalasi Docker RDP (akan di-handle di else block)
            }
            
            if (session.installType === 'dedicated') {
                const startTime = session.startTime || Date.now();
                const estimatedTime = formatEstimatedTime(startTime, 15, 30);
                await bot.editMessageText(
                    '🔄 **Memulai instalasi Windows Dedicated...**\n\n' +
                    `⏳ ${estimatedTime}\n` +
                    '🔍 Sistem akan reboot dan menginstall Windows langsung ke VPS.\n\n' +
                    '📝 Monitoring progress...',
                    {
                        chat_id: chatId,
                        message_id: session.messageId,
                        parse_mode: 'Markdown'
                    }
                );

                try {
                    const result = await installDedicatedRDP(session.ip, 'root', session.password, {
                        osVersion: session.selectedOS?.version || 'win_10',
                        password: session.rdpPassword
                    }, (progress) => {
                        bot.editMessageText(
                            '🔄 **Instalasi Windows Dedicated berlangsung...**\n\n' +
                            `⏱️ Dimulai: ${Math.floor((Date.now() - session.startTime) / 60000)} menit yang lalu\n\n` +
                            `📋 **Status Terkini:**\n${progress}\n\n` +
                            '⚠️ **Jangan tutup chat ini sampai instalasi selesai!**',
                            {
                                chat_id: chatId,
                                message_id: session.messageId,
                                parse_mode: 'Markdown'
                            }
                        ).catch(err => console.info('Failed to update progress:', err.message));
                    });

                    // Potong saldo SETELAH installation completed successfully
                    if (!isAdmin(chatId) && session.installationCost) {
                        await deductBalance(chatId, session.installationCost);
                        console.info(`[RDP] Deducted ${session.installationCost} from user ${chatId} after dedicated installation success`);
                    }

                    const totalTime = result.installationTime || Math.floor((Date.now() - session.startTime) / 60000);
                    
                    await bot.editMessageText(
                        `🎉 **Dedicated RDP Installation Completed!**\n\n` +
                        `📋 **Detail Server:**\n` +
                        `🖥️ OS: ${session.selectedOS?.name || 'Windows 10'}\n` +
                        `🌐 IP: ${session.ip}:${RDP_PORT}\n` +
                        `👤 Username: administrator\n` +
                        `🔑 Password: ${session.rdpPassword}\n\n` +
                        `⚙️ **Full Specifications:**\n` +
                        `• CPU: ${session.vpsConfig.cpu} Core (full)\n` +
                        `• RAM: ${session.vpsConfig.ram}GB (full)\n` +
                        `• Storage: ${session.vpsConfig.storage}GB (full)\n\n` +
                        `⏱️ **Installation Time:** ${totalTime} menit\n` +
                        `🔌 **Custom Port:** ${RDP_PORT} (untuk keamanan)\n\n` +
                        `🔄 **Status:** Windows sedang booting...\n` +
                        `⏳ **Tunggu 10-15 menit** untuk Windows fully boot`,
                        {
                            chat_id: chatId,
                            message_id: session.messageId,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_menu' }]
                                ]
                            }
                        }
                    );

                    await bot.sendMessage(
                        chatId,
                        `🎯 **Cara Connect ke Dedicated RDP:**\n\n` +
                        `**1. Tunggu 10-15 menit** agar Windows selesai booting\n\n` +
                        `**2. Gunakan RDP Client:**\n` +
                        `• Server: ${session.ip}:${RDP_PORT}\n` +
                        `• Username: administrator\n` +
                        `• Password: ${session.rdpPassword}\n\n` +
                        `**3. Jika tidak bisa connect:**\n` +
                        `• Tunggu beberapa menit lagi\n` +
                        `• Windows mungkin masih setup initial configuration\n` +
                        `• Coba connect ulang setiap 5 menit\n\n` +
                        `✅ **Server siap digunakan setelah Windows fully boot!**`,
                        {
                            parse_mode: 'Markdown'
                        }
                    );

                } catch (error) {
                    console.error('Dedicated Installation error:', error);
                    await bot.editMessageText(
                        '❌ **Gagal menginstall Windows Dedicated**\n\n' +
                        `📝 **Error:** ${error.message || 'Unknown error'}\n\n` +
                        '💡 **Kemungkinan penyebab:**\n' +
                        '• Koneksi ke VPS terputus\n' +
                        '• VPS tidak memenuhi requirement\n' +
                        '• Masalah dengan script installation\n\n' +
                        '🔄 Silakan coba lagi dengan VPS yang berbeda.',
                        {
                            chat_id: chatId,
                            message_id: session.messageId,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔄 Coba Lagi', callback_data: 'install_dedicated_rdp' }],
                                    [{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_menu' }]
                                ]
                            }
                        }
                    );
                }
            } else {
                // Docker RDP installation
                // Get fresh session to ensure we have the latest Install ID and balance status
                let currentSession = sessionManager.getUserSession(chatId);
                if (!currentSession) {
                    currentSession = sessionManager.getUserSession(String(chatId));
                }
                if (!currentSession) {
                    currentSession = session;
                }
                
                const installId = currentSession.installId;
                const installIdText = installId ? `\n🆔 **Install ID:** \`${installId}\`\n` : '';
                
                // Update session step ke installation_in_progress agar tidak menerima input lagi
                currentSession.step = 'installation_in_progress';
                sessionManager.setUserSession(chatId, currentSession);
                
                const startTime = currentSession.startTime || session.startTime || Date.now();
                const estimatedTime = formatEstimatedTime(startTime, 10, 15);
                await bot.editMessageText(
                    `🚀 Memulai instalasi Windows Docker...${installIdText}\n` +
                    `⏰ ${estimatedTime}\n\n` +
                    `📊 Status: Instalasi sedang berjalan...\n` +
                    `🔔 Catatan: Anda akan mendapat notifikasi ketika RDP siap!`,
                    {
                        chat_id: chatId,
                        message_id: currentSession.messageId || session.messageId,
                        parse_mode: 'Markdown'
                    }
                );

                try {
                    // Handle installPromise rejection (installation failed)
                    const installPromise = installRDP(currentSession.ip, 'root', currentSession.password, {
                        windowsId: currentSession.windowsVersion.id,
                        ...currentSession.vpsConfig,
                        password: currentSession.rdpPassword,
                        isArm: false,
                        supportsKvm: currentSession.supportsKvm
                    }, (logMessage) => {
                        console.info(`[${currentSession.ip}] ${logMessage}`);
                        
                        // Track apakah sudah sampai "Installation completed successfully" (dari rdp.sh line 317)
                        if (logMessage.includes('Installation completed successfully')) {
                            console.info(`[RDP DOCKER] Installation completed successfully detected - Installation progressing successfully`);
                            
                            // Get fresh session to avoid stale data
                            let freshSession = sessionManager.getUserSession(chatId);
                            if (!freshSession) {
                                freshSession = sessionManager.getUserSession(String(chatId));
                            }
                            if (!freshSession) {
                                freshSession = currentSession;
                            }
                            
                            // Mark bahwa sudah sampai "Installation completed successfully"
                            freshSession.reachedInstallationSuccess = true;
                            sessionManager.setUserSession(chatId, freshSession);
                            console.info(`[RDP DOCKER] Installation reached "Installation completed successfully" for user ${chatId}`);
                        }
                    });

                    // Wait for installation to complete
                    await installPromise;

                    // Get fresh session after installation
                     currentSession = sessionManager.getUserSession(chatId);
                    if (!currentSession) {
                        currentSession = sessionManager.getUserSession(String(chatId));
                    }
                    if (!currentSession) {
                        currentSession = session;
                    }

                    // Update installation status to completed
                    if (currentSession.installId) {
                        try {
                            const { completeInstallation, updateInstallationIP } = require('../utils/statistics');
                            
                            // Ensure IP address is saved to database
                            if (currentSession.ip) {
                                await updateInstallationIP(currentSession.installId, currentSession.ip);
                            }
                            
                            // Pass hostname, OS name, and location info if available
                            const hostnameToSave = currentSession.hostname && currentSession.hostname !== 'N/A' && currentSession.hostname !== 'unknown' && !currentSession.hostname.startsWith('RDP-')
                                ? currentSession.hostname 
                                : null;
                            const osNameToSave = currentSession.windowsVersion?.name || 'Windows';
                            const locationInfoToSave = currentSession.locationInfo && currentSession.locationInfo !== 'N/A' 
                                ? currentSession.locationInfo 
                                : null;
                            
                            // RDP username untuk Windows adalah "administrator"
                            const rdpUsername = 'administrator';
                            const rdpPassword = currentSession.rdpPassword || null;
                            
                            // Save IP, hostname, OS, location info, username, and password to database
                            await completeInstallation(currentSession.installId, hostnameToSave, osNameToSave, locationInfoToSave, rdpUsername, rdpPassword);
                            console.info(`[RDP DOCKER] Completed installation ID ${currentSession.installId} with IP: ${currentSession.ip || 'N/A'}, hostname: ${hostnameToSave || 'N/A'}, OS: ${osNameToSave}, location: ${locationInfoToSave || 'N/A'}`);
                        } catch (e) {
                            console.error('[RDP DOCKER] Error completing installation:', e);
                        }
                    }

                    // Calculate installation time from created_at to completed_at (from database)
                    let installTimeText = 'N/A';
                    let installTimeMinutes = null;
                    if (currentSession.installId) {
                        try {
                            const dbAsync = require('../config/database');
                            const installation = await dbAsync.get(
                                `SELECT created_at, completed_at FROM rdp_installations WHERE install_id = ?`,
                                [currentSession.installId]
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
                            console.error('[RDP DOCKER] Error calculating installation time from database:', e);
                            // Fallback to duration calculation
                            const duration = Math.floor((Date.now() - (currentSession.startTime || Date.now())) / 60000);
                            installTimeText = `${duration} menit`;
                            installTimeMinutes = duration;
                        }
                    }
                    
                    // Send notification to channel (SEBELUM send message ke user untuk memastikan installId konsisten)
                    // Gunakan installId yang sama dengan yang akan dikirim ke user
                    let installIdForChannel = currentSession.installId || 'N/A';
                    try {
                        const { sendChannelNotification, createInstallationNotification } = require('../utils/adminNotifications');
                        const { getBalance } = require('../utils/userManager');
                        const { getUserStats } = require('../utils/statistics');
                        
                        const currentBalance = await getBalance(chatId);
                        const userStats = await getUserStats(chatId);
                        const totalInstallations = userStats.installCount || 0;
                        
                        // Get location info and installation cost if available
                        const locationInfoForChannel = currentSession.locationInfo || null;
                        const installationCost = currentSession.installationCost || 0;
                        
                        // Use installTimeMinutes from database if available
                        const installTime = installTimeMinutes !== null ? installTimeMinutes : Math.floor((Date.now() - (currentSession.startTime || Date.now())) / 60000);
                        
                        // Pastikan installId yang dikirim ke channel sama dengan yang ke user
                        const notificationMsg = await createInstallationNotification(
                            bot,
                            chatId,
                            installIdForChannel, // Gunakan installId yang sama
                            'docker',
                            currentBalance,
                            totalInstallations,
                            currentSession.windowsVersion?.name || 'Windows',
                            installTime,
                            locationInfoForChannel,
                            installationCost
                        );
                        
                        const telegramBot = bot.telegram || bot;
                        await sendChannelNotification(telegramBot, notificationMsg);
                        console.info(`[RDP DOCKER] ✅ Channel notification sent for installation ID ${installIdForChannel}`);
                    } catch (e) {
                        console.error('[RDP] Error sending channel notification:', e);
                    }

                    // Format location info jika ada
                    const locationInfo = currentSession.locationInfo || 'N/A';
                    const locationText = locationInfo !== 'N/A' ? `\n🌍 Lokasi: ${locationInfo}` : '';
                    const vpsNameText = currentSession.hostname && currentSession.hostname !== 'N/A' ? `\n🏷️ VPS Name: ${currentSession.hostname}` : '';
                    
                    await bot.editMessageText(
                        `✅ **Instalasi Docker RDP berhasil!**\n\n` +
                        `📋 **Detail RDP:**\n` +
                        `🖥️ Windows: ${currentSession.windowsVersion.name}${vpsNameText}${locationText}\n` +
                        `🌐 IP: ${currentSession.ip}:3389\n` +
                        `👤 Username: administrator\n` +
                        `🔑 Password: ${currentSession.rdpPassword}\n\n` +
                        `⚙️ **Spesifikasi:**\n` +
                        `CPU: ${currentSession.vpsConfig.cpu} Core\n` +
                        `RAM: ${currentSession.vpsConfig.ram}GB\n` +
                        `Storage: ${currentSession.vpsConfig.storage}GB\n\n` +
                        `⏱️ Waktu instalasi: ${installTimeText}\n\n` +
                        `🔗 **Web Interface:** http://${currentSession.ip}:8006`,
                        {
                            chat_id: chatId,
                            message_id: currentSession.messageId || session.messageId,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🖥️ Monitor Installation', url: `http://${currentSession.ip}:8006` }],
                                    [{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_menu' }]
                                ]
                            }
                        }
                    );

                    await bot.sendMessage(
                        chatId,
                        `🔒 **Cara Mengatasi Account RDP di Locked**\n\n` +
                        `**1. Mengatur Account Lockout Threshold Jadi Nol**\n\n` +
                        `Langkah pertama ini bakal bikin akun kamu nggak akan terkunci lagi walaupun ada beberapa kali login gagal. Cocok banget buat menghindari gangguan penguncian akun.\n\n` +
                        `**Caranya:**\n` +
                        `1. Tekan tombol Windows + R, ketik secpol.msc, lalu tekan Enter.\n` +
                        `2. Ini akan membuka jendela Local Security Policy.\n` +
                        `3. Pergi ke Account Policies > Account Lockout Policy.\n` +
                        `4. Cari Account lockout threshold, klik dua kali.\n` +
                        `5. Ubah nilainya jadi 0 (nol), lalu klik OK.\n\n` +
                        `**2. Ubah Port RDP dari Default (3389)**\n\n` +
                        `Port RDP default (3389) adalah sasaran empuk buat para hacker yang iseng nyoba brute force attack. Nah, solusinya adalah mengubah port ini ke angka yang tidak biasa.\n\n` +
                        `**Langkah-langkah:**\n` +
                        `1. Tekan Windows + R, ketik regedit, tekan Enter.\n` +
                        `2. Masuk ke: HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp\\PortNumber\n` +
                        `3. Di panel kanan, klik dua kali PortNumber.\n` +
                        `4. Ubah ke Decimal, terus masukkan nomor port baru yang kamu mau, misalnya 50000.\n` +
                        `5. Klik OK buat menyimpan perubahan.\n\n` +
                        `**3. Tambahkan Port Baru ke Firewall**\n\n` +
                        `**Tambahkan Inbound Rule untuk Port RDP Baru**\n` +
                        `1. Tekan Windows + R, ketik wf.msc, terus tekan Enter\n` +
                        `2. Di panel kiri, klik Inbound Rules\n` +
                        `3. Di panel kanan, pilih New Rule....\n` +
                        `4. Pilih Port, klik Next\n` +
                        `5. Pilih TCP, terus masukkan port baru (contoh: 50000)\n` +
                        `6. Klik Next, pilih Allow the connection\n` +
                        `7. Centang semua profil (Domain, Private, Public)\n` +
                        `8. Beri nama (misal: RDP Custom Port 50000)\n\n` +
                        `**Tambahkan Outbound Rule untuk Port RDP Baru**\n` +
                        `1. Klik Outbound Rules di panel kiri\n` +
                        `2. Ikuti langkah yang sama seperti Inbound\n` +
                        `3. Beri nama yang sesuai (misal: RDP Outbound Port 50000)\n\n` +
                        `_Restart server untuk menerapkan perubahan._`,
                        {
                            parse_mode: 'Markdown'
                        }
                    );

            } catch (error) {
                console.error('Installation error:', error);
                
                // Mark installation as failed
                if (session.installId) {
                    try {
                        const { failInstallation } = require('../utils/statistics');
                        await failInstallation(session.installId, error.message || 'Installation failed');
                        console.info(`[RDP] Failed installation ID ${session.installId}: ${error.message}`);
                    } catch (e) {
                        console.error('[RDP] Error failing installation:', e);
                    }
                }
                
                await bot.editMessageText(
                    '❌ Gagal menginstall Windows Docker. Error: ' + (error.message || 'Unknown error') + '\n\nSilakan coba lagi.',
                        {
                            chat_id: chatId,
                            message_id: session.messageId,
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '🔄 Coba Lagi', callback_data: 'install_docker_rdp' }
                                ]]
                            }
                        }
                    );
                }
            }

            sessionManager.clearUserSession(chatId);
            break;
    }
}

async function showWindowsSelection(bot, chatId, messageId, page = 0) {
    const itemsPerPage = 6;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const desktopVersions = WINDOWS_VERSIONS.filter(v => v.category === 'desktop');
    const serverVersions = WINDOWS_VERSIONS.filter(v => v.category === 'server');

    let messageText = '🪟 **Pilih Versi Windows:**\n\n';
    messageText += '📱 **Windows Desktop:**\n';
    desktopVersions.forEach(v => {
        messageText += `${v.id}. ${v.name} (Rp ${v.price.toLocaleString()})\n`;
    });
    messageText += '\n🖥️ **Windows Server:**\n';
    serverVersions.forEach(v => {
        messageText += `${v.id}. ${v.name} (Rp ${v.price.toLocaleString()})\n`;
    });

    const versions = WINDOWS_VERSIONS.slice(start, end);
    const keyboard = [];

    for (let i = 0; i < versions.length; i += 2) {
        const row = [];
        row.push({
            text: `${versions[i].id}. ${versions[i].name}`,
            callback_data: `windows_${versions[i].id}`
        });

        if (versions[i + 1]) {
            row.push({
                text: `${versions[i + 1].id}. ${versions[i + 1].name}`,
                callback_data: `windows_${versions[i + 1].id}`
            });
        }

        keyboard.push(row);
    }

    const navigationRow = [];
    if (page > 0) {
        navigationRow.push({ text: '⬅️ Sebelumnya', callback_data: `page_${page - 1}` });
    }

    if (end < WINDOWS_VERSIONS.length) {
        navigationRow.push({ text: 'Selanjutnya ➡️', callback_data: `page_${page + 1}` });
    }

    if (navigationRow.length > 0) {
        keyboard.push(navigationRow);
    }

    keyboard.push([{ text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_menu' }]);

    await bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
}

async function handleWindowsSelection(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getUserSession(chatId);
    
    if (!session || !session.vpsConfig) {
        await bot.answerCallbackQuery(query.id, {
            text: '❌ Sesi Anda telah berakhir atau tidak valid. Silakan mulai lagi.',
            show_alert: true
        });
        return;
    }

    const windowsId = parseInt(query.data.split('_')[1]);
    const selectedWindows = WINDOWS_VERSIONS.find(v => v.id === windowsId);
    
    if (!selectedWindows) {
        await bot.answerCallbackQuery(query.id, {
            text: '❌ Versi Windows tidak valid. Silakan pilih kembali.',
            show_alert: true
        });
        return;
    }

    session.windowsVersion = selectedWindows;
    session.step = 'waiting_rdp_password';
    sessionManager.setUserSession(chatId, session);
    
    const ramInfo = session.installType === 'docker' 
        ? `${session.vpsConfig.ram}GB (dikurangi 2GB untuk host OS)`
        : `${session.vpsConfig.ram}GB (full spec - no reduction)`;
    
    const storageInfo = session.installType === 'docker'
        ? `${session.vpsConfig.storage}GB (dikurangi 10GB untuk host OS)`
        : `${session.vpsConfig.storage}GB (full spec - no reduction)`;

    await bot.editMessageText(
        `📋 **Konfigurasi yang dipilih:**\n\n` +
        `🖥️ ${session.installType === 'docker' ? 'Docker RDP' : 'Dedicated RDP'}\n` +
        `🪟 Windows: ${selectedWindows.name}\n` +
        `💰 Harga: Rp ${selectedWindows.price.toLocaleString()}\n\n` +
        `⚙️ **Spesifikasi Setelah Instalasi:**\n` +
        `• CPU: ${session.vpsConfig.cpu} Core (full)\n` +
        `• RAM: ${ramInfo}\n` +
        `• Storage: ${storageInfo}\n\n` +
        `🔑 Masukkan password untuk RDP Windows:\n` +
        `_(Min. 8 karakter, kombinasi huruf dan angka)_`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '« Kembali', callback_data: 'back_to_windows' }
                ]]
            }
        }
    );
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

    const osVersion = query.data.split('_')[2];
    
    const osOptions = {
        'win_10': { version: 'win_10', name: 'Windows 10 Pro', price: 3000 },
        'win_22': { version: 'win_22', name: 'Windows Server 2022', price: 3000 },
        'win_19': { version: 'win_19', name: 'Windows Server 2019', price: 3000 },
        'win_12': { version: 'win_12', name: 'Windows Server 2012', price: 3000 }
    };

    const selectedOS = osOptions[osVersion];
    
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
    
    await bot.editMessageText(
        `📋 **Konfigurasi yang dipilih:**\n\n` +
        `🖥️ Dedicated RDP\n` +
        `🪟 OS: ${selectedOS.name}\n` +
        `💰 Harga: Rp ${selectedOS.price.toLocaleString()}\n\n` +
        `⚙️ **Spesifikasi Setelah Instalasi:**\n` +
        `• CPU: ${session.vpsConfig.cpu} Core (full)\n` +
        `• RAM: ${session.vpsConfig.ram}GB (full spec - no reduction)\n` +
        `• Storage: ${session.vpsConfig.storage}GB (full spec - no reduction)\n\n` +
        `🔑 Masukkan password untuk RDP Windows:\n` +
        `_(Min. 8 karakter, kombinasi huruf dan angka)_`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '« Kembali', callback_data: 'back_to_dedicated_os' }
                ]]
            }
        }
    );
}

async function handlePageNavigation(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const page = parseInt(query.data.split('_')[1]);
    await showWindowsSelection(bot, chatId, messageId, page);
}

async function handleCancelInstallation(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getUserSession(chatId);
    
    // Mark installation as failed if installId exists
    if (session && session.installId) {
        try {
            const { failInstallation } = require('../utils/statistics');
            await failInstallation(session.installId, 'User cancelled');
            console.info(`[RDP] Cancelled installation ID ${session.installId}`);
        } catch (e) {
            console.error('[RDP] Error failing installation on cancel:', e);
        }
    }
    
    // Refund saldo jika sudah dipotong (untuk Docker dan Dedicated)
    if (session && !isAdmin(chatId) && session.balanceDeducted && session.installationCost) {
        try {
            const { addBalance } = require('../utils/userManager');
            await addBalance(chatId, session.installationCost);
            console.info(`[RDP] Refunded ${session.installationCost} to user ${chatId} - User cancelled installation`);
        } catch (e) {
            console.error('[RDP] Error refunding balance on cancel:', e);
        }
    }
    
    sessionManager.clearUserSession(chatId);
    
    await bot.editMessageText(
        '❌ Instalasi dibatalkan.',
        {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[
                    { text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_menu' }
                ]]
            }
        }
    );
}

module.exports = {
    handleInstallRDP,
    handleInstallDockerRDP,
    handleVPSCredentials,
    handleWindowsSelection,
    showWindowsSelection,
    handlePageNavigation,
    handleCancelInstallation
};
