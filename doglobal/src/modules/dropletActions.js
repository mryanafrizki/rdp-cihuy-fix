const { createDigitalOceanClient, getProxyInfoString } = require('../utils/createDigitalOceanClient');
const { checkProxyRequirement } = require('../utils/proxyRequirement');
const { showDefaultProxyConfirm } = require('../utils/defaultProxyConfirm');
const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const { editOrReply } = require('../utils/editOrReply');

async function dropletDelete(ctx, accountId, dropletId, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    await ctx.answerCbQuery('❌ Proxy harus dikonfigurasi', { show_alert: true });
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'droplet_delete', { accountId, dropletId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const messageId = ctx.callbackQuery?.message?.message_id;
  const proxyInfo = await getProxyInfoString(ctx.from.id);
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>🔄 Menghapus droplet${proxyInfo}...</b>`;

    await editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    await client.deleteDroplet(dropletId);

    if (messageId) {
      const oldText = ctx.callbackQuery.message.text;
      const finalText = `${oldText.split('\n\n🔄')[0]}\n\n<b>✅ Droplet telah dihapus${proxyInfo}</b>`;

      return editOrReply(ctx, messageId, finalText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

async function dropletShutdown(ctx, accountId, dropletId, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    await ctx.answerCbQuery('❌ Proxy harus dikonfigurasi', { show_alert: true });
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'droplet_shutdown', { accountId, dropletId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const messageId = ctx.callbackQuery?.message?.message_id;
  const proxyInfo = await getProxyInfoString(ctx.from.id);
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>🔄 Mematikan droplet${proxyInfo}...</b>`;

    await editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    await client.shutdownDroplet(dropletId);

    if (messageId) {
      const oldText = ctx.callbackQuery.message.text;
      const finalText = `${oldText.split('\n\n🔄')[0]}\n\n<b>✅ Droplet telah dimatikan${proxyInfo}</b>`;

      return editOrReply(ctx, messageId, finalText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

async function dropletReboot(ctx, accountId, dropletId, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    await ctx.answerCbQuery('❌ Proxy harus dikonfigurasi', { show_alert: true });
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'droplet_reboot', { accountId, dropletId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const messageId = ctx.callbackQuery?.message?.message_id;
  const proxyInfo = await getProxyInfoString(ctx.from.id);
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>🔄 Merestart droplet${proxyInfo}...</b>`;

    await editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    await client.rebootDroplet(dropletId);

    if (messageId) {
      const oldText = ctx.callbackQuery.message.text;
      const finalText = `${oldText.split('\n\n🔄')[0]}\n\n<b>✅ Droplet telah direstart${proxyInfo}</b>`;

      return editOrReply(ctx, messageId, finalText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

async function dropletPowerOn(ctx, accountId, dropletId, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    await ctx.answerCbQuery('❌ Proxy harus dikonfigurasi', { show_alert: true });
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'droplet_power_on', { accountId, dropletId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const messageId = ctx.callbackQuery?.message?.message_id;
  const proxyInfo = await getProxyInfoString(ctx.from.id);
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>🔄 Menyalakan droplet${proxyInfo}...</b>`;

    await editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    await client.powerOnDroplet(dropletId);

    if (messageId) {
      const oldText = ctx.callbackQuery.message.text;
      const finalText = `${oldText.split('\n\n🔄')[0]}\n\n<b>✅ Droplet telah dinyalakan${proxyInfo}</b>`;

      return editOrReply(ctx, messageId, finalText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

async function dropletRebuild(ctx, accountId, dropletId, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    await ctx.answerCbQuery('❌ Proxy harus dikonfigurasi', { show_alert: true });
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'droplet_rebuild', { accountId, dropletId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const messageId = ctx.callbackQuery?.message?.message_id;
  const proxyInfo = await getProxyInfoString(ctx.from.id);
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>🔄 Membangun ulang droplet${proxyInfo}...</b>`;

    await editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const droplet = await client.getDroplet(dropletId);
    
    await client.rebuildDroplet(dropletId, droplet.image);

    if (messageId) {
      const oldText = ctx.callbackQuery.message.text;
      const finalText = `${oldText.split('\n\n🔄')[0]}\n\n<b>✅ Droplet telah dibangun ulang${proxyInfo}</b>\n🔑 Password baru dikirim ke email`;

      return editOrReply(ctx, messageId, finalText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

async function dropletResetPassword(ctx, accountId, dropletId, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    await ctx.answerCbQuery('❌ Proxy harus dikonfigurasi', { show_alert: true });
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'droplet_reset_password', { accountId, dropletId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const messageId = ctx.callbackQuery?.message?.message_id;
  const proxyInfo = await getProxyInfoString(ctx.from.id);
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>🔄 Mereset password droplet${proxyInfo}...</b>`;

    await editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    await client.resetDropletPassword(dropletId);

    if (messageId) {
      const oldText = ctx.callbackQuery.message.text;
      const finalText = `${oldText.split('\n\n🔄')[0]}\n\n<b>✅ Password droplet telah direset${proxyInfo}</b>\n🔑 Password baru dikirim ke email`;

      return editOrReply(ctx, messageId, finalText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

module.exports = {
  dropletDelete,
  dropletShutdown,
  dropletReboot,
  dropletPowerOn,
  dropletRebuild,
  dropletResetPassword
};

