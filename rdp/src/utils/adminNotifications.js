// dotenv removed - using centralized env.txt via cursor.js

async function sendAdminNotification(bot, message) {
  const adminId = process.env.ADMIN_ID || process.env.OWNER_TELEGRAM_ID;
  if (!adminId) {
    console.error('Admin ID not configured');
    return;
  }

  try {
    // Support both bot.sendMessage (node-telegram-bot-api) and bot.telegram.sendMessage (Telegraf)
    if (bot.telegram && typeof bot.telegram.sendMessage === 'function') {
      // Telegraf format
      await bot.telegram.sendMessage(adminId, message, {
        parse_mode: 'Markdown'
      });
    } else if (typeof bot.sendMessage === 'function') {
      // node-telegram-bot-api format
      await bot.sendMessage(adminId, message, {
        parse_mode: 'Markdown'
      });
    } else {
      console.error('Bot instance tidak valid untuk sendAdminNotification');
    }
  } catch (error) {
    console.error('Failed to send admin notification:', error);
  }
}

/**
 * Send notification to RDP channel
 */
async function sendChannelNotification(bot, message) {
  // Support both RDP_CHANNEL_ID and RDP_CHANNEL_LINK
  // Channel ID format: -1001234567890 (numeric, starts with -100)
  // Channel link: https://t.me/+LHpQetaRdw5hNTdl (invite link)
  // Note: If using channel link, bot must be added to channel as admin first
  // Then get the channel ID by forwarding a message from channel to @userinfobot or @getidsbot
  let channelId = process.env.RDP_CHANNEL_ID || process.env.RDP_CHANNEL_LINK;
  
  if (!channelId) {
    console.error('[RDP CHANNEL] RDP Channel ID not configured. Set RDP_CHANNEL_ID in env.txt');
    return;
  }

  // Convert channel link to channel ID if needed
  // Link format: https://t.me/+LHpQetaRdw5hNTdl
  // We can't directly use the invite link, need to get actual channel ID
  if (channelId.startsWith('http')) {
    console.error('[RDP CHANNEL] ❌ Cannot use channel link directly.');
    console.error('[RDP CHANNEL] 📝 Bot must be added to channel as admin first, then get channel ID.');
    console.error('[RDP CHANNEL] 📋 To get channel ID:');
    console.error('[RDP CHANNEL]    1. Add bot to channel as admin');
    console.error('[RDP CHANNEL]    2. Forward a message from channel to @userinfobot or @getidsbot');
    console.error('[RDP CHANNEL]    3. Get channel ID (format: -1001234567890)');
    console.error('[RDP CHANNEL]    4. Set RDP_CHANNEL_ID=-1001234567890 in env.txt');
    return;
  }

  // Convert to string and ensure it's numeric (for channel ID format)
  const numericChannelId = String(channelId).trim();
  
  // Validate channel ID format (should start with -100 for supergroups/channels)
  if (!numericChannelId.startsWith('-100') && !numericChannelId.startsWith('-') && isNaN(parseInt(numericChannelId))) {
    console.warn(`[RDP CHANNEL] ⚠️ Channel ID format may be incorrect: ${numericChannelId}`);
    console.warn('[RDP CHANNEL] Expected format: -1001234567890 (starts with -100)');
  }

  try {
    // Support both bot.sendMessage (node-telegram-bot-api) and bot.telegram.sendMessage (Telegraf)
    if (bot.telegram && typeof bot.telegram.sendMessage === 'function') {
      // Telegraf format - try with numeric ID
      await bot.telegram.sendMessage(numericChannelId, message, {
        parse_mode: 'Markdown'
      });
      console.info(`[RDP CHANNEL] ✅ Notification sent to channel ${numericChannelId}`);
    } else if (typeof bot.sendMessage === 'function') {
      // node-telegram-bot-api format
      await bot.sendMessage(numericChannelId, message, {
        parse_mode: 'Markdown'
      });
      console.info(`[RDP CHANNEL] ✅ Notification sent to channel ${numericChannelId}`);
    } else {
      console.error('[RDP CHANNEL] Bot instance tidak valid untuk sendChannelNotification');
    }
  } catch (error) {
    const errorMsg = error.description || error.message || String(error);
    console.error(`[RDP CHANNEL] ❌ Failed to send channel notification: ${errorMsg}`);
    
    if (errorMsg.includes('chat not found') || errorMsg.includes('Chat not found')) {
      console.error('[RDP CHANNEL] 🔧 Troubleshooting:');
      console.error('[RDP CHANNEL]    1. Make sure bot is added to channel as admin');
      console.error('[RDP CHANNEL]    2. Check RDP_CHANNEL_ID in env.txt is correct');
      console.error('[RDP CHANNEL]    3. Channel ID format should be: -1001234567890');
      console.error('[RDP CHANNEL]    4. To get channel ID: Forward message from channel to @userinfobot');
      console.error(`[RDP CHANNEL]    5. Current channel ID: ${numericChannelId}`);
    } else if (errorMsg.includes('not enough rights')) {
      console.error('[RDP CHANNEL] 🔧 Bot doesn\'t have permission to send messages');
      console.error('[RDP CHANNEL]    Make sure bot is admin in channel with "Post Messages" permission');
    } else {
      console.error('[RDP CHANNEL] 🔧 Error details:', {
        channelId: numericChannelId,
        error: errorMsg
      });
    }
  }
}

async function createDepositNotification(bot, userId, amount, newBalance, transactionId = null) {
  // Import getUserStats here to avoid circular dependency
  const { getUserStats } = require('./statistics');
  const timeStr = new Date().toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  // Get user info (username and name)
  let username = 'N/A';
  let firstName = 'N/A';
  let lastName = '';
  
  try {
    const telegramBot = bot.telegram || bot;
    const chat = await telegramBot.getChat(userId);
    username = chat.username ? `@${chat.username}` : 'N/A';
    firstName = chat.first_name || 'N/A';
    lastName = chat.last_name ? ` ${chat.last_name}` : '';
  } catch (e) {
    // Silent error if cannot get chat info
  }
  
  // Get total deposits count for user (getUserStats already imported above)
  let totalDeposits = 0;
  try {
    const userStats = await getUserStats(userId);
    totalDeposits = userStats.depositCount || 0;
  } catch (e) {
    // Silent error
  }
  
  // Get global deposit count for hashtag
  let globalDepositCount = 0;
  try {
    const { getStat } = require('./statistics');
    globalDepositCount = await getStat('total_deposits', 0);
  } catch (e) {
    // Silent error
  }
  
  // Calculate initial balance (saldo awal) = newBalance - amount
  const initialBalance = typeof newBalance === 'string' ? 0 : (newBalance - amount);
  const totalBalance = typeof newBalance === 'string' ? 0 : newBalance;
  
  // Get quota mode status
  const rdpPriceManager = require('./rdpPriceManager');
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const pricePerQuota = rdpPriceManager.getRdpPrices().pricePerQuota || 3000;
  
  // Get total saldo RDP global
  let saldoRdpSebelumnya = 0;
  let totalSaldoRdp = 0;
  let kuotaRdpSebelumnya = 0;
  let totalKuotaRdp = 0;
  
  try {
    const path = require('path');
    const statisticsHandlerPath = path.join(__dirname, '../../../statisticsHandler');
    const statisticsHandler = require(statisticsHandlerPath);
    const globalStats = await statisticsHandler.getGlobalStatistics();
    totalSaldoRdp = globalStats.totalSaldoRdp || 0;
    // Saldo sebelumnya = total saldo saat ini - saldo dari deposit ini
    // (karena deposit sudah dicatat sebelum notifikasi dikirim)
    saldoRdpSebelumnya = totalSaldoRdp - amount;
    
    // Calculate kuota
    if (quotaMode) {
      totalKuotaRdp = Math.floor(totalSaldoRdp / pricePerQuota);
      kuotaRdpSebelumnya = Math.floor(saldoRdpSebelumnya / pricePerQuota);
    }
  } catch (statsErr) {
    console.error('[RDP DEPOSIT] Error getting global statistics:', statsErr);
    // Fallback: jika error, gunakan 0 untuk saldo sebelumnya
    saldoRdpSebelumnya = 0;
    totalSaldoRdp = amount;
    if (quotaMode) {
      kuotaRdpSebelumnya = 0;
      totalKuotaRdp = Math.floor(amount / pricePerQuota);
    }
  }
  
  let msg = `💰 *DEPOSIT RDP BERHASIL*\n\n` +
           `👤 User ID: \`${userId}\`\n` +
           `📝 Username: ${username}\n` +
           `👤 Nama: ${firstName}${lastName}\n` +
           `💵 Jumlah: *Rp ${amount.toLocaleString('id-ID')}*\n` +
           `📊 Total Deposit Berhasil: ${totalDeposits}\n`;
  
  if (transactionId) {
    msg += `📋 Transaction ID: \`${transactionId}\`\n`;
  }
  
  // Calculate quota
  const quota = Math.round(amount / pricePerQuota);
  
  if (quotaMode) {
    // Quota mode: show quota
    const initialQuota = Math.floor(initialBalance / pricePerQuota);
    const depositQuota = quota;
    const totalQuota = Math.floor(totalBalance / pricePerQuota);
    
    msg += `\n💎 *Kuota User:*\n` +
           `• Kuota Awal: ${initialQuota} kuota\n` +
           `• Deposit: ${depositQuota} kuota (Rp ${amount.toLocaleString('id-ID')})\n` +
           `• Kuota Total: ${totalQuota} kuota\n\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `💎 *KUOTA RDP INFO*\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `Total kuota RDP sebelumnya: ${kuotaRdpSebelumnya} kuota\n` +
           `User deposit: ${depositQuota} kuota\n\n` +
           `*TOTAL KUOTA RDP: ${totalKuotaRdp} kuota*\n\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `⏰ Waktu: ${timeStr}\n\n` +
           `#depositrdp-${globalDepositCount}`;
  } else {
    // Saldo mode: show saldo
    msg += `\n💰 *Saldo User:*\n` +
           `• Saldo Awal: Rp ${initialBalance.toLocaleString('id-ID')}\n` +
           `• Deposit: Rp ${amount.toLocaleString('id-ID')}\n` +
           `• Saldo Total: Rp ${totalBalance.toLocaleString('id-ID')}\n\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `💰 *SALDO RDP INFO*\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `Total saldo RDP sebelumnya: Rp ${saldoRdpSebelumnya.toLocaleString('id-ID')}\n` +
           `User deposit: Rp ${amount.toLocaleString('id-ID')}\n\n` +
           `*TOTAL SALDO RDP: Rp ${totalSaldoRdp.toLocaleString('id-ID')}*\n\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `⏰ Waktu: ${timeStr}\n\n` +
           `#depositrdp-${globalDepositCount}`;
  }
  
  return msg;
}

/**
 * Send tracking request notification to channel with approve/decline buttons
 * @param {Object} bot - Bot instance
 * @param {Object} request - Tracking request object
 * @param {Object} installation - Installation object
 * @param {Object} requesterInfo - Requester user info {userId, username, firstName, lastName}
 * @param {Object} ownerInfo - Owner user info {userId, username, firstName, lastName}
 * @returns {Promise<number|null>} - Channel message ID or null if failed
 */
/**
 * Send tracking request to channel (censored info only, no buttons)
 */
async function sendTrackingRequestToChannel(bot, request, installation, requesterInfo, ownerInfo) {
  const channelId = process.env.RDP_CHANNEL_REQUEST || process.env.RDP_CHANNEL_ID;
  
  if (!channelId) {
    console.error('[RDP CHANNEL REQUEST] RDP_CHANNEL_REQUEST not configured. Set RDP_CHANNEL_REQUEST in env.txt');
    return null;
  }

  // Convert to string and ensure it's numeric (for channel ID format)
  const numericChannelId = String(channelId).trim();
  
  // Validate channel ID format
  if (channelId.startsWith('http')) {
    console.error('[RDP CHANNEL REQUEST] ❌ Cannot use channel link directly.');
    console.error('[RDP CHANNEL REQUEST] Use channel ID format: -1001234567890');
    return null;
  }

  try {
    // Censor sensitive information
    const requestId = request.request_id;
    const installId = request.install_id;
    const requesterId = requesterInfo.userId;
    const ownerId = ownerInfo.userId;
    
    // Censor: show only partial info
    const censoredRequestId = requestId.substring(0, 8) + '***';
    const censoredInstallId = installId.substring(0, 8) + '***';
    const censoredRequesterId = String(requesterId).substring(0, 3) + '***';
    const censoredOwnerId = String(ownerId).substring(0, 3) + '***';
    
    // Parse dates - handle both ISO string and SQLite timestamp format
    let expiresAt = new Date(request.expires_at);
    if (isNaN(expiresAt.getTime())) {
      console.warn('[TRACKING REQUEST CHANNEL] Invalid expires_at date:', request.expires_at);
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Fallback to 24h from now
    }
    
    let createdAt = new Date(request.created_at);
    if (isNaN(createdAt.getTime())) {
      console.warn('[TRACKING REQUEST CHANNEL] Invalid created_at date:', request.created_at);
      createdAt = new Date(); // Fallback to now
    }
    
    const expiresAtText = expiresAt.toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const createdAtText = createdAt.toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Public info only (censored)
    const message = `📋 *REQUEST TRACKING RDP*\n\n` +
      `🆔 *Request ID:* \`${censoredRequestId}\`\n` +
      `📋 *Install ID:* \`${censoredInstallId}\`\n\n` +
      `👤 *Requester ID:* \`${censoredRequesterId}\`\n` +
      `👑 *Owner ID:* \`${censoredOwnerId}\`\n\n` +
      `📅 *Dibuat:* ${createdAtText} WIB\n` +
      `⏱️ *Expires:* ${expiresAtText} WIB\n\n` +
      `💡 Request sedang diproses oleh owner.`;

    // No buttons - channel is for public info only

    // Support both bot.sendMessage (node-telegram-bot-api) and bot.telegram.sendMessage (Telegraf)
    let result;
    if (bot.telegram && typeof bot.telegram.sendMessage === 'function') {
      // Telegraf format
      result = await bot.telegram.sendMessage(numericChannelId, message, {
        parse_mode: 'Markdown'
      });
    } else if (typeof bot.sendMessage === 'function') {
      // node-telegram-bot-api format
      result = await bot.sendMessage(numericChannelId, message, {
        parse_mode: 'Markdown'
      });
    } else {
      console.error('[RDP CHANNEL REQUEST] Bot instance tidak valid');
      return null;
    }

    const messageId = result?.message_id || result?.result?.message_id;
    console.info(`[RDP CHANNEL REQUEST] ✅ Request notification sent to channel ${numericChannelId}, message ID: ${messageId}`);
    return messageId;
  } catch (error) {
    const errorMsg = error.description || error.message || String(error);
    console.error(`[RDP CHANNEL REQUEST] ❌ Failed to send request notification: ${errorMsg}`);
    
    if (errorMsg.includes('chat not found') || errorMsg.includes('Chat not found')) {
      console.error('[RDP CHANNEL REQUEST] 🔧 Troubleshooting:');
      console.error('[RDP CHANNEL REQUEST]    1. Make sure bot is added to channel as admin');
      console.error('[RDP CHANNEL REQUEST]    2. Check RDP_CHANNEL_REQUEST in env.txt is correct');
      console.error('[RDP CHANNEL REQUEST]    3. Channel ID format should be: -1001234567890');
      console.error(`[RDP CHANNEL REQUEST]    4. Current channel ID: ${numericChannelId}`);
    } else if (errorMsg.includes('not enough rights')) {
      console.error('[RDP CHANNEL REQUEST] 🔧 Bot doesn\'t have permission to send messages');
      console.error('[RDP CHANNEL REQUEST]    Make sure bot is admin in channel with "Post Messages" permission');
    }
    return null;
  }
}

/**
 * Send tracking request approval buttons to owner (bot owner or installer owner)
 */
async function sendTrackingRequestToOwner(bot, request, installation, requesterInfo, ownerInfo, toBotOwner = false) {
  try {
    const requestId = request.request_id;
    const installId = request.install_id;
    const requesterId = requesterInfo.userId;
    const requesterUsername = requesterInfo.username || 'N/A';
    const requesterName = `${requesterInfo.firstName || 'N/A'}${requesterInfo.lastName || ''}`;
    const ownerId = ownerInfo.userId;
    const ownerUsername = ownerInfo.username || 'N/A';
    const ownerName = `${ownerInfo.firstName || 'N/A'}${ownerInfo.lastName || ''}`;
    
    // Parse dates - handle both ISO string and SQLite timestamp format
    let expiresAt = new Date(request.expires_at);
    if (isNaN(expiresAt.getTime())) {
      console.warn('[TRACKING REQUEST OWNER] Invalid expires_at date:', request.expires_at);
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Fallback to 24h from now
    }
    
    let createdAt = new Date(request.created_at);
    if (isNaN(createdAt.getTime())) {
      console.warn('[TRACKING REQUEST OWNER] Invalid created_at date:', request.created_at);
      createdAt = new Date(); // Fallback to now
    }
    
    const expiresAtText = expiresAt.toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const createdAtText = createdAt.toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const ownerType = toBotOwner ? 'Bot Owner' : 'Installer Owner';
    const message = `📋 *REQUEST TRACKING RDP*\n\n` +
      `🆔 *Request ID:* \`${requestId}\`\n` +
      `📋 *Install ID:* \`${installId}\`\n\n` +
      `👤 *Requester:*\n` +
      `• ID: \`${requesterId}\`\n` +
      `• Username: ${requesterUsername}\n` +
      `• Nama: ${requesterName}\n\n` +
      `👑 *Installation Owner:*\n` +
      `• ID: \`${ownerId}\`\n` +
      `• Username: ${ownerUsername}\n` +
      `• Nama: ${ownerName}\n\n` +
      `📅 *Dibuat:* ${createdAtText} WIB\n` +
      `⏱️ *Expires:* ${expiresAtText} WIB\n\n` +
      `💡 ${ownerType} dapat menyetujui atau menolak request ini.`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅ Setujui', callback_data: `tracking_request_approve_${requestId}` },
          { text: '❌ Tolak', callback_data: `tracking_request_reject_${requestId}` }
        ]
      ]
    };

    // Determine target chat ID
    let targetChatId;
    if (toBotOwner) {
      // Send to bot owner
      targetChatId = process.env.OWNER_TELEGRAM_ID;
      if (!targetChatId) {
        console.error('[TRACKING REQUEST OWNER] OWNER_TELEGRAM_ID not configured');
        return null;
      }
    } else {
      // Send to installer owner
      targetChatId = ownerId;
    }

    // Support both bot.sendMessage (node-telegram-bot-api) and bot.telegram.sendMessage (Telegraf)
    let result;
    if (bot.telegram && typeof bot.telegram.sendMessage === 'function') {
      // Telegraf format
      result = await bot.telegram.sendMessage(targetChatId, message, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      });
    } else if (typeof bot.sendMessage === 'function') {
      // node-telegram-bot-api format
      result = await bot.sendMessage(targetChatId, message, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      });
    } else {
      console.error('[TRACKING REQUEST OWNER] Bot instance tidak valid');
      return null;
    }

    const messageId = result?.message_id || result?.result?.message_id;
    console.info(`[TRACKING REQUEST OWNER] ✅ Request sent to ${ownerType} (${targetChatId}), message ID: ${messageId}`);
    return messageId;
  } catch (error) {
    const errorMsg = error.description || error.message || String(error);
    console.error(`[TRACKING REQUEST OWNER] ❌ Failed to send request: ${errorMsg}`);
    return null;
  }
}

/**
 * Create installation success notification for channel
 */
async function createInstallationNotification(bot, userId, installId, installType, balance, totalInstallations, osName = null, installTime = null, locationInfo = null, installationCost = null) {
  // Get user info (username and name)
  let username = 'N/A';
  let firstName = 'N/A';
  let lastName = '';
  
  try {
    const telegramBot = bot.telegram || bot;
    const chat = await telegramBot.getChat(userId);
    username = chat.username ? `@${chat.username}` : 'N/A';
    firstName = chat.first_name || 'N/A';
    lastName = chat.last_name ? ` ${chat.last_name}` : '';
  } catch (e) {
    // Silent error if cannot get chat info
  }
  
  const installTypeText = installType === 'docker' ? 'Docker' : installType === 'dedicated' ? 'Dedicated' : installType;
  const currentBalance = typeof balance === 'string' ? 0 : balance;
  const cost = installationCost || 0;
  
  // Calculate initial balance (saldo awal) = currentBalance + cost
  const initialBalance = currentBalance + cost;
  
  let msg = `🎉 *RDP Windows SUDAH SIAP DIGUNAKAN!*\n\n` +
             `👤 *User Info:*\n` +
             `• ID: \`${userId}\`\n` +
             `• Username: ${username}\n` +
             `• Nama: ${firstName}${lastName}\n\n` +
             `📋 *Install Info:*\n` +
             `• Install ID: \`${installId}\`\n` +
             `• Type: ${installTypeText} RDP\n`;
  
  // Add OS info if provided
  if (osName) {
    msg += `• OS: ${osName}\n`;
  }
  
  // Add install time if provided
  // installTime bisa berupa number (menit) atau string (formatted time)
  if (installTime) {
    if (typeof installTime === 'number') {
      msg += `• Waktu Instalasi: ${installTime} menit\n`;
    } else {
      msg += `• Waktu Instalasi: ${installTime}\n`;
    }
  }
  
  // Add location info if provided
  if (locationInfo && locationInfo !== 'N/A') {
    msg += `• Lokasi: ${locationInfo}\n`;
  }
  
  // Get quota mode status
  const rdpPriceManager = require('./rdpPriceManager');
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const pricePerQuota = rdpPriceManager.getRdpPrices().pricePerQuota || 3000;
  
  if (quotaMode) {
    // Quota mode: show quota
    const initialQuota = Math.floor(initialBalance / pricePerQuota);
    const costQuota = Math.floor(cost / pricePerQuota);
    const currentQuota = Math.floor(currentBalance / pricePerQuota);
    
    msg += `\n💎 *Kuota:*\n` +
           `• Kuota Awal: ${initialQuota} kuota\n` +
           `• Biaya: ${costQuota} kuota\n` +
           `• Sisa Kuota: ${currentQuota} kuota\n\n` +
           `📊 *Statistics:*\n` +
           `• Total Berhasil Install: ${totalInstallations}\n\n`;
  } else {
    // Saldo mode: show saldo
    msg += `\n💰 *Saldo:*\n` +
           `• Saldo Awal: Rp ${initialBalance.toLocaleString('id-ID')}\n` +
           `• Biaya: Rp ${cost.toLocaleString('id-ID')}\n` +
           `• Sisa Saldo: Rp ${currentBalance.toLocaleString('id-ID')}\n\n` +
           `📊 *Statistics:*\n` +
           `• Total Berhasil Install: ${totalInstallations}\n\n`;
  }
  
  // Get global installation count for hashtag
  let globalInstallCount = 0;
  try {
    const { getStat } = require('./statistics');
    globalInstallCount = await getStat('total_installations', 0);
  } catch (e) {
    // Silent error
  }
  
  msg += `#installrdp-${globalInstallCount}`;
  
  return msg;
}

/**
 * Queue untuk notifikasi user baru dengan delay
 * Menghindari spam saat banyak user mendaftar bersamaan
 */
const newUserNotificationQueue = new Map(); // userId -> { timeoutId, userInfo }
const notifiedUsers = new Set(); // Track user yang sudah dapat notifikasi (untuk mencegah duplikat)

/**
 * Send new user notification to channel with delay mechanism
 * @param {Object} bot - Bot instance
 * @param {Number} userId - Telegram user ID
 * @param {String} username - Telegram username (optional)
 * @param {String} firstName - User first name (optional)
 * @param {String} lastName - User last name (optional)
 */
async function sendNewUserNotification(bot, userId, username = null, firstName = null, lastName = null) {
  const channelId = process.env.CHANNEL_NEW_USER;
  
  if (!channelId) {
    console.warn('[NEW USER NOTIFICATION] CHANNEL_NEW_USER not configured. Set CHANNEL_NEW_USER in env.txt');
    return;
  }

  // Prevent duplicate notifications (user might register in both umum and RDP systems)
  const userIdStr = String(userId);
  if (notifiedUsers.has(userIdStr)) {
    console.info(`[NEW USER NOTIFICATION] User ${userIdStr} already notified, skipping duplicate`);
    return;
  }

  // Convert to string and ensure it's numeric (for channel ID format)
  const numericChannelId = String(channelId).trim();
  
  // Validate channel ID format
  if (channelId.startsWith('http')) {
    console.error('[NEW USER NOTIFICATION] ❌ Cannot use channel link directly.');
    console.error('[NEW USER NOTIFICATION] Use channel ID format: -1001234567890');
    return;
  }

  // Get user info from bot if not provided
  let userUsername = username || 'N/A';
  let userFirstName = firstName || 'N/A';
  let userLastName = lastName ? ` ${lastName}` : '';
  
  try {
    const telegramBot = bot.telegram || bot;
    const chat = await telegramBot.getChat(userId);
    if (chat.username) userUsername = `@${chat.username}`;
    if (chat.first_name) userFirstName = chat.first_name;
    if (chat.last_name) userLastName = ` ${chat.last_name}`;
  } catch (e) {
    // Silent error if cannot get chat info
    console.warn(`[NEW USER NOTIFICATION] Could not get chat info for user ${userId}:`, e.message);
  }

  // Get total user count from database (gabungan umum + RDP)
  let userNumber = 0;
  try {
    // Get RDP users count
    const db = require('../config/database');
    const rdpUserCountResult = await db.get('SELECT COUNT(*) as count FROM users');
    const rdpUserCount = rdpUserCountResult?.count || 0;
    
    // Get umum users count (PenggunaTele)
    let umumUserCount = 0;
    try {
      const { PenggunaTele } = require('../../../models');
      umumUserCount = await PenggunaTele.countDocuments({});
    } catch (e) {
      // Silent error if PenggunaTele not available
    }
    
    // Get unique user count (gabungan umum + RDP, avoid duplicates)
    // Use statistics handler to get accurate count
    try {
      const statisticsHandler = require('../../../statisticsHandler');
      const globalStats = await statisticsHandler.getGlobalStatistics();
      userNumber = globalStats.totalUsers || 0;
    } catch (e) {
      // Fallback: use sum of both (may have duplicates, but better than nothing)
      userNumber = Math.max(rdpUserCount, umumUserCount);
    }
  } catch (e) {
    console.error('[NEW USER NOTIFICATION] Error getting user count:', e.message);
  }

  // Get registration time
  const registrationTime = new Date();
  const timeStr = registrationTime.toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // Format notification message
  const message = `🎉 *USER BARU TERDAFTAR*\n\n` +
    `🆔 *ID Telegram:* \`${userId}\`\n` +
    `👤 *Username:* ${userUsername}\n` +
    `📝 *Nama:* ${userFirstName}${userLastName}\n` +
    `⏰ *Waktu Terdaftar:* ${timeStr} WIB\n` +
    `📊 *User Ke:* ${userNumber}\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Selamat datang di bot! 🎊`;

  // Calculate delay based on queue size to avoid spam
  // Base delay: 2 seconds, additional 1 second per user in queue
  const queueSize = newUserNotificationQueue.size;
  const baseDelay = 2000; // 2 seconds base delay
  const additionalDelay = queueSize * 1000; // 1 second per user in queue
  const delay = baseDelay + additionalDelay;
  
  // Clear existing timeout if user already in queue
  if (newUserNotificationQueue.has(userIdStr)) {
    const existing = newUserNotificationQueue.get(userIdStr);
    if (existing.timeoutId) {
      clearTimeout(existing.timeoutId);
    }
  }

  // Create timeout for delayed notification
  const timeoutId = setTimeout(async () => {
    try {
      // Support both bot.sendMessage (node-telegram-bot-api) and bot.telegram.sendMessage (Telegraf)
      if (bot.telegram && typeof bot.telegram.sendMessage === 'function') {
        // Telegraf format
        await bot.telegram.sendMessage(numericChannelId, message, {
          parse_mode: 'Markdown'
        });
        console.info(`[NEW USER NOTIFICATION] ✅ Notification sent to channel ${numericChannelId} for user ${userIdStr}`);
      } else if (typeof bot.sendMessage === 'function') {
        // node-telegram-bot-api format
        await bot.sendMessage(numericChannelId, message, {
          parse_mode: 'Markdown'
        });
        console.info(`[NEW USER NOTIFICATION] ✅ Notification sent to channel ${numericChannelId} for user ${userIdStr}`);
      } else {
        console.error('[NEW USER NOTIFICATION] Bot instance tidak valid');
      }
    } catch (error) {
      const errorMsg = error.description || error.message || String(error);
      console.error(`[NEW USER NOTIFICATION] ❌ Failed to send notification: ${errorMsg}`);
      
      if (errorMsg.includes('chat not found') || errorMsg.includes('Chat not found')) {
        console.error('[NEW USER NOTIFICATION] 🔧 Troubleshooting:');
        console.error('[NEW USER NOTIFICATION]    1. Make sure bot is added to channel as admin');
        console.error('[NEW USER NOTIFICATION]    2. Check CHANNEL_NEW_USER in env.txt is correct');
        console.error('[NEW USER NOTIFICATION]    3. Channel ID format should be: -1001234567890');
        console.error(`[NEW USER NOTIFICATION]    4. Current channel ID: ${numericChannelId}`);
      } else if (errorMsg.includes('not enough rights')) {
        console.error('[NEW USER NOTIFICATION] 🔧 Bot doesn\'t have permission to send messages');
        console.error('[NEW USER NOTIFICATION]    Make sure bot is admin in channel with "Post Messages" permission');
      }
    } finally {
      // Remove from queue after sending and mark as notified
      newUserNotificationQueue.delete(userIdStr);
      notifiedUsers.add(userIdStr);
      
      // Clean up old entries from notifiedUsers set (keep last 1000 to prevent memory leak)
      if (notifiedUsers.size > 1000) {
        const entriesArray = Array.from(notifiedUsers);
        const toRemove = entriesArray.slice(0, entriesArray.length - 1000);
        toRemove.forEach(id => notifiedUsers.delete(id));
      }
    }
  }, delay);

  // Store in queue
  newUserNotificationQueue.set(userIdStr, {
    timeoutId,
    userInfo: {
      userId: userIdStr,
      username: userUsername,
      firstName: userFirstName,
      lastName: userLastName,
      registrationTime,
      userNumber
    }
  });

  console.info(`[NEW USER NOTIFICATION] 📝 Notification queued for user ${userIdStr}, will be sent in ${delay}ms`);
}

module.exports = {
  sendAdminNotification,
  sendChannelNotification,
  createDepositNotification,
  createInstallationNotification,
  sendTrackingRequestToChannel,
  sendTrackingRequestToOwner,
  sendNewUserNotification
};