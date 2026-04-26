const axios = require('axios');
const { addBalance, getAllUsers } = require('../utils/userManager');
const { get, run, all } = require('../config/database');
const { setDockerRdpPrice, setDedicatedRdpPrice } = require('../utils/priceManager');
const { restartRentedBot } = require('./rentBotHandler'); // Import the new function
const sqlite3 = require('sqlite3');
const safeMessageEditor = require('../utils/safeMessageEdit');
const { BUTTONS } = require('../config/buttons');

async function handleAddBalance(bot, chatId, messageId, sessionManager) {
    sessionManager.setAdminSession(chatId, { action: 'add_balance', messageId });
    await bot.editMessageText(
      'Masukkan ID pengguna dan jumlah saldo yang akan ditambahkan dalam format:\n\n`_user_id_ _jumlah_`\n\nContoh: `123456789 50000`',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[BUTTONS.ADMIN_MENU]] }
      }
    );
  }
  
  async function processAddBalance(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const parts = msg.text.split(' ');
    if (parts.length !== 2) {
      await bot.sendMessage(chatId, '❌ Format tidak valid. Gunakan format: `<user_id> <jumlah>`');
      return;
    }
  
    const userId = parseInt(parts[0]);
    const amount = parseInt(parts[1]);
  
    if (isNaN(userId) || isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, '❌ ID pengguna atau jumlah tidak valid');
      return;
    }
  
    try {
      const newBalance = await addBalance(userId, amount);
      await bot.sendMessage(chatId, 
        `✅ Saldo berhasil ditambahkan ke database *utama*:\n\n` +
        `👤 User ID: 
${userId}
` +
        `💰 Jumlah: Rp ${amount.toLocaleString()}
` +
        `💳 Saldo Baru: Rp ${newBalance.toLocaleString()}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error adding balance:', error);
      await bot.sendMessage(chatId, '❌ Gagal menambahkan saldo. User ID tidak ditemukan di database utama.');
    }
    sessionManager.clearAdminSession(chatId);
}

async function handleAdminManageRentedBots(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const rentedBots = await all('SELECT * FROM rented_bots ORDER BY id DESC');

    let message = '🤖 *Kelola Semua Bot Sewaan*\n\n';
    const keyboard = { inline_keyboard: [] };

    if (rentedBots.length === 0) {
        message += 'Tidak ada bot yang disewa saat ini.';
    } else {
        keyboard.inline_keyboard.push([{
            text: '🔄 Restart Semua Bot Aktif',
            callback_data: 'restart_all_rented_bots'
        }]);

        for (const botData of rentedBots) {
            const endDate = new Date(botData.end_date);
            let statusText;
            switch(botData.status) {
                case 'active': statusText = '🟢 Aktif'; break;
                case 'expired': statusText = '🔴 Kadaluarsa'; break;
                case 'stopped': statusText = '🟡 Dihentikan'; break;
                case 'suspended': statusText = '🚫 Ditangguhkan'; break;
                default: statusText = `❓ ${botData.status}`;
            }
            const botName = botData.bot_name || `Bot (ID: ${botData.id})`;

            message += `*${botName}* (Owner: ${botData.user_id}) - ${statusText}\n`;
            message += `  Berakhir: ${endDate.toLocaleDateString('id-ID')}\n`;

            const row = [];
            if (botData.status === 'active' || botData.status === 'stopped') {
                 row.push({ text: botData.status === 'active' ? '🚫 Tangguhkan' : '▶️ Aktifkan', callback_data: `suspend_rented_bot_${botData.id}` });
            }
            row.push({ text: 'ℹ️ Detail', callback_data: `view_rented_bot_details_${botData.id}` });
            keyboard.inline_keyboard.push(row);
        }
    }
    keyboard.inline_keyboard.push([{ text: '« Kembali ke Menu Admin', callback_data: 'admin_menu' }]);

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { 
        parse_mode: 'Markdown', 
        reply_markup: keyboard 
    });
}

async function handleRestartAllBots(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    bot.answerCallbackQuery(query.id, { text: 'Memulai proses restart...' });

    await safeMessageEditor.editMessage(bot, chatId, messageId, '🔄 Merestart semua bot sewaan yang aktif...');

    const activeBots = await all('SELECT id, bot_name FROM rented_bots WHERE status = ?', ['active']);

    if (activeBots.length === 0) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Tidak ada bot aktif untuk direstart.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'admin_manage_rented_bots' }]] }
        });
    }

    let successCount = 0;
    let failureCount = 0;
    let results = '';

    for (const botData of activeBots) {
        const result = await restartRentedBot(botData.id);
        if (result.success) {
            successCount++;
            results += `✅ ${botData.bot_name || `Bot ID ${botData.id}`}: Berhasil\n`;
        } else {
            failureCount++;
            results += `❌ ${botData.bot_name || `Bot ID ${botData.id}`}: Gagal (${result.error})\n`;
        }
    }

    const finalMessage = `*Proses Restart Selesai*\n\nBerhasil: ${successCount}\nGagal: ${failureCount}\n\n${results}`;

    await safeMessageEditor.editMessage(bot, chatId, messageId, finalMessage, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'admin_manage_rented_bots' }]] }
    });
}

async function handleSuspendRentedBot(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const rentedBotId = parseInt(query.data.split('_')[3]);
    bot.answerCallbackQuery(query.id);

    const botData = await get('SELECT * FROM rented_bots WHERE id = ?', [rentedBotId]);
    if (!botData) {
        return bot.answerCallbackQuery(query.id, { text: 'Bot tidak ditemukan.', show_alert: true });
    }

    const isCurrentlyActive = botData.status === 'active';
    const newStatus = isCurrentlyActive ? 'suspended' : 'active';

    try {
        if (isCurrentlyActive && botData.process_id) {
            try {
                process.kill(botData.process_id, 'SIGTERM');
                console.log(`Killed process ${botData.process_id} for suspension.`);
            } catch (e) {
                if (e.code !== 'ESRCH') console.error(`Error killing process for suspension: ${e.message}`);
            }
        }
        
        await run('UPDATE rented_bots SET status = ?, process_id = NULL WHERE id = ?', [newStatus, rentedBotId]);
        
        await bot.answerCallbackQuery(query.id, { text: `✅ Bot telah di-${newStatus === 'suspended' ? 'tangguhkan' : 'aktifkan'}.` });

        // Refresh the management list
        const updatedQuery = { ...query, data: 'admin_manage_rented_bots' };
        await handleAdminManageRentedBots(bot, updatedQuery);

    } catch (error) {
        console.error(`Error updating bot status to ${newStatus}:`, error);
        await bot.answerCallbackQuery(query.id, { text: '❌ Gagal memperbarui status bot.', show_alert: true });
    }
}


async function handleAdminAddRentedBotBalance(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const rentedBots = await all('SELECT id, bot_name FROM rented_bots');

    if (rentedBots.length === 0) {
        return bot.editMessageText('Tidak ada bot sewaan yang ditemukan.', {
            chat_id: chatId, message_id: messageId, 
            reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'admin_menu' }]]}
        });
    }

    const keyboard = rentedBots.map(b => ([{
        text: `${b.bot_name || `Bot ID: ${b.id}`}`,
        callback_data: `admin_select_rented_bot_${b.id}`
    }]));

    keyboard.push([{ text: '« Kembali', callback_data: 'admin_menu' }]);

    const message = 'Pilih bot sewaan yang saldonya ingin Anda kelola:';
    await bot.editMessageText(message, {
        chat_id: chatId, message_id: messageId,
        reply_markup: { inline_keyboard: keyboard }
    });
}

async function handleAdminSelectRentedBot(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const botId = query.data.split('_')[4];

    sessionManager.setAdminSession(chatId, {
        action: 'add_rented_bot_balance',
        rentedBotId: botId,
        messageId: messageId
    });

    await bot.editMessageText('Masukkan ID Telegram pengguna dan jumlah yang akan ditambahkan, dipisahkan spasi.\n\nContoh: `123456789 50000`', {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'admin_menu' }]] }
    });
}

async function processAdminAddRentedBotBalance(bot, msg, sessionManager) {
    const adminChatId = msg.chat.id;
    const adminSession = sessionManager.getAdminSession(adminChatId);

    if (!adminSession || adminSession.action !== 'add_rented_bot_balance') return;

    const { rentedBotId, messageId } = adminSession;
    const parts = msg.text.split(' ');
    if (parts.length !== 2) {
        return bot.sendMessage(adminChatId, '❌ Format tidak valid. Gunakan: `<user_id> <jumlah>`');
    }

    const targetUserId = parseInt(parts[0], 10);
    const amount = parseFloat(parts[1]);

    if (isNaN(targetUserId) || isNaN(amount) || amount <= 0) {
        return bot.sendMessage(adminChatId, '❌ User ID atau jumlah tidak valid.');
    }

    try {
        const botData = await get('SELECT db_path, bot_name FROM rented_bots WHERE id = ?', [rentedBotId]);
        if (!botData || !botData.db_path) {
            throw new Error(`Database path not found for bot ID ${rentedBotId}.`);
        }

        const rentedDb = new sqlite3.Database(botData.db_path);
        const rentedDbRun = (sql, params = []) => new Promise((resolve, reject) => {
            rentedDb.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });

        const result = await rentedDbRun(
            'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
            [amount, targetUserId]
        );

        rentedDb.close();

        if (result.changes === 0) {
            await safeMessageEditor.editMessage(bot, adminChatId, messageId, `⚠️ User dengan ID 
${targetUserId}
 tidak ditemukan di bot *${botData.bot_name}*. Tidak ada saldo yang ditambahkan.`, { parse_mode: 'Markdown' });
        } else {
            await safeMessageEditor.editMessage(bot, adminChatId, messageId, `✅ Saldo berhasil ditambahkan.

- Bot: *${botData.bot_name}*
- User ID: 
${targetUserId}
- Jumlah: Rp ${amount.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        console.error('Error adding balance to rented bot:', error);
        await safeMessageEditor.editMessage(bot, adminChatId, messageId, `❌ Terjadi kesalahan: ${error.message}`);
    }

    sessionManager.clearAdminSession(adminChatId);
}


async function handleSetPrices(bot, chatId, messageId) {
    const message = '💰 *Atur Harga Layanan*\n\nPilih layanan yang harganya ingin diatur:';
    const keyboard = {
        inline_keyboard: [
            [
                { text: '🐳 Docker RDP', callback_data: 'set_docker_rdp_price' },
                { text: '🖥️ Dedicated RDP', callback_data: 'set_dedicated_rdp_price' }
            ],
            [
                { text: '« Kembali', callback_data: 'admin_menu' }
            ]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
}

async function handleSetDockerRdpPrice(bot, chatId, messageId, sessionManager) {
    sessionManager.setAdminSession(chatId, { action: 'set_price', type: 'docker_rdp', messageId });
    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan harga baru untuk Docker RDP:', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'set_prices' }]] }
    });
}

async function handleSetDedicatedRdpPrice(bot, chatId, messageId, sessionManager) {
    sessionManager.setAdminSession(chatId, { action: 'set_price', type: 'dedicated_rdp', messageId });
    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan harga baru untuk Dedicated RDP:', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'set_prices' }]] }
    });
}

async function processNewPrice(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);

    if (!session || session.action !== 'set_price') return;

    const price = parseInt(msg.text);
    if (isNaN(price) || price < 0) {
        await bot.sendMessage(chatId, '❌ Harga tidak valid.');
        return;
    }

    try {
        if (session.type === 'docker_rdp') {
            await setDockerRdpPrice(price);
            await bot.sendMessage(chatId, `✅ Harga Docker RDP berhasil diubah menjadi Rp ${price.toLocaleString()}.`);
        } else if (session.type === 'dedicated_rdp') {
            await setDedicatedRdpPrice(price);
            await bot.sendMessage(chatId, `✅ Harga Dedicated RDP berhasil diubah menjadi Rp ${price.toLocaleString()}.`);
        }
    } catch (error) {
        console.error('Error processing new price:', error);
        await bot.sendMessage(chatId, '❌ Gagal mengubah harga.');
    }

    sessionManager.clearAdminSession(chatId);
    if (session.messageId) {
        await handleSetPrices(bot, chatId, session.messageId);
    }
}

async function handlePromoMenu(bot, chatId, messageId) {
    const message = '🎉 *Promo Management*\n\nPilih salah satu opsi:';
    const keyboard = {
        inline_keyboard: [
            [
                { text: '➕ Buat Promo Baru', callback_data: 'create_promo' },
            ],
            [
                { text: '📄 Lihat Promo', callback_data: 'view_promos' },
                { text: '✏️ Edit Promo', callback_data: 'edit_promo' },
                { text: '🗑️ Hapus Promo', callback_data: 'delete_promo' }
            ],
            [
                { text: '« Kembali', callback_data: 'admin_menu' }
            ]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
}

async function handleCreatePromo(bot, chatId, messageId, sessionManager) {
    sessionManager.setAdminSession(chatId, { action: 'create_promo_service_type', messageId });
    const message = 'Pilih jenis layanan untuk promo:';
    const keyboard = {
        inline_keyboard: [
            [
                { text: 'Install RDP Docker', callback_data: 'promo_service_docker_rdp' },
                { text: 'Install RDP Dedicated', callback_data: 'promo_service_dedicated_rdp' }
            ],
            [
                { text: 'VPS Biasa', callback_data: 'promo_service_vps_regular' },
                { text: 'VPS + RDP', callback_data: 'promo_service_vps_rdp' }
            ],
            [
                { text: 'Sewa Bot', callback_data: 'promo_service_rent_bot' }
            ],
            [
                { text: '« Batal', callback_data: 'promo_menu' }
            ]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { reply_markup: keyboard });
}

async function handleViewPromos(bot, chatId, messageId) {
    const promos = await all('SELECT * FROM promotions ORDER BY start_date DESC');
    let message = '📄 *Daftar Promo*\n\n';
    if (promos.length === 0) {
        message += 'Tidak ada promo yang dikonfigurasi.';
    } else {
        promos.forEach(promo => {
            message += `*ID: ${promo.id}*
` +
                `Layanan: ${promo.service_type}
` +
                `Diskon: ${promo.discount_percentage}%
` +
                `Mulai: ${new Date(promo.start_date).toLocaleString('id-ID')}
` +
                `Selesai: ${new Date(promo.end_date).toLocaleString('id-ID')}

`;
        });
    }
    const keyboard = {
        inline_keyboard: [
            [{ text: '« Kembali', callback_data: 'promo_menu' }]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
}

async function handleDeletePromo(bot, chatId, messageId, sessionManager) {
    sessionManager.setAdminSession(chatId, { action: 'delete_promo', messageId });
    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan ID promo yang akan dihapus:', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'promo_menu' }]] }
    });
}

async function handleEditPromo(bot, chatId, messageId, sessionManager) {
    sessionManager.setAdminSession(chatId, { action: 'edit_promo', messageId });
    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan ID promo yang akan diedit:', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'promo_menu' }]] }
    });
}

async function processPromoServiceType(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const serviceType = query.data.split('promo_service_')[1];
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'create_promo_service_type') return;

    session.promo = { service_type: serviceType };
    session.action = 'create_promo_discount';
    sessionManager.setAdminSession(chatId, session);

    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan persentase diskon (misal: 10 untuk 10%):', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'promo_menu' }]] }
    });
}

async function processPromoDiscount(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'create_promo_discount') return;

    const discount = parseFloat(msg.text);
    if (isNaN(discount) || discount <= 0 || discount > 100) {
        await bot.sendMessage(chatId, '❌ Persentase diskon tidak valid. Masukkan angka antara 1 dan 100.');
        return;
    }

    session.promo.discount_percentage = discount;
    session.action = 'create_promo_duration'; 
    sessionManager.setAdminSession(chatId, session);

    await safeMessageEditor.editMessage(bot, chatId, session.messageId, 'Masukkan durasi promo dalam hari (misal: 7 untuk 7 hari):', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'promo_menu' }]] }
    });
}

async function processPromoDuration(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'create_promo_duration') return;

    const durationDays = parseInt(msg.text);
    if (isNaN(durationDays) || durationDays <= 0) {
        await bot.sendMessage(chatId, '❌ Durasi tidak valid. Masukkan jumlah hari (misal: 7).');
        return;
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + durationDays);

    session.promo.start_date = startDate.toISOString();
    session.promo.end_date = endDate.toISOString();
    
    try {
        await run('INSERT INTO promotions (service_type, discount_percentage, start_date, end_date) VALUES (?, ?, ?, ?)',
            [session.promo.service_type, session.promo.discount_percentage, session.promo.start_date, session.promo.end_date]
        );
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '✅ Promo berhasil dibuat!', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    } catch (error) {
        console.error('Error creating promo:', error);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '❌ Gagal membuat promo.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    }
    sessionManager.clearAdminSession(chatId);
}

async function processDeletePromo(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'delete_promo') return;

    const promoId = parseInt(msg.text);
    if (isNaN(promoId)) {
        await bot.sendMessage(chatId, '❌ ID promo tidak valid.');
        return;
    }

    try {
        const result = await run('DELETE FROM promotions WHERE id = ?', [promoId]);
        if (result.changes > 0) {
            await safeMessageEditor.editMessage(bot, chatId, session.messageId, `✅ Promo dengan ID ${promoId} berhasil dihapus.`, {
                reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
            });
        } else {
            await safeMessageEditor.editMessage(bot, chatId, session.messageId, `❌ Promo dengan ID ${promoId} tidak ditemukan.`, {
                reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
            });
        }
    } catch (error) {
        console.error('Error deleting promo:', error);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '❌ Gagal menghapus promo.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    }
    sessionManager.clearAdminSession(chatId);
}

async function processEditPromo(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'edit_promo') return;

    const promoId = parseInt(msg.text);
    if (isNaN(promoId)) {
        await bot.sendMessage(chatId, '❌ ID promo tidak valid.');
        return;
    }

    try {
        const promo = await get('SELECT * FROM promotions WHERE id = ?', [promoId]);
        if (!promo) {
            await safeMessageEditor.editMessage(bot, chatId, session.messageId, `❌ Promo dengan ID ${promoId} tidak ditemukan.`, {
                reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
            });
            sessionManager.clearAdminSession(chatId);
            return;
        }

        session.promo_id_to_edit = promoId;
        session.action = 'select_promo_field_to_edit';
        sessionManager.setAdminSession(chatId, session);

        let message = `✏️ *Edit Promo ID: ${promo.id}*\n\n` +
            `Layanan: ${promo.service_type}\n` +
            `Diskon: ${promo.discount_percentage}%
` +
            `Mulai: ${new Date(promo.start_date).toLocaleString('id-ID')}
` +
            `Selesai: ${new Date(promo.end_date).toLocaleString('id-ID')}

` +
            `Pilih field yang akan diedit:`

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Layanan', callback_data: 'edit_promo_field_service_type' },
                    { text: 'Diskon', callback_data: 'edit_promo_field_discount' }
                ],
                [
                    { text: 'Tanggal Mulai', callback_data: 'edit_promo_field_start_date' },
                    { text: 'Tanggal Selesai', callback_data: 'edit_promo_field_end_date' }
                ],
                [
                    { text: '« Kembali', callback_data: 'promo_menu' }
                ]
            ]
        };

        await safeMessageEditor.editMessage(bot, chatId, session.messageId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

    } catch (error) {
        console.error('Error finding promo to edit:', error);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '❌ Gagal mencari promo.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
        sessionManager.clearAdminSession(chatId);
    }
}

async function handleBroadcast(bot, chatId, messageId, sessionManager) {
    sessionManager.setAdminSession(chatId, { action: 'broadcast', messageId });
    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Silakan kirim pesan yang ingin Anda siarkan ke semua pengguna. Anda dapat menggunakan format Markdown.', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'admin_menu' }]] }
    });
}

async function processBroadcast(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);

    if (!session || session.action !== 'broadcast') return;

    const messageText = msg.text;
    sessionManager.clearAdminSession(chatId);

    await bot.sendMessage(chatId, `📢 Memulai siaran ke semua pengguna...`);

    try {
        const users = await getAllUsers();
        let successCount = 0;
        let failureCount = 0;

        for (const user of users) {
            try {
                await bot.sendMessage(user.telegram_id, messageText, { parse_mode: 'Markdown' });
                successCount++;
            } catch (error) {
                failureCount++;
                console.error(`Failed to send broadcast to user ${user.telegram_id}:`, error.response ? error.response.body : error.message);
            }
        }

        await bot.sendMessage(chatId, `✅ Siaran selesai.

Berhasil terkirim: ${successCount}
Gagal terkirim: ${failureCount}`);
    } catch (error) {
        console.error('Error during broadcast:', error);
        await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil daftar pengguna untuk siaran.');
    }

    if (session.messageId) {
        // Go back to admin menu
        const adminMenuMessage = '👑 *Admin Menu*\n\nSilakan pilih salah satu opsi di bawah ini:';
        const { createAdminMenu } = require('../utils/keyboard'); // Local require to avoid circular deps
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, adminMenuMessage, { ...createAdminMenu() });
    }
}

async function handleEditPromoDiscount(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getAdminSession(chatId);

    if (!session || session.action !== 'select_promo_field_to_edit') return;

    session.action = 'process_edit_promo_discount';
    sessionManager.setAdminSession(chatId, session);

    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan persentase diskon baru (misal: 15 untuk 15%):', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'promo_menu' }]] }
    });
}

async function processEditPromoDiscount(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'process_edit_promo_discount' || !session.promo_id_to_edit) return;

    const discount = parseFloat(msg.text);
    if (isNaN(discount) || discount <= 0 || discount > 100) {
        await bot.sendMessage(chatId, '❌ Persentase diskon tidak valid. Masukkan angka antara 1 dan 100.');
        return;
    }

    try {
        await run('UPDATE promotions SET discount_percentage = ? WHERE id = ?', [discount, session.promo_id_to_edit]);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, `✅ Diskon promo ID ${session.promo_id_to_edit} berhasil diubah menjadi ${discount}%.`, {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    } catch (error) {
        console.error('Error updating promo discount:', error);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '❌ Gagal mengubah diskon promo.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    }
    sessionManager.clearAdminSession(chatId);
}

async function handleEditPromoServiceType(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getAdminSession(chatId);

    if (!session || session.action !== 'select_promo_field_to_edit' || !session.promo_id_to_edit) return;

    session.action = 'process_edit_promo_service_type';
    sessionManager.setAdminSession(chatId, session);

    const message = 'Pilih jenis layanan baru untuk promo:';
    const keyboard = {
        inline_keyboard: [
            [
                { text: 'Install RDP Docker', callback_data: 'promo_service_docker_rdp' },
                { text: 'Install RDP Dedicated', callback_data: 'promo_service_dedicated_rdp' }
            ],
            [
                { text: 'VPS Biasa', callback_data: 'promo_service_vps_regular' },
                { text: 'VPS + RDP', callback_data: 'promo_service_vps_rdp' }
            ],
            [
                { text: 'Sewa Bot', callback_data: 'promo_service_rent_bot' }
            ],
            [
                { text: '« Batal', callback_data: 'promo_menu' }
            ]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { reply_markup: keyboard });
}

async function processEditPromoServiceType(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const serviceType = query.data.split('promo_service_')[1];
    const session = sessionManager.getAdminSession(chatId);

    if (!session || session.action !== 'process_edit_promo_service_type' || !session.promo_id_to_edit) return;

    try {
        await run('UPDATE promotions SET service_type = ? WHERE id = ?', [serviceType, session.promo_id_to_edit]);
        await safeMessageEditor.editMessage(bot, chatId, messageId, `✅ Jenis layanan promo ID ${session.promo_id_to_edit} berhasil diubah menjadi ${serviceType}.`, {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    } catch (error) {
        console.error('Error updating promo service type:', error);
        await safeMessageEditor.editMessage(bot, chatId, messageId, '❌ Gagal mengubah jenis layanan promo.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    }
    sessionManager.clearAdminSession(chatId);
}

async function handleEditPromoStartDate(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getAdminSession(chatId);

    if (!session || session.action !== 'select_promo_field_to_edit' || !session.promo_id_to_edit) return;

    session.action = 'process_edit_promo_start_date';
    sessionManager.setAdminSession(chatId, session);

    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan tanggal mulai promo baru (YYYY-MM-DD):', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'promo_menu' }]] }
    });
}

async function processEditPromoStartDate(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'process_edit_promo_start_date' || !session.promo_id_to_edit) return;

    const startDate = new Date(msg.text);
    if (isNaN(startDate.getTime())) {
        await bot.sendMessage(chatId, '❌ Format tanggal tidak valid. Gunakan YYYY-MM-DD.');
        return;
    }

    try {
        await run('UPDATE promotions SET start_date = ? WHERE id = ?', [startDate.toISOString(), session.promo_id_to_edit]);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, `✅ Tanggal mulai promo ID ${session.promo_id_to_edit} berhasil diubah menjadi ${startDate.toLocaleDateString('id-ID')}.`, {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    } catch (error) {
        console.error('Error updating promo start date:', error);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '❌ Gagal mengubah tanggal mulai promo.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    }
    sessionManager.clearAdminSession(chatId);
}

async function handleEditPromoEndDate(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getAdminSession(chatId);

    if (!session || session.action !== 'select_promo_field_to_edit' || !session.promo_id_to_edit) return;

    session.action = 'process_edit_promo_end_date';
    sessionManager.setAdminSession(chatId, session);

    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Masukkan tanggal selesai promo baru (YYYY-MM-DD):', {
        reply_markup: { inline_keyboard: [[{ text: '« Batal', callback_data: 'promo_menu' }]] }
    });
}

async function processEditPromoEndDate(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getAdminSession(chatId);
    if (!session || session.action !== 'process_edit_promo_end_date' || !session.promo_id_to_edit) return;

    const endDate = new Date(msg.text);
    if (isNaN(endDate.getTime())) {
        await bot.sendMessage(chatId, '❌ Format tanggal tidak valid. Gunakan YYYY-MM-DD.');
        return;
    }

    try {
        await run('UPDATE promotions SET end_date = ? WHERE id = ?', [endDate.toISOString(), session.promo_id_to_edit]);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, `✅ Tanggal selesai promo ID ${session.promo_id_to_edit} berhasil diubah menjadi ${endDate.toLocaleDateString('id-ID')}.`, {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    } catch (error) {
        console.error('Error updating promo end date:', error);
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '❌ Gagal mengubah tanggal selesai promo.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali ke Menu Promo', callback_data: 'promo_menu' }]] }
        });
    }
    sessionManager.clearAdminSession(chatId);
}

async function handleAtlanticMenu(bot, chatId, messageId) {
    try {
        // IMPORTANT: Replace with your actual API base URL
        const response = await axios.get(`${process.env.ATLANTIS_API_ENDPOINT}/get_profile`);

        if (response.data && response.data.status === 'true') {
            const { username, balance } = response.data.data;
            const message = `*Atlantic H2H Profile*\n\nUsername: 
${username}
` + 
`Balance: 
Rp ${parseInt(balance).toLocaleString('id-ID')}`;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: 'Check Balance', callback_data: 'atlantic_check_balance' }],
                    [{ text: '« Kembali', callback_data: 'admin_menu' }]
                ]
            };

            await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
        } else {
            const errorMessage = response.data ? response.data.message : 'Failed to retrieve data.';
            await safeMessageEditor.editMessage(bot, chatId, messageId, `❌ Error: ${errorMessage}`, {
                reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'admin_menu' }]] }
            });
        }
    } catch (error) {
        console.error('Error in handleAtlanticMenu:', error);
        await safeMessageEditor.editMessage(bot, chatId, messageId, '❌ An error occurred while fetching the profile.', {
            reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'admin_menu' }]] }
        });
    }
}

async function handleAtlanticCheckBalance(bot, chatId, messageId) {
    // This function is not implemented yet.
    await safeMessageEditor.editMessage(bot, chatId, messageId, 'This feature is not yet implemented.', {
        reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'atlantic_menu' }]] }
    });
}

module.exports = {
  handleAddBalance,
  processAddBalance,
  handleBroadcast,
  processBroadcast,
  setupAdminCommands: () => {},
  handleSetPrices,
  handleSetDockerRdpPrice,
  handleSetDedicatedRdpPrice,
  processNewPrice,
  handleAdminManageRentedBots,
  handleRestartAllBots, 
  handleSuspendRentedBot,
  handleAdminAddRentedBotBalance,
  handleAdminSelectRentedBot,
  processAdminAddRentedBotBalance,
  handlePromoMenu,
  handleCreatePromo,
  handleViewPromos,
  handleDeletePromo,
  handleEditPromo,
  processPromoServiceType,
  processPromoDiscount,
  processPromoDuration,
  processDeletePromo,
  processEditPromo,
  handleEditPromoDiscount,
  processEditPromoDiscount,
  handleEditPromoServiceType,
  processEditPromoServiceType,
  handleEditPromoStartDate,
  processEditPromoStartDate,
  handleEditPromoEndDate,
  processEditPromoEndDate,
  handleAtlanticMenu,
  handleAtlanticCheckBalance,
};