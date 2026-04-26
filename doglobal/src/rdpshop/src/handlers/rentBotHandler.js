const { run, get, all } = require('../config/database');
const { BUTTONS } = require('../config/buttons');
const safeMessageEditor = require('../utils/safeMessageEdit');
const { deductBalance, isAdmin } = require('../utils/userManager');
const { getDockerRdpPrice, getDedicatedRdpPrice } = require('../utils/priceManager');
const { spawn } = require('child_process');
const path = require('path');
const { initializeRentedBotDatabase } = require('../utils/rentedBotDb');

const RENTAL_PRICE_PER_MONTH = 50000;

// --- Helper to delete message safely ---
const deleteMsg = (bot, chatId, messageId) => {
    bot.deleteMessage(chatId, messageId).catch(() => {}); // Ignore errors
};

const stopRentedBotLogic = async (rentedBotId) => {
    const botData = await get('SELECT * FROM rented_bots WHERE id = ?', [rentedBotId]);
    if (!botData || !botData.process_id) return false;

    try {
        process.kill(botData.process_id, 'SIGTERM');
        await run('UPDATE rented_bots SET status = ?, process_id = NULL WHERE id = ?', ['stopped', rentedBotId]);
        console.log(`[Admin] Stopped rented bot ${rentedBotId} (PID: ${botData.process_id})`);
        return true;
    } catch (error) {
        if (error.code !== 'ESRCH') console.error(`Error stopping rented bot PID ${botData.process_id}:`, error);
        // Even if kill fails (e.g., process already dead), update the DB
        await run('UPDATE rented_bots SET status = ?, process_id = NULL WHERE id = ?', ['stopped', rentedBotId]);
        return true; // Return true as the bot is effectively stopped
    }
};

const startRentedBotLogic = async (rentedBotId) => {
    const botData = await get('SELECT * FROM rented_bots WHERE id = ?', [rentedBotId]);
    if (!botData) throw new Error('Bot tidak ditemukan.');

    if (botData.status === 'active' && botData.process_id) throw new Error('Bot ini sudah aktif.');
    if (new Date(botData.end_date) < new Date()) throw new Error('Masa sewa bot ini telah berakhir.');

    try {
        const rentedBotScriptPath = path.resolve(__dirname, '../../rentedBot.js');
        const dockerPrice = await getDockerRdpPrice();
        const dedicatedPrice = await getDedicatedRdpPrice();
        const mainAdminUsername = process.env.MAIN_ADMIN_USERNAME || 'masventot';

        const env = {
            BOT_TOKEN: botData.bot_token,
            ADMIN_ID: botData.admin_telegram_id,
            PAYMENT_API_KEY: botData.payment_api_key || '',
            RENTED_BOT_ID: rentedBotId,
            OWNER_USERNAME: botData.owner_username,
            DB_PATH: botData.db_path,
            BOT_NAME: botData.bot_name,
            MAIN_DB_PATH: path.resolve(__dirname, '../../src/rdp.db'),
            DOCKER_RDP_PRICE: dockerPrice,
            DEDICATED_RDP_PRICE: dedicatedPrice,
            MAIN_ADMIN_USERNAME: mainAdminUsername
        };

        const childProcess = spawn('node', [rentedBotScriptPath], {
            env: { ...process.env, ...env },
            detached: true,
            stdio: 'pipe'
        });

        childProcess.stdout.on('data', (data) => console.log(`[Rented Bot ${rentedBotId}]: ${data.toString().trim()}`));
        childProcess.stderr.on('data', (data) => console.error(`[Rented Bot ${rentedBotId} ERROR]: ${data.toString().trim()}`));
        childProcess.unref();

        await run('UPDATE rented_bots SET status = ?, process_id = ? WHERE id = ?', ['active', childProcess.pid, rentedBotId]);
        console.log(`[Admin] Started rented bot ${rentedBotId} (PID: ${childProcess.pid})`);
        return true;
    } catch (error) {
        console.error(`Error starting rented bot ID ${rentedBotId}:`, error);
        // Revert status if start fails
        await run('UPDATE rented_bots SET status = ? WHERE id = ?', ['stopped', rentedBotId]);
        throw error;
    }
};

const restartRentedBot = async (rentedBotId) => {
    try {
        await stopRentedBotLogic(rentedBotId);
        // Short delay to ensure the process is terminated before restarting
        await new Promise(resolve => setTimeout(resolve, 1000));
        await startRentedBotLogic(rentedBotId);
        return { success: true };
    } catch (error) {
        console.error(`[Admin] Failed to restart bot ${rentedBotId}:`, error.message);
        return { success: false, error: error.message };
    }
};

const handleRentBotMenu = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    bot.answerCallbackQuery(query.id);

    const message = `🤖 *Sewa Bot Telegram Anda Sendiri!*\n\n` +
        `Pilih durasi sewa bot Anda. Harga sewa adalah *Rp ${RENTAL_PRICE_PER_MONTH.toLocaleString('id-ID')}* per bulan.\n\n` +
        `*Fitur bot yang disewa:*\n` +
        `- Statistik Pengguna & Deposit Terpisah\n` +
        `- Tombol Deposit (Manual & Otomatis)\n` +
        `- Nama Bot & Username Owner Kustom\n\n` +
        `Pilih durasi sewa:`;

    const keyboard = {
        inline_keyboard: [
            [{ text: '1 Bulan (Rp 50.000)', callback_data: 'rent_bot_duration_1' }],
            [{ text: '2 Bulan (Rp 100.000)', callback_data: 'rent_bot_duration_2' }],
            [{ text: '3 Bulan (Rp 150.000)', callback_data: 'rent_bot_duration_3' }],
            [{ text: '📋 Bot Saya', callback_data: 'manage_rented_bots' }],
            [BUTTONS.BACK_TO_MENU]
        ]
    };

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleSelectDuration = async (bot, query, sessionManager) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const durationMonths = parseInt(query.data.split('_')[3]);
    bot.answerCallbackQuery(query.id);

    const totalPrice = durationMonths * RENTAL_PRICE_PER_MONTH;

    sessionManager.setUserSession(chatId, {
        awaiting: 'confirm_rent_payment',
        durationMonths,
        totalPrice,
        messageId
    });

    const message = `Anda memilih sewa bot selama *${durationMonths} bulan* dengan total harga *Rp ${totalPrice.toLocaleString('id-ID')}*.\n\n` +
        `Apakah Anda yakin ingin melanjutkan pembayaran? Saldo Anda akan dipotong.`;

    const keyboard = {
        inline_keyboard: [
            [{ text: `✅ Bayar Rp ${totalPrice.toLocaleString('id-ID')}✅`, callback_data: 'confirm_rent_payment' }],
            [BUTTONS.RENT_BOT]
        ]
    };

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleConfirmRentPayment = async (bot, query, sessionManager) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    bot.answerCallbackQuery(query.id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'confirm_rent_payment') {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Sesi pembayaran tidak valid. Silakan coba lagi.', { reply_markup: { inline_keyboard: [[BUTTONS.RENT_BOT]] } });
    }

    if (!isAdmin(userId)) {
        const deducted = await deductBalance(userId, session.totalPrice);
        if (!deducted) {
            sessionManager.clearUserSession(chatId);
            return safeMessageEditor.editMessage(bot, chatId, messageId, '❌ Saldo Anda tidak mencukupi.', { reply_markup: { inline_keyboard: [[BUTTONS.RENT_BOT]] } });
        }
    }

    sessionManager.setUserSession(chatId, { ...session, awaiting: 'bot_token_input' });

    const message = `✅  Pembayaran berhasil!\n\nSekarang, silakan masukkan *Bot Token* untuk bot yang ingin Anda sewa.\n\n*Contoh:*\n\
\
\
123456:ABC-DEF...\
\
\

`;
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batalkan', callback_data: 'cancel_rent_bot' }]] } });
};

const handleBotTokenInput = async (bot, msg, sessionManager) => {
    const chatId = msg.chat.id;
    deleteMsg(bot, chatId, msg.message_id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'bot_token_input') return;

    if (!msg.text.match(/^\d+:[a-zA-Z0-9_-]+$/)) {
        return bot.sendMessage(chatId, '❌ Format Bot Token tidak valid. Coba lagi.');
    }

    sessionManager.setUserSession(chatId, { ...session, awaiting: 'bot_name_input', botToken: msg.text.trim() });

    const message = `Token bot diterima. Sekarang, masukkan *nama untuk bot Anda*.`;
    await safeMessageEditor.editMessage(bot, chatId, session.messageId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batalkan', callback_data: 'cancel_rent_bot' }]] } });
};

const handleBotNameInput = async (bot, msg, sessionManager) => {
    const chatId = msg.chat.id;
    deleteMsg(bot, chatId, msg.message_id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'bot_name_input') return;

    sessionManager.setUserSession(chatId, { ...session, awaiting: 'admin_telegram_id_input', botName: msg.text.trim() });

    const message = `Nama bot: *${msg.text.trim()}*.\n\nSekarang, masukkan *ID Telegram* Anda untuk menjadi admin bot ini.\n\n*ID Anda saat ini:* \n\
\
\
${chatId}\
\
\

`;
    await safeMessageEditor.editMessage(bot, chatId, session.messageId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batalkan', callback_data: 'cancel_rent_bot' }]] } });
};

const handleAdminTelegramIdInput = async (bot, msg, sessionManager) => {
    const chatId = msg.chat.id;
    deleteMsg(bot, chatId, msg.message_id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'admin_telegram_id_input') return;

    if (!msg.text.match(/^\d+$/)) {
        return bot.sendMessage(chatId, '❌ ID Telegram tidak valid. Harap masukkan ID numerik.');
    }

    sessionManager.setUserSession(chatId, { ...session, awaiting: 'owner_username_input', adminTelegramId: msg.text.trim() });

    const message = `ID Admin: 

${msg.text.trim()}

Sekarang, masukkan *username Telegram Anda* (tanpa '@').`;
    await safeMessageEditor.editMessage(bot, chatId, session.messageId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Batalkan', callback_data: 'cancel_rent_bot' }]] } });
};

const handleOwnerUsernameInput = async (bot, msg, sessionManager) => {
    const chatId = msg.chat.id;
    deleteMsg(bot, chatId, msg.message_id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'owner_username_input') return;

    const ownerUsername = msg.text.trim().replace('@', '');
    sessionManager.setUserSession(chatId, { ...session, awaiting: 'payment_api_key_input', ownerUsername });

    const message = `Username owner: *${ownerUsername}*.\n\nTerakhir, masukkan *API Key* pembayaran (opsional). Lewati jika deposit ditangani manual.`;
    const keyboard = {
        inline_keyboard: [
            [{ text: '➡️ Lewati (Deposit Manual)', callback_data: 'skip_payment_api_key' }],
            [{ text: '❌ Batalkan', callback_data: 'cancel_rent_bot' }]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, session.messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handlePaymentApiKeyInput = async (bot, msg, sessionManager) => {
    const chatId = msg.chat.id;
    deleteMsg(bot, chatId, msg.message_id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'payment_api_key_input') return;

    sessionManager.clearUserSession(chatId);
    await provisionBot(bot, chatId, session.messageId, { ...session, paymentApiKey: msg.text.trim(), userId: chatId });
};

const handleSkipPaymentApiKey = async (bot, query, sessionManager) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    bot.answerCallbackQuery(query.id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'payment_api_key_input') {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Sesi tidak valid.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'rent_bot_menu' }]] } });
    }

    sessionManager.clearUserSession(chatId);
    await provisionBot(bot, chatId, messageId, { ...session, paymentApiKey: null, userId: chatId });
};

const provisionBot = async (bot, chatId, messageId, botDetails) => {
    const { userId, botToken, botName, adminTelegramId, ownerUsername, paymentApiKey, durationMonths } = botDetails;

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + durationMonths);

    try {
        const initialResult = await run(
            'INSERT INTO rented_bots (user_id, bot_token, bot_name, owner_username, admin_telegram_id, payment_api_key, rental_duration_months, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, botToken, botName, ownerUsername, adminTelegramId, paymentApiKey, durationMonths, startDate.toISOString(), endDate.toISOString(), 'pending']
        );
        const rentedBotId = initialResult.id;

        const dbPath = path.resolve(__dirname, `../../rented_bot_${rentedBotId}.db`);
        await initializeRentedBotDatabase(dbPath);

        await run('UPDATE rented_bots SET db_path = ? WHERE id = ?', [dbPath, rentedBotId]);

        await startRentedBotLogic(rentedBotId);

        const successMessage = `🎉 *Bot Anda Berhasil Disewa!*\n\n` +
            `Bot Anda (*${botName}*) telah berhasil disewa selama *${durationMonths} bulan*.\n\n` +
            `Bot Anda sedang diaktifkan. Coba kirim /start ke bot Anda.`;
        
        await safeMessageEditor.editMessage(bot, chatId, messageId, successMessage, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '📋 Bot Saya', callback_data: 'manage_rented_bots' }]] }
        });

    } catch (error) {
        console.error('Error provisioning bot:', error);
        const errorMessage = `❌ *Gagal Menyewa Bot!*\n\nTerjadi kesalahan: ${error.message}`;
        await safeMessageEditor.editMessage(bot, chatId, messageId, errorMessage, { parse_mode: 'Markdown' });
    }
};

const handleCancelRentBot = async (bot, query, sessionManager) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    bot.answerCallbackQuery(query.id);
    sessionManager.clearUserSession(chatId);
    await safeMessageEditor.editMessage(bot, chatId, messageId, '❌ Proses sewa bot dibatalkan.', { reply_markup: { inline_keyboard: [[BUTTONS.BACK_TO_MENU]] } });
};

const handleManageRentedBots = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    bot.answerCallbackQuery(query.id);

    const rentedBots = await all('SELECT * FROM rented_bots WHERE user_id = ?', [userId]);

    let message = `📋 *Daftar Bot Sewaan Anda:*\n\n`;
    const keyboard = { inline_keyboard: [] };

    if (rentedBots.length === 0) {
        message += 'Anda belum menyewa bot apapun.';
        keyboard.inline_keyboard.push([{ text: '🤖 Sewa Bot Baru', callback_data: 'rent_bot_menu' }]);
    } else {
        for (const botData of rentedBots) {
            const endDate = new Date(botData.end_date);
            let statusText;
            switch(botData.status) {
                case 'active': statusText = '🟢 Aktif'; break;
                case 'expired': statusText = '🔴 Kadaluarsa'; break;
                case 'stopped': statusText = '🟡 Dihentikan'; break;
                case 'suspended': statusText = '🚫 Ditangguhkan'; break;
                default: statusText = `🟡 ${botData.status}`;
            }
            const botName = botData.bot_name || `Bot (ID: ${botData.id})`;

            message += `*${botName}* - ${statusText}\n`;
            message += `  Berakhir: ${endDate.toLocaleDateString('id-ID')}\n`;

            const botActions = [
                { text: 'ℹ️ Detail', callback_data: `view_rented_bot_details_${botData.id}` },
                { text: '🔄 Perpanjang', callback_data: `renew_rented_bot_${botData.id}` }
            ];
            keyboard.inline_keyboard.push(botActions);
        }
    }
    keyboard.inline_keyboard.push([BUTTONS.BACK_TO_MENU]);

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleDeleteRentedBot = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const rentedBotId = parseInt(query.data.split('_')[3]);
    bot.answerCallbackQuery(query.id);

    const botData = await get('SELECT * FROM rented_bots WHERE id = ?', [rentedBotId]);
    if (!botData) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Bot tidak ditemukan.', { reply_markup: { inline_keyboard: [[BUTTONS.MANAGE_RENTED_BOTS]] } });
    }

    const confirmationMessage = `❓ *Anda yakin ingin menghapus bot ini?*\n\n` +
        `Nama Bot: ${botData.bot_name || 'N/A'}\n\n` +
        `**Tindakan ini tidak dapat diurungkan.** Proses bot akan dihentikan dan file database-nya akan dihapus permanen.`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '⚠️ Ya, Hapus Permanen', callback_data: `confirm_delete_rented_bot_${rentedBotId}` },
                BUTTONS.CANCEL_TO_MANAGE_RENTED_BOTS
            ]
        ]
    };

    await safeMessageEditor.editMessage(bot, chatId, messageId, confirmationMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleConfirmDeleteRentedBot = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const rentedBotId = parseInt(query.data.split('_')[4]);
    bot.answerCallbackQuery(query.id);

    const botData = await get('SELECT * FROM rented_bots WHERE id = ?', [rentedBotId]);
    if (!botData) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Bot sudah dihapus.', { reply_markup: { inline_keyboard: [[BUTTONS.MANAGE_RENTED_BOTS]] } });
    }

    if (botData.process_id) {
        try { process.kill(botData.process_id, 'SIGTERM'); } catch (e) {}
    }

    if (botData.db_path) {
        const fs = require('fs').promises;
        try { await fs.unlink(botData.db_path); } catch (e) {}
    }

    await run('DELETE FROM rented_bots WHERE id = ?', [rentedBotId]);
    await bot.answerCallbackQuery(query.id, { text: '✅ Bot berhasil dihapus.', show_alert: true });

    const updatedQuery = { ...query, data: 'manage_rented_bots' };
    await handleManageRentedBots(bot, updatedQuery);
};

const handleViewRentedBotDetails = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const rentedBotId = parseInt(query.data.split('_')[4]);
    const userId = query.from.id;
    bot.answerCallbackQuery(query.id);

    const botData = isAdmin(userId)
        ? await get('SELECT * FROM rented_bots WHERE id = ?', [rentedBotId])
        : await get('SELECT * FROM rented_bots WHERE id = ? AND user_id = ?', [rentedBotId, userId]);

    if (!botData) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Bot tidak ditemukan.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'manage_rented_bots' }]] } });
    }

    const endDate = new Date(botData.end_date);
    let statusText;
    switch(botData.status) {
        case 'active': statusText = '🟢 Aktif'; break;
        case 'expired': statusText = '🔴 Kadaluarsa'; break;
        case 'stopped': statusText = '🟡 Dihentikan'; break;
        case 'suspended': statusText = '🚫 Ditangguhkan'; break;
        default: statusText = `🟡 ${botData.status}`;
    }

    const message = `*Detail Bot Anda:*\n\n` +
        `- Nama Bot: *${botData.bot_name || 'N/A'}*\n` +
        `- Token Bot: \n\
\
\
${botData.bot_token}\
\
\
` +
        `- Admin ID: \n\
\
\
${botData.admin_telegram_id}\
\
\
` +
        `- Username Owner: @${botData.owner_username || 'N/A'}\n` +
        `- API Key: ${botData.payment_api_key || 'Manual'}\n` +
        `- Berakhir: ${endDate.toLocaleDateString('id-ID')}\n` +
        `- Status: ${statusText}\n` +
        `- PID: ${botData.process_id || 'N/A'}`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '🔄 Perpanjang', callback_data: `renew_rented_bot_${botData.id}` },
                botData.status === 'active'
                    ? { text: '🛑 Hentikan Bot', callback_data: `stop_rented_bot_${botData.id}` }
                    : { text: '▶️ Mulai Bot', callback_data: `start_rented_bot_${botData.id}` }
            ],
            [{ text: '🗑️ Hapus Bot', callback_data: `delete_rented_bot_${botData.id}` }],
            [isAdmin(query.from.id) ? BUTTONS.BACK_TO_ADMIN_MANAGE_RENTED_BOTS : BUTTONS.BACK_TO_MANAGE_RENTED_BOTS]
        ]
    };

    if (isAdmin(userId) && botData.owner_username) {
        keyboard.inline_keyboard.unshift([{ text: '📞 Hubungi Owner', url: `https://t.me/${botData.owner_username}` }]);
    }

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleRenewRentedBot = async (bot, query, sessionManager) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const rentedBotId = parseInt(query.data.split('_')[3]);
    const userId = query.from.id;
    bot.answerCallbackQuery(query.id);

    const botData = await get('SELECT * FROM rented_bots WHERE id = ? AND user_id = ?', [rentedBotId, userId]);
    if (!botData) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Bot tidak ditemukan.', { reply_markup: { inline_keyboard: [[BUTTONS.BACK_TO_MANAGE_RENTED_BOTS]] } });
    }

    sessionManager.setUserSession(chatId, {
        awaiting: 'confirm_renew_payment',
        rentedBotId,
        renewalPrice: RENTAL_PRICE_PER_MONTH,
        messageId
    });

    const message = `Anda akan memperpanjang sewa bot *${botData.bot_name || 'Bot Anda'}* selama *1 bulan* dengan harga *Rp ${RENTAL_PRICE_PER_MONTH.toLocaleString('id-ID')}*.\n\n` +
        `Apakah Anda yakin ingin melanjutkan?`;

    const keyboard = {
        inline_keyboard: [
            [{ text: `✅ Bayar Rp ${RENTAL_PRICE_PER_MONTH.toLocaleString('id-ID')}✅`, callback_data: `confirm_renew_payment_${rentedBotId}` }],
            [{ text: '🔙 Kembali', callback_data: `view_rented_bot_details_${rentedBotId}` }]
        ]
    };

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleConfirmRenewPayment = async (bot, query, sessionManager) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    const rentedBotId = parseInt(query.data.split('_')[3]);
    bot.answerCallbackQuery(query.id);

    const session = sessionManager.getUserSession(chatId);
    if (!session || session.awaiting !== 'confirm_renew_payment' || session.rentedBotId !== rentedBotId) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Sesi pembayaran tidak valid.', { reply_markup: { inline_keyboard: [[BUTTONS.BACK_TO_MANAGE_RENTED_BOTS]] } });
    }

    if (!isAdmin(userId)) {
        const deducted = await deductBalance(userId, session.renewalPrice);
        if (!deducted) {
            sessionManager.clearUserSession(chatId);
            return safeMessageEditor.editMessage(bot, chatId, messageId, '❌ Saldo Anda tidak mencukupi.', { reply_markup: { inline_keyboard: [[BUTTONS.BACK_TO_MANAGE_RENTED_BOTS]] } });
        }
    }

    const botData = await get('SELECT * FROM rented_bots WHERE id = ?', [rentedBotId]);
    if (!botData) {
        sessionManager.clearUserSession(chatId);
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Bot tidak ditemukan.', { reply_markup: { inline_keyboard: [[BUTTONS.BACK_TO_MANAGE_RENTED_BOTS]] } });
    }

    const currentEndDate = new Date(botData.end_date);
    const newEndDate = new Date(currentEndDate);
    newEndDate.setMonth(newEndDate.getMonth() + 1);

    await run('UPDATE rented_bots SET end_date = ?, status = ? WHERE id = ?', [newEndDate.toISOString(), 'active', rentedBotId]);
    sessionManager.clearUserSession(chatId);

    await safeMessageEditor.editMessage(bot, chatId, messageId,
        `✅ Bot *${botData.bot_name || 'Bot Anda'}* berhasil diperpanjang hingga ${newEndDate.toLocaleDateString('id-ID')}! `,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📋 Bot Saya', callback_data: 'manage_rented_bots' }]] } });
};

const handleStopRentedBot = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const rentedBotId = parseInt(query.data.split('_')[3]);
    bot.answerCallbackQuery(query.id);

    try {
        await stopRentedBotLogic(rentedBotId);
        await safeMessageEditor.editMessage(bot, chatId, messageId,
            `✅ Bot berhasil dihentikan.`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[BUTTONS.MANAGE_RENTED_BOTS]] } });
    } catch (error) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
            `❌ Gagal menghentikan bot: ${error.message}`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[BUTTONS.MANAGE_RENTED_BOTS]] } });
    }
};

const handleStartRentedBot = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const rentedBotId = parseInt(query.data.split('_')[3]);
    bot.answerCallbackQuery(query.id);

    try {
        await startRentedBotLogic(rentedBotId);
        await safeMessageEditor.editMessage(bot, chatId, messageId,
            `✅ Bot berhasil dimulai.`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[BUTTONS.MANAGE_RENTED_BOTS]] } });
    } catch (error) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
            `❌ Gagal memulai bot: ${error.message}`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[BUTTONS.MANAGE_RENTED_BOTS]] } });
    }
};

module.exports = {
    handleRentBotMenu,
    handleSelectDuration,
    handleConfirmRentPayment,
    handleBotTokenInput,
    handleBotNameInput,
    handleAdminTelegramIdInput,
    handleOwnerUsernameInput,
    handlePaymentApiKeyInput,
    handleSkipPaymentApiKey,
    handleCancelRentBot,
    handleManageRentedBots,
    handleViewRentedBotDetails,
    handleRenewRentedBot,
    handleConfirmRenewPayment,
    handleStopRentedBot,
    handleStartRentedBot,
    handleDeleteRentedBot,
    handleConfirmDeleteRentedBot,
    restartRentedBot
};