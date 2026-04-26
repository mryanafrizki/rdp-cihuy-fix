const { Telegraf } = require('telegraf');

let botInstance = null;

/**
 * Initialize error logger with bot instance
 * @param {Telegraf} bot - Telegraf bot instance
 */
function initErrorLogger(bot) {
  botInstance = bot;
}

/**
 * Send error to Telegram channel
 * @param {Error|string} error - Error object or error message
 * @param {object} context - Optional context information
 * @returns {Promise<void>}
 */
async function logErrorToChannel(error, context = {}) {
  const channelId = process.env.CHANNEL_LOGERROR;
  
  if (!channelId) {
    console.warn('[errorLogger] CHANNEL_LOGERROR not set in .env, skipping error log');
    return;
  }

  if (!botInstance) {
    console.warn('[errorLogger] Bot instance not initialized');
    return;
  }

  try {
    // Parse error
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    
    // Format error message
    let text = `🚨 <b>Error Log</b>\n\n`;
    text += `<b>⏰ Time:</b> <code>${new Date().toLocaleString('id-ID')}</code>\n\n`;
    
    if (context.userId) {
      text += `<b>👤 User ID:</b> <code>${context.userId}</code>\n`;
    }
    
    if (context.module) {
      text += `<b>📦 Module:</b> <code>${context.module}</code>\n`;
    }
    
    if (context.action) {
      text += `<b>⚙️ Action:</b> <code>${context.action}</code>\n`;
    }
    
    text += `\n<b>❌ Error:</b>\n<code>${errorMessage}</code>\n`;
    
    if (errorStack && errorStack.length > 0) {
      // Truncate stack trace if too long (Telegram has 4096 char limit)
      const maxStackLength = 2000;
      const truncatedStack = errorStack.length > maxStackLength 
        ? errorStack.substring(0, maxStackLength) + '\n... (truncated)'
        : errorStack;
      text += `\n<b>📋 Stack Trace:</b>\n<pre>${truncatedStack}</pre>`;
    }
    
    if (Object.keys(context).length > 0 && !context.userId && !context.module && !context.action) {
      text += `\n<b>📝 Context:</b>\n<code>${JSON.stringify(context, null, 2)}</code>`;
    }

    await botInstance.telegram.sendMessage(channelId, text, {
      parse_mode: 'HTML'
    });
  } catch (err) {
    // Don't log error of error logger to avoid infinite loop
    console.error('[errorLogger] Failed to send error to channel:', err.message);
  }
}

module.exports = {
  initErrorLogger,
  logErrorToChannel
};

