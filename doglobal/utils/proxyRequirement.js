const { isProxyRequired, hasProxyConfigured } = require('./getUserProxy');

/**
 * Sama seperti versi di src/: jika belum ada proxy -> treat as default (tidak blokir)
 * @param {number} userId
 * @returns {Promise<{required: boolean, isDefault?: boolean, notConfigured?: boolean}>}
 */
async function checkProxyRequirement(userId) {
  const hasProxy = await hasProxyConfigured(userId);
  const proxyRequired = await isProxyRequired(userId);

  if (!hasProxy) {
    return { required: false, isDefault: true, notConfigured: true };
  }
  if (!proxyRequired) {
    return { required: false, isDefault: true };
  }
  return { required: false, usingProxy: true };
}

module.exports = { checkProxyRequirement };

