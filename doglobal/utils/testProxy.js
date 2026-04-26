const net = require('net');

/**
 * Test proxy connection by checking TCP connection to proxy server
 * @param {object} proxy - Proxy object: { protocol, host, port, auth? }
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise<{alive: boolean, responseTime?: number, error?: string}>}
 */
async function testProxy(proxy, timeout = 5000) {
  if (!proxy) {
    return { alive: false, error: 'Proxy tidak dikonfigurasi' };
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Create TCP socket connection to proxy server
    const socket = new net.Socket();
    let isResolved = false;

    // Set timeout
    socket.setTimeout(timeout);

    // Handle connection success
    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        const responseTime = Date.now() - startTime;
        socket.destroy();
        resolve({ 
          alive: true, 
          responseTime: responseTime
        });
      }
    });

    // Handle connection error
    socket.on('error', (error) => {
      if (!isResolved) {
        isResolved = true;
        const responseTime = Date.now() - startTime;
        console.error('[testProxy] Connection error:', error.message);
        
        let errorMessage = error.message;
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
          errorMessage = `Tidak dapat terhubung ke ${proxy.host}:${proxy.port}`;
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = `Host ${proxy.host} tidak ditemukan`;
        } else if (error.code === 'EHOSTUNREACH') {
          errorMessage = `Host ${proxy.host} tidak dapat dijangkau`;
        }
        
        resolve({ 
          alive: false, 
          error: errorMessage,
          responseTime: responseTime
        });
      }
    });

    // Handle timeout
    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        const responseTime = Date.now() - startTime;
        socket.destroy();
        resolve({ 
          alive: false, 
          error: `Timeout: Tidak ada respon dari ${proxy.host}:${proxy.port}`,
          responseTime: responseTime
        });
      }
    });

    // Handle socket close
    socket.on('close', () => {
      // Connection closed, but we should have already resolved
    });

    // Connect to proxy server
    try {
      socket.connect(proxy.port, proxy.host);
    } catch (error) {
      if (!isResolved) {
        isResolved = true;
        const responseTime = Date.now() - startTime;
        resolve({ 
          alive: false, 
          error: error.message,
          responseTime: responseTime
        });
      }
    }
  });
}

module.exports = { testProxy };

