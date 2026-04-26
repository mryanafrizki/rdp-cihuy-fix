const { Markup } = require('telegraf');
const { isAdmin } = require('../utils/userManager');
const rdpPriceManager = require('../utils/rdpPriceManager');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { getTrackingRequestApprovalMode } = require('../utils/trackingRequestSettings');

/**
 * Send RDP admin menu
 */
async function handleRdpAdminMenu(bot, chatId, messageId) {
  if (!isAdmin(chatId)) {
    await bot.sendMessage('❌ Access denied. Admin only feature.', {
      chat_id: chatId,
      reply_markup: {
        inline_keyboard: [[
          { text: '« Back', callback_data: 'back_to_menu' }
        ]]
      }
    });
    return;
  }

  const prices = rdpPriceManager.getRdpPrices();
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const pricePerQuota = prices.pricePerQuota || 3000;
  const pricePerQuotaText = pricePerQuota === 0 ? 'Gratis' : `Rp ${pricePerQuota.toLocaleString('id-ID')}`;
  const dockerPrice = prices.dockerRdpPrice || 1000;
  const dedicatedPrice = prices.dedicatedRdpPrice || 3000;
  const dockerPriceText = dockerPrice === 0 ? 'Gratis' : `Rp ${dockerPrice.toLocaleString('id-ID')}`;
  const dedicatedPriceText = dedicatedPrice === 0 ? 'Gratis' : `Rp ${dedicatedPrice.toLocaleString('id-ID')}`;
  
  // Get tracking request approval mode
  const approvalMode = await getTrackingRequestApprovalMode();
  const approvalModeText = approvalMode ? 'Bot Owner' : 'Installer Owner';

  let menuText = `⚙️ *RDP Admin Menu*\n\n`;
  
  if (quotaMode) {
    // Quota Mode Enabled
    // Convert min/max from rupiah to kuota for display
    const minQuota = Math.ceil(prices.minDepositAmount / pricePerQuota);
    const maxQuota = Math.floor(prices.maxDepositAmount / pricePerQuota);
    
    menuText += 
      `💎 *Mode Kuota: ENABLED*\n\n` +
      `💎 *Sistem Kuota:*\n` +
      `• Harga Per Kuota: ${pricePerQuotaText}\n` +
      `• Docker RDP: 1 kuota (Rp ${pricePerQuota.toLocaleString('id-ID')})\n` +
      `• Dedicated RDP: 1 kuota (Rp ${pricePerQuota.toLocaleString('id-ID')})\n\n` +
      `💵 *Deposit Settings (Kuota):*\n` +
      `• Minimal: ${minQuota} kuota\n` +
      `• Maksimal: ${maxQuota} kuota\n\n`;
  } else {
    // Quota Mode Disabled
    menuText += 
      `💵 *Mode Saldo: ENABLED*\n\n` +
      `💵 *Harga Install:*\n` +
      `• Docker RDP: ${dockerPriceText}/install\n` +
      `• Dedicated RDP: ${dedicatedPriceText}/install\n\n` +
      `💵 *Deposit Settings (Rupiah):*\n` +
      `• Minimal: Rp ${prices.minDepositAmount.toLocaleString('id-ID')}\n` +
      `• Maksimal: Rp ${prices.maxDepositAmount.toLocaleString('id-ID')}\n\n`;
  }
  
  menuText += `📋 *Tracking Request Approval:*\n` +
    `• Mode: ${approvalModeText}\n` +
    `${approvalMode ? '• Approve/reject dikirim ke Bot Owner' : '• Approve/reject dikirim ke Installer Owner'}\n\n`;
  
  menuText += `Pilih menu:`;

  const keyboard = {
    inline_keyboard: [
      [{ 
        text: quotaMode ? '❌ Disable Mode Kuota' : '✅ Enable Mode Kuota', 
        callback_data: quotaMode ? 'rdp_admin_disable_quota_mode' : 'rdp_admin_enable_quota_mode' 
      }],
      // [{ 
      //   text: approvalMode ? '❌ Disable Bot Owner Approval' : '✅ Enable Bot Owner Approval', 
      //   callback_data: approvalMode ? 'rdp_admin_disable_bot_owner_approval' : 'rdp_admin_enable_bot_owner_approval' 
      // }]
    ]
  };
  
  if (quotaMode) {
    // Quota Mode Menu
    keyboard.inline_keyboard.push([
      { text: '💎 Set Harga Per Kuota', callback_data: 'rdp_admin_set_price_per_quota' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '💰 Set Minimal Kuota Deposit', callback_data: 'rdp_admin_set_min_deposit' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '💰 Set Maksimal Kuota Deposit', callback_data: 'rdp_admin_set_max_deposit' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '💸 Kurangi Kuota User', callback_data: 'rdp_admin_deduct_balance' }
    ]);
  } else {
    // Saldo Mode Menu
    keyboard.inline_keyboard.push([
      { text: '🐳 Set Harga Docker RDP', callback_data: 'rdp_admin_set_docker_price' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '🖥️ Set Harga Dedicated RDP', callback_data: 'rdp_admin_set_dedicated_price' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '💰 Set Minimal Deposit RDP', callback_data: 'rdp_admin_set_min_deposit' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '💰 Set Maksimal Deposit RDP', callback_data: 'rdp_admin_set_max_deposit' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '💸 Kurangi Saldo User', callback_data: 'rdp_admin_deduct_balance' }
    ]);
  }
  
    keyboard.inline_keyboard.push([
      { text: '⚖️ Set Maksimal Balance RDP', callback_data: 'balance_limit_set_rdp_from_menu' }
    ]);
    keyboard.inline_keyboard.push([
      { text: '🔙 Kembali', callback_data: 'back_to_menu' }
    ]);

  if (messageId) {
    try {
      await bot.editMessageText(menuText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (e) {
      // If edit fails, send new message
      await bot.sendMessage(menuText, {
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  } else {
    await bot.sendMessage(menuText, {
      chat_id: chatId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}

/**
 * Handle set docker price
 */
async function handleSetDockerPrice(bot, chatId, messageId) {
  if (!isAdmin(chatId)) {
    return;
  }

  const prices = rdpPriceManager.getRdpPrices();
  const currentPrice = prices.dockerRdpPrice;

  const menuText = 
    `🐳 *Set Price Docker RDP*\n\n` +
    `Harga saat ini: ${currentPrice === 0 ? 'Gratis' : `Rp ${currentPrice.toLocaleString('id-ID')}`}\n\n` +
    `Masukkan harga baru (0 untuk gratis):`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🆓 Set Gratis (0)', callback_data: 'rdp_admin_set_docker_price_0' }],
      [{ text: '💵 Rp 1.000', callback_data: 'rdp_admin_set_docker_price_1000' }],
      [{ text: '💵 Rp 2.000', callback_data: 'rdp_admin_set_docker_price_2000' }],
      [{ text: '💵 Rp 5.000', callback_data: 'rdp_admin_set_docker_price_5000' }],
      [{ text: '✏️ Custom Price', callback_data: 'rdp_admin_set_docker_price_custom' }],
      [{ text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }]
    ]
  };

  await bot.editMessageText(menuText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Handle set dedicated price
 */
async function handleSetDedicatedPrice(bot, chatId, messageId) {
  if (!isAdmin(chatId)) {
    return;
  }

  const prices = rdpPriceManager.getRdpPrices();
  const currentPrice = prices.dedicatedRdpPrice;

  const menuText = 
    `🖥️ *Set Price Dedicated RDP*\n\n` +
    `Harga saat ini: ${currentPrice === 0 ? 'Gratis' : `Rp ${currentPrice.toLocaleString('id-ID')}`}\n\n` +
    `Masukkan harga baru (0 untuk gratis):`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🆓 Set Gratis (0)', callback_data: 'rdp_admin_set_dedicated_price_0' }],
      [{ text: '💵 Rp 3.000', callback_data: 'rdp_admin_set_dedicated_price_3000' }],
      [{ text: '💵 Rp 5.000', callback_data: 'rdp_admin_set_dedicated_price_5000' }],
      [{ text: '💵 Rp 10.000', callback_data: 'rdp_admin_set_dedicated_price_10000' }],
      [{ text: '✏️ Custom Price', callback_data: 'rdp_admin_set_dedicated_price_custom' }],
      [{ text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }]
    ]
  };

  await bot.editMessageText(menuText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Handle set min deposit
 */
async function handleSetMinDeposit(bot, chatId, messageId) {
  if (!isAdmin(chatId)) {
    return;
  }

  const prices = rdpPriceManager.getRdpPrices();
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const pricePerQuota = prices.pricePerQuota || 3000;
  const currentMin = prices.minDepositAmount;

  let menuText;
  let keyboard;

  if (quotaMode) {
    // Quota mode: show and set in kuota
    const currentMinQuota = Math.ceil(currentMin / pricePerQuota);
    // Recalculate minimal rupiah from kuota to ensure sync with pricePerQuota
    const currentMinRecalculated = currentMinQuota * pricePerQuota;
    menuText = 
      `💰 *Set Minimal Kuota Deposit RDP*\n\n` +
      `💎 Harga Per Kuota: Rp ${pricePerQuota.toLocaleString('id-ID')}\n\n` +
      `Minimal saat ini: ${currentMinQuota} kuota (Rp ${currentMinRecalculated.toLocaleString('id-ID')})\n\n` +
      `Pilih minimal kuota baru:`;

    keyboard = {
      inline_keyboard: [
        [{ text: '💎 1 Kuota', callback_data: 'rdp_admin_set_min_deposit_1' }],
        [{ text: '💎 5 Kuota', callback_data: 'rdp_admin_set_min_deposit_5' }],
        [{ text: '💎 10 Kuota', callback_data: 'rdp_admin_set_min_deposit_10' }],
        [{ text: '💎 20 Kuota', callback_data: 'rdp_admin_set_min_deposit_20' }],
        [{ text: '✏️ Custom Kuota', callback_data: 'rdp_admin_set_min_deposit_custom' }],
        [{ text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }]
      ]
    };
  } else {
    // Saldo mode: show and set in rupiah
    menuText = 
      `💰 *Set Minimal Deposit RDP*\n\n` +
      `Minimal saat ini: Rp ${currentMin.toLocaleString('id-ID')}\n\n` +
      `Pilih minimal baru:`;

    keyboard = {
      inline_keyboard: [
        [{ text: '💵 Rp 1.000', callback_data: 'rdp_admin_set_min_deposit_1000' }],
        [{ text: '💵 Rp 5.000', callback_data: 'rdp_admin_set_min_deposit_5000' }],
        [{ text: '💵 Rp 10.000', callback_data: 'rdp_admin_set_min_deposit_10000' }],
        [{ text: '✏️ Custom Amount', callback_data: 'rdp_admin_set_min_deposit_custom' }],
        [{ text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }]
      ]
    };
  }

  await bot.editMessageText(menuText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Handle set price per quota
 */
async function handleSetPricePerQuota(bot, chatId, messageId) {
  if (!isAdmin(chatId)) {
    return;
  }

  const prices = rdpPriceManager.getRdpPrices();
  const currentPrice = prices.pricePerQuota || 3000;

  const menuText = 
    `💎 *Set Harga Per Kuota*\n\n` +
    `Harga saat ini: ${currentPrice === 0 ? 'Gratis' : `Rp ${currentPrice.toLocaleString('id-ID')}`}\n\n` +
    `Masukkan harga per kuota baru (0 untuk gratis):\n\n` +
    `⚠️ *PENTING:*\n` +
    `• Dedicated RDP = 1 kuota (fixed)\n` +
    `• Docker RDP = 1 kuota (sesuai harga ini)\n` +
    `• Deposit menggunakan kuota × harga ini`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '💵 Rp 2.000', callback_data: 'rdp_admin_set_price_per_quota_2000' }],
      [{ text: '💵 Rp 3.000', callback_data: 'rdp_admin_set_price_per_quota_3000' }],
      [{ text: '💵 Rp 5.000', callback_data: 'rdp_admin_set_price_per_quota_5000' }],
      [{ text: '💵 Rp 10.000', callback_data: 'rdp_admin_set_price_per_quota_10000' }],
      [{ text: '✏️ Custom Price', callback_data: 'rdp_admin_set_price_per_quota_custom' }],
      [{ text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }]
    ]
  };

  await bot.editMessageText(menuText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Handle set max deposit
 */
async function handleSetMaxDeposit(bot, chatId, messageId) {
  if (!isAdmin(chatId)) {
    return;
  }

  const prices = rdpPriceManager.getRdpPrices();
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const pricePerQuota = prices.pricePerQuota || 3000;
  const currentMax = prices.maxDepositAmount;

  let menuText;
  let keyboard;

  if (quotaMode) {
    // Quota mode: show and set in kuota
    const currentMaxQuota = Math.floor(currentMax / pricePerQuota);
    // Recalculate maksimal rupiah from kuota to ensure sync with pricePerQuota
    const currentMaxRecalculated = currentMaxQuota * pricePerQuota;
    menuText = 
      `💰 *Set Maksimal Kuota Deposit RDP*\n\n` +
      `💎 Harga Per Kuota: Rp ${pricePerQuota.toLocaleString('id-ID')}\n\n` +
      `Maksimal saat ini: ${currentMaxQuota} kuota (Rp ${currentMaxRecalculated.toLocaleString('id-ID')})\n\n` +
      `Pilih maksimal kuota baru:`;

    keyboard = {
      inline_keyboard: [
        [{ text: '💎 50 Kuota', callback_data: 'rdp_admin_set_max_deposit_50' }],
        [{ text: '💎 100 Kuota', callback_data: 'rdp_admin_set_max_deposit_100' }],
        [{ text: '💎 500 Kuota', callback_data: 'rdp_admin_set_max_deposit_500' }],
        [{ text: '💎 1000 Kuota', callback_data: 'rdp_admin_set_max_deposit_1000' }],
        [{ text: '✏️ Custom Kuota', callback_data: 'rdp_admin_set_max_deposit_custom' }],
        [{ text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }]
      ]
    };
  } else {
    // Saldo mode: show and set in rupiah
    menuText = 
      `💰 *Set Maksimal Deposit RDP*\n\n` +
      `Maksimal saat ini: Rp ${currentMax.toLocaleString('id-ID')}\n\n` +
      `Pilih maksimal baru:`;

    keyboard = {
      inline_keyboard: [
        [{ text: '💵 Rp 500.000', callback_data: 'rdp_admin_set_max_deposit_500000' }],
        [{ text: '💵 Rp 1.000.000', callback_data: 'rdp_admin_set_max_deposit_1000000' }],
        [{ text: '💵 Rp 5.000.000', callback_data: 'rdp_admin_set_max_deposit_5000000' }],
        [{ text: '💵 Rp 10.000.000', callback_data: 'rdp_admin_set_max_deposit_10000000' }],
        [{ text: '✏️ Custom Amount', callback_data: 'rdp_admin_set_max_deposit_custom' }],
        [{ text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }]
      ]
    };
  }

  await bot.editMessageText(menuText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Confirm and save price/amount
 */
async function confirmAndSave(bot, chatId, messageId, type, value, displayName) {
  if (!isAdmin(chatId)) {
    return;
  }

  let success = false;
  let oldValue = '';
  let newValue = '';

  switch (type) {
    case 'docker_price':
      const oldDockerPrice = rdpPriceManager.getRdpPrices().dockerRdpPrice;
      success = rdpPriceManager.setDockerRdpPrice(value);
      oldValue = oldDockerPrice === 0 ? 'Gratis' : `Rp ${oldDockerPrice.toLocaleString('id-ID')}`;
      newValue = value === 0 ? 'Gratis' : `Rp ${parseInt(value).toLocaleString('id-ID')}`;
      break;
    case 'dedicated_price':
      const oldDedicatedPrice = rdpPriceManager.getRdpPrices().dedicatedRdpPrice;
      success = rdpPriceManager.setDedicatedRdpPrice(value);
      oldValue = oldDedicatedPrice === 0 ? 'Gratis' : `Rp ${oldDedicatedPrice.toLocaleString('id-ID')}`;
      newValue = value === 0 ? 'Gratis' : `Rp ${parseInt(value).toLocaleString('id-ID')}`;
      break;
    case 'min_deposit':
      const oldMin = rdpPriceManager.getRdpPrices().minDepositAmount;
      const quotaModeMin = rdpPriceManager.isQuotaModeEnabled();
      const pricePerQuotaMin = rdpPriceManager.getRdpPrices().pricePerQuota || 3000;
      
      // If quota mode, convert kuota to rupiah
      let minAmount = parseInt(value);
      if (quotaModeMin) {
        minAmount = minAmount * pricePerQuotaMin;
      }
      
      success = rdpPriceManager.setMinDepositAmount(minAmount);
      
      if (quotaModeMin) {
        const oldMinQuota = Math.ceil(oldMin / pricePerQuotaMin);
        oldValue = `${oldMinQuota} kuota (Rp ${oldMin.toLocaleString('id-ID')})`;
        newValue = `${value} kuota (Rp ${minAmount.toLocaleString('id-ID')})`;
      } else {
        oldValue = `Rp ${oldMin.toLocaleString('id-ID')}`;
        newValue = `Rp ${minAmount.toLocaleString('id-ID')}`;
      }
      break;
    case 'max_deposit':
      const oldMax = rdpPriceManager.getRdpPrices().maxDepositAmount;
      const quotaModeMax = rdpPriceManager.isQuotaModeEnabled();
      const pricePerQuotaMax = rdpPriceManager.getRdpPrices().pricePerQuota || 3000;
      
      // If quota mode, convert kuota to rupiah
      let maxAmount = parseInt(value);
      if (quotaModeMax) {
        maxAmount = maxAmount * pricePerQuotaMax;
      }
      
      // Validate: max deposit tidak boleh di atas max balance
      const BalanceLimitManager = require('../../../utils/balance/balanceLimitManager');
      const maxRdpBalance = BalanceLimitManager.getMaxRdpBalance();
      if (maxRdpBalance !== null && maxAmount > maxRdpBalance) {
        // Auto-adjust to max balance
        maxAmount = maxRdpBalance;
        if (quotaModeMax) {
          // Recalculate quota to fit max balance
          const maxQuota = Math.floor(maxRdpBalance / pricePerQuotaMax);
          maxAmount = maxQuota * pricePerQuotaMax;
        }
      }
      
      success = rdpPriceManager.setMaxDepositAmount(maxAmount);
      
      if (quotaModeMax) {
        const oldMaxQuota = Math.floor(oldMax / pricePerQuotaMax);
        const newMaxQuota = Math.floor(maxAmount / pricePerQuotaMax);
        oldValue = `${oldMaxQuota} kuota (Rp ${oldMax.toLocaleString('id-ID')})`;
        newValue = `${newMaxQuota} kuota (Rp ${maxAmount.toLocaleString('id-ID')})`;
      } else {
        oldValue = `Rp ${oldMax.toLocaleString('id-ID')}`;
        newValue = `Rp ${maxAmount.toLocaleString('id-ID')}`;
      }
      break;
    case 'price_per_quota':
      const oldPricePerQuota = rdpPriceManager.getRdpPrices().pricePerQuota || 3000;
      success = rdpPriceManager.setPricePerQuota(value);
      oldValue = oldPricePerQuota === 0 ? 'Gratis' : `Rp ${oldPricePerQuota.toLocaleString('id-ID')}`;
      newValue = value === 0 ? 'Gratis' : `Rp ${parseInt(value).toLocaleString('id-ID')}`;
      break;
    default:
      await bot.editMessageText('❌ Invalid type.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }
          ]]
        }
      });
      return;
  }

  if (success) {
    const successText = 
      `✅ *Berhasil Update!*\n\n` +
      `${displayName}:\n` +
      `• Lama: ${oldValue}\n` +
      `• Baru: ${newValue}\n\n` +
      `Perubahan akan diterapkan untuk deposit/install selanjutnya.`;

    try {
      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu RDP Admin', callback_data: 'rdp_admin_menu' }
          ]]
        }
      });
      console.info(`[RDP ADMIN] ✅ ${displayName} updated: ${oldValue} → ${newValue} by admin ${chatId}`);
    } catch (editError) {
      console.error(`[RDP ADMIN] Error editing message:`, editError);
      // Try to send new message instead
      try {
        await bot.sendMessage(successText, {
          chat_id: chatId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Kembali ke Menu RDP Admin', callback_data: 'rdp_admin_menu' }
            ]]
          }
        });
        console.info(`[RDP ADMIN] ✅ ${displayName} updated (sent as new message): ${oldValue} → ${newValue} by admin ${chatId}`);
      } catch (sendError) {
        console.error(`[RDP ADMIN] Error sending new message:`, sendError);
      }
    }
  } else {
    const errorText = '❌ Gagal menyimpan perubahan.\n\nSilakan coba lagi atau hubungi admin.';
    try {
      await bot.editMessageText(errorText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }
          ]]
        }
      });
    } catch (editError) {
      try {
        await bot.sendMessage(errorText, {
          chat_id: chatId,
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }
            ]]
          }
        });
      } catch (sendError) {
        console.error(`[RDP ADMIN] Error sending error message:`, sendError);
      }
    }
    console.error(`[RDP ADMIN] ❌ Failed to save ${displayName} for admin ${chatId}`);
  }
}

/**
 * Get users list with pagination sorted by balance (descending)
 */
async function getUsersListWithPagination(page = 1, itemsPerPage = 20) {
  try {
    const offset = (page - 1) * itemsPerPage;
    
    // Get total count
    const totalCount = await db.get('SELECT COUNT(*) as count FROM users WHERE balance > 0');
    const totalUsers = totalCount?.count || 0;
    
    // Get users sorted by balance descending
    const users = await db.all(
      'SELECT telegram_id, balance FROM users WHERE balance > 0 ORDER BY balance DESC LIMIT ? OFFSET ?',
      [itemsPerPage, offset]
    );
    
    const totalPages = Math.ceil(totalUsers / itemsPerPage);
    
    return {
      users,
      totalUsers,
      totalPages,
      currentPage: page
    };
  } catch (error) {
    console.error('Error getting users list:', error);
    return {
      users: [],
      totalUsers: 0,
      totalPages: 0,
      currentPage: page
    };
  }
}

/**
 * Generate file content for download
 */
async function generateUsersListFile(quotaMode = false, pricePerQuota = 3000) {
  try {
    // Get all users sorted by balance descending
    const users = await db.all(
      'SELECT telegram_id, balance FROM users WHERE balance > 0 ORDER BY balance DESC'
    );
    
    let fileContent = '';
    if (quotaMode) {
      fileContent = '📊 DAFTAR USER KUOTA (TERBANYAK KE TERKECIL)\n\n';
      fileContent += `Harga Per Kuota: Rp ${pricePerQuota.toLocaleString('id-ID')}\n\n`;
      fileContent += 'Format: <user_id> <jumlah_kuota>\n\n';
      fileContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      
      users.forEach((user, index) => {
        const quota = Math.floor(user.balance / pricePerQuota);
        const balanceInRupiah = user.balance;
        fileContent += `${index + 1}. User ID: ${user.telegram_id}\n`;
        fileContent += `   Kuota: ${quota} kuota (Rp ${balanceInRupiah.toLocaleString('id-ID')})\n\n`;
      });
    } else {
      fileContent = '📊 DAFTAR USER SALDO (TERBANYAK KE TERKECIL)\n\n';
      fileContent += 'Format: <user_id> <jumlah>\n\n';
      fileContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      
      users.forEach((user, index) => {
        fileContent += `${index + 1}. User ID: ${user.telegram_id}\n`;
        fileContent += `   Saldo: Rp ${user.balance.toLocaleString('id-ID')}\n\n`;
      });
    }
    
    return fileContent;
  } catch (error) {
    console.error('Error generating users list file:', error);
    return '';
  }
}

/**
 * Handle deduct balance menu with user list
 */
async function handleDeductBalance(bot, chatId, messageId, page = 1) {
  if (!isAdmin(chatId)) {
    return;
  }

  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const prices = rdpPriceManager.getRdpPrices();
  const pricePerQuota = prices.pricePerQuota || 3000;
  
  // Get users list with pagination
  const { users, totalUsers, totalPages, currentPage } = await getUsersListWithPagination(page, 20);
  
  let menuText;
  if (quotaMode) {
    menuText = `💸 *Kurangi Kuota User* (Halaman ${currentPage}/${totalPages})\n\n`;
    menuText += `💎 Harga Per Kuota: Rp ${pricePerQuota.toLocaleString('id-ID')}\n\n`;
    menuText += `📋 *Daftar User (${totalUsers} total):*\n\n`;
    
    if (users.length === 0) {
      menuText += 'Tidak ada user dengan saldo > 0.\n\n';
    } else {
      users.forEach((user, index) => {
        const quota = Math.floor(user.balance / pricePerQuota);
        const balanceInRupiah = user.balance;
        const number = (currentPage - 1) * 20 + index + 1;
        menuText += `${number}. \`${user.telegram_id}\` - ${quota} kuota (Rp ${balanceInRupiah.toLocaleString('id-ID')})\n`;
      });
    }
    
    menuText += `\n\n📝 *Format Input:*\n\`<user_id> <jumlah_kuota>\`\n\n`;
    menuText += `Contoh: \`123456789 5\` (untuk mengurangi 5 kuota)`;
  } else {
    menuText = `💸 *Kurangi Saldo User* (Halaman ${currentPage}/${totalPages})\n\n`;
    menuText += `📋 *Daftar User (${totalUsers} total):*\n\n`;
    
    if (users.length === 0) {
      menuText += 'Tidak ada user dengan saldo > 0.\n\n';
    } else {
      users.forEach((user, index) => {
        const number = (currentPage - 1) * 20 + index + 1;
        menuText += `${number}. \`${user.telegram_id}\` - Rp ${user.balance.toLocaleString('id-ID')}\n`;
      });
    }
    
    menuText += `\n\n📝 *Format Input:*\n\`<user_id> <jumlah>\`\n\n`;
    menuText += `Contoh: \`123456789 50000\` (untuk mengurangi Rp 50.000)`;
  }

  const keyboard = {
    inline_keyboard: []
  };
  
  // Navigation buttons
  const navButtons = [];
  if (currentPage > 1) {
    navButtons.push({ text: '« Sebelumnya', callback_data: `rdp_deduct_list_page_${currentPage - 1}` });
  }
  if (currentPage < totalPages) {
    navButtons.push({ text: 'Berikutnya »', callback_data: `rdp_deduct_list_page_${currentPage + 1}` });
  }
  if (navButtons.length > 0) {
    keyboard.inline_keyboard.push(navButtons);
  }
  
  // Download button
  keyboard.inline_keyboard.push([
    { text: '📥 Download List (Semua Data)', callback_data: 'rdp_deduct_download_list' }
  ]);
  
  // Back button
  keyboard.inline_keyboard.push([
    { text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }
  ]);

  if (messageId) {
    try {
      await bot.editMessageText(menuText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (e) {
      await bot.sendMessage(menuText, {
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  } else {
    await bot.sendMessage(menuText, {
      chat_id: chatId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}

/**
 * Process deduct balance input
 */
async function processDeductBalance(bot, msg) {
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
    const { deductBalance, getBalance } = require('../utils/userManager');
    const currentBalance = await getBalance(userId);
    
    if (typeof currentBalance === 'string' && currentBalance === 'Unlimited') {
      const balanceLabel = quotaMode ? 'Kuota' : 'Saldo';
      await bot.sendMessage(
        `⚠️ User adalah admin dengan saldo unlimited.\n\n` +
        `👤 User ID: \`${userId}\`\n` +
        `💰 Jumlah yang akan dikurangi: ${inputDisplay}\n` +
        `💳 ${balanceLabel} Saat Ini: ${currentBalance}`,
        {
          chat_id: adminChatId,
          parse_mode: 'Markdown'
        }
      );
      return;
    }
    
    if (typeof currentBalance === 'number' && currentBalance < amount) {
      const balanceLabel = quotaMode ? 'Kuota' : 'Saldo';
      const currentBalanceDisplay = quotaMode 
        ? `${Math.floor(currentBalance / pricePerQuota)} kuota (Rp ${currentBalance.toLocaleString('id-ID')})`
        : `Rp ${currentBalance.toLocaleString('id-ID')}`;
      const shortage = amount - currentBalance;
      const shortageDisplay = quotaMode
        ? `${Math.ceil(shortage / pricePerQuota)} kuota (Rp ${shortage.toLocaleString('id-ID')})`
        : `Rp ${shortage.toLocaleString('id-ID')}`;
      
      await bot.sendMessage(
        `❌ ${balanceLabel} tidak cukup untuk dikurangi.\n\n` +
        `👤 User ID: \`${userId}\`\n` +
        `💰 Jumlah yang akan dikurangi: ${inputDisplay}\n` +
        `💳 ${balanceLabel} Saat Ini: ${currentBalanceDisplay}\n` +
        `💸 Kekurangan: ${shortageDisplay}`,
        {
          chat_id: adminChatId,
          parse_mode: 'Markdown'
        }
      );
      return;
    }
    
    const deducted = await deductBalance(userId, amount);
    if (deducted) {
      const newBalance = await getBalance(userId);
      const balanceLabel = quotaMode ? 'Kuota' : 'Saldo';
      const currentBalanceDisplay = quotaMode 
        ? `${Math.floor(currentBalance / pricePerQuota)} kuota (Rp ${currentBalance.toLocaleString('id-ID')})`
        : `Rp ${currentBalance.toLocaleString('id-ID')}`;
      const newBalanceDisplay = quotaMode
        ? `${Math.floor(newBalance / pricePerQuota)} kuota (Rp ${newBalance.toLocaleString('id-ID')})`
        : `Rp ${newBalance.toLocaleString('id-ID')}`;
      
      await bot.sendMessage(
        `✅ Berhasil mengurangi ${balanceLabel.toLowerCase()}:\n\n` +
        `👤 User ID: \`${userId}\`\n` +
        `💰 Jumlah: ${inputDisplay}\n` +
        `💳 ${balanceLabel} Lama: ${currentBalanceDisplay}\n` +
        `💳 ${balanceLabel} Baru: ${newBalanceDisplay}`,
        {
          chat_id: adminChatId,
          parse_mode: 'Markdown'
        }
      );
    } else {
      await bot.sendMessage('❌ Gagal mengurangi saldo. User ID tidak ditemukan.', {
        chat_id: adminChatId,
        parse_mode: 'Markdown'
      });
    }
  } catch (error) {
    console.error('Error deducting balance:', error);
    await bot.sendMessage('❌ Terjadi kesalahan saat mengurangi saldo.', {
      chat_id: adminChatId,
      parse_mode: 'Markdown'
    });
  }
}

/**
 * Handle toggle quota mode
 */
async function handleToggleQuotaMode(bot, chatId, messageId, enable) {
  if (!isAdmin(chatId)) {
    return;
  }

  const success = enable 
    ? rdpPriceManager.enableQuotaMode() 
    : rdpPriceManager.disableQuotaMode();

  if (success) {
    const modeText = enable ? 'Mode Kuota' : 'Mode Saldo';
    const statusText = enable ? 'ENABLED' : 'DISABLED';
    
    const successText = 
      `✅ *${modeText} ${statusText}!*\n\n` +
      `Mode telah ${enable ? 'diaktifkan' : 'dinonaktifkan'}.\n\n` +
      `${enable 
        ? '• Semua harga menggunakan sistem kuota\n• Deposit menggunakan kuota × harga per kuota' 
        : '• Harga menggunakan sistem saldo (Rupiah)\n• Set harga Docker dan Dedicated secara terpisah'}`;

    try {
      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'rdp_admin_menu' }
          ]]
        }
      });
    } catch (e) {
      await bot.sendMessage(successText, {
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'rdp_admin_menu' }
          ]]
        }
      });
    }
  } else {
    await bot.editMessageText('❌ Gagal mengubah mode. Silakan coba lagi.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }
        ]]
      }
    });
  }
}

/**
 * Handle toggle tracking request approval mode
 */
async function handleToggleTrackingRequestApproval(bot, chatId, messageId, enable) {
  if (!isAdmin(chatId)) {
    return;
  }

  const { setTrackingRequestApprovalMode } = require('../utils/trackingRequestSettings');
  const success = await setTrackingRequestApprovalMode(enable);

  if (success) {
    const modeText = enable ? 'Bot Owner' : 'Installer Owner';
    const statusText = enable ? 'ENABLED' : 'DISABLED';
    
    const successText = 
      `✅ *Tracking Request Approval Mode: ${statusText}!*\n\n` +
      `Mode: ${modeText}\n\n` +
      `${enable 
        ? '• Approve/reject dikirim ke Bot Owner\n• Channel hanya menerima info publik (disensor)'
        : '• Approve/reject dikirim ke Installer Owner\n• Channel hanya menerima info publik (disensor)'}`;

    try {
      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'rdp_admin_menu' }
          ]]
        }
      });
    } catch (e) {
      await bot.sendMessage(successText, {
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'rdp_admin_menu' }
          ]]
        }
      });
    }
  } else {
    await bot.editMessageText('❌ Gagal mengubah mode. Silakan coba lagi.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Kembali', callback_data: 'rdp_admin_menu' }
        ]]
      }
    });
  }
}

/**
 * Handle download users list
 */
async function handleDownloadUsersList(bot, chatId) {
  if (!isAdmin(chatId)) {
    return;
  }

  try {
    const quotaMode = rdpPriceManager.isQuotaModeEnabled();
    const prices = rdpPriceManager.getRdpPrices();
    const pricePerQuota = prices.pricePerQuota || 3000;
    
    // Generate file content
    const fileContent = await generateUsersListFile(quotaMode, pricePerQuota);
    
    if (!fileContent) {
      await bot.sendMessage('❌ Gagal membuat file list.', {
        chat_id: chatId
      });
      return;
    }
    
    // Create temp file
    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const fileName = quotaMode ? `list_user_kuota_${Date.now()}.txt` : `list_user_saldo_${Date.now()}.txt`;
    const filePath = path.join(tempDir, fileName);
    
    fs.writeFileSync(filePath, fileContent, 'utf8');
    
    // Send file - use bot parameter directly or create BotAdapter properly
    try {
      // Try to use bot parameter directly if it has sendDocument method
      if (bot && typeof bot.sendDocument === 'function') {
        await bot.sendDocument(chatId, filePath, {
          caption: quotaMode ? '📥 List User Kuota (Terbanyak ke Terkecil)' : '📥 List User Saldo (Terbanyak ke Terkecil)',
          parse_mode: 'Markdown'
        });
      } else if (bot && bot.telegram && typeof bot.telegram.sendDocument === 'function') {
        // Use bot.telegram if available (Telegraf format)
        await bot.telegram.sendDocument(chatId, { source: fs.createReadStream(filePath), filename: fileName }, {
          caption: quotaMode ? '📥 List User Kuota (Terbanyak ke Terkecil)' : '📥 List User Saldo (Terbanyak ke Terkecil)',
          parse_mode: 'Markdown'
        });
      } else {
        // Fallback: create BotAdapter with bot as telegram
        const BotAdapter = require('../utils/botAdapter');
        const botAdapter = new BotAdapter({ telegram: bot.telegram || bot });
        await botAdapter.sendDocument(chatId, filePath, {
          caption: quotaMode ? '📥 List User Kuota (Terbanyak ke Terkecil)' : '📥 List User Saldo (Terbanyak ke Terkecil)',
          parse_mode: 'Markdown'
        });
      }
    } catch (sendError) {
      console.error('Error sending document:', sendError);
      // Fallback: send as buffer
      const fileBuffer = Buffer.from(fileContent, 'utf8');
      if (bot && bot.telegram && typeof bot.telegram.sendDocument === 'function') {
        await bot.telegram.sendDocument(chatId, { source: fileBuffer, filename: fileName }, {
          caption: quotaMode ? '📥 List User Kuota (Terbanyak ke Terkecil)' : '📥 List User Saldo (Terbanyak ke Terkecil)',
          parse_mode: 'Markdown'
        });
      } else {
        throw sendError;
      }
    }
    
    // Clean up temp file after a delay
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }
    }, 10000);
    
  } catch (error) {
    console.error('Error downloading users list:', error);
    await bot.sendMessage('❌ Terjadi kesalahan saat membuat file.', {
      chat_id: chatId
    });
  }
}

module.exports = {
  handleRdpAdminMenu,
  handleSetDockerPrice,
  handleSetDedicatedPrice,
  handleSetPricePerQuota,
  handleSetMinDeposit,
  handleSetMaxDeposit,
  confirmAndSave,
  handleDeductBalance,
  processDeductBalance,
  handleToggleQuotaMode,
  handleDownloadUsersList,
  handleToggleTrackingRequestApproval
};

