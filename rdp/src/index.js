// dotenv.config() removed - env vars loaded in cursor.js

const { scheduleJob } = require('node-schedule');
const path = require('path');

// Export handlers
const { handleInstallRDP, handleInstallDockerRDP, handleVPSCredentials, handleWindowsSelection, showWindowsSelection, handlePageNavigation, handleCancelInstallation } = require('./handlers/rdpHandler');
const { handleInstallDedicatedRDP, handleDedicatedVPSCredentials, showDedicatedOSSelection, handleDedicatedOSSelection } = require('./handlers/dedicatedRdpHandler');
const { handleDeposit, handleDepositAmount, sendDepositConfirmation, processDepositConfirmation, handlePendingPayment } = require('./handlers/depositHandler');
const { handleAddBalance, processAddBalance, handleBroadcast, processBroadcast, handleAtlanticAdmin } = require('./handlers/adminHandler');
const { handleRdpAdminMenu, handleSetDockerPrice, handleSetDedicatedPrice, handleSetPricePerQuota, handleSetMinDeposit, handleSetMaxDeposit, confirmAndSave, handleDeductBalance, processDeductBalance, handleToggleQuotaMode, handleDownloadUsersList, handleToggleTrackingRequestApproval } = require('./handlers/rdpAdminHandler');
const { handleFAQ } = require('./handlers/faqHandler');
const { handleTutorial } = require('./handlers/tutorialHandler');
const { handleProviders } = require('./handlers/providerHandler');
const { handleWithdrawBalance } = require('./handlers/withdrawHandler');
const { handleSaveAccount } = require('./handlers/accountHandler');
const { showInstallList, showInstallDetail, deleteInstallation, batchTestInstallations, deleteAllInstallations } = require('./handlers/installListHandler');


// Export utilities
const { getUser, isAdmin, getBalance } = require('./utils/userManager');
const { createMainMenu } = require('./utils/keyboard');
const PaymentTracker = require('./utils/paymentTracker');
const DatabaseBackup = require('./utils/dbBackup');
const { getUptime } = require('./utils/uptime');
const safeMessageEditor = require('./utils/safeMessageEdit');
const SessionManager = require('./utils/sessionManager');
const ErrorHandler = require('./utils/errorHandler');
const BotAdapter = require('./utils/botAdapter');
const { handlePaymentStatus } = require('./utils/paymentStatus');
const { checkPaymentStatus } = require('./utils/payment');
const { cleanupRdpDatabase } = require('./utils/dbCleanup');
const { cleanupOldRdpFiles } = require('./utils/rdpFileGenerator');
const axios = require('axios');
const qs = require('qs');

// Try to get PenggunaTele from cursor.js models for sharing
let PenggunaTele = null;
try {
  // Try to require from root directory (cursor.js location)
  const models = require('../../../models');
  if (models && models.PenggunaTele) {
    PenggunaTele = models.PenggunaTele;
    console.info('✅ PenggunaTele model loaded from models.js');
  }
} catch (error) {
  try {
    // Try alternative path (if running from different location)
    const models = require('../../../../models');
    if (models && models.PenggunaTele) {
      PenggunaTele = models.PenggunaTele;
      console.info('✅ PenggunaTele model loaded from models.js (alternative path)');
    }
  } catch (e) {
    // Silent - RDP uses SQLite, PenggunaTele is optional
    // Will be loaded dynamically in userManager if needed
  }
}

// Initialize session manager (singleton)
const sessionManager = new SessionManager();

// Setup scheduled jobs
scheduleJob('0 */6 * * *', () => {
    PaymentTracker.cleanupExpiredPayments();
    console.info('🧹 Cleaned up expired payments');
});

// Setup RDP database cleanup (every 6 hours)
scheduleJob('0 */6 * * *', async () => {
    const result = await cleanupRdpDatabase();
    if (result.completed > 0 || result.pending > 0) {
        console.info(`🧹 [RDP CLEANUP] Cleaned up database: ${result.completed} completed, ${result.pending} pending/failed`);
    }
});

// Setup RDP file cleanup (every 24 hours)
scheduleJob('0 0 * * *', () => {
    cleanupOldRdpFiles();
    console.info('🧹 [RDP FILE] Cleaned up old RDP files');
});

// Setup global error handlers
ErrorHandler.setupGlobalErrorHandlers();

// Helper function untuk mendapatkan database backup (membutuhkan bot instance)
function createDatabaseBackup(bot) {
    return new DatabaseBackup(bot);
}

// Helper function untuk mendapatkan error handler (membutuhkan bot instance)
function createErrorHandler(bot) {
    return new ErrorHandler(bot, sessionManager);
}

// Helper function untuk menampilkan menu utama RDP (untuk back_to_menu)
async function showRDPMainMenu(botAdapter, chatId, messageId, queryFrom = null) {
            const balance = await getBalance(chatId);
            const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
            const isUserAdmin = isAdmin(chatId);

            // Get current prices from rdpPrice.json
            const rdpPriceManager = require('./utils/rdpPriceManager');
            const prices = rdpPriceManager.getRdpPrices();
            const quotaMode = rdpPriceManager.isQuotaModeEnabled();
            const pricePerQuota = prices.pricePerQuota || 3000;
            
            // Calculate balance in quota if quota mode enabled
            let balanceText;
            if (quotaMode) {
              const balanceNum = typeof balance === 'string' ? 0 : balance;
              const quota = Math.floor(balanceNum / pricePerQuota);
              balanceText = `${quota} kuota`;
            } else {
              balanceText = typeof balance === 'string' ? balance : `Rp ${balance.toLocaleString('id-ID')}`;
            }
            
            const balanceLabel = quotaMode ? 'Sisa Kuota' : 'Sisa Saldo';

    const firstName = queryFrom?.first_name || 'User';
            let welcomeMessage = `🎉 *Selamat datang di RDP Installation Bot, by 𝐀𝐙𝐎𝐕𝐄𝐒𝐓!*\n\n` +
        `👋 Halo ${firstName}!\n\n` +
                `💎 *${balanceLabel}:* ${balanceText}\n\n` +
                `🚀 *Layanan Tersedia:*\n`;
            
            if (quotaMode) {
              // Quota mode: don't show prices, just show "1 kuota"
              welcomeMessage += 
                `• 🐳 Docker RDP - 1 kuota\n` +
                `• 🖥️ Dedicated RDP - 1 kuota\n`;
            } else {
              // Saldo mode: show prices
              const dockerPrice = prices.dockerRdpPrice || 1000;
              const dedicatedPrice = prices.dedicatedRdpPrice || 3000;
              const dockerPriceText = dockerPrice === 0 ? 'Gratis' : `Rp ${dockerPrice.toLocaleString('id-ID')}`;
              const dedicatedPriceText = dedicatedPrice === 0 ? 'Gratis' : `Rp ${dedicatedPrice.toLocaleString('id-ID')}`;
              welcomeMessage += 
                `• 🐳 Docker RDP - ${dockerPriceText}/install\n` +
                `• 🖥️ Dedicated RDP - ${dedicatedPriceText}/install\n`;
            }
            
            welcomeMessage += 
                `• 💰 Deposit ${quotaMode ? 'kuota' : 'saldo'} otomatis\n` +
                `• 📚 Tutorial lengkap\n` +
                `• 🏢 Rekomendasi provider VPS\n\n` +
                `⏰ Uptime: ${getUptime()}`;

    // Use botAdapter.editMessageText directly (not safeMessageEditor which expects different format)
    try {
        await botAdapter.editMessageText(welcomeMessage, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
                ...createMainMenu(isUserAdmin, !!pendingPayment)
            });
    } catch (error) {
        // If edit fails (e.g., no messageId), send new message
        console.warn('[RDP] Edit failed, sending new message:', error.message);
        await botAdapter.sendMessage(welcomeMessage, {
            chat_id: chatId,
            parse_mode: 'Markdown',
                ...createMainMenu(isUserAdmin, !!pendingPayment)
            });
    }
}

// Resume pending payments setelah bot restart
async function resumePendingPayments(bot) {
    try {
        console.info('[RDP] Resuming pending payments...');
        
        const now = Date.now();
        const pendingPayments = await PaymentTracker.getAllPendingPayments();
        
        console.info(`[RDP] Found ${pendingPayments.length} pending payments`);
        
        // Log user info untuk setiap pending payment saat bot launch
        for (const payment of pendingPayments) {
            try {
                const userId = payment.user_id;
                let userInfo = `ID: ${userId}`;
                try {
                    const chat = await bot.telegram.getChat(userId);
                    const username = chat.username ? `@${chat.username}` : 'N/A';
                    const firstName = chat.first_name || 'N/A';
                    const lastName = chat.last_name ? ` ${chat.last_name}` : '';
                    userInfo = `ID: ${userId} | Username: ${username} | Nama: ${firstName}${lastName}`;
                } catch {}
                console.info(`[RDP] 📋 Pending Payment - ${userInfo} | Transaction: ${payment.transaction_id} | Amount: Rp ${payment.amount?.toLocaleString() || 'N/A'}`);
            } catch (e) {
                // Silent error
            }
        }
        
        for (const payment of pendingPayments) {
            try {
                const userId = payment.user_id;
                const expiryTime = payment.expiry_time;
                
                // Check if expired
                if (expiryTime <= now) {
                    // Get user info untuk logging
                    let userInfo = `ID: ${userId}`;
                    try {
                        const chat = await bot.telegram.getChat(userId);
                        const username = chat.username ? `@${chat.username}` : 'N/A';
                        const firstName = chat.first_name || 'N/A';
                        const lastName = chat.last_name ? ` ${chat.last_name}` : '';
                        userInfo = `ID: ${userId} | Username: ${username} | Nama: ${firstName}${lastName}`;
                    } catch {}
                    console.warn(`[RDP] ⏰ Expired Payment - ${userInfo} | Transaction: ${payment.transaction_id}`);
                    
                    // Delete QR message
                    if (payment.qr_message_id) {
                        try {
                            await bot.telegram.deleteMessage(userId, payment.qr_message_id);
                            console.info(`[RDP] ✅ Deleted QR message ${payment.qr_message_id} (expired on restart)`);
                        } catch (e) {
                            console.error(`[RDP] Error deleting QR message:`, e.message);
                        }
                    }
                    
                    // Delete reminder message
                    if (payment.reminder_message_id) {
                        try {
                            await bot.telegram.deleteMessage(userId, payment.reminder_message_id);
                            console.info(`[RDP] ✅ Deleted reminder message ${payment.reminder_message_id} (expired on restart)`);
                        } catch (e) {
                            console.error(`[RDP] Error deleting reminder message:`, e.message);
                        }
                    }
                    
                    // Hapus block middleware warning message (warnState) jika ada
                    try {
                        const cursorExports = require(path.join(__dirname, '../../../cursor'));
                        if (cursorExports.warnState && cursorExports.freezeUntil) {
                            const warnData = cursorExports.warnState.get(userId.toString());
                            if (warnData) {
                                clearInterval(warnData.interval);
                                try {
                                    // Gunakan bot instance dari cursor.js (Telegraf bot instance)
                                    const botInstance = cursorExports.bot;
                                    if (botInstance && botInstance.telegram && typeof botInstance.telegram.deleteMessage === 'function') {
                                        await botInstance.telegram.deleteMessage(warnData.chatId, warnData.messageId);
                                        console.info(`[RDP] ✅ Deleted warnState message ${warnData.messageId} for ${userId} (expired on restart)`);
                                    } else {
                                        // Fallback: gunakan bot yang ada
                                        await bot.telegram.deleteMessage(warnData.chatId, warnData.messageId);
                                    }
                                } catch (deleteErr) {
                                    console.error(`[RDP] Error deleting warnState message:`, deleteErr.message);
                                }
                                cursorExports.warnState.delete(userId.toString());
                                console.info(`[RDP] ✅ Removed warnState entry for ${userId}`);
                            }
                            cursorExports.freezeUntil.delete(userId.toString());
                            console.info(`[RDP] ✅ Cleared middleware warning for ${userId} (expired on restart)`);
                        }
                    } catch (e) {
                        console.error(`[RDP] Error accessing warnState:`, e.message);
                    }
                    
                    // Delete payment
                    await PaymentTracker.removePendingPayment(payment.transaction_id);
                    
                    continue;
                }
                
                // Check payment status (EXACT pattern dari features/deposit/depositHandler.js resumePendingDeposits)
                // Get gateway type and API key
                // PENTING: RDP deposit menggunakan API key khusus (PAKASIR_API_KEY_RDP)
                const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
                const apiKey = gateway === 'pakasir' 
                  ? (process.env.PAKASIR_API_KEY_RDP || process.env.PAKASIR_APIKEY_RDP || process.env.PAKASIR_API_KEY || process.env.PAKASIR_APIKEY)
                  : (process.env.ATLANTIC_API_KEY || process.env.ATLANTIS_API_KEY);
                
                // Prepare additional data for Pakasir
                const additionalData = {};
                if (gateway === 'pakasir' && payment) {
                  additionalData.projectSlug = process.env.PAKASIR_PROJECT_SLUG_RDP || process.env.PAKASIR_PROJECT_SLUG;
                  additionalData.orderId = payment.deposit_id || payment.transaction_id;
                  if (payment.amount) {
                    // Try to get uniqueCode from payment data or calculate
                    const uniqueCode = payment.unique_code || 0;
                    additionalData.amount = payment.amount + uniqueCode;
                  }
                }
                
                const statusResult = await checkPaymentStatus(apiKey, payment.transaction_id, 0, additionalData);
                
                if (statusResult && statusResult.success && statusResult.data) {
                    const status = statusResult.data.status;
                    const statusLower = status?.toString().toLowerCase();
                    const successStatuses = ['success', 'settlement', 'capture', 'paid', 'processing', 'completed'];
                    
                    if (statusLower && successStatuses.includes(statusLower)) {
                        // Payment was completed while bot was offline (EXACT pattern dari features/deposit/depositHandler.js)
                        console.info(`[RDP] ✅ QRIS Payment completed offline: ${payment.transaction_id}`);
                        
                        // Process payment success directly (EXACT pattern dari features/deposit/depositHandler.js)
                        // Resume watcher yang akan memproses success payment
                        try {
                            const BotAdapter = require('./utils/botAdapter');
                            const botAdapter = new BotAdapter({ telegram: bot.telegram });
                            const { handlePaymentStatus } = require('./utils/paymentStatus');
                            
                            // Resume watcher - it will detect success status and process it
                            await handlePaymentStatus(
                                botAdapter,
                                userId,
                                payment.qr_message_id || 0,
                                payment.transaction_id,
                                payment.amount,
                                60,
                                payment.qr_message_id
                            );
                            console.info(`[RDP] ✅ Payment success processed via watcher: ${payment.transaction_id}`);
                        } catch (processError) {
                            console.error(`[RDP] Error processing payment success: ${processError.message}`);
                            console.error(`[RDP] Error stack:`, processError.stack);
                        }
                        
                        continue;
                    }
                }
                
                // Resume watcher (silent, tidak perlu log lagi karena sudah di log saat bot launch)
                const BotAdapter = require('./utils/botAdapter');
                const botAdapter = new BotAdapter({ telegram: bot.telegram });
                
                await handlePaymentStatus(
                    botAdapter,
                    userId,
                    payment.qr_message_id || 0,
                    payment.transaction_id,
                    payment.amount,
                    60,
                    payment.qr_message_id
                );
                
            } catch (error) {
                console.error(`[RDP] Error resuming payment ${payment.transaction_id}:`, error.message);
            }
        }
        
        console.info('[RDP] Resume pending payments completed');

    } catch (error) {
        console.error('[RDP] Error resuming pending payments:', error);
    }
}

// Export semua yang diperlukan
module.exports = {
    // Handlers
    handleInstallRDP,
    handleInstallDockerRDP,
    handleVPSCredentials,
    handleWindowsSelection,
    showWindowsSelection,
    handlePageNavigation,
    handleCancelInstallation,
    handleInstallDedicatedRDP,
    handleDedicatedVPSCredentials,
    showDedicatedOSSelection,
    handleDedicatedOSSelection,
    handleDeposit,
    handleDepositAmount,
    sendDepositConfirmation,
    processDepositConfirmation,
    handlePendingPayment,
    handleAddBalance,
    processAddBalance,
    handleBroadcast,
    processBroadcast,
    handleAtlanticAdmin,
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
    handleToggleTrackingRequestApproval,
    handleFAQ,
    handleTutorial,
    handleProviders,
    handleWithdrawBalance,
    handleSaveAccount,
    
    // Install List handlers
    showInstallList,
    showInstallDetail,
    deleteInstallation,
    batchTestInstallations,
    deleteAllInstallations,
    
    // Utilities
    getUser,
    isAdmin,
    getBalance,
    createMainMenu,
    PaymentTracker,
    createDatabaseBackup,
    createErrorHandler,
    getUptime,
    safeMessageEditor,
    sessionManager,
    SessionManager,
    BotAdapter,
    showRDPMainMenu,
    
    // Constants
    ErrorHandler,
    
    // Dependencies (untuk digunakan di cursor.js jika diperlukan)
    axios,
    qs,
    
    // Models
    PenggunaTele,
    
    // Resume function
    resumePendingPayments
};
