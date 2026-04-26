const safeMessageEditor = require('./safeMessageEdit');
const { createMainMenu } = require('./keyboard');
const { getBalance, isAdmin } = require('./userManager');
const PaymentTracker = require('./paymentTracker');
const { getUptime } = require('./uptime');

class ErrorHandler {
    constructor(bot, sessionManager) {
        this.bot = bot;
        this.sessionManager = sessionManager;
    }

    async handleCallbackError(error, query, context = {}) {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        
        console.error('Callback query error:', error);
        console.error('Context:', context);
        
        try {
            // Clear any problematic sessions
            this.sessionManager.clearAllSessions(chatId);
            
            await this.bot.answerCallbackQuery(query.id, {
                text: '❌ Terjadi kesalahan. Sesi telah direset. Silakan gunakan /start untuk memulai kembali.',
                show_alert: true
            });
            
            // Send recovery message
            await this.sendRecoveryMessage(chatId, 'callback_error');
            
        } catch (recoveryError) {
            console.error('Error in callback error recovery:', recoveryError);
            try {
                await this.bot.answerCallbackQuery(query.id, {
                    text: '❌ Terjadi kesalahan sistem.',
                    show_alert: true
                });
            } catch (answerError) {
                console.error('Error answering callback query:', answerError);
            }
        }
    }

    async handleMessageError(error, msg, context = {}) {
        const chatId = msg.chat.id;
        
        console.error('Message handler error:', error);
        console.error('Context:', context);
        
        try {
            // Clear sessions on error
            this.sessionManager.clearAllSessions(chatId);
            
            await this.sendRecoveryMessage(chatId, 'message_error');
            
        } catch (recoveryError) {
            console.error('Error in message error recovery:', recoveryError);
            try {
                await this.bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem. Gunakan /start untuk memulai kembali.');
            } catch (sendError) {
                console.error('Error sending fallback message:', sendError);
            }
        }
    }

    async sendRecoveryMessage(chatId, errorType) {
        try {
            const balance = await getBalance(chatId);
            const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
            const isUserAdmin = isAdmin(chatId);

            const errorMessage = `❌ *Terjadi Kesalahan Sistem*\n\n` +
                `Sesi telah direset untuk mencegah masalah lebih lanjut.\n\n` +
                `💰 *Saldo:* ${typeof balance === 'string' ? balance : `Rp ${balance.toLocaleString()}`}\n\n` +
                `Silakan gunakan menu di bawah untuk melanjutkan:`;

            await this.bot.sendMessage(chatId, errorMessage, {
                parse_mode: 'Markdown',
                ...createMainMenu(isUserAdmin, !!pendingPayment)
            });
        } catch (error) {
            console.error('Error sending recovery message:', error);
            throw error;
        }
    }

    async handleInstallationError(error, chatId, messageId, session, installType) {
        console.error(`${installType} installation error:`, error);
        
        const errorMessage = `❌ **Gagal menginstall ${installType === 'docker' ? 'Docker' : 'Dedicated'} RDP**\n\n` +
            `📝 **Error:** ${error.message || 'Unknown error'}\n\n` +
            '💡 **Kemungkinan penyebab:**\n' +
            '• Koneksi ke VPS terputus\n' +
            '• VPS tidak memenuhi requirement\n' +
            '• Masalah dengan script installation\n\n' +
            '🔄 Silakan coba lagi dengan VPS yang berbeda.';

        const retryCallback = installType === 'docker' ? 'install_docker_rdp' : 'install_dedicated_rdp';
        
        await safeMessageEditor.editMessage(this.bot, chatId, messageId, errorMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 Coba Lagi', callback_data: retryCallback }],
                    [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                ]
            }
        });

        this.sessionManager.clearUserSession(chatId);
    }

    async handleVPSError(error, chatId, messageId, session) {
        console.error('VPS connection error:', error);
        
        const retryCallback = session.installType === 'docker' ? 'install_docker_rdp' : 'install_dedicated_rdp';
        
        await safeMessageEditor.editMessage(this.bot, chatId, messageId,
            '❌ Gagal terhubung ke VPS. Pastikan IP dan password benar.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Coba Lagi', callback_data: retryCallback }],
                        [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                    ]
                }
            }
        );
        
        this.sessionManager.clearUserSession(chatId);
    }

    async handleSessionExpired(chatId, messageId) {
        await safeMessageEditor.editMessage(this.bot, chatId, messageId,
            '⏰ Sesi telah kadaluarsa. Silakan mulai dari awal.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                    ]
                }
            }
        );
        
        this.sessionManager.clearAllSessions(chatId);
    }

    async handleValidationError(validationResult, chatId, messageId, context = {}) {
        const suggestions = validationResult.suggestions || [];
        const errorMessage = this.createValidationErrorMessage(validationResult.message, suggestions, context);
        
        await safeMessageEditor.editMessage(this.bot, chatId, messageId, errorMessage, {
            parse_mode: 'Markdown',
            reply_markup: context.replyMarkup || {
                inline_keyboard: [
                    [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
                ]
            }
        });
    }

    createValidationErrorMessage(message, suggestions = [], context = {}) {
        let errorMsg = `❌ ${message}`;
        
        if (suggestions.length > 0) {
            errorMsg += '\n\n💡 Saran:\n';
            suggestions.forEach(suggestion => {
                errorMsg += `• ${suggestion}\n`;
            });
        }
        
        if (context.additionalInfo) {
            errorMsg += `\n\n${context.additionalInfo}`;
        }
        
        return errorMsg;
    }

    // Global error handler for unhandled errors
    static setupGlobalErrorHandlers() {
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            // Don't exit the process, just log the error
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            // Don't exit the process, just log the error
        });
    }
}

module.exports = ErrorHandler;