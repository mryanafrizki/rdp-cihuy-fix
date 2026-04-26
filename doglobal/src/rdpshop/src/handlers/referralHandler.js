const User = require('../utils/userManager');
const { run, get, all } = require('../config/database');
const { adminNotifications } = require('../utils/adminNotifications');
const { BUTTONS } = require('../config/buttons');
const safeMessageEditor = require('../utils/safeMessageEdit');
const { nanoid } = require('nanoid');

const handleReferralCommand = async (bot, msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    await showReferralMenu(bot, userId, chatId);
};

const handleReferralMenu = async (bot, query) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    await showReferralMenu(bot, userId, chatId, messageId);
};

const showReferralMenu = async (bot, userId, chatId, messageId = null, notification = null) => {

    let user = await User.getUser(userId);

    // Generate referral code if it doesn't exist
    if (!user.referral_code) {
        const referralCode = nanoid(10);
        await run('UPDATE users SET referral_code = ? WHERE telegram_id = ?', [referralCode, userId]);
        user = await User.getUser(userId); // Refresh user data
    }

    const botInfo = await bot.getMe();
    const referralLink = `https://t.me/${botInfo.username}?start=${user.referral_code}`;

    const commissionBalance = user.commission_balance || 0;

    let message = '';
    if (notification) {
        message += `${notification}\n\n`;
    }

    message += `🔗 *Menu Referral Anda*\n\n` +
    `🤝 Undang teman Anda untuk menggunakan bot ini dan dapatkan komisi 10% dari setiap pembelian mereka!\n\n` +
    `*🔗 Link Referral Anda:*
` +
    `\
${referralLink}\

` +
    `*💰 Saldo Komisi Anda:*
` +
    `Rp ${commissionBalance.toLocaleString('id-ID')}\n\n` +
    `👇 Gunakan tombol di bawah untuk mengelola akun referral Anda.`;


    const keyboard = {
        inline_keyboard: [
            [BUTTONS.ADD_EDIT_BANK_ACCOUNT, BUTTONS.WITHDRAW_COMMISSION],
            [BUTTONS.MY_REFERRALS, BUTTONS.BACK_TO_MENU]
        ]
    };

    if (messageId) {
        await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
};

const handleAddBankAccount = async (bot, query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    bot.answerCallbackQuery(query.id);
    const message = '💳 Silakan masukkan detail rekening bank atau e-wallet Anda.\n\nContoh:\n🏦 `BCA 1234567890 a/n John Doe`\n📱 `DANA 081234567890`';
    const keyboard = {
        inline_keyboard: [
            [BUTTONS.REFERRAL]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleWithdrawCommission = async (bot, query) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const user = await User.getUser(userId);
    bot.answerCallbackQuery(query.id);

    if (!user.bank_details) {
        const message = '⚠️ Anda harus menambahkan rekening bank/e-wallet terlebih dahulu.';
        const keyboard = {
            inline_keyboard: [
                [BUTTONS.ADD_EDIT_BANK_ACCOUNT],
                [BUTTONS.REFERRAL]
            ]
        };
        return safeMessageEditor.editMessage(bot, chatId, messageId, message, { reply_markup: keyboard });
    }

    const commissionBalance = user.commission_balance || 0;
    const message = `💸 Saldo komisi Anda: *Rp ${commissionBalance.toLocaleString('id-ID')}*.\n\n✍️ Masukkan jumlah yang ingin Anda tarik (minimal Rp 5.000):`;
    const keyboard = {
        inline_keyboard: [
            [BUTTONS.REFERRAL]
        ]
    };
    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
};

const handleMyReferrals = async (bot, query, page = 1) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const REFERRALS_PER_PAGE = 10;

    bot.answerCallbackQuery(query.id);

    // Get total number of referrals
    const totalReferrals = await get('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?', [userId]);
    const total = totalReferrals.count;
    const totalPages = Math.ceil(total / REFERRALS_PER_PAGE);

    // Get referrals for the current page
    const offset = (page - 1) * REFERRALS_PER_PAGE;
    const referrals = await all('SELECT referee_id FROM referrals WHERE referrer_id = ? LIMIT ? OFFSET ?', [userId, REFERRALS_PER_PAGE, offset]);

    let message = `👥 *Pengguna yang Anda Referensikan (Halaman ${page}/${totalPages}):*\n\n`;

    if (referrals.length === 0) {
        message += 'Anda belum memiliki referral.';
    } else {
        const userPromises = referrals.map(ref => get('SELECT telegram_id, created_at FROM users WHERE telegram_id = ?', [ref.referee_id]));
        const referredUsers = await Promise.all(userPromises);

        const userDetails = await Promise.all(referredUsers.map(async (user) => {
            if (!user) return '- Pengguna tidak ditemukan';
            try {
                const chat = await bot.getChat(user.telegram_id);
                const date = new Date(user.created_at).toLocaleDateString('id-ID');
                return `- ${chat.first_name || 'Pengguna'} (Bergabung: ${date})`;
            } catch (error) {
                console.error(`Could not get chat for user ${user.telegram_id}:`, error);
                return `- Pengguna (ID: ${user.telegram_id})`;
            }
        }));

        message += userDetails.join('\n');
    }

    // Pagination keyboard
    const keyboard = [];
    const row = [];
    if (page > 1) {
        row.push({ text: '⬅️ Sebelumnya', callback_data: `my_referrals_${page - 1}` });
    }
    if (page < totalPages) {
        row.push({ text: 'Berikutnya ➡️', callback_data: `my_referrals_${page + 1}` });
    }
    if (row.length > 0) {
        keyboard.push(row);
    }
    keyboard.push([BUTTONS.REFERRAL]);

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
};



const handleApproveWithdrawal = async (bot, query) => {
    bot.answerCallbackQuery(query.id, { text: 'Menyetujui penarikan...' });
    const withdrawalId = query.data.split('_')[2];
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    
    const withdrawal = await get('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId]);
    if (!withdrawal || withdrawal.status !== 'pending') {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Penarikan ini sudah diproses atau tidak valid.');
    }

    await run('UPDATE withdrawals SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?', ['approved', withdrawalId]);

    // Notify user
    try {
        await bot.sendMessage(withdrawal.user_id, `✅ Selamat! Penarikan Anda sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} telah disetujui dan diproses.`);
    } catch (error) {
        console.error("Failed to send withdrawal approval message to user:", error);
    }

    await safeMessageEditor.editMessage(bot, chatId, messageId, `✅ Penarikan untuk user ${withdrawal.user_id} sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} telah disetujui.`);
};

const handleRejectWithdrawal = async (bot, query) => {
    bot.answerCallbackQuery(query.id, { text: 'Menolak penarikan...' });
    const withdrawalId = query.data.split('_')[2];
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const withdrawal = await get('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId]);
    if (!withdrawal || withdrawal.status !== 'pending') {
        return safeMessageEditor.editMessage(bot, chatId, messageId, 'Penarikan ini sudah diproses atau tidak valid.');
    }

    // Update withdrawal status
    await run('UPDATE withdrawals SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?', ['rejected', withdrawalId]);

    // Refund commission balance
    await run('UPDATE users SET commission_balance = commission_balance + ? WHERE telegram_id = ?', [withdrawal.amount, withdrawal.user_id]);

    // Notify user
    try {
        await bot.sendMessage(withdrawal.user_id, `❌ Mohon maaf, penarikan Anda sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} ditolak. Saldo komisi telah dikembalikan.`);
    } catch (error) {
        console.error("Failed to send withdrawal rejection message to user:", error);
    }

    await safeMessageEditor.editMessage(bot, chatId, messageId, `❌ Penarikan untuk user ${withdrawal.user_id} sebesar Rp ${withdrawal.amount.toLocaleString('id-ID')} telah ditolak dan saldo dikembalikan.`);
};


const setupReferralCommands = (bot, sessionManager) => {
    bot.onText(/\/referral/, (msg) => handleReferralCommand(bot, msg));
};

module.exports = {
    setupReferralCommands,
    handleReferralMenu,
    showReferralMenu,
    handleAddBankAccount,
    handleWithdrawCommission,
    handleMyReferrals,
    handleApproveWithdrawal,
    handleRejectWithdrawal
};