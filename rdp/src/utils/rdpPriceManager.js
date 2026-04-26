const fs = require('fs');
const path = require('path');

const PRICE_FILE = path.join(__dirname, '../config/rdpPrice.json');

/**
 * Load RDP price configuration
 */
function loadRdpPrices() {
  try {
    if (fs.existsSync(PRICE_FILE)) {
      const data = fs.readFileSync(PRICE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[RDP PRICE] Error loading price config:', error);
  }
  
  // Default values
  return {
    quotaMode: true,
    dockerRdpPrice: 1000,
    dedicatedRdpPrice: 3000,
    minDepositAmount: 1000,
    maxDepositAmount: 1000000,
    pricePerQuota: 3000
  };
}

/**
 * Save RDP price configuration
 */
function saveRdpPrices(prices) {
  try {
    // Ensure directory exists
    const dir = path.dirname(PRICE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(PRICE_FILE, JSON.stringify(prices, null, 2), 'utf8');
    console.info(`[RDP PRICE] ✅ Saved prices to ${PRICE_FILE}:`, prices);
    return true;
  } catch (error) {
    console.error('[RDP PRICE] ❌ Error saving price config:', error);
    console.error('[RDP PRICE] Error stack:', error.stack);
    return false;
  }
}

/**
 * Get current prices
 */
function getRdpPrices() {
  return loadRdpPrices();
}

/**
 * Update docker RDP price
 */
function setDockerRdpPrice(price) {
  try {
    const prices = loadRdpPrices();
    prices.dockerRdpPrice = Math.max(0, parseInt(price, 10) || 0);
    console.info(`[RDP PRICE] Setting docker RDP price: ${prices.dockerRdpPrice}`);
    return saveRdpPrices(prices);
  } catch (error) {
    console.error('[RDP PRICE] Error setting docker price:', error);
    return false;
  }
}

/**
 * Update dedicated RDP price
 */
function setDedicatedRdpPrice(price) {
  try {
    const prices = loadRdpPrices();
    prices.dedicatedRdpPrice = Math.max(0, parseInt(price, 10) || 0);
    console.info(`[RDP PRICE] Setting dedicated RDP price: ${prices.dedicatedRdpPrice}`);
    return saveRdpPrices(prices);
  } catch (error) {
    console.error('[RDP PRICE] Error setting dedicated price:', error);
    return false;
  }
}

/**
 * Update min deposit amount
 */
function setMinDepositAmount(amount) {
  try {
    const prices = loadRdpPrices();
    prices.minDepositAmount = Math.max(0, parseInt(amount, 10) || 0);
    console.info(`[RDP PRICE] Setting min deposit: ${prices.minDepositAmount}`);
    return saveRdpPrices(prices);
  } catch (error) {
    console.error('[RDP PRICE] Error setting min deposit:', error);
    return false;
  }
}

/**
 * Update max deposit amount
 */
function setMaxDepositAmount(amount) {
  try {
    const prices = loadRdpPrices();
    prices.maxDepositAmount = Math.max(0, parseInt(amount, 10) || 0);
    console.info(`[RDP PRICE] Setting max deposit: ${prices.maxDepositAmount}`);
    return saveRdpPrices(prices);
  } catch (error) {
    console.error('[RDP PRICE] Error setting max deposit:', error);
    return false;
  }
}

/**
 * Update price per quota (harga per 1 kuota)
 */
function setPricePerQuota(price) {
  try {
    const prices = loadRdpPrices();
    prices.pricePerQuota = Math.max(0, parseInt(price, 10) || 0);
    console.info(`[RDP PRICE] Setting price per quota: ${prices.pricePerQuota}`);
    return saveRdpPrices(prices);
  } catch (error) {
    console.error('[RDP PRICE] Error setting price per quota:', error);
    return false;
  }
}

/**
 * Get price per quota
 */
function getPricePerQuota() {
  const prices = loadRdpPrices();
  return prices.pricePerQuota || 3000;
}

/**
 * Enable quota mode
 */
function enableQuotaMode() {
  try {
    const prices = loadRdpPrices();
    prices.quotaMode = true;
    console.info('[RDP PRICE] ✅ Quota mode enabled');
    return saveRdpPrices(prices);
  } catch (error) {
    console.error('[RDP PRICE] Error enabling quota mode:', error);
    return false;
  }
}

/**
 * Disable quota mode
 */
function disableQuotaMode() {
  try {
    const prices = loadRdpPrices();
    prices.quotaMode = false;
    console.info('[RDP PRICE] ✅ Quota mode disabled');
    return saveRdpPrices(prices);
  } catch (error) {
    console.error('[RDP PRICE] Error disabling quota mode:', error);
    return false;
  }
}

/**
 * Get quota mode status
 */
function isQuotaModeEnabled() {
  const prices = loadRdpPrices();
  return prices.quotaMode !== false; // Default true
}

module.exports = {
  loadRdpPrices,
  saveRdpPrices,
  getRdpPrices,
  setDockerRdpPrice,
  setDedicatedRdpPrice,
  setMinDepositAmount,
  setMaxDepositAmount,
  setPricePerQuota,
  getPricePerQuota,
  enableQuotaMode,
  disableQuotaMode,
  isQuotaModeEnabled
};

