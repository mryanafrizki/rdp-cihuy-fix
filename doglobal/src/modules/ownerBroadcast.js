const UsersDB = require('../utils/usersDb');

let broadcastInProgress = false;
const broadcastQueue = [];

async function ownerBroadcast(ctx) {
  // Check if there's already a broadcast in progress
  if (broadcastInProgress) {
    return ctx.reply('⚠️ Sedang ada broadcast yang berlangsung. Silakan tunggu selesai.');
  }

  // Check if message is provided
  if (!ctx.message || !ctx.message.text) {
    return ctx.reply(
      `📢 <b>Broadcast ke Semua User</b>\n\n` +
      `Balas pesan ini dengan pesan yang ingin di-broadcast.\n\n` +
      `Contoh:\n` +
      `<code>/broadcast Ini adalah pesan broadcast</code>`,
      { parse_mode: 'HTML' }
    );
  }

  // Extract broadcast message
  const messageText = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
  
  if (!messageText) {
    return ctx.reply('❌ Pesan broadcast tidak boleh kosong!');
  }

  broadcastInProgress = true;
  const statusMsg = await ctx.reply('📢 Memulai broadcast...');

  try {
    const usersDb = new UsersDB();
    const allUsers = await usersDb.getAllUsers();
    const allUserIds = allUsers.map(u => u.userId);

    if (allUserIds.length === 0) {
      broadcastInProgress = false;
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        '⚠️ Tidak ada user yang terdaftar untuk di-broadcast.',
        { parse_mode: 'HTML' }
      );
    }

    let successCount = 0;
    let failedCount = 0;
    const failedUsers = [];

    // Send broadcast message
    const broadcastMessage = `📢 <b>Broadcast dari Owner</b>\n\n${messageText}`;

    for (const userId of allUserIds) {
      try {
        await ctx.telegram.sendMessage(userId, broadcastMessage, {
          parse_mode: 'HTML'
        });
        successCount++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failedCount++;
        failedUsers.push(userId);
        console.error(`[broadcast] Failed to send to user ${userId}:`, error.message);
      }
    }

    // Update status message
    let resultText = `📊 <b>Hasil Broadcast</b>\n\n`;
    resultText += `✅ Berhasil: <b>${successCount}</b> user\n`;
    resultText += `❌ Gagal: <b>${failedCount}</b> user\n`;
    resultText += `📤 Total: <b>${allUserIds.length}</b> user\n\n`;

    if (failedUsers.length > 0 && failedUsers.length <= 10) {
      resultText += `<b>User yang gagal:</b>\n`;
      failedUsers.forEach(userId => {
        resultText += `<code>${userId}</code>\n`;
      });
    } else if (failedUsers.length > 10) {
      resultText += `<b>User yang gagal:</b> ${failedUsers.length} user (terlalu banyak untuk ditampilkan)\n`;
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      resultText,
      { parse_mode: 'HTML' }
    );

    broadcastInProgress = false;
  } catch (error) {
    broadcastInProgress = false;
    console.error('[broadcast] Error:', error);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      `⚠️ Kesalahan saat broadcast: <code>${error.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = { ownerBroadcast };

