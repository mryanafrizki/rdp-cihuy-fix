const DigitalOceanClient = require('./digitaloceanClient');
const { getUserProxy, getUserProxyInfo } = require('./getUserProxy');

/**
 * Create DigitalOceanClient with user's selected proxy if configured and enabled
 * @param {string} token - DigitalOcean API token
 * @param {number} userId - User ID for proxy lookup
 * @returns {Promise<DigitalOceanClient>} Configured client instance
 */
async function createDigitalOceanClient(token, userId) {
  const proxy = await getUserProxy(userId);
  return new DigitalOceanClient(token, proxy);
}

/**
 * Get proxy info for display
 * @param {number} userId - User ID
 * @returns {Promise<string>} Proxy info string or empty string
 */
async function getProxyInfoString(userId) {
  const proxyInfo = await getUserProxyInfo(userId);
  if (proxyInfo) {
    return ` (using proxy ${proxyInfo.proxyNum})`;
  }
  return '';
}

module.exports = { createDigitalOceanClient, getProxyInfoString };

