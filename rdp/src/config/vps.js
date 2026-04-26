const VPS_CONFIGS = [
    {
        id: 1,
        name: 'VPS 4 Core 8GB',
        specs: {
            cpu: 4,
            ram: 6,
            storage: 140
        }
    },
    {
        id: 2,
        name: 'VPS 2 Core 4GB',
        specs: {
            cpu: 2,
            ram: 2,
            storage: 70
        }
    }
];

// Default installation costs (will be loaded from rdpPrice.json)
const rdpPriceManager = require('../utils/rdpPriceManager');

// Get current prices (lazy load) - using quota system
function getInstallationCost() {
  const prices = rdpPriceManager.getRdpPrices();
  // Docker = 1 kuota (sesuai pricePerQuota)
  return prices.pricePerQuota || 3000;
}

function getDedicatedInstallationCost() {
  const prices = rdpPriceManager.getRdpPrices();
  // Dedicated = 1 kuota (fixed)
  return prices.pricePerQuota || 3000;
}

// For backward compatibility
const INSTALLATION_COST = getInstallationCost();
const DEDICATED_INSTALLATION_COST = getDedicatedInstallationCost();

module.exports = {
  VPS_CONFIGS,
  INSTALLATION_COST,
  DEDICATED_INSTALLATION_COST,
  getInstallationCost,
  getDedicatedInstallationCost
};
