require('dotenv').config();

async function sendAdminNotification(bot, message, options = {}) {
  const adminId = process.env.ADMIN_ID;
  if (!adminId) {
    console.error('Admin ID not configured');
    return;
  }

  try {
    await bot.sendMessage(adminId, message, {
      parse_mode: 'Markdown',
      ...options
    });
  } catch (error) {
    console.error('Failed to send admin notification:', error);
  }
}

function createDepositNotification(userId, amount, newBalance) {
  return `💰 *New Deposit*\n\n` +
         `👤 User ID: \`${userId}\`\n` +
         `💵 Amount: Rp ${amount.toLocaleString()}\n` +
         `💳 New Balance: Rp ${newBalance.toLocaleString()}\n` +
         `⏰ Time: ${new Date().toLocaleString('id-ID')}`;
}

module.exports = {
  sendAdminNotification,
  createDepositNotification
};