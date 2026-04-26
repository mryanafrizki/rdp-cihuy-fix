const { Markup } = require('telegraf');
const { editOrReply } = require('./editOrReply');
const { createSession } = require('./callbackSession');
const { hasProxyConfigured, getUserProxyInfo } = require('./getUserProxy');

/**
 * Show confirmation dialog when user is using default proxy
 * @param {object} ctx - Telegraf context
 * @param {string} action - Action identifier (e.g., 'create_droplet', 'account_detail', etc.)
 * @param {object} actionData - Data needed to continue the action (will be stored in session)
 * @returns {Promise}
 */
async function showDefaultProxyConfirm(ctx, action, actionData = {}) {
  const messageId = ctx.callbackQuery?.message?.message_id;
  
  // Create session to store action data
  const sessionId = createSession(ctx.from.id, {
    action,
    ...actionData
  });
  
  const notConfigured = !(await hasProxyConfigured(ctx.from.id));
  const proxyInfo = await getUserProxyInfo(ctx.from.id);
  let text;
  if (proxyInfo && proxyInfo.proxy) {
    const proxy = proxyInfo.proxy;
    const base = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
    text = `⚠️ <b>Konfirmasi Penggunaan Proxy</b>\n\nAnda saat ini menggunakan proxy ${proxyInfo.proxyNum}: <code>${base}</code>, lanjutkan?`;
  } else {
    text = notConfigured
      ? `⚠️ <b>Konfirmasi Tanpa Proxy</b>\n\nAnda belum menambahkan proxy. Sistem akan menggunakan mode default (tanpa proxy). Lanjutkan?\n\n💡 Disarankan menambah proxy untuk keamanan dan reliabilitas.`
      : `⚠️ <b>Konfirmasi Proxy Default</b>\n\nAnda saat ini memilih untuk tidak menggunakan proxy (mode default). Lanjutkan?`;
  }
  
  const buttons = [
    [
      Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage'),
      Markup.button.callback('✅ Lanjutkan', `default_proxy_continue:${sessionId}`)
    ]
  ];
  
  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

module.exports = { showDefaultProxyConfirm };

