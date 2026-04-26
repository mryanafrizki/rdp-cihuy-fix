/**
 * Bot Adapter untuk mengkonversi antara Telegraf ctx dan node-telegram-bot-api interface
 * Memungkinkan handler RDP yang menggunakan node-telegram-bot-api untuk bekerja dengan Telegraf
 */

const path = require('path');

class BotAdapter {
    constructor(ctx) {
        this.ctx = ctx;
        this.telegram = ctx.telegram || ctx;
    }

    /**
     * Convert Telegraf ctx ke BotAdapter
     */
    static fromCtx(ctx) {
        return new BotAdapter(ctx);
    }

    /**
     * Edit message text - compatible dengan node-telegram-bot-api
     */
    async editMessageText(text, options = {}) {
        const chatId = options.chat_id || this.ctx.chat?.id || this.ctx.callbackQuery?.message?.chat?.id;
        const messageId = options.message_id || this.ctx.callbackQuery?.message?.message_id;

        if (!chatId) {
            throw new Error('chatId is required');
        }

        if (!messageId) {
            // If no messageId, send new message instead
            console.warn('No messageId provided, sending new message instead of editing');
            return await this.sendMessage(text, options);
        }

        // Convert options format dari node-telegram-bot-api ke Telegraf
        const telegrafOptions = {
            parse_mode: options.parse_mode || 'HTML',
            reply_markup: options.reply_markup || undefined
        };

        try {
            await this.telegram.editMessageText(chatId, messageId, undefined, text, telegrafOptions);
            // Return a mock object with message_id for compatibility
            return { message_id: messageId };
        } catch (error) {
            // Jika edit gagal, kirim pesan baru
            if (error.message && error.message.includes('message is not modified')) {
                // Ignore - message sama, return mock object
                return { message_id: messageId };
            }
            // Fallback: kirim pesan baru
            console.warn('Edit message failed, sending new message:', error.message);
            const sentMsg = await this.sendMessage(text, telegrafOptions);
            return sentMsg || { message_id: messageId };
        }
    }

    /**
     * Send message - compatible dengan node-telegram-bot-api
     * Supports both formats:
     * - sendMessage(text, options) - BotAdapter format
     * - sendMessage(chatId, text, options) - node-telegram-bot-api format
     */
    async sendMessage(textOrChatId, textOrOptions = {}, options = {}) {
        let chatId, text, opts;
        
        // Check if first parameter is chatId (number/string) or text (string)
        if (typeof textOrChatId === 'number' || (typeof textOrChatId === 'string' && /^\d+$/.test(textOrChatId))) {
            // node-telegram-bot-api format: sendMessage(chatId, text, options)
            chatId = textOrChatId;
            text = textOrOptions;
            opts = options || {};
        } else {
            // BotAdapter format: sendMessage(text, options)
            chatId = textOrOptions.chat_id || this.ctx.chat?.id || this.ctx.callbackQuery?.message?.chat?.id;
            text = textOrChatId;
            opts = textOrOptions || {};
        }

        if (!chatId) {
            throw new Error('chatId is required');
        }

        const telegrafOptions = {
            parse_mode: opts.parse_mode || 'HTML',
            reply_markup: opts.reply_markup || undefined,
            reply_to_message_id: opts.reply_to_message_id || undefined
        };

        const sentMsg = await this.telegram.sendMessage(chatId, text, telegrafOptions);
        // Return object with message_id for compatibility with node-telegram-bot-api
        if (sentMsg && sentMsg.message_id) {
            return { message_id: sentMsg.message_id };
        }
        // Fallback if sentMsg doesn't have message_id
        return { message_id: sentMsg?.message_id || (sentMsg?.message?.message_id) || Date.now() };
    }

    /**
     * Answer callback query - compatible dengan node-telegram-bot-api
     */
    async answerCallbackQuery(queryId, options = {}) {
        const qId = queryId || this.ctx.callbackQuery?.id;

        if (!qId) {
            // Try to answer via ctx if available
            if (this.ctx.answerCbQuery) {
                try {
                    await this.ctx.answerCbQuery(options.text || '', {
                        show_alert: options.show_alert || false,
                        cache_time: options.cache_time || 0
                    });
                    return;
                } catch (e) {
                    // Ignore
                }
            }
            return;
        }

        try {
            await this.telegram.answerCbQuery(qId, {
                text: options.text,
                show_alert: options.show_alert || false,
                cache_time: options.cache_time || 0
            });
        } catch (error) {
            // Try via ctx if available
            if (this.ctx.answerCbQuery) {
                try {
                    await this.ctx.answerCbQuery(options.text || '', {
                        show_alert: options.show_alert || false,
                        cache_time: options.cache_time || 0
                    });
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    /**
     * Delete message - compatible dengan node-telegram-bot-api
     */
    async deleteMessage(chatId, messageId) {
        const cId = chatId || this.ctx.chat?.id || this.ctx.callbackQuery?.message?.chat?.id;
        const mId = messageId || this.ctx.callbackQuery?.message?.message_id;

        if (!cId || !mId) {
            return;
        }

        try {
            await this.telegram.deleteMessage(cId, mId);
        } catch (error) {
            // Ignore delete errors
        }
    }

    /**
     * Send document - compatible dengan node-telegram-bot-api
     */
    async sendDocument(chatId, filePath, options = {}) {
        const cId = chatId || this.ctx.chat?.id || this.ctx.callbackQuery?.message?.chat?.id;

        if (!cId) {
            throw new Error('chatId is required');
        }

        const telegrafOptions = {
            caption: options.caption,
            parse_mode: options.parse_mode || 'Markdown',
            reply_markup: options.reply_markup || undefined
        };

        // Use Telegraf's sendDocument method
        // Telegraf sendDocument expects { source: filePath } or ReadableStream
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
            const sentMsg = await this.telegram.sendDocument(cId, {
                source: fs.createReadStream(filePath),
                filename: path.basename(filePath)
            }, telegrafOptions);
            return sentMsg || { message_id: sentMsg?.message_id || Date.now() };
        } else {
            throw new Error(`File not found: ${filePath}`);
        }
    }

    /**
     * Send photo - compatible dengan node-telegram-bot-api
     */
    async sendPhoto(chatId, photo, options = {}) {
        const cId = chatId || this.ctx.chat?.id || this.ctx.callbackQuery?.message?.chat?.id;

        if (!cId) {
            throw new Error('chatId is required');
        }

        const telegrafOptions = {
            caption: options.caption,
            parse_mode: options.parse_mode || 'HTML',
            reply_markup: options.reply_markup || undefined
        };

        // Handle different photo formats (Buffer, URL, file path)
        let photoSource;
        if (Buffer.isBuffer(photo)) {
            // If it's a buffer, use source format
            photoSource = { source: photo };
        } else if (typeof photo === 'string' && (photo.startsWith('http') || photo.startsWith('/'))) {
            // If it's a URL or file path
            photoSource = photo;
        } else {
            // Fallback: assume it's a buffer-like object
            photoSource = { source: photo };
        }

        // Use Telegraf's sendPhoto method
        const sentMsg = await this.telegram.sendPhoto(cId, photoSource, telegrafOptions);

        // Return object with message_id for compatibility
        return sentMsg || { message_id: sentMsg?.message_id || Date.now() };
    }

    /**
     * Get chat ID dari ctx atau options
     */
    getChatId(options = {}) {
        return options.chat_id || this.ctx.chat?.id || this.ctx.callbackQuery?.message?.chat?.id;
    }

    /**
     * Get message ID dari ctx atau options
     */
    getMessageId(options = {}) {
        return options.message_id || this.ctx.callbackQuery?.message?.message_id;
    }
}

module.exports = BotAdapter;

