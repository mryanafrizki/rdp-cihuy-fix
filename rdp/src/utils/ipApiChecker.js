/**
 * IP-API.com checker untuk mendapatkan informasi IP dan VPS Name (ISP)
 * API Documentation: https://ip-api.com/docs/api:json
 * 
 * Endpoint: http://ip-api.com/json/{ip}
 * Free tier: 45 requests/minute
 * 
 * Note: VPS Name (hostname) diambil dari field `isp` di JSON response ip-api.com
 * Contoh: http://ip-api.com/json/167.71.192.164
 */

const axios = require('axios');

/**
 * Get IP information from ip-api.com
 * @param {string} ip - IP address to check (contoh: "167.71.192.164")
 * @returns {Promise<Object>} IP information dengan VPS Name dari field `isp`
 */
async function getIPInfo(ip) {
  try {
    // ip-api.com JSON API
    // Endpoint: http://ip-api.com/json/{ip}
    // Fields available: status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query
    // Field `isp` digunakan sebagai VPS Name
    const response = await axios.get(`http://ip-api.com/json/${ip}`, {
      timeout: 5000,
      params: {
        fields: 'status,message,country,countryCode,region,regionName,city,timezone,isp,org,as,query'
      }
    });

    if (response.data && response.data.status === 'success') {
      return {
        success: true,
        ip: response.data.query || ip,
        country: response.data.country || 'N/A',
        countryCode: response.data.countryCode || 'N/A',
        region: response.data.regionName || 'N/A', // regionName dari API
        city: response.data.city || 'N/A',
        timezone: response.data.timezone || 'N/A',
        isp: response.data.isp || 'N/A',
        org: response.data.org || 'N/A',
        as: response.data.as || 'N/A',
        // VPS Name (hostname) diambil dari field isp (ISP name)
        // Contoh: "DigitalOcean, LLC" dari response {"isp": "DigitalOcean, LLC", ...}
        hostname: response.data.isp || 'N/A'
      };
    } else {
      return {
        success: false,
        error: response.data?.message || 'Failed to get IP information'
      };
    }
  } catch (error) {
    console.error('[IP-API] Error getting IP info:', error.message);
    return {
      success: false,
      error: error.message || 'Network error'
    };
  }
}

/**
 * Get comprehensive IP information including VPS Name (from ISP field)
 * VPS Name diambil dari field `isp` di JSON response ip-api.com
 * @param {string} ip - IP address to check (contoh: "167.71.192.164")
 * @returns {Promise<Object>} Complete IP information with VPS Name (ISP)
 */
async function getIPInfoWithHostname(ip) {
  try {
    // Get IP info from ip-api.com
    // VPS Name sudah termasuk di response sebagai field `isp`
    const ipInfo = await getIPInfo(ip);
    
    if (!ipInfo.success) {
      return ipInfo;
    }
    
    // VPS Name sudah diambil dari field isp di getIPInfo()
    // Return langsung dengan hostname (VPS Name)
    return ipInfo;
  } catch (error) {
    console.error('[IP-API] Error getting IP info with VPS Name:', error.message);
    return {
      success: false,
      error: error.message || 'Failed to get IP information'
    };
  }
}

module.exports = {
  getIPInfo,
  getIPInfoWithHostname
};

