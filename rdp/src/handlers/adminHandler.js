const { addBalance } = require('../utils/userManager');
const { getAllUsers } = require('../utils/userManager');
const { sendAdminNotification } = require('../utils/adminNotifications');
const axios = require('axios');
const qs = require('qs');
const { BUTTONS } = require('../config/buttons');
const rdpPriceManager = require('../utils/rdpPriceManager');

async function handleAddBalance(bot, chatId, messageId) {
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const prices = rdpPriceManager.getRdpPrices();
  const pricePerQuota = prices.pricePerQuota || 3000;
  
  let menuText;
  if (quotaMode) {
    menuText = 
      `➕ *Tambah Kuota User*\n\n` +
      `Masukkan ID pengguna dan jumlah kuota yang akan ditambahkan dalam format:\n\n` +
      `\`<user_id> <jumlah_kuota>\`\n\n` +
      `Contoh: \`123456789 5\` (untuk menambahkan 5 kuota)\n\n` +
      `💎 Harga Per Kuota: Rp ${pricePerQuota.toLocaleString('id-ID')}`;
  } else {
    menuText = 
      `➕ *Tambah Saldo User*\n\n` +
      `Masukkan ID pengguna dan jumlah saldo yang akan ditambahkan dalam format:\n\n` +
      `\`<user_id> <jumlah>\`\n\n` +
      `Contoh: \`123456789 50000\` (untuk menambahkan Rp 50.000)`;
  }
  
  await bot.editMessageText(menuText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '« Kembali', callback_data: 'back_to_menu' }]]
    }
  });
  // Return messageId for session management
  return messageId;
}

async function processAddBalance(bot, msg) {
  // Gunakan msg.from.id untuk memastikan pesan dikirim ke admin yang benar
  const adminChatId = msg.from?.id || msg.chat?.id;
  
  const parts = msg.text.split(' ');
  if (parts.length !== 2) {
    const quotaMode = rdpPriceManager.isQuotaModeEnabled();
    const errorMsg = quotaMode 
      ? '❌ Format tidak valid. Gunakan format: `<user_id> <jumlah_kuota>`'
      : '❌ Format tidak valid. Gunakan format: `<user_id> <jumlah>`';
    await bot.sendMessage(errorMsg, {
      chat_id: adminChatId,
      parse_mode: 'Markdown'
    });
    return;
  }

  const userId = parseInt(parts[0]);
  const inputValue = parseInt(parts[1]);

  if (isNaN(userId) || isNaN(inputValue) || inputValue <= 0) {
    await bot.sendMessage('❌ ID pengguna atau jumlah tidak valid', {
      chat_id: adminChatId,
      parse_mode: 'Markdown'
    });
    return;
  }

  // Get quota mode and convert input to amount
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const prices = rdpPriceManager.getRdpPrices();
  const pricePerQuota = prices.pricePerQuota || 3000;
  
  let amount;
  let inputDisplay;
  if (quotaMode) {
    // Input is kuota, convert to rupiah
    amount = inputValue * pricePerQuota;
    inputDisplay = `${inputValue} kuota (Rp ${amount.toLocaleString('id-ID')})`;
  } else {
    // Input is rupiah
    amount = inputValue;
    inputDisplay = `Rp ${amount.toLocaleString('id-ID')}`;
  }

  try {
    const { getBalance } = require('../utils/userManager');
    const currentBalance = await getBalance(userId);
    
    // Check if user is admin with unlimited balance
    if (typeof currentBalance === 'string' && currentBalance === 'Unlimited') {
      const balanceLabel = quotaMode ? 'Kuota' : 'Saldo';
      await bot.sendMessage(
        `⚠️ User adalah admin dengan ${balanceLabel.toLowerCase()} unlimited.\n\n` +
        `👤 User ID: \`${userId}\`\n` +
        `💰 Jumlah yang akan ditambahkan: ${inputDisplay}\n` +
        `💳 ${balanceLabel} Saat Ini: ${currentBalance}`,
        {
          chat_id: adminChatId,
          parse_mode: 'Markdown'
        }
      );
      return;
    }
    
    const newBalance = await addBalance(userId, amount);
    
    const balanceLabel = quotaMode ? 'Kuota' : 'Saldo';
    const currentBalanceDisplay = quotaMode 
      ? `${Math.floor(currentBalance / pricePerQuota)} kuota (Rp ${currentBalance.toLocaleString('id-ID')})`
      : `Rp ${currentBalance.toLocaleString('id-ID')}`;
    const newBalanceDisplay = quotaMode
      ? `${Math.floor(newBalance / pricePerQuota)} kuota (Rp ${newBalance.toLocaleString('id-ID')})`
      : `Rp ${newBalance.toLocaleString('id-ID')}`;
    
    await bot.sendMessage(
      `✅ Berhasil menambahkan ${balanceLabel.toLowerCase()}:\n\n` +
      `👤 User ID: \`${userId}\`\n` +
      `💰 Jumlah: ${inputDisplay}\n` +
      `💳 ${balanceLabel} Lama: ${currentBalanceDisplay}\n` +
      `💳 ${balanceLabel} Baru: ${newBalanceDisplay}`,
      {
        chat_id: adminChatId,
        parse_mode: 'Markdown'
      }
    );
	try {
            await bot.sendMessage(userId, `🎉 Anda menerima ${balanceLabel.toLowerCase()}\n sebesar *${inputDisplay}* dari Owner.\n\nSaldo Anda sekarang adalah *${newBalanceDisplay}*`, { parse_mode: 'Markdown' });
        } catch (e) {
            console.warn(`Gagal mengirim notifikasi tambah ${balanceLabel.toLowerCase()} ke user ${userId}:`, e.message);
        }
  } catch (error) {
    console.error('Error adding balance:', error);
    const adminChatId = msg.from?.id || msg.chat?.id;
    const balanceLabel = quotaMode ? 'kuota' : 'saldo';
    await bot.sendMessage(`❌ Gagal menambahkan ${balanceLabel}. User ID tidak ditemukan.`, {
      chat_id: adminChatId,
      parse_mode: 'Markdown'
    });
  }
}

async function handleBroadcast(bot, chatId, messageId) {
  await bot.editMessageText(
    '📢 *Broadcast Message*\n\n' +
    'Kirim pesan yang ingin di-broadcast ke semua pengguna.\n' +
    '_Pesan akan dikirim dengan format Markdown_',
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '« Kembali', callback_data: 'back_to_menu' }]]
      }
    }
  );
}

async function processBroadcast(bot, msg) {
  try {
    const users = await getAllUsers();
    let successCount = 0;
    let failCount = 0;

    await bot.sendMessage(msg.chat.id, '📤 Memulai broadcast...');

    for (const user of users) {
      try {
        await bot.sendMessage(user.telegram_id, msg.text, {
          parse_mode: 'Markdown'
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to send broadcast to ${user.telegram_id}:`, error);
        failCount++;
      }
      
      // Add small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await bot.sendMessage(msg.chat.id,
      `✅ *Broadcast Selesai*\n\n` +
      `📨 Terkirim: ${successCount}\n` +
      `❌ Gagal: ${failCount}\n` +
      `📊 Total: ${users.length}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Broadcast error:', error);
    await bot.sendMessage(msg.chat.id, '❌ Terjadi kesalahan saat broadcast.');
  }
}

async function handleAtlanticAdmin(bot, chatId, messageId) {
  try {
    const apiKey = process.env.ATLANTIC_API_KEY || process.env.ATLANTIS_API_KEY;

    if (!apiKey) {
      await bot.editMessageText(
        'Error: ATLANTIS_API_KEY is not set in the .env file.',
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '« Kembali', callback_data: 'back_to_menu' }
              ]
            ]
          }
        }
      );
      return;
    }

    const data = qs.stringify({
      'api_key': apiKey
    });

    const config = {
      method: 'post',
      url: 'https://atlantich2h.com/get_profile',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data
    };

    const response = await axios(config);

    if (response.data.status === 'true') {
      const { name, balance } = response.data.data;
      const message = `🌊 Atlantic Menu 🌊

👤 Name: ${name}
💰 Saldo: ${balance}`;

      await bot.editMessageText(
        message,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                BUTTONS.WITHDRAW_BALANCE
              ],
              [
                { text: '« Kembali', callback_data: 'back_to_menu' }
              ]
            ]
          }
        }
      );
    } else {
      await bot.editMessageText(
        `Error: ${response.data.message}`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '« Kembali', callback_data: 'back_to_menu' }
              ]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.error('Error fetching Atlantic API:', error);
    await bot.editMessageText(
      'Error fetching data from Atlantic API.',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '« Kembali', callback_data: 'back_to_menu' }
            ]
          ]
        }
      }
    );
  }
}

module.exports = {
  handleAddBalance,
  processAddBalance,
  handleBroadcast,
  processBroadcast,
  handleAtlanticAdmin
};
