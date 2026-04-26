/**
 * Helper function to edit message, or delete and send new if edit fails
 * @param {Object} ctx - Telegraf context
 * @param {number} messageId - Message ID to edit (optional)
 * @param {string} text - Text to send
 * @param {Object} extra - Extra options (parse_mode, reply_markup, etc)
 * @param {boolean} deleteOnFail - If true, delete old message before sending new (default: true)
 * @returns {Promise} Result of edit or new message
 */
async function editOrReply(ctx, messageId, text, extra = {}, deleteOnFail = true) {
  // If we have callbackQuery and messageId, try to edit
  if (messageId && ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      return await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        text,
        extra
      );
    } catch (error) {
      // If edit fails, delete old message and send new one
      console.log(`[editOrReply] Failed to edit message ${messageId}, ${deleteOnFail ? 'deleting and ' : ''}sending new message:`, error.message);
      
      if (deleteOnFail) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
        } catch (deleteError) {
          console.log(`[editOrReply] Failed to delete message ${messageId}:`, deleteError.message);
        }
      }
      
      return await ctx.reply(text, extra);
    }
  }
  
  // No messageId or callbackQuery, just reply
  return await ctx.reply(text, extra);
}

/**
 * Helper to get message ID from callback query or create new message
 * @param {Object} ctx - Telegraf context
 * @returns {Promise<number>} Message ID
 */
async function getOrCreateMessageId(ctx) {
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    return ctx.callbackQuery.message.message_id;
  }
  
  // If no callback query, send a placeholder message
  const msg = await ctx.reply('⏳ Memproses...', { parse_mode: 'HTML' });
  return msg.message_id;
}

module.exports = { editOrReply, getOrCreateMessageId };

