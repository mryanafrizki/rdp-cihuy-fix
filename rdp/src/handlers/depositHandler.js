
const { handlePaymentStatus } = require('../utils/paymentStatus');
const { checkPaymentStatus, createPayment } = require('../utils/payment');
const BalanceManager = require('./balanceHandler');
const PaymentTracker = require('../utils/paymentTracker');
const { getUser, getBalance } = require('../utils/userManager');
const QRCode = require('qrcode');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

// Import depositRDPLimiter dari limits.js (deposit RDP menggunakan depositRDPLimiter, bukan depositLimiter)
let depositRDPLimiter = null;
try {
  const limits = require(path.join(__dirname, '../../../limits'));
  depositRDPLimiter = limits.depositRDPLimiter;
  if (!depositRDPLimiter) {
    console.warn('[RDP DEPOSIT] depositRDPLimiter not found in limits.js');
  }
} catch (error) {
  console.warn('[RDP DEPOSIT] Could not load depositRDPLimiter from limits.js:', error.message);
}

// Helper function untuk format waktu
function fmtMs(ms) {
  if (ms < 0) return '0 detik';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  const parts = [];
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  if (seconds > 0) parts.push(`${seconds} detik`);

  return parts.join(' ') || '0 detik';
}

// Format Rupiah
function toRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

async function handleDeposit(bot, chatId, messageId) {
  try {
    // Get RDP balance (from SQLite)
    const balance = await getBalance(chatId);
    const currentBalance = typeof balance === 'string' ? 0 : balance;
    
    // Get price per quota and quota mode
    const rdpPriceManager = require('../utils/rdpPriceManager');
    const prices = rdpPriceManager.getRdpPrices();
    const pricePerQuota = prices.pricePerQuota || 3000;
    const quotaMode = rdpPriceManager.isQuotaModeEnabled();
    const maxDepositAmount = prices.maxDepositAmount || 1000000;
    
    // Check balance limit
    const BalanceLimitManager = require('../../../utils/balance/balanceLimitManager');
    const maxRdpBalance = BalanceLimitManager.getMaxRdpBalance();
    
    // Check if balance has reached limit
    if (maxRdpBalance !== null && currentBalance >= maxRdpBalance) {
      // Balance sudah mencapai limit - tampilkan pesan limit
      let limitMessage;
      let limitDisplay;
      
      if (quotaMode) {
        const currentQuota = Math.floor(currentBalance / pricePerQuota);
        const maxQuota = Math.floor(maxRdpBalance / pricePerQuota);
        limitDisplay = `${maxQuota} kuota`;
        limitMessage = 
          `⚠️ Saldo/kuota anda telah mencapai limit ${limitDisplay}, belanja sekarang!`;
      } else {
        limitDisplay = toRupiah(maxRdpBalance);
        limitMessage = 
          `⚠️ Saldo/kuota anda telah mencapai limit ${limitDisplay}, belanja sekarang!`;
      }
      
      // Button: Install RDP
      const keyboard = {
        inline_keyboard: [[
          { text: '🖥️ Install RDP', callback_data: 'install_rdp' }
        ]]
      };
      
      await bot.editMessageText(limitMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
      return null;
    }
    
    // Calculate max deposit based on balance limit
    let effectiveMaxDeposit = maxDepositAmount;
    if (maxRdpBalance !== null) {
      const maxAllowedByBalance = maxRdpBalance - currentBalance;
      effectiveMaxDeposit = Math.min(maxDepositAmount, Math.max(0, maxAllowedByBalance));
    }
    
    // Calculate balance in quota if quota mode enabled
    let balanceText;
    if (quotaMode) {
      const quota = Math.floor(currentBalance / pricePerQuota);
      balanceText = `${quota} kuota`;
    } else {
      balanceText = toRupiah(currentBalance);
    }
    
    const balanceLabel = quotaMode ? 'Sisa Kuota' : 'Sisa Saldo';
    
    let menuText;
    let keyboard;
    
    if (quotaMode) {
      // Quota mode: show quota options
      const maxQuota = Math.floor(effectiveMaxDeposit / pricePerQuota);
      
      menuText =
        `💰 *DEPOSIT KUOTA RDP*\n\n` +
        `💎 *${balanceLabel}:* *${balanceText}*\n` +
        `💵 *Harga Per Kuota:* *${toRupiah(pricePerQuota)}*\n` +
        `📊 *Maksimal Deposit:* *${maxQuota} kuota*\n\n` +
        `Pilih jumlah kuota deposit:\n` +
        `(1 kuota = ${toRupiah(pricePerQuota)})`;

      // Filter buttons based on max deposit
      const buttons = [];
      const quotaOptions = [
        { text: '💎 1 Kuota', value: 1, callback: 'rdp_deposit_select_1' },
        { text: '💎 5 Kuota', value: 5, callback: 'rdp_deposit_select_5' },
        { text: '💎 10 Kuota', value: 10, callback: 'rdp_deposit_select_10' },
        { text: '💎 20 Kuota', value: 20, callback: 'rdp_deposit_select_20' },
        { text: '💎 50 Kuota', value: 50, callback: 'rdp_deposit_select_50' },
        { text: '💎 100 Kuota', value: 100, callback: 'rdp_deposit_select_100' }
      ];
      
      const availableQuotas = quotaOptions.filter(q => q.value <= maxQuota || maxQuota === 0);
      
      // Arrange buttons in rows of 2
      for (let i = 0; i < availableQuotas.length; i += 2) {
        const row = availableQuotas.slice(i, i + 2).map(q => ({
          text: q.text,
          callback_data: q.callback
        }));
        buttons.push(row);
      }
      
      buttons.push([{ text: '✏️ Jumlah Custom', callback_data: 'rdp_deposit_custom_quota' }]);
      buttons.push([{ text: '🔙 Kembali ke Menu RDP', callback_data: 'back_to_menu' }]);
      
      keyboard = { inline_keyboard: buttons };
    } else {
      // Saldo mode: show amount options
      menuText =
        `💰 *DEPOSIT SALDO RDP*\n\n` +
        `💵 *${balanceLabel}:* *${balanceText}*\n` +
        `📊 *Maksimal Deposit:* *${toRupiah(effectiveMaxDeposit)}*\n\n` +
        `Pilih nominal deposit atau masukkan nominal custom:`;

      // Filter buttons based on max deposit
      const buttons = [];
      const amountOptions = [
        { text: '💵 Rp 5.000', value: 5000, callback: 'rdp_deposit_select_5000' },
        { text: '💵 Rp 10.000', value: 10000, callback: 'rdp_deposit_select_10000' },
        { text: '💵 Rp 50.000', value: 50000, callback: 'rdp_deposit_select_50000' },
        { text: '💵 Rp 100.000', value: 100000, callback: 'rdp_deposit_select_100000' },
        { text: '💵 Rp 200.000', value: 200000, callback: 'rdp_deposit_select_200000' },
        { text: '💵 Rp 500.000', value: 500000, callback: 'rdp_deposit_select_500000' }
      ];
      
      const availableAmounts = amountOptions.filter(a => a.value <= effectiveMaxDeposit || effectiveMaxDeposit === 0);
      
      // Arrange buttons in rows of 2
      for (let i = 0; i < availableAmounts.length; i += 2) {
        const row = availableAmounts.slice(i, i + 2).map(a => ({
          text: a.text,
          callback_data: a.callback
        }));
        buttons.push(row);
      }
      
      buttons.push([{ text: '✏️ Nominal Custom', callback_data: 'rdp_deposit_custom_amount' }]);
      buttons.push([{ text: '🔙 Kembali ke Menu RDP', callback_data: 'back_to_menu' }]);
      
      keyboard = { inline_keyboard: buttons };
    }

    const msg = await bot.editMessageText(menuText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    // Return empty session since we're using callbacks now
    return null;
  } catch (error) {
    console.error('Error in handleDeposit:', error);
    await bot.editMessageText(
      '❌ Gagal memuat menu deposit.',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali', callback_data: 'back_to_menu' }
          ]]
        }
      }
    );
    return null;
  }
}

async function sendDepositConfirmation(bot, chatId, messageId, amount, quota = null) {
  try {
    const balance = await getBalance(chatId);
    const currentBalance = typeof balance === 'string' ? 0 : balance;
    const balanceAfterDeposit = currentBalance + amount;
    
    // Get price per quota for display
    const rdpPriceManager = require('../utils/rdpPriceManager');
    const prices = rdpPriceManager.getRdpPrices();
    const pricePerQuota = prices.pricePerQuota || 3000;
    const quotaMode = rdpPriceManager.isQuotaModeEnabled();
    
    // Validate balance limit
    const BalanceLimitManager = require('../../../utils/balance/balanceLimitManager');
    const maxRdpBalance = BalanceLimitManager.getMaxRdpBalance();
    
    if (maxRdpBalance !== null && balanceAfterDeposit > maxRdpBalance) {
      // Calculate max allowed deposit
      const maxAllowedDeposit = maxRdpBalance - currentBalance;
      
      let errorMessage;
      if (quotaMode) {
        const maxAllowedQuota = Math.floor(maxAllowedDeposit / pricePerQuota);
        const currentQuota = Math.floor(currentBalance / pricePerQuota);
        const maxQuota = Math.floor(maxRdpBalance / pricePerQuota);
        errorMessage = 
          `❌ *DEPOSIT MELEBIHI BATAS*\n\n` +
          `💎 *Sisa Kuota Saat Ini:* ${currentQuota} kuota\n` +
          `📊 *Maksimal Kuota:* ${maxQuota} kuota\n` +
          `💵 *Sisa Deposit yang Bisa Diisi:* ${maxAllowedQuota} kuota (${toRupiah(maxAllowedDeposit)})\n\n` +
          `💡 Deposit yang diminta akan membuat saldo melebihi batas maksimal.`;
      } else {
        errorMessage = 
          `❌ *DEPOSIT MELEBIHI BATAS*\n\n` +
          `💵 *Saldo Saat Ini:* ${toRupiah(currentBalance)}\n` +
          `📊 *Maksimal Balance:* ${BalanceLimitManager.formatBalance(maxRdpBalance)}\n` +
          `💵 *Sisa Deposit yang Bisa Diisi:* ${toRupiah(maxAllowedDeposit)}\n\n` +
          `💡 Deposit yang diminta akan membuat saldo melebihi batas maksimal.`;
      }
      
      try {
        await bot.editMessageText(errorMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
            ]]
          }
        });
      } catch (editError) {
        await bot.sendMessage(errorMessage, {
          chat_id: chatId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
            ]]
          }
        });
      }
      return;
    }
    
    // Calculate quota if not provided
    if (!quota) {
      quota = Math.round(amount / pricePerQuota);
    }
    
    // Calculate balance in quota if quota mode enabled
    let currentBalanceText;
    let balanceAfterDepositText;
    if (quotaMode) {
      const currentQuota = Math.floor(currentBalance / pricePerQuota);
      const afterQuota = Math.floor(balanceAfterDeposit / pricePerQuota);
      currentBalanceText = `${currentQuota} kuota`;
      balanceAfterDepositText = `${afterQuota} kuota`;
    } else {
      currentBalanceText = toRupiah(currentBalance);
      balanceAfterDepositText = toRupiah(balanceAfterDeposit);
    }
    
    const balanceLabel = quotaMode ? 'Sisa Kuota' : 'Sisa Saldo';
    
    const confirmText =
      `💰 *KONFIRMASI DEPOSIT RDP*\n\n` +
      `💎 *${balanceLabel} Saat Ini:*\n` +
      `   ${currentBalanceText}\n\n` +
      `💎 *Jumlah Kuota:*\n` +
      `   ${quota} kuota\n\n` +
      `💵 *Jumlah Deposit:*\n` +
      `   ${toRupiah(amount)}\n` +
      `   (1 kuota = ${toRupiah(pricePerQuota)})\n\n` +
      `💎 *${balanceLabel} Setelah Deposit:*\n` +
      `   *${balanceAfterDepositText}*\n\n` +
      `Pilih metode pembayaran:`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '💳 Bayar dengan QRIS', callback_data: `rdp_deposit_confirm_qris_${amount}` }],
        [{ text: '❌ Batalkan', callback_data: 'rdp_cancel_custom_deposit' }]
      ]
    };

    // Hapus pesan lama dan kirim pesan baru (untuk menghindari delay)
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (deleteError) {
      // Silent error jika pesan sudah tidak ada
    }
    
    // Kirim pesan baru
    await bot.sendMessage(confirmText, {
      chat_id: chatId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('[RDP DEPOSIT] Error showing confirmation:', error);
    try {
      await bot.editMessageText('❌ Gagal menampilkan konfirmasi deposit.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
          ]]
        }
      });
    } catch (editError) {
      await bot.sendMessage('❌ Gagal menampilkan konfirmasi deposit.', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
          ]]
        }
      });
    }
  }
}

async function handleDepositAmount(bot, msg, session) {
  const chatId = msg.chat.id;
  
  // Get quota mode
  const rdpPriceManager = require('../utils/rdpPriceManager');
  const prices = rdpPriceManager.getRdpPrices();
  const quotaMode = rdpPriceManager.isQuotaModeEnabled();
  const pricePerQuota = prices.pricePerQuota || 3000;
  const minDepositAmount = prices.minDepositAmount || 1000;
  const maxDepositAmount = prices.maxDepositAmount || 1000000;
  
  // Get current balance and calculate max deposit based on balance limit
  const balance = await getBalance(chatId);
  const currentBalance = typeof balance === 'string' ? 0 : balance;
  const BalanceLimitManager = require('../../../utils/balance/balanceLimitManager');
  const maxRdpBalance = BalanceLimitManager.getMaxRdpBalance();
  
  // Calculate max deposit: min(maxDepositAmount, maxBalance - currentBalance)
  let effectiveMaxDeposit = maxDepositAmount;
  if (maxRdpBalance !== null) {
    const maxAllowedByBalance = maxRdpBalance - currentBalance;
    effectiveMaxDeposit = Math.min(maxDepositAmount, Math.max(0, maxAllowedByBalance));
  }
  
  let amount;
  let quota;
  
  if (quotaMode) {
    // Quota mode: user input kuota
    let quotaText = msg.text;
    if (!quotaText || quotaText === 'undefined') {
      return;
    }
    
    quota = parseInt(quotaText.replace(/[^0-9]/g, ''));
    
    // Validate quota (min 1 kuota)
    if (isNaN(quota) || quota < 1) {
      quota = 1;
    }
    
    // Calculate amount from quota
    amount = quota * pricePerQuota;
    
    // In quota mode, min/max are stored as rupiah but represent kuota
    // Convert min/max to kuota for comparison
    const minQuota = Math.ceil(minDepositAmount / pricePerQuota);
    const maxQuota = Math.floor(effectiveMaxDeposit / pricePerQuota);
    
    // Validate and auto-adjust quota
    if (quota < minQuota) {
      // Adjust quota to meet minimum
      quota = minQuota;
      amount = quota * pricePerQuota;
    }
    
    if (quota > maxQuota && maxQuota > 0) {
      // Adjust quota to meet maximum (based on balance limit)
      quota = maxQuota;
      amount = quota * pricePerQuota;
    }
  } else {
    // Saldo mode: user input amount
    let amountText = msg.text;
    if (!amountText || amountText === 'undefined') {
      return;
    }
    
    amount = parseInt(amountText.replace(/[^0-9]/g, ''), 10);
    
    // Validate and auto-adjust amount
    if (isNaN(amount) || amount < minDepositAmount) {
      amount = minDepositAmount;
    }
    
    if (amount > effectiveMaxDeposit && effectiveMaxDeposit > 0) {
      amount = effectiveMaxDeposit;
    }
    
    // Calculate quota for display
    quota = Math.round(amount / pricePerQuota);
  }

  // Delete message if it's from user input (not callback)
  // Only delete if it's actually a user message (message_id > 0 and text is a number string)
  if (msg.message_id && msg.message_id > 0 && /^\d+$/.test(msg.text)) {
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch (error) {
      // Silent error
    }
  }
  
  // Ensure session has messageId
  if (!session || !session.messageId) {
    await bot.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan mulai dari awal.', {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
        ]]
      }
    });
    return;
  }

  // Show confirmation page with quota info
  await sendDepositConfirmation(bot, chatId, session.messageId, amount, quota);
}

async function processDepositConfirmation(bot, chatId, messageId, amount) {
  try {
    // Validate balance limit before creating QRIS
    const balance = await getBalance(chatId);
    const currentBalance = typeof balance === 'string' ? 0 : balance;
    const balanceAfterDeposit = currentBalance + amount;
    
    const BalanceLimitManager = require('../../../utils/balance/balanceLimitManager');
    const maxRdpBalance = BalanceLimitManager.getMaxRdpBalance();
    
    if (maxRdpBalance !== null && balanceAfterDeposit > maxRdpBalance) {
      const rdpPriceManager = require('../utils/rdpPriceManager');
      const quotaMode = rdpPriceManager.isQuotaModeEnabled();
      const pricePerQuota = rdpPriceManager.getRdpPrices().pricePerQuota || 3000;
      const maxAllowedDeposit = maxRdpBalance - currentBalance;
      
      let errorMessage;
      if (quotaMode) {
        const maxAllowedQuota = Math.floor(maxAllowedDeposit / pricePerQuota);
        const currentQuota = Math.floor(currentBalance / pricePerQuota);
        const maxQuota = Math.floor(maxRdpBalance / pricePerQuota);
        errorMessage = 
          `❌ *DEPOSIT MELEBIHI BATAS*\n\n` +
          `💎 *Sisa Kuota Saat Ini:* ${currentQuota} kuota\n` +
          `📊 *Maksimal Kuota:* ${maxQuota} kuota\n` +
          `💵 *Sisa Deposit yang Bisa Diisi:* ${maxAllowedQuota} kuota (${toRupiah(maxAllowedDeposit)})\n\n` +
          `💡 Deposit yang diminta akan membuat saldo melebihi batas maksimal.`;
      } else {
        errorMessage = 
          `❌ *DEPOSIT MELEBIHI BATAS*\n\n` +
          `💵 *Saldo Saat Ini:* ${toRupiah(currentBalance)}\n` +
          `📊 *Maksimal Balance:* ${BalanceLimitManager.formatBalance(maxRdpBalance)}\n` +
          `💵 *Sisa Deposit yang Bisa Diisi:* ${toRupiah(maxAllowedDeposit)}\n\n` +
          `💡 Deposit yang diminta akan membuat saldo melebihi batas maksimal.`;
      }
      
      await bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
          ]]
        }
      });
      return;
    }
    
    // Check depositRDPLimiter sebelum create QRIS
    if (depositRDPLimiter) {
      const canDeposit = depositRDPLimiter.can(chatId.toString());
      if (!canDeposit) {
        const count = depositRDPLimiter.getCount(chatId.toString());
        const limit = depositRDPLimiter.limit;
        const offense = depositRDPLimiter.getOffenses(chatId.toString());
        const blockTime = depositRDPLimiter.getBlockTime(chatId.toString());
        const blockTimeMs = blockTime ? blockTime - Date.now() : 0;
        const blockMinutes = Math.ceil(blockTimeMs / 60000);
        
        // Cap count agar tidak menampilkan melebihi limit (untuk display saja)
        const displayCount = Math.min(count, limit);
        
        let blockMessage = `⚠️ *DEPOSIT RDP DIBLOKIR*\n\n`;
        blockMessage += `Kamu telah membuat ${displayCount}/${limit} deposit RDP yang dibatalkan/kadaluarsa.\n`;
        if (offense > 0) {
          blockMessage += `Offense: ${offense}\n`;
        }
        blockMessage += `\n⏰ Tunggu ${blockMinutes} menit lagi sebelum bisa deposit kembali.`;
        
        await bot.editMessageText(blockMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }
            ]]
          }
        });
        
        console.info(`[RDP DEPOSIT LIMITER] ⚠️ Blocked user ${chatId} from creating QRIS: ${count}/${limit} (Offense: ${offense}, Block: ${blockMinutes}m)`);
        return;
      }
    }
    
    // Show loading message
    await bot.editMessageText(
      '⏳ Membuat tagihan pembayaran QRIS...',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );

    await getUser(chatId);
    
    // Generate unique code (sama seperti cursor.js)
    const uniqueCode = Math.floor(Math.random() * (100 - 10)) + 10; // 10-99
    const finalAmountToPay = amount + uniqueCode;
    // Generate RDP deposit ID: DEP-RDP-RANDOM (different from regular deposit ID)
    const depositId = `DEP-RDP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create payment via payment utility (supports both Atlantic and Pakasir)
    let data, paymentGatewayId, qrString;
    
    try {
      // Get API key based on gateway
      // PENTING: RDP deposit menggunakan API key khusus (PAKASIR_API_KEY_RDP)
      const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
      const apiKey = gateway === 'pakasir' 
        ? (process.env.PAKASIR_API_KEY_RDP || process.env.PAKASIR_APIKEY_RDP || process.env.PAKASIR_API_KEY || process.env.PAKASIR_APIKEY)
        : (process.env.ATLANTIC_API_KEY || process.env.ATLANTIS_API_KEY);
      
      if (!apiKey) {
        throw new Error(`API key not found for ${gateway} gateway`);
      }

      // Prepare additional data for Pakasir
      const additionalData = {};
      if (gateway === 'pakasir') {
        additionalData.projectSlug = process.env.PAKASIR_PROJECT_SLUG_RDP || process.env.PAKASIR_PROJECT_SLUG;
        additionalData.orderId = depositId; // DEP-RDP-RANDOM format
        
        console.info('[RDP DEPOSIT] [PAKASIR] Creating payment with:', {
          project: additionalData.projectSlug,
          orderId: additionalData.orderId,
          amount: finalAmountToPay,
          baseAmount: amount,
          uniqueCode: uniqueCode
        });
      }

      // Create payment using utility
      const paymentResult = await createPayment(apiKey, depositId, finalAmountToPay, additionalData);

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || 'Payment creation failed');
      }

      data = paymentResult.data;
      
      if (!data.qr_string) {
        console.error('[RDP DEPOSIT] Payment response:', paymentResult);
        throw new Error('Payment API failed: no QR data');
      }

      paymentGatewayId = data.id;
      qrString = data.qr_string;

    } catch (apiError) {
      console.error('[RDP DEPOSIT] Payment API Error:', apiError.response?.data || apiError.message);
      
      const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
      const gatewayName = gateway === 'pakasir' ? 'Pakasir' : 'Atlantic';
      
      let errorMsg = '❌ Gagal membuat QRIS deposit.\n\n';
      
      if (apiError.response?.status === 503) {
        errorMsg += `⚠️ *Server ${gatewayName} sedang sibuk/maintenance*\n\n` +
                   `Mohon tunggu beberapa saat dan coba lagi.`;
      } else if (apiError.response?.status === 500) {
        errorMsg += `⚠️ *Server ${gatewayName} mengalami masalah*\n\n` +
                   `Mohon coba lagi dalam beberapa menit.`;
      } else {
        errorMsg += `Error: ${apiError.response?.data?.message || apiError.message}\n\n` +
                   `Silakan coba lagi atau hubungi admin.`;
      }
      
      await bot.editMessageText(errorMsg, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
          ]]
        }
      });
      return;
    }

    // Calculate expiry (5 minutes like cursor.js)
    const expirationTime = new Date(Date.now() + 5 * 60 * 1000);
    const expiryTime = expirationTime.getTime();
    const expireTimeStr = expirationTime.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + ' WIB';

    // Generate QR Code
    const qrCodeBuffer = await QRCode.toBuffer(qrString, {
      width: 300,
      margin: 2
    });

    // Delete loading message
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (deleteError) {
      // Silent error
    }

    // Build caption - adjust for Pakasir vs Atlantic
    const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
    let displayUniqueCode, displayTotalPayment;
    
    if (gateway === 'pakasir') {
      // Untuk Pakasir: Total Bayar selalu menggunakan total_payment dari API response
      displayTotalPayment = data.total_payment || data.get_balance || finalAmountToPay;
      
      // Kode Unik tergantung fee by merchant
      // fee by merchant = yes: fee ditanggung seller (merchant), customer hanya bayar uniqueCode
      // fee by merchant = no: fee ditanggung customer, customer bayar fee + uniqueCode
      const feeByMerchantEnv = (process.env.PAKASIR_FEE_BY_MERCHANT || 'yes').toLowerCase().trim();
      const feeByMerchant = feeByMerchantEnv === 'yes';
      
      console.info('[RDP DEPOSIT] [PAKASIR] Fee by merchant config:', {
        envValue: process.env.PAKASIR_FEE_BY_MERCHANT,
        normalized: feeByMerchantEnv,
        isYes: feeByMerchant,
        fee: data.fee,
        uniqueCode: uniqueCode
      });
      
      if (feeByMerchant) {
        // PAKASIR_FEE_BY_MERCHANT=yes: Fee ditanggung seller, customer hanya bayar uniqueCode
        displayUniqueCode = uniqueCode;
        console.info('[RDP DEPOSIT] [PAKASIR] Kode Unik (yes - fee ditanggung seller):', displayUniqueCode, '= uniqueCode saja');
      } else {
        // PAKASIR_FEE_BY_MERCHANT=no: Fee ditanggung customer, customer bayar fee + uniqueCode
        const pakasirFee = data.fee || 0;
        displayUniqueCode = pakasirFee + uniqueCode;
        console.info('[RDP DEPOSIT] [PAKASIR] Kode Unik (no - fee ditanggung customer):', displayUniqueCode, '= fee', pakasirFee, '+ uniqueCode', uniqueCode);
      }
    } else {
      // Untuk Atlantic: gunakan uniqueCode dan finalAmountToPay yang dihitung
      displayUniqueCode = uniqueCode;
      displayTotalPayment = finalAmountToPay;
    }
    
    const caption =
      `╭──「 *DEPOSIT SALDO RDP* 」─\n` +
      `┊\n┊ • ID Deposit: *${depositId}*\n┊\n` +
      `┊ • Jumlah Deposit: ${toRupiah(amount)}\n` +
      `┊ • Kode Unik: ${toRupiah(displayUniqueCode)}\n` +
      `┊ • *Total Bayar: ${toRupiah(displayTotalPayment)}*\n┊\n` +
      `┊ • Batas Waktu: 5 Menit\n` +
      `┊ • Expired: ${expireTimeStr}\n` +
      `╰──────────────`;

    // Send QR Code
    const sentMessage = await bot.sendPhoto(chatId, qrCodeBuffer, {
      caption: caption,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Batalkan Deposit', callback_data: 'rdp_cancel_deposit' }]
        ]
      }
    });

    // Add to payment tracker dengan QR message ID
    // Parameters: userId, transactionId, uniqueCode (10-99), amount, expiryTime, qrMessageId, depositId (DEP-RDP-RANDOM)
    await PaymentTracker.addPendingPayment(
      chatId,
      paymentGatewayId,
      uniqueCode,  // uniqueCode is the random number 10-99, not depositId
      amount,
      expiryTime,
      sentMessage.message_id,
      depositId  // depositId is DEP-RDP-RANDOM format
    );

    // PENTING: JANGAN increment depositRDPLimiter saat deposit dibuat!
    // Increment hanya saat cancel atau expired (EXACT pattern dari features/deposit/depositHandler.js)
    // Deposit reguler TIDAK increment saat deposit dibuat, hanya saat cancel/expired
    // Limiter akan di-increment di:
    // - cursor.js line 13215 (saat cancel)
    // - paymentStatus.js line 238 (saat expired)
    
    // Start payment watcher dengan QR message ID
    await handlePaymentStatus(
      bot,
      chatId,
      sentMessage.message_id,
      paymentGatewayId,
      amount,
      60,
      sentMessage.message_id
    );

  } catch (error) {
    console.error('[RDP DEPOSIT] Payment creation error:', error);
    const errorMessage = error.message ? error.message.replace(/[_*`]/g, '\\$&') : 'Unknown error';

    await bot.editMessageText(
      'Gagal membuat pembayaran QRIS. Silakan coba lagi.\n\n' +
      `Error: ${errorMessage}\n\n` +
      `Tips: Pastikan koneksi internet stabil`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Coba Lagi', callback_data: 'deposit' }],
            [{ text: '« Kembali', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  }
}

async function generateQrCodeFromString(qrString) {
  try {
    const qrBuffer = await QRCode.toBuffer(qrString, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrBuffer;
  } catch (error) {
    console.error('[RDP DEPOSIT] Failed to generate QR code:', error.message);
    return null;
  }
}

async function handlePendingPayment(bot, chatId, messageId) {
  try {
    const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
    if (!pendingPayment) {
      await bot.editMessageText(
        'Tidak ada tagihan pembayaran yang tertunda.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '« Kembali', callback_data: 'back_to_menu' }
            ]]
          }
        }
      );
      return;
    }

    // Get gateway type and API key
    // PENTING: RDP deposit menggunakan API key khusus (PAKASIR_API_KEY_RDP)
    const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
    const apiKey = gateway === 'pakasir' 
      ? (process.env.PAKASIR_API_KEY_RDP || process.env.PAKASIR_APIKEY_RDP || process.env.PAKASIR_API_KEY || process.env.PAKASIR_APIKEY)
      : (process.env.ATLANTIC_API_KEY || process.env.ATLANTIS_API_KEY);
    
      // Prepare additional data for Pakasir
      const additionalData = {};
      if (gateway === 'pakasir' && pendingPayment) {
        additionalData.projectSlug = process.env.PAKASIR_PROJECT_SLUG_RDP || process.env.PAKASIR_PROJECT_SLUG;
      additionalData.orderId = pendingPayment.deposit_id || pendingPayment.transaction_id;
      if (pendingPayment.amount) {
        const uniqueCode = parseInt(pendingPayment.unique_code) || 0;
        additionalData.amount = pendingPayment.amount + uniqueCode;
      }
    }
    
    const paymentStatus = await checkPaymentStatus(apiKey, pendingPayment.transaction_id, 0, additionalData);

    if (!paymentStatus.success) {
      throw new Error(paymentStatus.error || 'Failed to get payment status');
    }

    const messageText = createAtlantisPendingPaymentMessage(pendingPayment);
    const qrImageUrl = paymentStatus.data?.qr_image || '#';

    await bot.editMessageText(
      messageText + `\n\n[Klik untuk melihat QR Code](${qrImageUrl})`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Refresh Status', callback_data: 'refresh_payment' }],
            [{ text: 'Batalkan', callback_data: 'cancel_payment' }]
          ]
        }
      }
    );

    await handlePaymentStatus(bot, chatId, messageId, pendingPayment.transaction_id, pendingPayment.amount);

  } catch (error) {
    console.error('Error handling pending payment:', error);
    await bot.editMessageText(
      'Terjadi kesalahan saat mengecek tagihan pembayaran.\n\n' +
      `Error: ${error.message}`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '« Kembali', callback_data: 'back_to_menu' }
          ]]
        }
      }
    );
  }
}

function createAtlantisPaymentMessage(paymentData, amount) {
  const expiredAt = paymentData.expired_at ? new Date(paymentData.expired_at) : new Date(Date.now() + 30 * 60 * 1000);
  const expiredTime = expiredAt.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const fee = paymentData.fee || 0;
  const tambahan = paymentData.tambahan || 0;
  const getBalance = paymentData.get_balance || amount;

  // PENTING: Jangan tampilkan paymentGatewayId (paymentData.id) ke user
  // Hanya tampilkan reff_id (deposit ID) jika ada
  return `**💳 Scan QRIS untuk membayar**\n\n` +
    (paymentData.reff_id ? `🆔 **ID Deposit:** ${paymentData.reff_id}\n` : '') +
    `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
    `📊 **Fee:** Rp ${fee.toLocaleString()}\n` +
    `🎁 **Bonus:** Rp ${tambahan.toLocaleString()}\n` +
    `💎 **Saldo Diterima:** Rp ${getBalance.toLocaleString()}\n\n` +
    `⏰ **Berlaku hingga:** ${expiredTime}\n\n` +
    `📱 **Cara Pembayaran:**\n` +
    `1️⃣ Scan QR Code di atas\n` +
    `2️⃣ Gunakan aplikasi e-wallet apapun\n` +
    `3️⃣ Konfirmasi pembayaran\n` +
    `4️⃣ Saldo otomatis masuk\n\n` +
    `⚠️ **Jangan tutup halaman ini sampai selesai!**`;
}

function createAtlantisPendingPaymentMessage(pendingPayment) {
  const expiredAt = new Date(pendingPayment.expiry_time);
  const expiredTime = expiredAt.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  // PENTING: Jangan tampilkan paymentGatewayId (transaction_id) atau unique_code ke user
  // Hanya tampilkan deposit_id (DEP-RDP-RANDOM) jika ada
  const depositId = pendingPayment.deposit_id || '';
  return `**💳 QRIS Payment (Pending)**\n\n` +
    (depositId ? `🆔 **ID Deposit:** ${depositId}\n` : '') +
    `💰 **Jumlah:** Rp ${pendingPayment.amount.toLocaleString()}\n` +
    `⏰ **Berlaku hingga:** ${expiredTime}\n\n` +
    `📱 **Cara Pembayaran:**\n` +
    `1️⃣ Scan QR Code\n` +
    `2️⃣ Gunakan aplikasi e-wallet apapun\n` +
    `3️⃣ Konfirmasi pembayaran\n` +
    `4️⃣ Saldo otomatis masuk\n\n` +
    `📊 **Status:** Menunggu Pembayaran`;
}

module.exports = {
  handleDeposit,
  handleDepositAmount,
  sendDepositConfirmation,
  processDepositConfirmation,
  handlePendingPayment
};
