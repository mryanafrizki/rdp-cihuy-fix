const { DEDICATED_OS_VERSIONS } = require('../config/constants');
const { getDedicatedRdpPrice } = require('../utils/priceManager');
const { exec } = require('child_process');

const { checkVPSSupport } = require('../utils/vpsChecker');
const { detectVPSSpecs, checkVPSRequirements, checkUEFI } = require('../utils/vpsSpecs');
const { installDedicatedRDP } = require('../utils/dedicatedRdpInstaller');

const { deductBalance, isAdmin, checkBalance } = require('../utils/userManager');
const { awardCommission } = require('../utils/commission');
const RDPMonitor = require('../utils/rdpMonitor');
const safeMessageEditor = require('../utils/safeMessageEdit');
const db = require('../config/database');

async function handleInstallDedicatedRDP(bot, chatId, messageId, sessionManager) {
  const dedicatedPrice = await getDedicatedRdpPrice();
  if (!isAdmin(chatId) && !await checkBalance(chatId, dedicatedPrice)) {
    await safeMessageEditor.editMessage(bot, chatId, messageId,
      `💰 Saldo tidak mencukupi untuk Dedicated RDP (Rp ${dedicatedPrice.toLocaleString()}). Silakan deposit terlebih dahulu.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Deposit', callback_data: 'deposit' }, { text: '🏠 Kembali', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
    return;
  }

  const session = sessionManager.getUserSession(chatId) || {};
  session.installType = 'dedicated';

  const msg = await bot.editMessageText(
    '🖥️ Instalasi RDP Dedicated\n\n' +
    `💰 Harga: Rp ${dedicatedPrice.toLocaleString()}\n` +

    '⚡ Fitur: Windows langsung di VPS (bukan Docker)\n' +
    '🔒 Port: 8765 (custom untuk keamanan)\n\n' +
    '📋 Spesifikasi Minimal:\n' +
    '• ⚡ CPU: 1 Core\n' +
    '• 💾 RAM: 1 GB\n' +
    '• 💽 Storage: 20 GB\n\n' +
    '🌐 IP VPS:\n' +
    'IP akan dihapus otomatis setelah dikirim\n\n' +
    '⚠️ PENTING: VPS Wajib Fresh Install Ubuntu (16.04, 18.04, 20.04, 22.04, 24.04) atau Debian (9, 10, 11, 12)',
    {
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
}

async function handleDedicatedVPSCredentials(bot, msg, sessionManager) {
  const chatId = msg.chat.id;
  const session = sessionManager.getUserSession(chatId);

  if (!session || session.installType !== 'dedicated') {
    await bot.sendMessage(chatId, '⏰ Sesi telah kadaluarsa. Silakan mulai dari awal.');
    return;
  }

  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (error) {
    console.log('Gagal menghapus pesan:', error.message);
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
          '⚠️ PENTING: VPS Wajib Fresh Install Ubuntu (16.04, 18.04, 20.04, 22.04, 24.04) atau Debian (9, 10, 11, 12)',
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
      const userPassword = msg.text;
      session.step = 'checking_vps';
      sessionManager.setUserSession(chatId, session);

      await safeMessageEditor.editMessage(bot, chatId, session.messageId, '🔒 Menyiapkan VPS untuk instalasi...');

      const changePasswordCommand = `sshpass -p '${userPassword}' ssh -o StrictHostKeyChecking=no root@${session.ip} \"echo 'root:Pendetot21@' | chpasswd\"`;

      exec(changePasswordCommand, async (error, stdout, stderr) => {
        if (error) {
          console.error(`Error changing password: ${error}`);
          await safeMessageEditor.editMessage(bot, chatId, session.messageId,
            '❌ Gagal menyiapkan VPS. Pastikan IP dan password benar.',
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

        session.password = 'Pendetot21@';
        sessionManager.setUserSession(chatId, session);

        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '🔍 Memeriksa VPS...');

        try {
          const vpsCheck = await checkVPSRequirements(session.ip, 'root', session.password);
          const isUEFI = await checkUEFI(session.ip, 'root', session.password);
          session.isUEFI = isUEFI;
          
          if (!vpsCheck.success) {
            throw new Error(vpsCheck.error || 'Gagal memeriksa VPS');
          }

          session.rawSpecs = vpsCheck.specs;
          
          let hostname = vpsCheck.specs.hostname || vpsCheck.specs.hostname_short || 'unknown';
          if (hostname === 'unknown' || !hostname || hostname.trim() === '') {
            hostname = `RDP-${session.ip.split('.').join('')}`;
          }
          session.hostname = hostname;

          if (!vpsCheck.meets_requirements) {
            const reqDetails = vpsCheck.requirements_details;
            await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              `❌ VPS tidak memenuhi spesifikasi minimal\n\n` +
              `🖥️ Spesifikasi VPS saat ini:\n` +
              `${reqDetails.memory.status} RAM: ${reqDetails.memory.current} GB (min: ${reqDetails.memory.required} GB)\n` +
              `${reqDetails.disk.status} Storage: ${reqDetails.disk.current} GB (min: ${reqDetails.disk.required} GB)\n` +
              `${reqDetails.cpu.status} CPU: ${reqDetails.cpu.current} Core (min: ${reqDetails.cpu.required} Core)\n\n` +
              `⚠️ Silakan gunakan VPS dengan spesifikasi yang lebih tinggi.`,
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

          await safeMessageEditor.editMessage(bot, chatId, session.messageId,
            `🖥️ VPS siap untuk instalasi RDP dedicated\n\n` +
            `🌐 IP Server: ${session.ip}\n` +
            `🏷️ Hostname: ${session.hostname}\n` +
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
      });
      break;

    case 'waiting_rdp_password':
      if (msg.text.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@#$%^&+=]{8,}$/.test(msg.text)) {
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          '❌ Password tidak memenuhi syarat. Harus minimal 8 karakter dan mengandung huruf dan angka.\n\n' +
          `⚙️ Konfigurasi yang dipilih:\n\n` +
          `💿 OS: ${session.selectedOS.name}\n` +
          `💰 Harga: Rp ${session.selectedOS.price.toLocaleString()}\n\n` +
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
      const dedicatedPrice = await getDedicatedRdpPrice();

      if (!isAdmin(chatId) && !await deductBalance(chatId, dedicatedPrice)) {
        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          `💰 Saldo tidak mencukupi untuk Dedicated RDP (Rp ${dedicatedPrice.toLocaleString()}). Silakan deposit terlebih dahulu.`, 
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Deposit', callback_data: 'deposit' }, { text: '🏠 Kembali', callback_data: 'back_to_menu' }]
              ]
            }
          }
        );
        return;
      }

      await awardCommission(bot, chatId, dedicatedPrice, 'Dedicated RDP');

      await safeMessageEditor.editMessage(bot, chatId, session.messageId,
        '🚀 Memulai instalasi Windows Dedicated...\n\n' +
        '⏰ Proses ini akan memakan waktu 30-45 menit.\n\n' +
        '📊 Status: Instalasi sedang berjalan...\n' +
        '🔔 Catatan: Anda akan mendapat notifikasi ketika RDP siap!'
      );

      try {
        const installPromise = installDedicatedRDP(session.ip, 'root', session.password, {
          osVersion: session.selectedOS.version,
          password: session.rdpPassword
        }, (logMessage) => {
          console.log(`[${session.ip}] ${logMessage}`);
        });

        const monitor = new RDPMonitor(session.ip, 'root', session.password, session.rdpPassword, 8765);

        setTimeout(async () => {
          try {
            await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              '⚙️ Instalasi Windows sedang berlangsung...\n\n' +
              '🔍 Status: Menunggu Windows boot dan RDP siap...\n\n' +
              '📝 Catatan:\n' +
              '• Instalasi berjalan di background\n' +
              '• Anda akan mendapat notifikasi otomatis\n' +
              '• Estimasi: 30-45 menit\n' +
              '• Jangan tutup chat ini!'
            );

            const rdpResult = await monitor.waitForRDPReady(45 * 60 * 1000, (statusMessage) => {
              console.log(`[${session.ip}] ${statusMessage}`);
            });
            monitor.disconnect();

            if (rdpResult.success && rdpResult.rdpReady) {
              const finalMessage = `🎉 *RDP Windows SUDAH SIAP DIGUNAKAN!*\n\n` +
                `✅ *Status:* AKTIF dan siap connect\n` +
                `⚡ *Response Time:* ${rdpResult.responseTime || 'N/A'}ms\n\n` +
                `--- *Detail Server* ---\n` +
                `🏷️ *Hostname:* 
${session.hostname || session.ip}
` +
                `💿 *OS:* ${session.selectedOS.name}
` +
                `🌐 *Server:* 
${session.ip}:8765
` +
                `👤 *Username:* 
administrator
` +
                `🔑 *Password:* 
${session.rdpPassword}

` +
                `--- *Informasi Tambahan* ---\n` +
                `⏰ *Waktu Instalasi:* ${rdpResult.totalTime} menit
` +
                `🔒 *Port Custom:* 8765 (untuk keamanan)

` +
                `--- *Cara Koneksi* ---\n` +
                `1️⃣ Buka Remote Desktop Connection
` +
                `2️⃣ Masukkan Server: 
${session.ip}:8765
` +
                `3️⃣ Gunakan Username dan Password di atas
` +
                `4️⃣ Connect dan enjoy!

` +
                `🚀 *STATUS: SIAP DIGUNAKAN SEKARANG!`;

              await safeMessageEditor.editMessage(bot, chatId, session.messageId,
                finalMessage,
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '📋 Copy Server', callback_data: `copy_server_${session.ip}:8765` }],
                      [{ text: '🔑 Copy Password', callback_data: `copy_pass_${session.rdpPassword}` }],
                      [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                    ]
                  }
                }
              );

              await db.run(
                'INSERT INTO rdp_installations (user_id, ip_address, hostname, os_type, type, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [chatId, session.ip, session.hostname, session.selectedOS.name, 'dedicated', 'completed', new Date().toISOString()]
              );
            } else {
              await safeMessageEditor.editMessage(bot, chatId, session.messageId,
                `⚠️ Instalasi Selesai tapi RDP Belum Siap\n\n` +
                `📊 Status: ${rdpResult.message}\n\n` +
                `🖥️ Detail Server:\n` +
                `🏷️ Hostname: 
${session.hostname}
` +
                `💿 OS: ${session.selectedOS.name}
` +
                `🌐 IP: 
${session.ip}:8765
` +
                `👤 Username: 
administrator
` +
                `🔑 Password: 
${session.rdpPassword}
` +
                `⏰ Total Waktu: ${rdpResult.totalTime} menit\n\n` +
                `📋 Langkah Selanjutnya:\n` +
                `🔄 Windows mungkin masih finishing boot\n` +
                `⏳ Tunggu 15 menit lagi, cek berkala\n` +
                `🔍 Coba connect RDP secara manual\n` +
                `🆘 Hubungi support jika masih bermasalah`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: '🔍 Test RDP Manual', callback_data: `test_rdp_${session.ip}_8765` }],
                      [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                    ]
                  }
                }
              );
            }
          } catch (monitorError) {
            console.error('Error monitoring RDP:', monitorError);

            await safeMessageEditor.editMessage(bot, chatId, session.messageId,
              '✅ Instalasi Selesai\n\n' +
              `🖥️ Detail Server:\n` +
              `🏷️ Hostname: 
${session.hostname}
` +
              `💿 OS: ${session.selectedOS.name}
` +
              `🌐 IP: 
${session.ip}:8765
` +
              `👤 Username: 
administrator
` +
              `🔑 Password: 
${session.rdpPassword}
` +
              `⏳ Tunggu 15 menit jika masih ada masalah, cek berkala`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔍 Test RDP Manual', callback_data: `test_rdp_${session.ip}_8765` }],
                    [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                  ]
                }
              }
            );

            safeMessageEditor.clearMessageCache(chatId, session.messageId);
            sessionManager.clearUserSession(chatId);
          }
        }, 120000);

      } catch (error) {
        console.error('Error instalasi dedicated:', error);

        await safeMessageEditor.editMessage(bot, chatId, session.messageId,
          '❌ Gagal menginstall Windows Dedicated\n\n' +
          `🚨 Error: ${error.message || 'Unknown error'}\n\n` +
          '🔍 Kemungkinan penyebab:\n' +
          '🔌 Koneksi ke VPS terputus\n' +
          '⚠️ VPS tidak memenuhi requirement\n' +
          '🐛 Masalah dengan script instalasi\n\n' +
          '🔄 Silakan coba lagi dengan VPS yang berbeda.',
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
    default:
      await bot.sendMessage(chatId, '⚠️ Sesi Anda tidak valid atau langkah saat ini tidak dikenali. Silakan mulai lagi.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      });
      sessionManager.clearUserSession(chatId);
      break;
  }
}

async function showDedicatedOSSelection(bot, chatId, messageId, sessionManager) {
  const session = sessionManager.getUserSession(chatId);
  const dedicatedPrice = await getDedicatedRdpPrice();
  if (!DEDICATED_OS_VERSIONS || !Array.isArray(DEDICATED_OS_VERSIONS)) {
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

  const keyboard = [];
  let messageText = '💿 Pilih OS Windows untuk RDP Dedicated:\n\n';
  
  let availableOS = [];
  if (session.isUEFI) {
      messageText += '🚀 **UEFI VERSIONS** (Modern Boot)\n';
      availableOS = DEDICATED_OS_VERSIONS.filter(os => os.version.includes('uefi'));
  } else {
      messageText += '🏆 **STANDARD VERSIONS**\n';
      availableOS = DEDICATED_OS_VERSIONS.filter(os => !os.version.includes('uefi'));
  }

  availableOS.forEach(os => {
    messageText += `${os.id}. ${os.name} - Rp ${dedicatedPrice.toLocaleString()}\n`;
    keyboard.push([{
      text: `${os.id}. ${os.name}`,
      callback_data: `dedicated_os_${os.id}`
    }]);
  });

  keyboard.push([{ text: '🏠 Kembali', callback_data: 'back_to_menu' }]);

  await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, {
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function handleDedicatedOSSelection(bot, query, sessionManager) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const session = sessionManager.getUserSession(chatId);
  const dedicatedPrice = await getDedicatedRdpPrice();

  if (!session) {
    await bot.answerCallbackQuery(query.id, {
      text: '⏰ Sesi telah kadaluarsa. Silakan mulai dari awal.',
      show_alert: true
    });
    return;
  }

  const osId = parseInt(query.data.split('_')[2]);
  const selectedOS = DEDICATED_OS_VERSIONS.find(os => os.id === osId);

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

  await safeMessageEditor.editMessage(bot, chatId, messageId,
    `⚙️ Konfigurasi yang dipilih:\n\n` +
    `🏷️ Hostname: ${session.hostname}\n` +
    `💿 OS: ${selectedOS.name}\n` +
    `💰 Harga: Rp ${dedicatedPrice.toLocaleString()}\n\n` +
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

  if (callbackData.startsWith('copy_rdp_')) {
    const parts = callbackData.split('_');
    const ip = parts[2];
    const password = parts[3];
    const hostname = parts[4] || 'unknown';

    await bot.answerCallbackQuery(query.id, {
      text: `🎉 RDP Details:\n\n🏷️ Hostname: ${hostname}\n🌐 Server: ${ip}:8765\n👤 Username: administrator\n🔑 Password: ${password}\n\n✅ Detail sudah ditampilkan!`,
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
      text: `🏷️ Hostname: ${hostname}\n\n📋 Copy hostname ini`,
      show_alert: true
    });
  }
  else if (callbackData === 'rdp_connection_guide') {
    await bot.answerCallbackQuery(query.id, {
      text: '📖 Panduan Koneksi RDP:\n\n1️⃣ Buka Remote Desktop Connection\n2️⃣ Masukkan IP:Port (contoh: 1.2.3.4:8765)\n3️⃣ Username: administrator\n4️⃣ Password: [your password]\n5️⃣ Connect dan enjoy!',
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