const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'rdpInstallerFeatureConfig.json');

/**
 * Load RDP installer feature config
 */
function loadRdpInstallerFeatureConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      return {
        rdpInstallerEnabled: config.rdpInstallerEnabled !== false // Default true
      };
    }
    // Default: enabled
    return { rdpInstallerEnabled: true };
  } catch (error) {
    console.error('[RDP INSTALLER CONFIG] Error loading config:', error);
    return { rdpInstallerEnabled: true }; // Default enabled
  }
}

/**
 * Save RDP installer feature config
 */
function saveRdpInstallerFeatureConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[RDP INSTALLER CONFIG] Error saving config:', error);
    return false;
  }
}

/**
 * Check if RDP installer feature is enabled
 */
function isRdpInstallerEnabled() {
  const config = loadRdpInstallerFeatureConfig();
  return config.rdpInstallerEnabled;
}

/**
 * Enable RDP installer feature
 */
function enableRdpInstaller() {
  const config = loadRdpInstallerFeatureConfig();
  config.rdpInstallerEnabled = true;
  return saveRdpInstallerFeatureConfig(config);
}

/**
 * Disable RDP installer feature
 */
function disableRdpInstaller() {
  const config = loadRdpInstallerFeatureConfig();
  config.rdpInstallerEnabled = false;
  return saveRdpInstallerFeatureConfig(config);
}

module.exports = {
  loadRdpInstallerFeatureConfig,
  saveRdpInstallerFeatureConfig,
  isRdpInstallerEnabled,
  enableRdpInstaller,
  disableRdpInstaller
};