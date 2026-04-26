const { isProxyRequired, hasProxyConfigured } = require('./getUserProxy');

/**
 * Check if user must configure proxy before using features
 * @param {number} userId - User ID
 * @returns {Promise<{required: boolean, isDefault?: boolean, message?: string}>}
 */
async function checkProxyRequirement(userId) {
  const hasProxy = await hasProxyConfigured(userId);
  const proxyRequired = await isProxyRequired(userId);

  // If user has NO proxy configured at all, don't block. Treat as default (no proxy) and allow with confirmation.
  if (!hasProxy) {
    return {
      required: false,
      isDefault: true,
      notConfigured: true
    };
  }

  if (!proxyRequired) {
    // User has proxy but not using it (default mode)
    return {
      required: false,
      isDefault: true
    };
  }

  // Proxy is active and selected
  return { required: false, usingProxy: true };
}

module.exports = { checkProxyRequirement };

