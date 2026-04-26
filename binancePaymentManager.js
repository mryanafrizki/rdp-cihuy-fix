const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'binancePaymentConfig.json');

/**
 * Load Binance payment config
 */
function loadBinancePaymentConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      return {
        binancePaymentEnabled: config.binancePaymentEnabled !== false // Default true
      };
    }
    // Default: enabled
    return { binancePaymentEnabled: true };
  } catch (error) {
    console.error('[BINANCE CONFIG] Error loading config:', error);
    return { binancePaymentEnabled: true }; // Default enabled
  }
}

/**
 * Save Binance payment config
 */
function saveBinancePaymentConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[BINANCE CONFIG] Error saving config:', error);
    return false;
  }
}

/**
 * Check if Binance payment is enabled
 */
function isBinancePaymentEnabled() {
  const config = loadBinancePaymentConfig();
  return config.binancePaymentEnabled;
}

/**
 * Enable Binance payment
 */
function enableBinancePayment() {
  const config = loadBinancePaymentConfig();
  config.binancePaymentEnabled = true;
  return saveBinancePaymentConfig(config);
}

/**
 * Disable Binance payment
 */
function disableBinancePayment() {
  const config = loadBinancePaymentConfig();
  config.binancePaymentEnabled = false;
  return saveBinancePaymentConfig(config);
}

module.exports = {
  loadBinancePaymentConfig,
  saveBinancePaymentConfig,
  isBinancePaymentEnabled,
  enableBinancePayment,
  disableBinancePayment
};
