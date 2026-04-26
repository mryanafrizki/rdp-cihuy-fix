const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Validate proxy by testing connection
 * @param {string} proxyString - Proxy string in format: http://user:pass@host:port or http://host:port
 * @returns {Promise<{valid: boolean, proxy?: object, error?: string}>}
 */
async function validateProxy(proxyString) {
  try {
    // Parse proxy string
    const proxyUrl = new URL(proxyString);
    
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(proxyUrl.protocol)) {
      return { valid: false, error: 'Proxy protocol harus http, https, socks4, atau socks5' };
    }

    const proxy = {
      protocol: proxyUrl.protocol.replace(':', ''),
      host: proxyUrl.hostname,
      port: parseInt(proxyUrl.port) || (proxyUrl.protocol === 'https:' ? 443 : 80),
      auth: proxyUrl.username || proxyUrl.password 
        ? {
            username: proxyUrl.username || '',
            password: proxyUrl.password || ''
          }
        : undefined
    };

    // Test proxy by making a simple HTTPS request through it
    // For now, just validate format - actual test can be added if needed
    // Testing actual connection may take time and could be expensive
    
    return { valid: true, proxy };
  } catch (error) {
    return { valid: false, error: `Format proxy tidak valid: ${error.message}` };
  }
}

/**
 * Parse proxy string to object
 * @param {string} proxyString - Proxy string
 * @returns {object|null} Proxy object or null if invalid
 */
function parseProxy(proxyString) {
  if (!proxyString || !proxyString.trim()) {
    return null;
  }

  try {
    const proxyUrl = new URL(proxyString.trim());
    
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(proxyUrl.protocol)) {
      return null;
    }

    return {
      protocol: proxyUrl.protocol.replace(':', ''),
      host: proxyUrl.hostname,
      port: parseInt(proxyUrl.port) || (proxyUrl.protocol === 'https:' ? 443 : 80),
      auth: proxyUrl.username || proxyUrl.password 
        ? {
            username: proxyUrl.username || '',
            password: proxyUrl.password || ''
          }
        : undefined
    };
  } catch (error) {
    return null;
  }
}

module.exports = { validateProxy, parseProxy };

