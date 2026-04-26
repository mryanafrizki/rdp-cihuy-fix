// Import database async wrapper
// database.js exports methods directly via spread operator, so we can use them directly
const dbAsync = require('../config/database');

/**
 * Cleanup RDP database:
 * - Delete completed installations after 1 month from created_at (original creation date)
 * - Delete pending installations after 6 hours from created_at
 * - Delete failed installations after 5 minutes from failed_at (when check failed) or created_at (fallback)
 */
async function cleanupRdpDatabase() {
  try {
    const now = Date.now();
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const sixHoursMs = 6 * 60 * 60 * 1000; // 6 hours
    const fiveMinutesMs = 5 * 60 * 1000; // 5 minutes
    
    // Delete completed installations older than 1 month from created_at (not from completed_at)
    // This ensures the original creation date is used for countdown
    const oneMonthAgo = new Date(now - oneMonthMs).toISOString();
    const completedResult = await dbAsync.run(
      `DELETE FROM rdp_installations 
       WHERE status = 'completed' 
       AND datetime(created_at) < datetime(?)`,
      [oneMonthAgo]
    );
    
    if (completedResult.changes > 0) {
      console.info(`[RDP CLEANUP] Deleted ${completedResult.changes} completed installations older than 1 month from created_at`);
    }
    
    // Delete pending installations older than 6 hours from created_at
    const sixHoursAgo = new Date(now - sixHoursMs).toISOString();
    const pendingResult = await dbAsync.run(
      `DELETE FROM rdp_installations 
       WHERE status = 'pending' 
       AND datetime(created_at) < datetime(?)`,
      [sixHoursAgo]
    );
    
    if (pendingResult.changes > 0) {
      console.info(`[RDP CLEANUP] Deleted ${pendingResult.changes} pending installations older than 6 hours`);
    }
    
    // Delete failed installations older than 5 minutes from failed_at (if exists) or created_at (fallback)
    // failed_at is set when batch test fails, so countdown starts from that time
    const fiveMinutesAgo = new Date(now - fiveMinutesMs).toISOString();
    const failedResult = await dbAsync.run(
      `DELETE FROM rdp_installations 
       WHERE status = 'failed' 
       AND (
         (failed_at IS NOT NULL AND datetime(failed_at) < datetime(?))
         OR (failed_at IS NULL AND datetime(created_at) < datetime(?))
       )`,
      [fiveMinutesAgo, fiveMinutesAgo]
    );
    
    if (failedResult.changes > 0) {
      console.info(`[RDP CLEANUP] Deleted ${failedResult.changes} failed installations older than 5 minutes from failed_at/created_at`);
    }
    
    // Cleanup expired tracking requests (24 hours)
    // Moved inline to avoid circular dependency issues
    let expiredRequests = 0;
    try {
      const expiredResult = await dbAsync.run(
        `DELETE FROM rdp_tracking_requests 
         WHERE status = 'pending' AND datetime(expires_at) < datetime('now')`
      );
      expiredRequests = expiredResult.changes || 0;
      if (expiredRequests > 0) {
        console.info(`[RDP CLEANUP] Deleted ${expiredRequests} expired tracking requests`);
      }
    } catch (error) {
      console.error('[RDP CLEANUP] Error cleaning up expired tracking requests:', error);
    }
    
    return {
      completed: completedResult.changes || 0,
      pending: pendingResult.changes || 0,
      failed: failedResult.changes || 0,
      expiredRequests: expiredRequests || 0
    };
  } catch (error) {
    console.error('[RDP CLEANUP] Error cleaning up database:', error);
    return { completed: 0, pending: 0, failed: 0, expiredRequests: 0 };
  }
}

module.exports = {
  cleanupRdpDatabase
};
