const axios = require('axios');

const ATLANTIS_BASE_URL = 'https://atlantich2h.com';

async function createPayment(apiKey, reffId, amount) {
  try {
    console.log('Creating payment with new endpoint:', {
      apiKey: apiKey ? '***' : 'undefined',
      reffId,
      amount
    });

    // Sesuaikan dengan spesifikasi baru
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
        metode: 'qris'
      }),
      timeout: 30000
    });

    console.log('Payment API Response:', {
      status: response.status,
      data: response.data
    });

    // Sesuaikan dengan format response baru
    if (response.data && response.data.status === true) {
      return {
        success: true,
        data: {
          id: response.data.data.id,
          reff_id: response.data.data.reff_id,
          nominal: response.data.data.nominal,
          tambahan: response.data.data.tambahan || 0,
          fee: 0,
          get_balance: amount,
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
    console.error('Payment creation error:', error.message);
    
    if (error.response) {
      console.error('Error response:', error.response.data);
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

async function checkPaymentStatus(apiKey, transactionId) {
  try {
    console.log('Checking payment status for transaction:', transactionId);
    
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

    console.log('Payment Status API Response:', {
      status: response.status,
      data: response.data
    });

    // Cek apakah response berhasil
    if (response.data) {
      // Jika ada field status di level atas response
      if (response.data.status === true || response.data.status === 'success') {
        return {
          success: true,
          data: response.data.data || response.data
        };
      }
      
      // Jika response.data.status bukan true, tapi ada data
      else if (response.data.data) {
        return {
          success: true,
          data: response.data.data
        };
      }
      
      // Jika tidak ada status true, tapi ada informasi status di data
      else if (response.data.status) {
        // Status langsung ada di response.data
        return {
          success: true,
          data: {
            status: response.data.status,
            ...response.data
          }
        };
      }
      
      // Fallback: return data apa adanya
      else {
        return {
          success: true,
          data: response.data
        };
      }
    } else {
      return {
        success: false,
        error: 'No response data received'
      };
    }

  } catch (error) {
    console.error('Check payment status error:', error.message);
    
    if (error.response) {
      console.error('Status check error response:', error.response.data);
      
      // Cek apakah ada informasi status dalam error response
      if (error.response.data && error.response.data.status) {
        return {
          success: true, // Ubah menjadi true agar bisa diproses
          data: error.response.data
        };
      }
    }
    
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

async function getAtlanticBalance(apiKey) {
  try {
    const response = await axios({
      method: 'POST',
      url: `${ATLANTIS_BASE_URL}/profile`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: new URLSearchParams({
        api_key: apiKey,
      }),
      timeout: 15000
    });

    if (response.data && response.data.status === true) {
      return { success: true, data: response.data.data };
    } else {
      return { success: false, error: response.data?.message || 'Failed to get balance' };
    }
  } catch (error) {
    console.error('Get Atlantic balance error:', error.message);
    if (error.response) {
      console.error('Error response:', error.response.data);
      return { success: false, error: error.response.data?.message || `HTTP ${error.response.status}` };
    }
    return { success: false, error: error.message || 'Network error' };
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
  
  // Status yang dianggap sukses
  const successStatuses = ['success', 'processing', 'settlement', 'capture', 'paid'];
  
  return successStatuses.includes(statusString);
}

module.exports = {
  createPayment,
  checkPaymentStatus,
  isPaymentStatusSuccessful,
  getAtlanticBalance
};