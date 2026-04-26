const User = require('../utils/userManager');
const { run, get } = require('../config/database');
const { sendAdminNotification } = require('../utils/adminNotifications');
const { isAdmin } = require('../utils/userManager');

const handleWithdrawalRequest = async (bot, msg, amount) => {
    const userId = msg.from.id;
    const user = await User.getUser(userId);
    const commissionBalance = user.commission_balance || 0;

    if (amount < 5000) {
        return { success: false, message: '❌ Penarikan minimal adalah Rp 5.000.' };
    }

    if (!isAdmin(userId) && amount > commissionBalance) {
        return { success: false, message: '❌ Saldo komisi Anda tidak mencukupi.' };
    }

    const withdrawalDetails = user.bank_details;

    // Create withdrawal record
    const { id: withdrawalId } = await run(
        'INSERT INTO withdrawals (user_id, amount, details) VALUES (?, ?, ?)',
        [userId, amount, withdrawalDetails]
    );

    // Deduct commission balance
    if (!isAdmin(userId)) {
        await run('UPDATE users SET commission_balance = commission_balance - ? WHERE telegram_id = ?', [amount, userId]);
    }

    // Notify admin
    const adminMessage = `
    💸 *Permintaan Penarikan Baru*

    *User:* ${msg.from.first_name} (ID: ${userId})
    *Jumlah:* Rp ${amount.toLocaleString('id-ID')}
    *Rekening:* ${withdrawalDetails}
    `;
    const adminKeyboard = {
        inline_keyboard: [
            [
                { text: '✅ Setujui', callback_data: `approve_withdrawal_${withdrawalId}` },
                { text: '❌ Tolak', callback_data: `reject_withdrawal_${withdrawalId}` }
            ]
        ]
    };
    await sendAdminNotification(bot, adminMessage, { reply_markup: adminKeyboard });

    return { success: true, message: '✅ Permintaan penarikan Anda telah diajukan dan akan segera diproses oleh admin.' };
};

module.exports = { handleWithdrawalRequest };
