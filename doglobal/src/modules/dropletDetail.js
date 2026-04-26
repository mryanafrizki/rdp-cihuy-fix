const { createDigitalOceanClient, getProxyInfoString } = require('../utils/createDigitalOceanClient');
const { checkProxyRequirement } = require('../utils/proxyRequirement');
const { showDefaultProxyConfirm } = require('../utils/defaultProxyConfirm');
const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const DropletsDB = require('../utils/dropletsDb');
const localizeRegion = require('../utils/localizer');
const { validateButtons } = require('../utils/buttonValidator');
const { createSession } = require('../utils/callbackSession');
const { editOrReply, getOrCreateMessageId } = require('../utils/editOrReply');

async function dropletDetail(ctx, accountId, dropletId, skipDefaultCheck = false) {
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
    return showDefaultProxyConfirm(ctx, 'droplet_detail', { accountId, dropletId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  if (!account) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    return editOrReply(ctx, messageId, '⚠️ Akun tidak ditemukan', { parse_mode: 'HTML' });
  }

  const proxyInfo = await getProxyInfoString(ctx.from.id);
  let text = `<b>Informasi Server${proxyInfo}</b>\n\n`;
  // Use existing message if from callback, otherwise create new
  let msg;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    msg = { message_id: ctx.callbackQuery.message.message_id };
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `${text}Akun: <code>${account.email}</code>\n\n⏳ Mengambil informasi...`,
      { parse_mode: 'HTML' }
    );
  } else {
    msg = await ctx.reply(`${text}Akun: <code>${account.email}</code>\n\n⏳ Mengambil informasi...`, {
      parse_mode: 'HTML'
    });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const droplet = await client.getDroplet(dropletId);

    // Create short session IDs for buttons
    const deleteSession = createSession(ctx.from.id, { accountId, dropletId, action: 'delete' });
    
    const buttons = [
      [Markup.button.callback('🗑️ Hapus', `da:${deleteSession}`)]
    ];

    if (droplet.status === 'active') {
      const shutdownSession = createSession(ctx.from.id, { accountId, dropletId, action: 'shutdown' });
      const rebootSession = createSession(ctx.from.id, { accountId, dropletId, action: 'reboot' });
      const rebuildSession = createSession(ctx.from.id, { accountId, dropletId, action: 'rebuild' });
      const resetPwSession = createSession(ctx.from.id, { accountId, dropletId, action: 'reset_password' });
      
      buttons.push([
        Markup.button.callback('🛑 Matikan', `da:${shutdownSession}`),
        Markup.button.callback('🔄 Restart', `da:${rebootSession}`)
      ]);
      buttons.push([
        Markup.button.callback('🔨 Rebuild', `da:${rebuildSession}`),
        Markup.button.callback('🔑 Reset Pass', `da:${resetPwSession}`)
      ]);
    } else {
      const powerOnSession = createSession(ctx.from.id, { accountId, dropletId, action: 'power_on' });
      buttons.push([
        Markup.button.callback('⚡ Nyalakan', `da:${powerOnSession}`)
      ]);
    }

    const refreshSession = createSession(ctx.from.id, { accountId, dropletId });
    const backSession = createSession(ctx.from.id, { accountId });
    
    buttons.push([
      Markup.button.callback('🔄 Refresh', `dd:${refreshSession}`),
      Markup.button.callback('🔙 Kembali', `ld:${backSession}`)
    ]);

    // Validate buttons before sending
    validateButtons(buttons, `dropletDetail for droplet ${dropletId}`);

    const ipV4 = droplet.networks?.v4?.find(net => net.type === 'public');
    const ipV4Private = droplet.networks?.v4?.find(net => net.type === 'private');

    // Get password from database if available
    // Ensure accountId and dropletId are strings for consistency
    const accountIdStr = accountId ? accountId.toString() : null;
    const dropletIdStr = dropletId ? dropletId.toString() : null;
    
    const dropletsDb = new DropletsDB(ctx.from.id);
    const password = await dropletsDb.getPassword(dropletIdStr, accountIdStr);

    const proxyInfoDisplay = await getProxyInfoString(ctx.from.id);
    text = `<b>Informasi Server${proxyInfoDisplay}</b>

👤 Akun: <code>${account.email}</code>
🏷️ Nama: <code>${droplet.name}</code>
📏 Model: <code>${droplet.size_slug}</code>
🌍 Wilayah: <code>${localizeRegion(droplet.region.slug)}</code>
💻 Sistem Operasi: <code>${droplet.image?.distribution} ${droplet.image?.name}</code>
💾 Hard Disk: <code>${droplet.disk} GB</code>
🌐 IP Publik: <code>${ipV4?.ip_address || 'N/A'}</code>
🔒 IP Privat: <code>${ipV4Private?.ip_address || 'N/A'}</code>${password ? `\n🔑 Password: <code>${password}</code>` : ''}
📊 Status: <code>${droplet.status}</code>
📅 Dibuat pada: <code>${droplet.created_at.split('T')[0]}</code>`;

    return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
  } catch (error) {
    return editOrReply(ctx, msg.message_id, `${text}Akun: <code>${account.email}</code>\n\n⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

module.exports = { dropletDetail };

