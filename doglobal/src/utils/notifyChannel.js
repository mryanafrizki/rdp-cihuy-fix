const localizeRegion = require('./localizer');
const { getGlobalCount, incrementGlobalCount } = require('./dropletCounter');
const UsersDB = require('./usersDb');

/**
 * Send notification to channel when droplet is successfully created
 * @param {object} telegram - Telegram instance (ctx.telegram)
 * @param {object} dropletInfo - Droplet information from API
 * @param {object} userInfo - User information (ctx.from)
 * @param {string} accountEmail - Account email used
 * @param {string} password - Droplet password
 * @param {object|null} proxyInfo - Proxy information (from getUserProxyInfo) or null
 * @returns {Promise<void>}
 */
async function notifyDropletCreated(telegram, dropletInfo, userInfo, accountEmail, password, proxyInfo = null) {
  const channelId = process.env.NOTIFICATION_CHANNEL_ID;
  
  if (!channelId) {
    console.warn('[notifyChannel] NOTIFICATION_CHANNEL_ID not set in .env, skipping notification');
    return;
  }

  try {
    // Get user info from database
    const usersDb = new UsersDB();
    const user = await usersDb.getUser(userInfo.id);
    
    // Increment and get global count
    const globalCount = await incrementGlobalCount();
    
    // Get droplet details
    const ipV4 = dropletInfo.networks?.v4?.find(net => net.type === 'public');
    const ipV4Private = dropletInfo.networks?.v4?.find(net => net.type === 'private');
    
    // Format user display name
    const userDisplayName = user?.firstName || user?.username || `User ${userInfo.id}`;
    const userId = userInfo.id;
    const username = user?.username ? `@${user.username}` : 'N/A';
    
    // Format proxy information
    let proxyText = '';
    if (proxyInfo && proxyInfo.proxy) {
      const proxy = proxyInfo.proxy;
      const proxyString = proxy.auth
        ? `${proxy.protocol}://${proxy.auth.username ? '****' : ''}@${proxy.host}:${proxy.port}`
        : `${proxy.protocol}://${proxy.host}:${proxy.port}`;
      proxyText = `🔐 <b>Proxy:</b> Proxy ${proxyInfo.proxyNum}\n` +
        `<code>${proxyString}</code>\n`;
    } else {
      proxyText = `🔐 <b>Proxy:</b> <code>Default (tanpa proxy)</code>\n`;
    }
    
    // Format notification message
    const text = `🎉 <b>VPS Baru Berhasil Dibuat!</b>\n\n` +
      `<b>📊 Informasi Server:</b>\n` +
      `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n` +
      `👤 <b>Akun DO:</b> <code>${accountEmail}</code>\n` +
      `🏷️ <b>Nama:</b> <code>${dropletInfo.name}</code>\n` +
      `🆔 <b>ID VPS:</b> <code>${dropletInfo.id}</code>\n` +
      `📏 <b>Model:</b> <code>${dropletInfo.size_slug}</code>\n` +
      `🌍 <b>Wilayah:</b> <code>${localizeRegion(dropletInfo.region.slug)}</code>\n` +
      `💻 <b>Sistem Operasi:</b> <code>${dropletInfo.image?.distribution || 'N/A'} ${dropletInfo.image?.name || ''}</code>\n` +
      `💾 <b>Hard Disk:</b> <code>${dropletInfo.disk} GB</code>\n` +
      `🌐 <b>IP Publik:</b> <code>${ipV4?.ip_address || 'N/A'}</code>\n` +
      `🔒 <b>IP Privat:</b> <code>${ipV4Private?.ip_address || 'N/A'}</code>\n` +
      `🔑 <b>Password:</b> <code>${password}</code>\n` +
      `📊 <b>Status:</b> <code>${dropletInfo.status}</code>\n` +
      `📅 <b>Dibuat pada:</b> <code>${new Date(dropletInfo.created_at).toLocaleString('id-ID')}</code>\n` +
      `${proxyText}\n` +
      `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n` +
      `<b>👤 Dibuat oleh:</b>\n` +
      `🆔 <b>ID:</b> <code>${userId}</code>\n` +
      `👤 <b>Nama:</b> <code>${userDisplayName}</code>\n` +
      `📱 <b>Username:</b> ${username}\n\n` +
      `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n` +
      `📈 <b>Total VPS Dibuat:</b> <code>${globalCount}</code>`;

    await telegram.sendMessage(channelId, text, {
      parse_mode: 'HTML'
    });
    
  } catch (error) {
    console.error('[notifyChannel] Error sending notification:', error);
    // Don't throw error - notification failure shouldn't break droplet creation
  }
}

module.exports = { notifyDropletCreated };

