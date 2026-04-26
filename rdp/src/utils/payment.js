const axios = require('axios');

const ATLANTIS_BASE_URL = 'https://atlantich2h.com';
const PAKASIR_BASE_URL = 'https://app.pakasir.com';

// Get payment gateway type from environment variable
// Default to 'atlantich2h' if not specified
function getPaymentGateway() {
  const gateway = (process.env.PAYMENT_GATEWAY || 'atlantich2h').toLowerCase();
  return gateway === 'pakasir' ? 'pakasir' : 'atlantich2h';
}

// PENTING: Rate limiter untuk API calls ke Atlantic (global)
// Mencegah terlalu banyak concurrent requests ke API
// Limit: 50 requests per detik (untuk safe margin dari Atlantic API limit)
const apiRateLimiter = {
  queue: [],
  processing: false,
  maxPerSecond: 50, // Max 50 requests per second
  requests: [],
  
  // Clean old requests (older than 1 second)
  cleanOldRequests() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < 1000);
  },
  
  // Check if can make request
  canMakeRequest() {
    this.cleanOldRequests();
    return this.requests.length < this.maxPerSecond;
  },
  
  // Add request timestamp
  addRequest() {
    this.requests.push(Date.now());
  },
  
  // Wait until can make request (with max wait time)
  async waitForSlot(maxWait = 5000) {
    const startTime = Date.now();
    while (!this.canMakeRequest() && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      this.cleanOldRequests();
    }
    return this.canMakeRequest();
  }
};

// Create payment via Atlantic
async function createPaymentAtlantic(apiKey, reffId, amount) {
  try {
    console.info('[ATLANTIC] Creating payment:', {
      apiKey: apiKey ? '***' : 'undefined',
      reffId,
      amount
    });

    const response = await axios({
      method: 'POST',
      url: `${ATLANTIS_BASE_URL}/deposit/create`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: new URLSearchParams({
        api_key: apiKey,
        reff_id: reffId,
        nominal: amount.toString(),
        type: 'ewallet',
        metode: 'QRIS'
      }),
      timeout: 30000
    });

    console.info('[ATLANTIC] Payment API Response:', {
      status: response.status,
      data: response.data
    });

    if (response.data && response.data.status === true) {
      return {
        success: true,
        data: {
          id: response.data.data.id,
          reff_id: response.data.data.reff_id,
          nominal: response.data.data.nominal,
          tambahan: response.data.data.tambahan || 0,
          fee: response.data.data.fee || 0,
          get_balance: response.data.data.get_balance || amount,
          qr_string: response.data.data.qr_string,
          qr_image: response.data.data.qr_image,
          status: response.data.data.status,
          created_at: response.data.data.created_at,
          expired_at: response.data.data.expired_at
        }
      };
    } else {
      return {
        success: false,
        error: response.data?.message || 'Payment creation failed'
      };
    }

  } catch (error) {
    console.error('[ATLANTIC] Payment creation error:', error.message);
    
    if (error.response) {
      console.error('[ATLANTIC] Error response:', error.response.data);
      return {
        success: false,
        error: error.response.data?.message || `HTTP ${error.response.status}: ${error.response.statusText}`
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

// Create payment via Pakasir
async function createPaymentPakasir(apiKey, projectSlug, orderId, amount) {
  try {
    console.info('[PAKASIR] Creating payment:', {
      apiKey: apiKey ? '***' : 'undefined',
      project: projectSlug,
      orderId,
      amount
    });

    const response = await axios({
      method: 'POST',
      url: `${PAKASIR_BASE_URL}/api/transactioncreate/qris`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        project: projectSlug,
        order_id: orderId,
        amount: amount,
        api_key: apiKey
      },
      timeout: 30000
    });

    console.info('[PAKASIR] Payment API Response:', {
      status: response.status,
      data: response.data
    });

    if (response.data && response.data.payment) {
      const payment = response.data.payment;
      return {
        success: true,
        data: {
          id: payment.order_id, // Use order_id as transaction ID
          reff_id: payment.order_id,
          nominal: payment.amount,
          tambahan: 0,
          fee: payment.fee || 0,
          get_balance: payment.total_payment || amount,
          total_payment: payment.total_payment || amount, // Store total_payment for display
          qr_string: payment.payment_number, // QR string from Pakasir
          qr_image: null,
          status: payment.status || 'pending',
          created_at: payment.created_at || new Date().toISOString(),
          expired_at: payment.expired_at,
          // Store additional Pakasir data for status checking
          _pakasir_project: projectSlug,
          _pakasir_order_id: orderId,
          _pakasir_amount: payment.amount
        }
      };
    } else {
      return {
        success: false,
        error: response.data?.message || 'Payment creation failed'
      };
    }

  } catch (error) {
    console.error('[PAKASIR] Payment creation error:', error.message);
    
    if (error.response) {
      console.error('[PAKASIR] Error response:', error.response.data);
      return {
        success: false,
        error: error.response.data?.message || `HTTP ${error.response.status}: ${error.response.statusText}`
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

// Main createPayment function - routes to appropriate gateway
async function createPayment(apiKey, reffId, amount, additionalData = {}) {
  const gateway = getPaymentGateway();
  
  if (gateway === 'pakasir') {
    // For Pakasir, we need project slug and order_id
    const projectSlug = additionalData.projectSlug || process.env.PAKASIR_PROJECT_SLUG;
    const orderId = additionalData.orderId || reffId;
    
    if (!projectSlug) {
      return {
        success: false,
        error: 'PAKASIR_PROJECT_SLUG is required in environment variables'
      };
    }
    
    return await createPaymentPakasir(apiKey, projectSlug, orderId, amount);
  } else {
    // Default to Atlantic
    return await createPaymentAtlantic(apiKey, reffId, amount);
  }
}

// Check payment status via Atlantic
async function checkPaymentStatusAtlantic(apiKey, transactionId, retryCount = 0) {
  try {
    // PENTING: Rate limiting untuk prevent API overload
    // Wait for slot jika rate limit tercapai
    const canProceed = await apiRateLimiter.waitForSlot(5000); // Max wait 5 detik
    if (!canProceed) {
      // If rate limited, use exponential backoff
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 detik
      console.warn(`[ATLANTIC STATUS] Rate limited, waiting ${backoffDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
    
    // Mark request
    apiRateLimiter.addRequest();
    
    // Implementasi check status sesuai dengan API Atlantis
    const response = await axios({
      method: 'POST',
      url: `${ATLANTIS_BASE_URL}/deposit/status`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: new URLSearchParams({
        api_key: apiKey,
        id: transactionId
      }),
      timeout: 15000
    });

    // Cek apakah response berhasil
    if (response.data) {
      // Log response untuk debugging (hanya jika perlu)
      // console.info('[PAYMENT STATUS] Response:', JSON.stringify(response.data, null, 2));
      
      // PENTING: Parse response dengan benar untuk berbagai format Atlantic API
      // Format 1: { status: true, data: { status: 'success', ... } }
      // Format 2: { status: true, data: { ... } } (status payment ada di data.status)
      // Format 3: { status: 'success', ... } (status langsung di root)
      // Format 4: { data: { status: 'success', ... } } (tanpa wrapper status)
      
      let paymentData = null;
      let paymentStatus = null;
      
      // Cek apakah response wrapper sukses (status: true)
      if (response.data.status === true || response.data.status === 'success') {
        // Response sukses, ambil data payment
        paymentData = response.data.data || response.data;
        
        // Cari status payment di berbagai lokasi
        if (paymentData && paymentData.status) {
          paymentStatus = paymentData.status;
        } else if (response.data.status && typeof response.data.status === 'string') {
          // Status mungkin ada di root level
          paymentStatus = response.data.status;
        }
      }
      // Jika response.data.status bukan true/success, tapi ada data
      else if (response.data.data) {
        paymentData = response.data.data;
        if (paymentData.status) {
          paymentStatus = paymentData.status;
        }
      }
      // Jika status ada langsung di response.data
      else if (response.data.status && typeof response.data.status === 'string') {
        paymentStatus = response.data.status;
        paymentData = response.data;
      }
      // Fallback: gunakan data apa adanya
      else {
        paymentData = response.data;
        if (paymentData.status) {
          paymentStatus = paymentData.status;
        }
      }
      
      // PENTING: Pastikan data selalu ada dan status payment ter-return
      if (paymentData) {
        // Jika paymentStatus belum ada, coba cari di berbagai lokasi
        if (!paymentStatus) {
          if (paymentData.status) {
            paymentStatus = paymentData.status;
          } else if (paymentData.payment_status) {
            paymentStatus = paymentData.payment_status;
          } else if (paymentData.transaction_status) {
            paymentStatus = paymentData.transaction_status;
          }
        }
        
        // Pastikan status ada di paymentData untuk digunakan di handler
        if (paymentStatus && !paymentData.status) {
          paymentData.status = paymentStatus;
        }
        
        return {
          success: true,
          data: paymentData
        };
      } else {
        return {
          success: false,
          error: 'No payment data in response'
        };
      }
    } else {
      return {
        success: false,
        error: 'No response data received'
      };
    }

  } catch (error) {
    // PENTING: Handle rate limiting dari Atlantic API
    // Jika rate limited (429 Too Many Requests), retry dengan exponential backoff
    if (error.response?.status === 429 || error.response?.status === 503) {
      if (retryCount < 3) {
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 detik
        console.warn(`[ATLANTIC STATUS] Rate limited (${error.response.status}), retrying in ${backoffDelay}ms... (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return checkPaymentStatusAtlantic(apiKey, transactionId, retryCount + 1);
      } else {
        console.error(`[PAYMENT STATUS] Rate limited - max retries reached for ${transactionId}`);
        return {
          success: false,
          error: 'Rate limited - please try again later'
        };
      }
    }
    
    // Suppress spam log untuk error 522 (timeout) dari Atlantic API
    if (error.response?.status === 522 || error.message?.includes('522')) {
      // Error 522 adalah timeout dari server Atlantic, return error tanpa log spam
      return {
        success: false,
        error: 'Server timeout (522)'
      };
    }
    
    // Log error untuk error selain 522 dan 429
    if (error.response?.status !== 522 && error.response?.status !== 429) {
      console.error('[ATLANTIC STATUS] Check payment status error:', error.message);
    }
    
    if (error.response) {
      const statusCode = error.response.status;
      const errorData = error.response.data;
      
      // Log response error untuk error selain 522 dan 429
      if (statusCode !== 522 && statusCode !== 429) {
        console.error('[ATLANTIC STATUS] Status check error response:', errorData);
      }
      
      // Untuk error 404, return format yang jelas dengan code dan message
      if (statusCode === 404) {
        return {
          success: false,
          error: {
            code: 404,
            status: 404,
            message: errorData?.message || 'Id deposit tidak ditemukan'
          },
          errorResponse: errorData // Include untuk reference
        };
      }
      
      // Cek apakah ada informasi status dalam error response
      if (errorData && errorData.status) {
        return {
          success: true, // Ubah menjadi true agar bisa diproses
          data: errorData
        };
      }
      
      // Return error dengan detail status code
      return {
        success: false,
        error: {
          code: statusCode,
          status: statusCode,
          message: errorData?.message || error.message || 'Network error occurred'
        },
        errorResponse: errorData
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

// Check payment status via Pakasir
async function checkPaymentStatusPakasir(apiKey, projectSlug, orderId, amount, retryCount = 0) {
  try {
    // PENTING: Rate limiting untuk prevent API overload
    const canProceed = await apiRateLimiter.waitForSlot(5000);
    if (!canProceed) {
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      console.warn(`[PAKASIR STATUS] Rate limited, waiting ${backoffDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
    
    apiRateLimiter.addRequest();
    
    // Pakasir uses GET request with query parameters
    console.info(`[PAKASIR STATUS] Checking status with params:`, {
      project: projectSlug,
      order_id: orderId,
      amount: amount,
      api_key: apiKey ? '***' : 'undefined'
    });
    
    const response = await axios({
      method: 'GET',
      url: `${PAKASIR_BASE_URL}/api/transactiondetail`,
      params: {
        project: projectSlug,
        amount: amount,
        order_id: orderId,
        api_key: apiKey
      },
      timeout: 15000
    });
    
    console.info(`[PAKASIR STATUS] Response:`, {
      status: response.status,
      hasTransaction: !!response.data?.transaction
    });

    if (response.data && response.data.transaction) {
      const transaction = response.data.transaction;
      
      // Map Pakasir status to common format
      // Pakasir status: 'completed' means paid
      let status = transaction.status || 'pending';
      if (status === 'completed') {
        status = 'success';
      }
      
      return {
        success: true,
        data: {
          id: transaction.order_id,
          reff_id: transaction.order_id,
          status: status,
          amount: transaction.amount,
          order_id: transaction.order_id,
          project: transaction.project,
          payment_method: transaction.payment_method,
          completed_at: transaction.completed_at
        }
      };
    } else {
      return {
        success: false,
        error: 'No transaction data in response'
      };
    }

  } catch (error) {
    // Handle rate limiting
    if (error.response?.status === 429 || error.response?.status === 503) {
      if (retryCount < 3) {
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        console.warn(`[PAKASIR STATUS] Rate limited (${error.response.status}), retrying in ${backoffDelay}ms... (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return checkPaymentStatusPakasir(apiKey, projectSlug, orderId, amount, retryCount + 1);
      } else {
        console.error(`[PAKASIR STATUS] Rate limited - max retries reached for ${orderId}`);
        return {
          success: false,
          error: 'Rate limited - please try again later'
        };
      }
    }
    
    if (error.response?.status === 404) {
      return {
        success: false,
        error: {
          code: 404,
          status: 404,
          message: 'Transaction not found'
        }
      };
    }
    
    console.error('[PAKASIR STATUS] Check payment status error:', error.message);
    
    if (error.response) {
      return {
        success: false,
        error: {
          code: error.response.status,
          status: error.response.status,
          message: error.response.data?.message || error.message || 'Network error occurred'
        }
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

// Main checkPaymentStatus function - routes to appropriate gateway
// For Pakasir, additionalData should contain: projectSlug, orderId, amount
async function checkPaymentStatus(apiKey, transactionId, retryCount = 0, additionalData = {}) {
  const gateway = getPaymentGateway();
  
  if (gateway === 'pakasir') {
    // For Pakasir, we need project slug, order_id, and amount
    const projectSlug = additionalData.projectSlug || process.env.PAKASIR_PROJECT_SLUG;
    const orderId = additionalData.orderId || transactionId;
    const amount = additionalData.amount;
    
    if (!projectSlug) {
      return {
        success: false,
        error: 'PAKASIR_PROJECT_SLUG is required in environment variables'
      };
    }
    
    if (!amount) {
      return {
        success: false,
        error: 'Amount is required for Pakasir status check'
      };
    }
    
    return await checkPaymentStatusPakasir(apiKey, projectSlug, orderId, amount, retryCount);
  } else {
    // Default to Atlantic
    return await checkPaymentStatusAtlantic(apiKey, transactionId, retryCount);
  }
}

function isPaymentStatusSuccessful(status) {
  // Terima berbagai format input
  let statusString = '';
  
  if (typeof status === 'string') {
    statusString = status.toLowerCase();
  } else if (status && status.status) {
    statusString = status.status.toLowerCase();
  } else if (status && status.data && status.data.status) {
    statusString = status.data.status.toLowerCase();
  } else {
    return false;
  }
  
  // Status yang dianggap sukses (includes Pakasir 'completed' status)
  const successStatuses = ['success', 'processing', 'settlement', 'capture', 'paid', 'completed'];
  
  return successStatuses.includes(statusString);
}

module.exports = {
  createPayment,
  checkPaymentStatus,
  isPaymentStatusSuccessful
};
