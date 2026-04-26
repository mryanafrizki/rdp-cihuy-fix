const UsersDB = require('../utils/usersDb');
const AccountsDB = require('../utils/db');
const { editOrReply, getOrCreateMessageId } = require('../utils/editOrReply');

async function ownerStats(ctx) {
  const messageId = ctx.callbackQuery?.message?.message_id;
  
  try {
    const usersDb = new UsersDB();
    const allUsers = await usersDb.getAllUsers();

    // Get all accounts from MongoDB
    let totalAccounts = 0;
    const userStats = [];

    for (const user of allUsers) {
      const accountsDb = new AccountsDB(user.userId);
      const accounts = await accountsDb.all();
      const accountCount = accounts.length;

      totalAccounts += accountCount;
      userStats.push({
        userId: user.userId,
        username: user.username || 'N/A',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        registeredAt: user.registeredAt,
        lastActive: user.lastActive,
        accountCount: accountCount
      });
    }

    // Sort by registered date (oldest first)
    userStats.sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));

    // Build message
    let message = `📊 <b>Statistik Bot</b>\n\n`;
    message += `👥 <b>Total User:</b> ${allUsers.length}\n`;
    message += `🔑 <b>Total Akun DO:</b> ${totalAccounts}\n`;
    message += `📅 <b>Bot dibuat:</b> ${userStats.length > 0 ? formatDate(userStats[0].registeredAt) : 'N/A'}\n\n`;

    message += `<b>📋 Detail per User:</b>\n`;
    message += `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n`;

    userStats.forEach((user, index) => {
      const displayName = user.username ? `@${user.username}` : `${user.firstName} ${user.lastName}`.trim() || `User ${user.userId}`;
      message += `${index + 1}. <b>${displayName}</b>\n`;
      message += `   ID: <code>${user.userId}</code>\n`;
      message += `   Akun DO: <b>${user.accountCount}</b>\n`;
      message += `   Terdaftar: ${formatDate(user.registeredAt)}\n`;
      message += `   Aktif terakhir: ${formatDate(user.lastActive)}\n\n`;
    });

    const buttons = [
      [require('telegraf').Markup.button.callback('🔄 Refresh', 'owner_stats')]
    ];

    return editOrReply(ctx, messageId, message, {
      parse_mode: 'HTML',
      reply_markup: require('telegraf').Markup.inlineKeyboard(buttons).reply_markup
    });
  } catch (error) {
    console.error('[ownerStats] Error:', error);
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

module.exports = { ownerStats };

