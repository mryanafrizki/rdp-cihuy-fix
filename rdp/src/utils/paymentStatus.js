const { checkPaymentStatus, isPaymentStatusSuccessful } = require('./payment');
const BalanceManager = require('../handlers/balanceHandler');
const PaymentTracker = require('./paymentTracker');
const { getBalance } = require('./userManager');
const path = require('path');

// Map untuk menyimpan expiryTimeoutId per transaction_id agar bisa di-clear saat cancel
const expiryTimeouts = new Map(); // transactionId -> timeoutId

// Import depositRDPLimiter dari limits.js (deposit RDP menggunakan depositRDPLimiter, bukan depositLimiter)
let depositRDPLimiter = null;
try {
  const limits = require(path.join(__dirname, '../../../limits'));
  depositRDPLimiter = limits.depositRDPLimiter;
} catch (error) {
  // Silent - limiter tidak kritis
}

// Import timer config dari set_timer.js
let timerConfig = null;
try {
  timerConfig = require(path.join(__dirname, '../../../set_timer'));
} catch (error) {
  // Fallback jika set_timer tidak tersedia
  timerConfig = {
    paymentCheckInterval: 5 * 1000, // 5 detik
    qrisReminderDelay: 2 * 60 * 1000 // 2 menit
  };
}

async function sendOrEditMessage(bot, chatId, messageId, text, options = {}) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
  } catch (editError) {
    try {
      const newMessage = await bot.sendMessage(chatId, text, options);
      return newMessage;
    } catch (sendError) {
      console.error('[RDP PAYMENT] Failed to send message:', sendError.message);
      throw sendError;
    }
  }
  return null;
}

async function handlePaymentStatus(bot, chatId, messageId, transactionId, amount, maxRetries = 60, qrMessageId = null) {
  // Helper function untuk mendapatkan bot Telegraf instance dari cursor.js
  // JANGAN clear cache karena bisa menyebabkan multiple bot instances!
  const getTelegramBot = () => {
    try {
      const cursorPath = path.join(__dirname, '../../../cursor');
      const cursorExports = require(cursorPath);
      if (cursorExports.bot && cursorExports.bot.telegram) {
        return cursorExports.bot.telegram;
      }
    } catch (e) {
      // Silent error
    }
    return null;
  };
  
  // Get bot instance from cursor.js (Telegraf bot instance) untuk semua operasi
  let telegramBot = getTelegramBot();
  
  // Fallback ke bot parameter jika cursorExports.bot tidak tersedia
  if (!telegramBot) {
    telegramBot = bot.telegram || bot;
  }
  let retryCount = 0;
  // PENTING: Dynamic check interval untuk mengurangi beban API saat banyak concurrent users
  // Base interval: 5 detik, dengan exponential backoff dan jitter untuk spread requests
  const baseInterval = timerConfig.paymentCheckInterval || 5 * 1000;
  
  // Get active pending payments count untuk adjust interval
  let activePaymentsCount = 0;
  try {
    // Estimate active payments dari PaymentTracker (jika ada method untuk itu)
    // Jika tidak ada, gunakan default
    if (PaymentTracker.getActivePaymentsCount && typeof PaymentTracker.getActivePaymentsCount === 'function') {
      activePaymentsCount = await PaymentTracker.getActivePaymentsCount();
    }
  } catch (e) {
    // Silent - gunakan default
  }
  
  // Dynamic interval: increase interval jika banyak concurrent users
  // Formula: baseInterval * (1 + log10(activePayments / 10))
  // - 10 users: ~5 detik
  // - 100 users: ~10 detik
  // - 1000 users: ~15 detik
  let dynamicInterval = baseInterval;
  if (activePaymentsCount > 10) {
    const multiplier = 1 + Math.log10(Math.max(1, activePaymentsCount / 10));
    dynamicInterval = Math.min(baseInterval * multiplier, 20 * 1000); // Max 20 detik
  }
  
  // Add jitter (random delay ±10%) untuk spread out requests dan avoid thundering herd
  const jitter = Math.random() * 0.2 - 0.1; // -10% to +10%
  const retryInterval = Math.round(dynamicInterval * (1 + jitter));
  
  // Log interval adjustment untuk monitoring
  if (activePaymentsCount > 100) {
    console.info(`[RDP PAYMENT] Dynamic interval adjusted: ${activePaymentsCount} active payments → ${retryInterval}ms (base: ${baseInterval}ms)`);
  }
  // Gunakan object untuk menyimpan reminder message ID agar bisa diakses dari closure
  const messageIds = { reminder: null };
  let expiryTimeoutId = null;
  
  // Get pending payment info
  const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
  const expiryTime = pendingPayment?.expiry_time || Date.now() + (5 * 60 * 1000);
  const remainingTime = Math.max(0, expiryTime - Date.now());
  
  // Set reminder (menggunakan qrisReminderDelay dari set_timer) - EXACT pattern dari features/deposit/depositHandler.js
  const reminderDelay = timerConfig.qrisReminderDelay || 2 * 60 * 1000;
  const reminderTime = Math.max(0, remainingTime - reminderDelay);
  if (reminderTime > 0) {
    setTimeout(async () => {
      try {
        // Get telegramBot menggunakan helper function
        let reminderTelegramBot = getTelegramBot();
        if (!reminderTelegramBot) {
          reminderTelegramBot = telegramBot || bot.telegram || bot;
        }
        
        const stillPending = await PaymentTracker.getPendingPayment(chatId);
        if (stillPending && stillPending.transaction_id === transactionId) {
          // PENTING: Cek dulu apakah transaction sudah di-cancel
          const atlanticGatewayId = stillPending.transaction_id || stillPending.unique_code;
          if (atlanticGatewayId) {
            try {
              const cursorExports = require(path.join(__dirname, '../../../cursor'));
              if (cursorExports.canceledTransactions && cursorExports.canceledTransactions.has(atlanticGatewayId)) {
                console.info(`[RDP DEPOSIT] ⚠️ Transaction ${transactionId} already canceled, skipping reminder`);
                return;
              }
            } catch (e) {
              console.warn('[RDP DEPOSIT] Error checking canceledTransactions:', e.message);
            }
          }
          
          const reminderMinutes = Math.floor(reminderDelay / 60000);
          
          // Gunakan telegramBot untuk sendMessage
          let reminderMsg = null;
          if (reminderTelegramBot && typeof reminderTelegramBot.sendMessage === 'function') {
            reminderMsg = await reminderTelegramBot.sendMessage(chatId,
              `⏰ *REMINDER*\n\n` +
              `Sisa waktu deposit *${reminderMinutes} menit* lagi!\n\n` +
              `Segera selesaikan pembayaran Anda.`,
              { parse_mode: 'Markdown' }
            );
          } else {
            console.error(`[RDP DEPOSIT] Cannot send reminder: telegramBot not available`);
          }
          
          if (reminderMsg && reminderMsg.message_id) {
            messageIds.reminder = reminderMsg.message_id; // Simpan ke object untuk digunakan di timeout closure
            // Simpan reminder message ID ke database
            await PaymentTracker.updateReminderMessageId(transactionId, messageIds.reminder);
            console.info(`[RDP DEPOSIT] ✅ Sent reminder message ${messageIds.reminder} and saved to DB`);
          }
        }
      } catch (e) {
        console.error('[RDP DEPOSIT] Error sending reminder:', e.message);
        console.error('[RDP DEPOSIT] Error stack:', e.stack);
      }
    }, reminderTime);
  }
  
  // Set expiry timeout untuk hapus QRIS saat expired (EXACT pattern dari features/deposit/depositHandler.js)
  if (remainingTime > 0) {
    // Capture message IDs dan bot instance untuk digunakan di timeout closure
    const capturedQrMsgId = qrMessageId || pendingPayment?.qr_message_id;
    const capturedTransactionId = transactionId;
    
    expiryTimeoutId = setTimeout(async () => {
      // Clear timeout ID dari map saat timeout dieksekusi
      expiryTimeouts.delete(capturedTransactionId);
      // Declare pakasirDataForMonitor in outer scope
      let pakasirDataForMonitor = null;
      
      try {
        // Get bot instance dari cursor.js (EXACT pattern dari features/deposit/depositHandler.js)
        let telegramBot = getTelegramBot();
        if (!telegramBot) {
          // Fallback ke bot parameter
          telegramBot = bot.telegram || bot;
        }
        
        // Get pending payment untuk cek canceled status (PENTING: cek dulu sebelum hapus messages)
        let stillPending = null;
        let finalRemMsgId = messageIds.reminder; // Prioritas dari object (akan diupdate oleh setTimeout reminder)
        try {
          stillPending = await PaymentTracker.getPendingPayment(chatId);
          if (stillPending && stillPending.transaction_id === capturedTransactionId) {
            // PENTING: Cek dulu apakah transaction sudah di-cancel
            const atlanticGatewayId = stillPending.transaction_id || stillPending.unique_code;
            if (atlanticGatewayId) {
              try {
                const cursorExports = require(path.join(__dirname, '../../../cursor'));
                if (cursorExports.canceledTransactions && cursorExports.canceledTransactions.has(atlanticGatewayId)) {
                  console.info(`[EXPIRED RDP DEPOSIT] ⚠️ Transaction ${capturedTransactionId} already canceled, skipping expired notification`);
                  // Clear dari canceled map setelah expired timeout
                  cursorExports.canceledTransactions.delete(atlanticGatewayId);
                  return;
                }
              } catch (e) {
                console.warn('[EXPIRED RDP DEPOSIT] Error checking canceledTransactions:', e.message);
              }
            }
            
            // Jika reminder message ID belum ada di object, coba ambil dari database
            if (!finalRemMsgId) {
              finalRemMsgId = stillPending.reminder_message_id;
            }
            
            // ========================================
            // CHECK PAYMENT STATUS (untuk detect jika sudah paid)
            // ========================================
            // PENTING: Tidak ada cancel API call - biarkan interval tetap jalan untuk auto-detect payment
            // Gateway ID untuk check status (bisa unique_code atau transaction_id)
            if (atlanticGatewayId) {
              try {
                // Check status via API untuk detect jika sudah paid
                console.info(`[RDP DEPOSIT] 🔍 Checking payment status (expired): ${atlanticGatewayId}`);
                const { checkPaymentStatus } = require('./payment');
                
                // Get gateway type and API key
                const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
                // PENTING: RDP deposit menggunakan API key khusus (PAKASIR_API_KEY_RDP)
                const apiKey = gateway === 'pakasir' 
                  ? (process.env.PAKASIR_API_KEY_RDP || process.env.PAKASIR_APIKEY_RDP || process.env.PAKASIR_API_KEY || process.env.PAKASIR_APIKEY)
                  : (process.env.ATLANTIC_API_KEY || process.env.ATLANTIS_API_KEY);
                
                // Prepare additional data for Pakasir
                const additionalData = {};
                if (gateway === 'pakasir' && stillPending) {
                  additionalData.projectSlug = process.env.PAKASIR_PROJECT_SLUG_RDP || process.env.PAKASIR_PROJECT_SLUG;
                  // PENTING: Untuk Pakasir, order_id harus sama dengan yang dikirim saat create
                  // deposit_id adalah order_id yang kita kirim saat create payment
                  additionalData.orderId = (stillPending.deposit_id || atlanticGatewayId).toString().trim();
                  // PENTING: Untuk Pakasir, amount harus finalAmountToPay (amount + uniqueCode)
                  // unique_code disimpan sebagai primary key di PaymentTracker
                  const uniqueCode = parseInt(stillPending.unique_code) || 0;
                  const baseAmount = parseInt(stillPending.amount) || parseInt(amount) || 0;
                  additionalData.amount = baseAmount + uniqueCode; // finalAmountToPay
                }
                
                const statusResult = await checkPaymentStatus(
                  apiKey,
                  atlanticGatewayId,
                  0,
                  additionalData
                );
                
                // Log hasil check status
                console.info(`[RDP DEPOSIT] 📊 Status check result (expired):`, {
                  success: statusResult?.success,
                  hasData: !!statusResult?.data,
                  hasError: !!statusResult?.error,
                  status: statusResult?.data?.status || statusResult?.error?.message || 'unknown',
                  gatewayId: atlanticGatewayId
                });
                
                if (statusResult && statusResult.success && statusResult.data) {
                  const paymentStatus = statusResult.data.status?.toLowerCase();
                  const paidStatuses = ['paid', 'success', 'settlement', 'capture', 'completed'];
                  
                  console.info(`[RDP DEPOSIT] 📋 Payment status (expired): ${paymentStatus} (gatewayId: ${atlanticGatewayId})`);
                  
                  // Check jika sudah paid - biarkan interval handle success
                  if (paidStatuses.includes(paymentStatus)) {
                    console.info(`[RDP DEPOSIT] ✅ Payment already paid (expired) - interval will handle success: ${atlanticGatewayId}, status: ${paymentStatus}`);
                    // Skip - interval akan handle proses success
                    return;
                  } else {
                    console.info(`[RDP DEPOSIT] 📋 Payment status: ${paymentStatus} (still pending) - expired (no API call, interval will continue)`);
                  }
                } else {
                  console.warn(`[RDP DEPOSIT] ⚠️ Failed to check payment status (expired):`, statusResult?.error || 'Unknown error');
                  // Continue anyway (no API call, interval will continue)
                }
              } catch (statusError) {
                console.warn(`[RDP DEPOSIT] ⚠️ Error checking payment status (expired):`, statusError.message);
                // Continue anyway (no API call, interval will continue)
              }
            }
            // ========================================
            // PENTING: Tidak ada cancel API call - biarkan interval tetap jalan selama minimal 1 menit
            // Interval akan auto-detect jika payment sudah paid dan process success
            // ========================================
            
            // PENTING: Simpan data sebelum hapus database (untuk monitoring)
            const transactionIdForMonitor = stillPending?.transaction_id || capturedTransactionId;
            const depositIdForMonitor = stillPending?.deposit_id || stillPending?.unique_code || capturedTransactionId;
            
            // Prepare Pakasir data BEFORE removing pending payment
            const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
            if (gateway === 'pakasir' && stillPending) {
              const uniqueCode = parseInt(stillPending.unique_code) || 0;
              const baseAmount = parseInt(stillPending.amount) || 0;
              pakasirDataForMonitor = {
                projectSlug: process.env.PAKASIR_PROJECT_SLUG_RDP || process.env.PAKASIR_PROJECT_SLUG,
                orderId: stillPending.deposit_id || transactionIdForMonitor,
                amount: baseAmount + uniqueCode // finalAmountToPay
              };
              console.info(`[RDP DEPOSIT] Prepared Pakasir data for cleared monitor:`, pakasirDataForMonitor);
            }
            
            // hapus pending payment (SETELAH simpan data yang diperlukan)
            await PaymentTracker.removePendingPayment(capturedTransactionId);
          }
        } catch (e) {
          // Silent - payment mungkin sudah dihapus
        }
        
        // Delete QR message dan reminder message dengan random delay 1-3 detik
        // Ignore "message not found" error - message mungkin sudah dihapus user/cancel
        const deletePromises = [];
        
        // PENTING: Hapus QR message saat expired
        if (capturedQrMsgId && telegramBot && typeof telegramBot.deleteMessage === 'function') {
          const qrRandomDelay = Math.floor(Math.random() * 2000) + 1000; // 1-3 detik (1000-3000ms)
          deletePromises.push(
            new Promise((resolve) => {
              setTimeout(async () => {
                try {
                  await telegramBot.deleteMessage(chatId, capturedQrMsgId);
                  console.info(`[RDP DEPOSIT] ✅ Deleted QR message ${capturedQrMsgId} (expired, delay: ${qrRandomDelay}ms)`);
                } catch (e) {
                  // Ignore "message not found" error (message mungkin sudah dihapus)
                  if (e.message && e.message.includes('message to delete not found')) {
                    console.info(`[RDP DEPOSIT] QR message ${capturedQrMsgId} already deleted (expired)`);
                  } else {
                    console.error(`[RDP DEPOSIT] Error deleting QR message ${capturedQrMsgId}:`, e.message);
                  }
                }
                resolve();
              }, qrRandomDelay);
            })
          );
        } else if (capturedQrMsgId) {
          console.error(`[RDP DEPOSIT] ❌ Cannot delete QR message ${capturedQrMsgId}: telegramBot.deleteMessage not available`);
        }
        
        // Hapus reminder message
        if (finalRemMsgId && telegramBot && typeof telegramBot.deleteMessage === 'function') {
          const randomDelay = Math.floor(Math.random() * 2000) + 1000; // 1-3 detik (1000-3000ms)
          deletePromises.push(
            new Promise((resolve) => {
              setTimeout(async () => {
                try {
                  await telegramBot.deleteMessage(chatId, finalRemMsgId);
                  console.info(`[RDP DEPOSIT] ✅ Deleted reminder message ${finalRemMsgId} (expired, delay: ${randomDelay}ms)`);
                } catch (e) {
                  // Ignore "message not found" error (message mungkin sudah dihapus)
                  if (e.message && e.message.includes('message to delete not found')) {
                    console.info(`[RDP DEPOSIT] Reminder message ${finalRemMsgId} already deleted (expired)`);
                  } else {
                    console.error(`[RDP DEPOSIT] Error deleting reminder message ${finalRemMsgId}:`, e.message);
                  }
                }
                resolve();
              }, randomDelay);
            })
          );
        } else if (finalRemMsgId) {
          console.error(`[RDP DEPOSIT] ❌ Cannot delete reminder message ${finalRemMsgId}: telegramBot.deleteMessage not available`);
        }
        
        // Wait for all deletions to complete (or at least started)
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises).catch(() => {});
        }
        
        // Hapus block middleware warning message (warnState) jika ada - PENTING: Tetap hapus meskipun pending sudah dihapus!
        try {
          const cursorExports = require(path.join(__dirname, '../../../cursor'));
          if (cursorExports.warnState && cursorExports.freezeUntil) {
            const warnData = cursorExports.warnState.get(chatId.toString());
            if (warnData) {
              clearInterval(warnData.interval);
              try {
                const botInstance = cursorExports.bot;
                if (botInstance && botInstance.telegram) {
                  await botInstance.telegram.deleteMessage(warnData.chatId, warnData.messageId);
                }
              } catch (_) {}
              cursorExports.warnState.delete(chatId.toString());
            }
            cursorExports.freezeUntil.delete(chatId.toString());
          }
        } catch (_) {}
        
        // PENTING: Tunggu sebentar (1-2 detik) untuk memastikan QRIS benar-benar expired sebelum increment/notification
        // Ini memastikan bahwa jika ada payment success di detik terakhir, tidak increment limiter
        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 1000)); // 1-2 detik
        
        // Double check: Pastikan payment benar-benar expired (jika masih ada, berarti tidak success)
        let finalCheckPending = null;
        try {
          finalCheckPending = await PaymentTracker.getPendingPayment(chatId);
        } catch (e) {
          // Silent - payment sudah dihapus
        }
        
        // Jika masih ada pending payment dengan transaction_id yang sama, log warning tapi tetap increment (sama seperti deposit biasa)
        if (finalCheckPending && finalCheckPending.transaction_id === capturedTransactionId) {
          console.info(`[RDP DEPOSIT] ⚠️ Payment ${capturedTransactionId} still pending after expiry timeout, but incrementing anyway (may be processing)`);
        }
        
        // PENTING: Tetap increment limiter dan kirim notification meskipun pending sudah dihapus (EXACT pattern dari features/deposit/depositHandler.js)
        const wasPending = stillPending && stillPending.transaction_id === capturedTransactionId;
        // Use deposit_id (DEP-RDP-RANDOM format) instead of unique_code (Atlantic gateway ID)
        const depositIdForNotification = wasPending ? (stillPending.deposit_id || stillPending.unique_code || capturedTransactionId) : capturedTransactionId;
        
        // Increment depositRDPLimiter (expired = sama seperti cancel)
        // PENTING: Sama seperti deposit biasa - langsung increment tanpa kondisi kompleks
        // (cek canceledTransactions sudah dilakukan di awal, dan finalCheckPending sudah di-handle di atas)
        const { depositRDPLimiter } = require(path.join(__dirname, '../../../limits'));
        if (depositRDPLimiter) {
          try {
            const countBefore = depositRDPLimiter.inc(chatId.toString()); // Return value adalah BEFORE increment
            const countAfter = depositRDPLimiter.getCount(chatId.toString()); // Get count SETELAH increment
            const offense = depositRDPLimiter.getOffenses(chatId.toString());
            console.info(`[RDP DEPOSIT LIMITER] ✅ Expired: ${chatId} → before=${countBefore} → after=${countAfter}/${depositRDPLimiter.limit} (Offense: ${offense})`);
          } catch (e) {
            console.error(`[RDP DEPOSIT LIMITER] Error incrementing limiter:`, e.message);
          }
        }
        
        // Send main menu with expired notification (EXACT pattern dari features/deposit/depositHandler.js)
        // PENTING: Tetap kirim meskipun pending sudah dihapus!
        try {
          const cursorExports = require(path.join(__dirname, '../../../cursor'));
          const sendMainMenu = cursorExports.sendMainMenu;
          
          // Get depositRDPLimiter info untuk ditampilkan di notification
          // NOTE: Limiter info will be shown in sendMainMenu, no need to duplicate here
          
          if (sendMainMenu && telegramBot) {
            await sendMainMenu(telegramBot, chatId, { 
              type: 'deposit_rdp_expired', 
              depositId: depositIdForNotification 
            });
            console.info(`[RDP DEPOSIT] ✅ Expired notification sent for ${depositIdForNotification}`);
          } else {
            // Fallback - tambahkan info limit
            if (telegramBot && typeof telegramBot.sendMessage === 'function') {
              await telegramBot.sendMessage(chatId,
                `⏰ *Waktu pembayaran deposit RDP habis*\n\n` +
                `Deposit ID: \`${depositIdForNotification}\`${limiterInfo}\n\n` +
                `Silakan deposit kembali jika diperlukan.`,
                {
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [[
                      { text: '💰 Deposit Lagi', callback_data: 'deposit' },
                      { text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }
                    ]]
                  }
                }
              );
              console.info(`[RDP DEPOSIT] ✅ Fallback expired notification sent for ${depositIdForNotification}`);
            }
          }
        } catch (e) {
          console.error('[RDP DEPOSIT] ❌ Error sending expired notification:', e?.description || e?.message || e);
        }

        // ========================================
        // START MONITORING PAYMENT (setelah clear)
        // ========================================
        // PENTING: Setelah clear semua, start monitoring selama 1 menit untuk detect late payment
        // PENTING: Gunakan data yang sudah disimpan sebelum hapus database
        // Note: stillPending might be null here if it was already deleted, but pakasirDataForMonitor should be set if it was Pakasir
        const transactionIdForMonitor = stillPending?.transaction_id || capturedTransactionId;
        const depositIdForMonitor = stillPending?.deposit_id || stillPending?.unique_code || capturedTransactionId;
        
        if (transactionIdForMonitor) {
          try {
            const cursorExports = require(path.join(__dirname, '../../../cursor'));
            const startClearedPaymentMonitor = cursorExports.startClearedPaymentMonitor;
            const clearedPaymentMonitors = cursorExports.clearedPaymentMonitors;
            if (startClearedPaymentMonitor) {
              // Start cleared payment monitor
              startClearedPaymentMonitor(transactionIdForMonitor, depositIdForMonitor, chatId.toString(), 'rdp_deposit', { telegram: telegramBot });
              
              // Store Pakasir data in monitor if available (pakasirDataForMonitor was prepared before removing pending payment)
              if (pakasirDataForMonitor) {
                // Use multiple attempts with increasing delays to ensure monitor is created
                const storePakasirData = (attempt = 0) => {
                  try {
                    if (clearedPaymentMonitors && clearedPaymentMonitors.has(transactionIdForMonitor)) {
                      const monitor = clearedPaymentMonitors.get(transactionIdForMonitor);
                      if (monitor) {
                        monitor.pakasirData = pakasirDataForMonitor;
                        console.info(`[RDP DEPOSIT] ✅ Stored Pakasir data in monitor for ${transactionIdForMonitor}:`, pakasirDataForMonitor);
                        return;
                      }
                    }
                    // Retry if monitor not found yet (max 5 attempts, up to 500ms)
                    if (attempt < 5) {
                      setTimeout(() => storePakasirData(attempt + 1), 100 * (attempt + 1));
                    } else {
                      console.warn(`[RDP DEPOSIT] ⚠️ Failed to store Pakasir data in monitor after ${attempt + 1} attempts`);
                    }
                  } catch (e) {
                    console.warn('[RDP DEPOSIT] Error storing Pakasir data in monitor:', e.message);
                  }
                };
                storePakasirData();
              }
              
              console.info(`[RDP DEPOSIT] Started cleared payment monitor for ${transactionIdForMonitor} (expired)`);
            }
          } catch (e) {
            console.warn('[RDP DEPOSIT] Error starting cleared payment monitor:', e.message);
          }
        }
        // ========================================
      } catch (e) {
        console.error('[RDP DEPOSIT] ❌ Error handling expiry:', e);
      }
    }, remainingTime);
    
    // Simpan timeout ID ke map agar bisa di-clear saat cancel
    expiryTimeouts.set(transactionId, expiryTimeoutId);
  }

  const checkStatus = async () => {
    try {
      // PENTING: Recalculate dynamic interval di setiap check untuk fleksibilitas maksimal
      // Ini memastikan interval menyesuaikan dengan jumlah active payments yang berubah
      let currentActivePaymentsCount = 0;
      try {
        if (PaymentTracker.getActivePaymentsCount && typeof PaymentTracker.getActivePaymentsCount === 'function') {
          currentActivePaymentsCount = await PaymentTracker.getActivePaymentsCount();
        }
      } catch (e) {
        // Silent - gunakan base interval
      }
      
      // Recalculate dynamic interval
      let currentDynamicInterval = baseInterval;
      if (currentActivePaymentsCount > 10) {
        const multiplier = 1 + Math.log10(Math.max(1, currentActivePaymentsCount / 10));
        currentDynamicInterval = Math.min(baseInterval * multiplier, 20 * 1000); // Max 20 detik
      }
      
      // Add jitter untuk spread requests
      const currentJitter = Math.random() * 0.2 - 0.1; // -10% to +10%
      const currentRetryInterval = Math.round(currentDynamicInterval * (1 + currentJitter));
      
      // Cek apakah pending payment masih ada (jika sudah dihapus via cancel, stop watcher)
      const stillPending = await PaymentTracker.getPendingPayment(chatId);
      if (!stillPending || stillPending.transaction_id !== transactionId) {
        // Get user info untuk logging
        let userInfo = `ID: ${chatId}`;
        try {
          const chat = await bot.getChat(chatId);
          const username = chat.username ? `@${chat.username}` : 'N/A';
          const firstName = chat.first_name || 'N/A';
          const lastName = chat.last_name ? ` ${chat.last_name}` : '';
          userInfo = `ID: ${chatId} | Username: ${username} | Nama: ${firstName}${lastName}`;
        } catch {}
        console.info(`[RDP PAYMENT] ⏸️ Payment watcher stopped (cancelled/removed) - ${userInfo} | Transaction: ${transactionId}`);
        return; // Stop watcher jika payment sudah dihapus
      }
      
      // Get pending payment info untuk mendapatkan message IDs
      const currentPending = await PaymentTracker.getPendingPayment(chatId);
      
      // Get gateway type and API key
      // PENTING: RDP deposit menggunakan API key khusus (PAKASIR_API_KEY_RDP)
      const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
      const apiKey = gateway === 'pakasir' 
        ? (process.env.PAKASIR_API_KEY_RDP || process.env.PAKASIR_APIKEY_RDP || process.env.PAKASIR_API_KEY || process.env.PAKASIR_APIKEY)
        : (process.env.ATLANTIC_API_KEY || process.env.ATLANTIS_API_KEY);
      
      // Prepare additional data for Pakasir
      const additionalData = {};
      if (gateway === 'pakasir' && currentPending) {
        additionalData.projectSlug = process.env.PAKASIR_PROJECT_SLUG_RDP || process.env.PAKASIR_PROJECT_SLUG;
        // PENTING: Untuk Pakasir, order_id harus sama dengan yang dikirim saat create
        // deposit_id adalah order_id yang kita kirim saat create payment
        additionalData.orderId = (currentPending.deposit_id || transactionId).toString().trim();
        // PENTING: Untuk Pakasir, amount harus finalAmountToPay (amount + uniqueCode)
        // unique_code disimpan sebagai primary key di PaymentTracker
        const uniqueCode = parseInt(currentPending.unique_code) || 0;
        const baseAmount = parseInt(currentPending.amount) || parseInt(amount) || 0;
        additionalData.amount = baseAmount + uniqueCode; // finalAmountToPay
        
        // Log untuk debugging
        console.info(`[RDP PAYMENT] [PAKASIR] Status check params:`, {
          project: additionalData.projectSlug,
          orderId: additionalData.orderId,
          amount: additionalData.amount,
          baseAmount: baseAmount,
          uniqueCode: uniqueCode,
          transactionId: transactionId,
          deposit_id: currentPending.deposit_id
        });
      }
      
      const statusResult = await checkPaymentStatus(apiKey, transactionId, 0, additionalData);

      // PENTING: Log response untuk debugging jika status tidak terdeteksi
      if (!statusResult || !statusResult.success || !statusResult.data) {
        // Skip jika status check gagal (misalnya website down) - akan retry di interval berikutnya
        // PENTING: Jangan cancel payment hanya karena check status gagal, tunggu website up lagi
        console.warn(`[RDP PAYMENT] ⚠️ Status check failed in interval (will retry): ${transactionId}`, {
          success: statusResult?.success,
          hasData: !!statusResult?.data,
          error: statusResult?.error || 'Unknown error'
        });
        return; // Skip dan retry di interval berikutnya
      }

      if (statusResult && statusResult.success && statusResult.data) {
        // PENTING: Cari status payment di berbagai lokasi yang mungkin
        let status = statusResult.data.status;
        
        // Jika status tidak ada di data.status, coba cari di lokasi lain
        if (!status) {
          if (statusResult.data.payment_status) {
            status = statusResult.data.payment_status;
          } else if (statusResult.data.transaction_status) {
            status = statusResult.data.transaction_status;
          } else if (statusResult.data.status_payment) {
            status = statusResult.data.status_payment;
          }
        }
        
        // PENTING: Log status untuk debugging jika status tidak terdeteksi sebagai success
        if (!status) {
          console.warn(`[RDP PAYMENT] No status found in response - Transaction: ${transactionId}`, {
            data: statusResult.data,
            keys: Object.keys(statusResult.data || {})
          });
        }
        
        if (status) {
          const statusLower = status.toString().toLowerCase().trim();
          const successStatuses = ['success', 'settlement', 'capture', 'paid', 'processing', 'completed'];
          const isSuccessStatus = successStatuses.includes(statusLower);
          
          // PENTING: Log status untuk debugging
          if (isSuccessStatus) {
            console.info(`[RDP PAYMENT] ✅ Payment SUCCESS detected - Transaction: ${transactionId} | Status: ${statusLower}`);
          } else {
           // console.info(`[RDP PAYMENT] ⏳ Payment still pending - Transaction: ${transactionId} | Status: ${statusLower}`);
          }
          
          if (isSuccessStatus) {
            // Get user info untuk logging
            let userInfo = `ID: ${chatId}`;
            try {
              const chat = await bot.getChat(chatId);
              const username = chat.username ? `@${chat.username}` : 'N/A';
              const firstName = chat.first_name || 'N/A';
              const lastName = chat.last_name ? ` ${chat.last_name}` : '';
              userInfo = `ID: ${chatId} | Username: ${username} | Nama: ${firstName}${lastName}`;
            } catch {}
            console.info(`[RDP PAYMENT] ✅ Payment SUCCESS - ${userInfo} | Transaction: ${transactionId}`);
            
            try {
              // Linear deposit: deposit 5000 ya dapat 5000 (tidak dipotong fee)
              // Gunakan amount yang user deposit, bukan get_balance dari API
              const balanceToAdd = amount;
              
              await BalanceManager.updateBalance(chatId, balanceToAdd);
              
              // Hapus QR message dan reminder message (prioritas dari parameter, lalu dari database)
              const qrMsgId = qrMessageId || currentPending?.qr_message_id;
              if (qrMsgId) {
                try {
                  await bot.deleteMessage(chatId, qrMsgId);
                  console.info(`[RDP DEPOSIT] ✅ Deleted QR message ${qrMsgId} (success)`);
                } catch (e) {
                  console.error(`[RDP DEPOSIT] Error deleting QR message ${qrMsgId}:`, e.message);
                }
              }
              const remMsgId = currentPending?.reminder_message_id;
              if (remMsgId) {
                try {
                  await bot.deleteMessage(chatId, remMsgId);
                  console.info(`[RDP DEPOSIT] ✅ Deleted reminder message ${remMsgId} (success)`);
                } catch (e) {
                  console.error(`[RDP DEPOSIT] Error deleting reminder message ${remMsgId}:`, e.message);
                }
              }
              
              await PaymentTracker.removePendingPayment(transactionId);
              
              // Stop expiry timeout karena payment success
              if (expiryTimeoutId) {
                clearTimeout(expiryTimeoutId);
                expiryTimeouts.delete(transactionId);
              }
              
              // Reset depositRDPLimiter saat payment success (hanya depositRDPLimiter)
              if (depositRDPLimiter && typeof depositRDPLimiter.reset === 'function') {
                try {
                  depositRDPLimiter.reset(chatId.toString());
                  console.info(`[RDP DEPOSIT LIMITER] ✅ Reset after success: ${chatId}`);
                } catch (e) {
                  console.error(`[RDP DEPOSIT LIMITER] Error resetting limiter:`, e.message);
                }
              }

              // Get current balance after update
              const currentBalance = await getBalance(chatId);
              const oldBalance = typeof currentBalance === 'string' ? 0 : (currentBalance - balanceToAdd);
              const newBalance = typeof currentBalance === 'string' ? 0 : currentBalance;
              
              // Format Rupiah helper
              const toRupiah = (amount) => {
                return new Intl.NumberFormat('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                  minimumFractionDigits: 0
                }).format(amount);
              };

              const statusText = statusLower === 'processing' ? 'Diproses' : 'Berhasil';

              // Get deposit_id from pending payment (DEP-RDP-RANDOM format) for display
              const pendingPaymentForDisplay = await PaymentTracker.getPendingPayment(chatId);
              const depositIdForDisplay = pendingPaymentForDisplay?.deposit_id || transactionId;

              const successMessage = 
                `✅ *DEPOSIT BERHASIL!*\n\n` +
                `💰 *Saldo berhasil ditambahkan*\n\n` +
                `📋 ID Deposit: \`${depositIdForDisplay}\`\n` +
                `💵 Jumlah: ${toRupiah(balanceToAdd)}\n\n` +
                `💳 *SALDO:*\n` +
                `   Sebelum: ${toRupiah(oldBalance)}\n` +
                `   *Sekarang: ${toRupiah(newBalance)}*\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🎉 Terima kasih telah melakukan deposit!`;
              
              // Hapus block middleware warning message (warnState) jika ada
              try {
                const cursorExports = require(path.join(__dirname, '../../../cursor'));
                // Access warnState and freezeUntil dari cursor.js
                if (cursorExports.warnState && cursorExports.freezeUntil) {
                  const warnData = cursorExports.warnState.get(chatId.toString());
                  if (warnData) {
                    clearInterval(warnData.interval);
                    try {
                      // Gunakan bot instance dari cursor.js (Telegraf bot instance)
                      const botInstance = cursorExports.bot;
                      if (botInstance && botInstance.telegram && typeof botInstance.telegram.deleteMessage === 'function') {
                        await botInstance.telegram.deleteMessage(warnData.chatId, warnData.messageId);
                        console.info(`[RDP DEPOSIT] ✅ Deleted warnState message ${warnData.messageId} for ${chatId} (success)`);
                      } else {
                        // Fallback
                        const telegramBot = bot.telegram || bot;
                        if (telegramBot && typeof telegramBot.deleteMessage === 'function') {
                          await telegramBot.deleteMessage(warnData.chatId, warnData.messageId);
                        } else if (telegramBot && telegramBot.telegram && typeof telegramBot.telegram.deleteMessage === 'function') {
                          await telegramBot.telegram.deleteMessage(warnData.chatId, warnData.messageId);
                        }
                      }
                    } catch (deleteErr) {
                      console.error(`[RDP DEPOSIT] Error deleting warnState message:`, deleteErr.message);
                    }
                    cursorExports.warnState.delete(chatId.toString());
                    console.info(`[RDP DEPOSIT] ✅ Removed warnState entry for ${chatId} (success)`);
                  }
                  cursorExports.freezeUntil.delete(chatId.toString());
                  console.info(`[RDP DEPOSIT] ✅ Cleared middleware warning for ${chatId} (success)`);
                }
              } catch (e) {
                console.error(`[RDP DEPOSIT] Error accessing warnState:`, e.message);
              }
              
              // Kirim message baru (tidak edit karena QR sudah dihapus)
              await bot.sendMessage(successMessage, {
                chat_id: chatId,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }
                  ]]
                }
              });
              
              // Record successful deposit
              try {
                const { recordDeposit } = require('./statistics');
                await recordDeposit(chatId, balanceToAdd);
              } catch (e) {
                console.error('[RDP DEPOSIT] Error recording deposit:', e);
              }

              // Send notification to channel
              try {
                const { sendChannelNotification, createDepositNotification } = require('../utils/adminNotifications');
                // Get deposit_id from pending payment (DEP-RDP-RANDOM format) instead of transactionId (payment gateway ID)
                const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
                const depositIdForChannel = pendingPayment?.deposit_id || transactionId;
                const notificationMsg = await createDepositNotification(bot, chatId, balanceToAdd, newBalance, depositIdForChannel);
                
                // Use bot.telegram if available, otherwise use bot directly
                const telegramBot = bot.telegram || bot;
                await sendChannelNotification(telegramBot, notificationMsg);
                console.info(`[RDP DEPOSIT] ✅ Channel notification sent for deposit ${depositIdForChannel}`);
              } catch (e) {
                console.error('[RDP DEPOSIT] Error sending channel notification:', e);
              }
              
              return;
              
            } catch (balanceError) {
              console.error('[RDP PAYMENT] Error processing payment success:', balanceError);
              
              const errorMessage = `⚠️ **Pembayaran Berhasil - Perlu Verifikasi Manual**\n\n` +
                `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
                `📋 **Status:** ${status}\n` +
                `❗ **Info:** Saldo mungkin butuh update manual\n\n` +
                `📞 **Hubungi admin jika saldo belum bertambah.**`;
              
              await sendOrEditMessage(bot, chatId, messageId, errorMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }
                  ]]
                }
              });
              
              return;
            }
          }
          
          else if (['failed', 'cancelled', 'expired', 'deny', 'error'].includes(statusLower)) {
            // Get user info untuk logging
            let userInfo = `ID: ${chatId}`;
            try {
              const chat = await bot.getChat(chatId);
              const username = chat.username ? `@${chat.username}` : 'N/A';
              const firstName = chat.first_name || 'N/A';
              const lastName = chat.last_name ? ` ${chat.last_name}` : '';
              userInfo = `ID: ${chatId} | Username: ${username} | Nama: ${firstName}${lastName}`;
            } catch {}
            console.info(`[RDP PAYMENT] ❌ Payment FAILED - ${userInfo} | Transaction: ${transactionId} | Status: ${status}`);
            
            // Stop expiry timeout karena payment failed
            if (expiryTimeoutId) {
              clearTimeout(expiryTimeoutId);
              expiryTimeouts.delete(transactionId);
            }
            
            await PaymentTracker.removePendingPayment(transactionId);
            
            const failedMessage = `❌ **Pembayaran Gagal**\n\n` +
              `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
              `📋 **Status:** ${status}\n` +
              `⏰ **Waktu:** ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
              `💡 **Silakan coba lagi untuk melakukan deposit.**`;

            await sendOrEditMessage(bot, chatId, messageId, failedMessage, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Coba Lagi', callback_data: 'deposit' }],
                  [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                ]
              }
            });
            
            return;
          }
        }
      }

      retryCount++;
      if (retryCount < maxRetries) {
        // PENTING: Gunakan currentRetryInterval yang sudah dihitung secara dinamis di awal checkStatus
        // Interval akan di-recalculate di setiap check untuk fleksibilitas maksimal
        setTimeout(checkStatus, currentRetryInterval);
      } else {
        
        const timeoutMessage = `⏰ **Monitoring Pembayaran Dihentikan**\n\n` +
          `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
          `📋 **Status:** Monitoring timeout setelah ${Math.round(maxRetries * retryInterval / 60000)} menit\n\n` +
          `💡 **Catatan:**\n` +
          `• Jika sudah membayar, saldo akan otomatis masuk\n` +
          `• Gunakan "Cek Status" untuk monitoring manual\n` +
          `• Hubungi support jika ada kendala`;

        await sendOrEditMessage(bot, chatId, messageId, timeoutMessage, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔍 Cek Status', callback_data: 'check_pending_payment' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        });
      }

    } catch (error) {
      // Silent error (jangan spam console kalau cuma network issue)
      if (!String(error.message).includes('ECONNRESET') && 
          !String(error.message).includes('ETIMEDOUT')) {
        console.error('[RDP PAYMENT] Error checking status:', error.message);
      }
      retryCount++;
      if (retryCount < maxRetries) {
        // PENTING: Recalculate interval untuk next retry (fleksibel dengan load)
        let nextActivePaymentsCount = 0;
        try {
          if (PaymentTracker.getActivePaymentsCount && typeof PaymentTracker.getActivePaymentsCount === 'function') {
            nextActivePaymentsCount = await PaymentTracker.getActivePaymentsCount();
          }
        } catch (e) {
          // Silent
        }
        
        let nextDynamicInterval = baseInterval;
        if (nextActivePaymentsCount > 10) {
          const multiplier = 1 + Math.log10(Math.max(1, nextActivePaymentsCount / 10));
          nextDynamicInterval = Math.min(baseInterval * multiplier, 20 * 1000);
        }
        
        const nextJitter = Math.random() * 0.2 - 0.1;
        const nextRetryInterval = Math.round(nextDynamicInterval * (1 + nextJitter));
        
        setTimeout(checkStatus, nextRetryInterval);
      } else {
        // Stop expiry timeout jika monitoring error
        if (expiryTimeoutId) {
          clearTimeout(expiryTimeoutId);
        }
        
        const errorMessage = `❌ **Error Monitoring Pembayaran**\n\n` +
          `💰 **Jumlah:** Rp ${amount.toLocaleString()}\n` +
          `📋 **Error:** ${error.message}\n\n` +
          `💡 **Silakan coba cek status manual atau hubungi support.**`;

        await sendOrEditMessage(bot, chatId, messageId, errorMessage, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔍 Cek Status', callback_data: 'check_pending_payment' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        });
      }
    }
  };

  setTimeout(checkStatus, retryInterval); // Gunakan retryInterval dari timer config
}

// Export helper function untuk clear expiry timeout dari luar
function clearExpiryTimeoutForTransaction(transactionId) {
  const timeoutId = expiryTimeouts.get(transactionId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    expiryTimeouts.delete(transactionId);
    console.info(`[RDP DEPOSIT] ✅ Cleared expiry timeout for transaction ${transactionId}`);
    return true;
  }
  return false;
}

module.exports = {
  handlePaymentStatus,
  clearExpiryTimeoutForTransaction
};