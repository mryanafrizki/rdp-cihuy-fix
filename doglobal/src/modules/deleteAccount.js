const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const { manageAccounts } = require('./manageAccounts');
const { editOrReply } = require('../utils/editOrReply');

async function deleteAccount(ctx, accountId) {
  const db = new AccountsDB(ctx.from.id);
  
  try {
    const deleted = await db.remove(accountId);
    
    if (!deleted) {
      const messageId = ctx.callbackQuery?.message?.message_id;
      const buttons = [[Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]];
      return editOrReply(ctx, messageId, '⚠️ Akun tidak ditemukan', { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
    }

    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]];
    
    if (messageId) {
      const oldText = ctx.callbackQuery.message.text;
      const newText = `${oldText}\n\n✅ <b>Akun berhasil dihapus</b>`;
      return editOrReply(ctx, messageId, newText, { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
    }
    
    return editOrReply(ctx, null, '✅ <b>Akun berhasil dihapus</b>', { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]];
    return editOrReply(ctx, messageId, `⚠️ Terjadi kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
}

module.exports = { deleteAccount };

