const { createDigitalOceanClient, getProxyInfoString } = require('../utils/createDigitalOceanClient');
const { checkProxyRequirement } = require('../utils/proxyRequirement');
const { showDefaultProxyConfirm } = require('../utils/defaultProxyConfirm');
const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const { editOrReply } = require('../utils/editOrReply');

async function batchTestAccounts(ctx, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Check if using default proxy (has proxy but not using it)
  if (!skipDefaultCheck && proxyCheck.isDefault) {
    return showDefaultProxyConfirm(ctx, 'batch_test_accounts', {});
  }

  
  const proxyInfo = await getProxyInfoString(ctx.from.id);
  const text = `<b>🔍 Akun Tes Batch${proxyInfo}</b>\n\n`;
  
  // Use existing message if from callback, otherwise create new
  let msg;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    msg = { message_id: ctx.callbackQuery.message.message_id };
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `${text}🔄 Sedang Menguji...`,
      { parse_mode: 'HTML' }
    );
  } else {
    msg = await ctx.reply(`${text}🔄 Sedang Menguji...`, { parse_mode: 'HTML' });
  }

  const db = new AccountsDB(ctx.from.id);
  const accounts = await db.all();
  const checkedAccounts = [];
  const failedAccounts = [];

  for (const account of accounts) {
    try {
      const client = await createDigitalOceanClient(account.token, ctx.from.id);
      const balanceData = await client.getBalance();
      
      
      // Handle different response structures
      let balance = '0.00';
      if (balanceData) {
        if (balanceData.account_balance) {
          balance = balanceData.account_balance;
        } else if (balanceData.month_to_date_balance) {
          balance = balanceData.month_to_date_balance;
        } else if (typeof balanceData === 'string') {
          balance = balanceData;
        }
      }
      
      checkedAccounts.push({
        email: account.email,
        account_balance: balance
      });
    } catch (error) {
      console.warn(`[batchTestAccounts] Failed for ${account.email}:`, error.message);
      failedAccounts.push(account.email);
    }
  }

  let resultText = `${text}<b>Total ${accounts.length} Akun</b>\n\n`;

  if (checkedAccounts.length > 0) {
    resultText += `✅ Tes Berhasil ${checkedAccounts.length} akun:\n`;
    checkedAccounts.forEach(acc => {
      resultText += `<code>${acc.email}</code> | Saldo: <code>$${acc.account_balance}</code>\n`;
    });
    resultText += '\n';
  }

  if (failedAccounts.length > 0) {
    resultText += `❌ Tes Gagal ${failedAccounts.length} akun:\n`;
    failedAccounts.forEach(email => {
      resultText += `<code>${email}</code>\n`;
    });
  }

  const buttons = [];
  if (failedAccounts.length > 0) {
    buttons.push([Markup.button.callback('🗑️ Hapus Akun Gagal', 'batch_test_delete_accounts')]);
  }
  buttons.push([Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]);

  return editOrReply(ctx, msg.message_id, resultText, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function batchTestDeleteAccounts(ctx) {
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>🔄 Menghapus Akun Gagal...</b>`;
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      null,
      newText,
      { parse_mode: 'HTML' }
    );

    const db = new AccountsDB(ctx.from.id);
    const accounts = await db.all();

    for (const account of accounts) {
      try {
        const client = await createDigitalOceanClient(account.token, ctx.from.id);
        await client.getBalance();
      } catch (error) {
        await db.remove(account.id);
      }
    }

    const finalText = `${oldText}\n\n<b>🔄 Menghapus Akun Gagal...</b>\n\n<b>✅ Akun gagal telah dihapus</b>`;

    const buttons = [[Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]];

    return ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      null,
      finalText,
      { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
      }
    );
  }
}

module.exports = { batchTestAccounts, batchTestDeleteAccounts };

