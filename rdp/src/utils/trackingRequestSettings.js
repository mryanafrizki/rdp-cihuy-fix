const dbAsync = require('../config/database');

/**
 * Get tracking request approval mode
 * @returns {Promise<boolean>} - true if bot owner mode, false if installer owner mode
 */
async function getTrackingRequestApprovalMode() {
  try {
    const setting = await dbAsync.get(
      `SELECT value FROM rdp_settings WHERE key = 'tracking_request_approval_mode'`
    );
    
    if (!setting) {
      // Default: false (installer owner mode)
      return false;
    }
    
    return setting.value === '1' || setting.value === 'true';
  } catch (error) {
    console.error('[TRACKING REQUEST SETTINGS] Error getting approval mode:', error);
    return false; // Default to installer owner mode
  }
}

/**
 * Set tracking request approval mode
 * @param {boolean} enabled - true for bot owner mode, false for installer owner mode
 * @returns {Promise<boolean>} - true if successful
 */
async function setTrackingRequestApprovalMode(enabled) {
  try {
    await dbAsync.run(
      `INSERT OR REPLACE INTO rdp_settings (key, value, updated_at) 
       VALUES ('tracking_request_approval_mode', ?, CURRENT_TIMESTAMP)`,
      [enabled ? '1' : '0']
    );
    console.info(`[TRACKING REQUEST SETTINGS] Approval mode set to: ${enabled ? 'Bot Owner' : 'Installer Owner'}`);
    return true;
  } catch (error) {
    console.error('[TRACKING REQUEST SETTINGS] Error setting approval mode:', error);
    return false;
  }
}

module.exports = {
  getTrackingRequestApprovalMode,
  setTrackingRequestApprovalMode
};

