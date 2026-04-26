const { createDigitalOceanClient, getProxyInfoString } = require('../utils/createDigitalOceanClient');
const { checkProxyRequirement } = require('../utils/proxyRequirement');
const { showDefaultProxyConfirm } = require('../utils/defaultProxyConfirm');
const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const localizeRegion = require('../utils/localizer');
const { createSession } = require('../utils/callbackSession');
const { editOrReply, getOrCreateMessageId } = require('../utils/editOrReply');

async function listDroplets(ctx, accountId, skipDefaultCheck = false) {
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
    return showDefaultProxyConfirm(ctx, 'list_droplets', { accountId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  if (!account) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    return editOrReply(ctx, messageId, '⚠️ Akun tidak ditemukan', { parse_mode: 'HTML' });
  }

  const proxyInfo = await getProxyInfoString(ctx.from.id);
  let text = `<b>🔧 VPS Manager${proxyInfo}</b>\n\n`;
  // Use existing message if from callback, otherwise create new
  let msg;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    msg = { message_id: ctx.callbackQuery.message.message_id };
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `${text}👤 Akun: <code>${account.email}</code>\n\n⏳ Mengambil daftar VPS...`,
      { parse_mode: 'HTML' }
    );
  } else {
    msg = await ctx.reply(`${text}👤 Akun: <code>${account.email}</code>\n\n⏳ Mengambil daftar VPS...`, {
      parse_mode: 'HTML'
    });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const dropletsList = await client.listDroplets();

    const buttons = [];

    if (dropletsList.length === 0) {
      // Use session for create_droplet callback
      const createDropletSession = createSession(ctx.from.id, { accountId: account.id });
      buttons.push([Markup.button.callback('➕ Buat instance', `cd:${createDropletSession}`)]);
    } else {
      // Map droplets to buttons
      dropletsList.forEach(droplet => {
        const session = createSession(ctx.from.id, { accountId: account.id, dropletId: droplet.id });
        buttons.push([
          Markup.button.callback(
            `${droplet.name} (${localizeRegion(droplet.region.slug)}) (${droplet.size_slug})`,
            `dd:${session}`
          )
        ]);
      });
    }

    // Add back button
    const backSession = createSession(ctx.from.id, {});
    buttons.push([Markup.button.callback('🔙 Kembali ke Manajer VPS', `manage_droplets:page:${backSession}`)]);

    const displayText = dropletsList.length === 0
      ? `${text}👤 Akun: <code>${account.email}</code>\n\n⚠️ Tidak ada instance`
      : `${text}👤 Akun: <code>${account.email}</code>\n\n🔢 Pilih instance`;

    return editOrReply(ctx, msg.message_id, displayText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    const backSession = createSession(ctx.from.id, {});
    const buttons = [[Markup.button.callback('🔙 Kembali ke Manajer VPS', `manage_droplets:page:${backSession}`)]];
    return editOrReply(ctx, msg.message_id, `${text}👤 Akun: <code>${account.email}</code>\n\n⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
}

module.exports = { listDroplets };

