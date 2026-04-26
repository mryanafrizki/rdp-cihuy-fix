const ProxyDB = require('./proxyDb');

/**
 * Get selected proxy for user (only if useProxy is enabled)
 * @param {number} userId - User ID
 * @returns {object|null} Selected proxy object or null if not configured/disabled
 */
async function getUserProxy(userId) {
  const proxyDb = new ProxyDB(userId);
  const settings = await proxyDb.getSettings();
  
  if (!settings.useProxy || !settings.selectedProxyId) {
    return null;
  }
  
  return await proxyDb.getSelected();
}

/**
 * Get proxy info for display (including proxy number)
 * @param {number} userId - User ID
 * @returns {object|null} { proxy, proxyNum } or null if not configured/disabled
 */
async function getUserProxyInfo(userId) {
  const proxyDb = new ProxyDB(userId);
  const settings = await proxyDb.getSettings();
  
  if (!settings.useProxy || !settings.selectedProxyId) {
    return null;
  }
  
  const selectedProxy = await proxyDb.getSelected();
  if (!selectedProxy) {
    return null;
  }
  
  const allProxies = await proxyDb.getAll();
  const proxyNum = allProxies.findIndex(p => p.id === selectedProxy.id) + 1;
  
  return {
    proxy: selectedProxy,
    proxyNum
  };
}

/**
 * Check if user must use proxy
 * @param {number} userId - User ID
 * @returns {boolean} True if proxy is required, false otherwise
 */
async function isProxyRequired(userId) {
  const proxyDb = new ProxyDB(userId);
  const settings = await proxyDb.getSettings();
  return settings.useProxy === true;
}

/**
 * Check if user has proxy configured
 * @param {number} userId - User ID
 * @returns {boolean} True if user has proxy, false otherwise
 */
async function hasProxyConfigured(userId) {
  const proxyDb = new ProxyDB(userId);
  const count = await proxyDb.count();
  return count > 0;
}

module.exports = { getUserProxy, getUserProxyInfo, isProxyRequired, hasProxyConfigured };

