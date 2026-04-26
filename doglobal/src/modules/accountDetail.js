const { createDigitalOceanClient, getProxyInfoString } = require('../utils/createDigitalOceanClient');
const { checkProxyRequirement } = require('../utils/proxyRequirement');
const { showDefaultProxyConfirm } = require('../utils/defaultProxyConfirm');
const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const { editOrReply } = require('../utils/editOrReply');

async function accountDetail(ctx, accountId, skipDefaultCheck = false) {
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
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'account_detail', { accountId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  if (!account) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    return editOrReply(ctx, messageId, '⚠️ Akun tidak ditemukan', { parse_mode: 'HTML' });
  }

  const proxyInfo = await getProxyInfoString(ctx.from.id);
  let text = `<b>ℹ️ Informasi Akun${proxyInfo}</b>

📧 Email: <code>${account.email}</code>

⏳ Mendapatkan informasi...`;

  // Use existing message if from callback, otherwise create new
  let msg;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    msg = { message_id: ctx.callbackQuery.message.message_id };
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      text,
      { parse_mode: 'HTML' }
    );
  } else {
    msg = await ctx.reply(text, { parse_mode: 'HTML' });
  }

  text = `<b>ℹ️ Informasi Akun</b>

📧 Email: <code>${account.email}</code>
💬 Komentar: <code>${account.remarks}</code>
📅 Tanggal Ditambahkan: <code>${account.date}</code>
🔑 Token: <code>${account.token}</code>
`;

  const buttons = [
    [Markup.button.callback('🗑️ Hapus Akun', `delete_account:${account.id}`)]
  ];

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const balanceData = await client.getBalance();

    text += `\n💰 Saldo Akun: <code>$${balanceData.account_balance}</code>
📊 Penggunaan Bulan Ini: <code>$${balanceData.month_to_date_usage}</code>
📅 Tanggal Penagihan: <code>${balanceData.generated_at.split('T')[0]}</code>`;
  } catch (error) {
    text += `\n⚠️ Kesalahan Mendapatkan Tagihan: <code>${error.message}</code>`;
  }

  buttons.push([Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]);

  return editOrReply(ctx, msg.message_id, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

module.exports = { accountDetail };

