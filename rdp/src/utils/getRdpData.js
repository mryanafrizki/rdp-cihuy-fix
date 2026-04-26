const dbAsync = require('../config/database');
const { isAdmin } = require('./userManager');
const { RDP_PORT } = require('../config/constants');

/**
 * Generate unique request ID
 */
function generateRequestId() {
  const now = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `REQ-${now}-${randomStr}`;
}

/**
 * Get RDP installation data by install ID
 * @param {string} installId - Installation ID
 * @param {number} userId - User ID requesting the data
 * @param {boolean} skipPermissionCheck - Skip permission check (for admin/owner)
 * @returns {Object|null} - Installation data or null if not found/not allowed
 */
async function getRdpData(installId, userId, skipPermissionCheck = false) {
  try {
    // Get installation data by install_id (format: tanggalbulantahun-acak)
    // Support both install_id (string) and id (integer) for backward compatibility
    let installation = null;
    
    // Try to find by install_id first (format: DDMMYYYY-XXXXX)
    if (typeof installId === 'string' && installId.includes('-')) {
      installation = await dbAsync.get(
        `SELECT * FROM rdp_installations WHERE install_id = ?`,
        [installId]
      );
    }
    
    // If not found by install_id, try by id (integer) for backward compatibility
    if (!installation && !isNaN(parseInt(installId, 10))) {
      installation = await dbAsync.get(
        `SELECT * FROM rdp_installations WHERE id = ?`,
        [parseInt(installId, 10)]
      );
    }

    if (!installation) {
      return null;
    }

    // Always return installation data if found
    // Permission check should be done at handler level
    // This allows tracking request system to work properly
    return installation;
  } catch (error) {
    console.error('[GET RDP DATA] Error getting installation data:', error);
    return null;
  }
}

/**
 * Create a tracking request
 * @param {number} requesterId - User ID requesting
 * @param {string} installId - Install ID to track
 * @param {string} targetOwnerType - 'installer_owner' or 'bot_owner'
 * @returns {Object|null} - Request object or null if failed
 */
async function createTrackingRequest(requesterId, installId, targetOwnerType = 'installer_owner') {
  try {
    // Check if installation exists
    let installation = null;
    if (typeof installId === 'string' && installId.includes('-')) {
      installation = await dbAsync.get(
        `SELECT * FROM rdp_installations WHERE install_id = ?`,
        [installId]
      );
    }
    
    if (!installation) {
      return { success: false, error: 'INSTALL_NOT_FOUND' };
    }
    
    // Check if requester is the owner
    if (installation.user_id === requesterId) {
      return { success: false, error: 'OWN_INSTALLATION' };
    }
    
    // Check if there's already a pending request
    const existingRequest = await dbAsync.get(
      `SELECT * FROM rdp_tracking_requests 
       WHERE requester_id = ? AND install_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [requesterId, installId]
    );
    
    if (existingRequest) {
      const expiresAt = new Date(existingRequest.expires_at);
      const now = new Date();
      if (expiresAt > now) {
        return { success: false, error: 'PENDING_REQUEST_EXISTS', request: existingRequest };
      }
    }
    
    // Generate request ID
    const requestId = generateRequestId();
    
    // Calculate expiry (24 hours from now)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Insert request with target_owner_type
    await dbAsync.run(
      `INSERT INTO rdp_tracking_requests (request_id, requester_id, install_id, status, expires_at, target_owner_type)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [requestId, requesterId, installId, expiresAt.toISOString(), targetOwnerType]
    );
    
    const request = await dbAsync.get(
      `SELECT * FROM rdp_tracking_requests WHERE request_id = ?`,
      [requestId]
    );
    
    return { success: true, request };
  } catch (error) {
    console.error('[TRACKING REQUEST] Error creating request:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

/**
 * Get pending tracking requests for owner to approve
 * @param {number} ownerId - Owner user ID
 * @returns {Array} - Array of pending requests
 */
async function getPendingTrackingRequests(ownerId) {
  try {
    // Get all pending requests for installations owned by this user
    const requests = await dbAsync.all(
      `SELECT tr.*, ri.user_id as installation_owner_id
       FROM rdp_tracking_requests tr
       INNER JOIN rdp_installations ri ON tr.install_id = ri.install_id
       WHERE ri.user_id = ? AND tr.status = 'pending' AND datetime(tr.expires_at) > datetime('now')
       ORDER BY tr.created_at DESC`,
      [ownerId]
    );
    
    return requests || [];
  } catch (error) {
    console.error('[TRACKING REQUEST] Error getting pending requests:', error);
    return [];
  }
}

/**
 * Approve or reject tracking request
 * @param {string} requestId - Request ID
 * @param {number} ownerId - Owner user ID (installation owner, or pass with skipOwnerCheck=true)
 * @param {boolean} approve - true to approve, false to reject
 * @param {boolean} skipOwnerCheck - Skip owner verification (for bot owner/admin)
 * @returns {Object} - Result object
 */
async function handleTrackingRequest(requestId, ownerId, approve, skipOwnerCheck = false) {
  try {
    // Get request
    const request = await dbAsync.get(
      `SELECT tr.*, ri.user_id as installation_owner_id
       FROM rdp_tracking_requests tr
       INNER JOIN rdp_installations ri ON tr.install_id = ri.install_id
       WHERE tr.request_id = ?`,
      [requestId]
    );
    
    if (!request) {
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }
    
    // Verify owner (unless skipOwnerCheck is true for bot owner/admin)
    if (!skipOwnerCheck && request.installation_owner_id !== ownerId) {
      return { success: false, error: 'NOT_OWNER' };
    }
    
    // Check if already handled
    if (request.status !== 'pending') {
      return { success: false, error: 'ALREADY_HANDLED' };
    }
    
    // Update request
    const now = new Date().toISOString();
    if (approve) {
      await dbAsync.run(
        `UPDATE rdp_tracking_requests 
         SET status = 'approved', owner_approved_at = ?
         WHERE request_id = ?`,
        [now, requestId]
      );
    } else {
      // Count total rejections for this user and install_id
      const totalRejections = await dbAsync.get(
        `SELECT COUNT(*) as count FROM rdp_tracking_requests 
         WHERE requester_id = ? AND install_id = ? AND status = 'rejected'`,
        [request.requester_id, request.install_id]
      );
      const rejectionCount = (totalRejections?.count || 0) + 1; // +1 for this rejection
      
      // Update request with rejection count
      await dbAsync.run(
        `UPDATE rdp_tracking_requests 
         SET status = 'rejected', owner_rejected_at = ?, rejection_count = ?
         WHERE request_id = ?`,
        [now, rejectionCount, requestId]
      );
    }
    
    return { success: true, request: { ...request, status: approve ? 'approved' : 'rejected' } };
  } catch (error) {
    console.error('[TRACKING REQUEST] Error handling request:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

/**
 * Get tracking request status for requester
 * @param {number} requesterId - Requester user ID
 * @param {string} installId - Install ID
 * @returns {Object|null} - Request object or null
 */
async function getTrackingRequestStatus(requesterId, installId) {
  try {
    const request = await dbAsync.get(
      `SELECT * FROM rdp_tracking_requests 
       WHERE requester_id = ? AND install_id = ? 
       ORDER BY created_at DESC LIMIT 1`,
      [requesterId, installId]
    );
    
    return request || null;
  } catch (error) {
    console.error('[TRACKING REQUEST] Error getting request status:', error);
    return null;
  }
}

/**
 * Check if user can request tracking (not permanent rejected, not in cooldown)
 * @param {number} requesterId - Requester user ID
 * @param {string} installId - Install ID
 * @returns {Object} - { canRequest: boolean, reason?: string, rejectionCount?: number, cooldownUntil?: Date }
 */
async function canRequestTracking(requesterId, installId) {
  try {
    // Get all rejected requests for this user and install ID
    const rejectedRequests = await dbAsync.all(
      `SELECT * FROM rdp_tracking_requests 
       WHERE requester_id = ? AND install_id = ? AND status = 'rejected'
       ORDER BY owner_rejected_at DESC`,
      [requesterId, installId]
    );
    
    if (rejectedRequests.length === 0) {
      return { canRequest: true };
    }
    
    // Check rejection count
    const totalRejections = rejectedRequests.length;
    if (totalRejections >= 3) {
      return { 
        canRequest: false, 
        reason: 'PERMANENT_REJECTED',
        rejectionCount: totalRejections
      };
    }
    
    // Check cooldown (24 hours from last rejection)
    const lastRejection = rejectedRequests[0];
    if (lastRejection.owner_rejected_at) {
      const lastRejectedAt = new Date(lastRejection.owner_rejected_at);
      const now = new Date();
      const timeSinceRejection = now.getTime() - lastRejectedAt.getTime();
      const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 24 hours
      
      if (timeSinceRejection < COOLDOWN_MS) {
        const cooldownUntil = new Date(lastRejectedAt.getTime() + COOLDOWN_MS);
        return { 
          canRequest: false, 
          reason: 'COOLDOWN',
          rejectionCount: totalRejections,
          cooldownUntil: cooldownUntil
        };
      }
    }
    
    return { 
      canRequest: true, 
      rejectionCount: totalRejections 
    };
  } catch (error) {
    console.error('[TRACKING REQUEST] Error checking can request:', error);
    return { canRequest: true }; // Default to allow on error
  }
}

/**
 * Cleanup expired tracking requests
 * @returns {number} - Number of cleaned up requests
 */
async function cleanupExpiredTrackingRequests() {
  try {
    const result = await dbAsync.run(
      `DELETE FROM rdp_tracking_requests 
       WHERE status = 'pending' AND datetime(expires_at) < datetime('now')`
    );
    
    return result.changes || 0;
  } catch (error) {
    console.error('[TRACKING REQUEST] Error cleaning up expired requests:', error);
    return 0;
  }
}

/**
 * Check rate limit for tracking requests (10 requests per 30 minutes)
 * @param {number} userId - User ID
 * @returns {Object} - { allowed: boolean, remaining: number, resetAt: Date }
 */
async function checkTrackingRateLimit(userId) {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const recentRequests = await dbAsync.all(
      `SELECT COUNT(*) as count FROM rdp_tracking_requests 
       WHERE requester_id = ? AND created_at > ?`,
      [userId, thirtyMinutesAgo]
    );
    
    const count = recentRequests[0]?.count || 0;
    const maxRequests = 10;
    const allowed = count < maxRequests;
    const remaining = Math.max(0, maxRequests - count);
    
    // Get oldest request in the 30-minute window to calculate reset time
    const oldestRequest = await dbAsync.get(
      `SELECT created_at FROM rdp_tracking_requests 
       WHERE requester_id = ? AND created_at > ?
       ORDER BY created_at ASC LIMIT 1`,
      [userId, thirtyMinutesAgo]
    );
    
    let resetAt = null;
    if (oldestRequest) {
      const oldestTime = new Date(oldestRequest.created_at);
      resetAt = new Date(oldestTime.getTime() + 30 * 60 * 1000);
    }
    
    return { allowed, remaining, resetAt, count };
  } catch (error) {
    console.error('[TRACKING REQUEST] Error checking rate limit:', error);
    return { allowed: true, remaining: 10, resetAt: null, count: 0 };
  }
}

/**
 * Format RDP installation data for display
 * Note: Function is now async because it needs to fetch location info from IP
 */
async function formatRdpData(installation) {
  if (!installation) {
    return null;
  }

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    // Format dengan timezone WIB (Waktu Indonesia Barat)
    const formatted = date.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    return `${formatted} WIB`;
  };

  const installTypeText = installation.install_type === 'docker' ? 'Docker RDP' : 
                         installation.install_type === 'dedicated' ? 'Dedicated RDP' : 
                         installation.install_type;

  // Format status dengan emoji
  let statusText = installation.status || 'unknown';
  let statusEmoji = '📊';
  if (statusText === 'pending') {
    statusEmoji = '⏳';
    statusText = '⏳ Sedang Proses Instalasi';
  } else if (statusText === 'completed') {
    statusEmoji = '✅';
    statusText = '✅ Berhasil';
  } else if (statusText === 'failed') {
    statusEmoji = '❌';
    statusText = '❌ Gagal';
  } else {
    statusText = `📊 ${statusText}`;
  }

  // os_type sekarang berisi OS name (seperti "Windows 10 AtlasOS") bukan "Windows" saja
  const osDisplayName = installation.os_type || 'N/A';
  
  // Ambil VPS Name dan location info dari database jika ada
  let vpsNameDisplay = installation.hostname || null;
  let locationDisplay = installation.location_info || 'N/A';
  
  // Jika hostname tidak ada atau 'N/A', ambil dari API (untuk backward compatibility)
  if (installation.ip_address && installation.ip_address !== 'N/A') {
    // Jika location_info tidak ada di database, coba ambil dari API
    if (!locationDisplay || locationDisplay === 'N/A') {
      try {
        // Import di dalam function untuk avoid circular dependency
        const { getIPInfoWithHostname } = require('./ipApiChecker');
        const ipInfo = await getIPInfoWithHostname(installation.ip_address);
        
        if (ipInfo.success) {
          // Ambil location info dari API jika tidak ada di database
          if (ipInfo.country && ipInfo.country !== 'N/A') {
            const countryCode = ipInfo.countryCode && ipInfo.countryCode !== 'N/A' ? `(${ipInfo.countryCode})` : '';
            const regionName = ipInfo.region && ipInfo.region !== 'N/A' ? ` - ${ipInfo.region}` : '';
            locationDisplay = `${ipInfo.country} ${countryCode}${regionName}`.trim();
          }
        }
      } catch (e) {
        // Silent error, use fallback
        console.error('[GET RDP DATA] Error getting location from ip-api.com:', e);
      }
    }
    
    // Jika hostname tidak ada atau invalid, coba ambil dari API (untuk backward compatibility)
    if (!vpsNameDisplay || vpsNameDisplay === 'N/A' || vpsNameDisplay === 'unknown' || vpsNameDisplay.startsWith('RDP-')) {
      try {
        // Import di dalam function untuk avoid circular dependency
        const { getIPInfoWithHostname } = require('./ipApiChecker');
        const ipInfo = await getIPInfoWithHostname(installation.ip_address);
        
        if (ipInfo.success && ipInfo.hostname && ipInfo.hostname !== 'N/A') {
          vpsNameDisplay = ipInfo.hostname;
          console.info(`[GET RDP DATA] Got VPS Name from ip-api.com for ${installation.ip_address}: ${vpsNameDisplay}`);
        } else {
          // Fallback jika API juga tidak punya hostname
          vpsNameDisplay = `RDP-${installation.ip_address.split('.').join('')}`;
        }
      } catch (e) {
        // Silent error, use fallback
        console.error('[GET RDP DATA] Error getting hostname from ip-api.com:', e);
        // Jika error, gunakan hostname dari database atau fallback
        if (!vpsNameDisplay || vpsNameDisplay === 'N/A' || vpsNameDisplay === 'unknown') {
          vpsNameDisplay = installation.ip_address ? `RDP-${installation.ip_address.split('.').join('')}` : 'N/A';
        }
      }
    }
  }
  
  // Final fallback jika masih tidak ada VPS Name
  if (!vpsNameDisplay || vpsNameDisplay === 'N/A' || vpsNameDisplay === 'unknown') {
    vpsNameDisplay = installation.ip_address ? `RDP-${installation.ip_address.split('.').join('')}` : 'N/A';
  }
  
  // Final fallback untuk location jika masih 'N/A'
  if (!locationDisplay || locationDisplay === 'N/A') {
    locationDisplay = 'N/A';
  }
  
  let resultText = `📋 *DATA INSTALASI RDP*\n\n` +
          `🆔 *Install ID:* \`${installation.install_id || installation.id}\`\n` +
          `👤 *User ID:* \`${installation.user_id}\`\n` +
          `📊 *Status:* ${statusText}\n` +
          `🌐 *IP Address:* \`${installation.ip_address || 'N/A'}:${RDP_PORT}\`\n` +
          `🏷️ *VPS Name:* ${vpsNameDisplay}\n` +
          `🌍 *Lokasi:* ${locationDisplay}\n` +
          `💿 *OS:* ${osDisplayName}\n` +
          `📦 *Install Type:* ${installTypeText}\n`;
  
  // Tampilkan username dan password RDP jika ada (hanya untuk status completed)
  if (installation.status === 'completed' && (installation.rdp_username || installation.rdp_password)) {
    resultText += `\n🔐 *RDP Credentials:*\n`;
    resultText += `👤 *Username:* \`${installation.rdp_username || 'N/A'}\`\n`;
    resultText += `🔑 *Password:* \`${installation.rdp_password || 'N/A'}\`\n`;
  }
  
  resultText += `💰 *Cost:* Rp ${(installation.cost || 0).toLocaleString('id-ID')}\n` +
          `📅 *Created At:* ${formatDateTime(installation.created_at)}`;
  
  if (installation.completed_at) {
    resultText += `\n${installation.status === 'completed' ? '✅' : '❌'} *Completed At:* ${formatDateTime(installation.completed_at)}`;
    
    // Calculate installation time from created_at to completed_at
    if (installation.created_at && installation.completed_at) {
      try {
        const createdDate = new Date(installation.created_at);
        const completedDate = new Date(installation.completed_at);
        const diffMs = completedDate.getTime() - createdDate.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMinutes / 60);
        const remainingMinutes = diffMinutes % 60;
        
        let timeText = '';
        if (diffHours > 0) {
          timeText = `${diffHours} jam ${remainingMinutes} menit`;
        } else {
          timeText = `${diffMinutes} menit`;
        }
        
        resultText += `\n⏱️ *Total Waktu Instalasi:* ${timeText}`;
      } catch (e) {
        console.error('[GET RDP DATA] Error calculating installation time:', e);
      }
    }
  }

  // Add button "Download RDP File" if installation is completed
  let reply_markup = undefined;
  if (installation.status === 'completed' && installation.ip_address && installation.rdp_username && installation.rdp_password) {
    const installId = installation.install_id || installation.id;
    reply_markup = {
      inline_keyboard: [
        [{ text: '📥 Download RDP File', callback_data: `download_rdp_file_${installId}` }],
        [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
      ]
    };
  }

  return {
    text: resultText,
    parse_mode: 'Markdown',
    reply_markup: reply_markup
  };
}

/**
 * Resend tracking request notification to owner (with rate limit)
 * @param {string} requestId - Request ID
 * @param {Object} bot - Bot instance
 * @returns {Object} - Result object { success: boolean, error?: string, message?: string }
 */
async function resendTrackingRequestToOwner(requestId, bot) {
  try {
    // Get request with installation info
    const request = await dbAsync.get(
      `SELECT tr.*, ri.user_id as installation_owner_id
       FROM rdp_tracking_requests tr
       INNER JOIN rdp_installations ri ON tr.install_id = ri.install_id
       WHERE tr.request_id = ?`,
      [requestId]
    );
    
    if (!request) {
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }
    
    // Check if request is still pending
    if (request.status !== 'pending') {
      return { success: false, error: 'REQUEST_NOT_PENDING' };
    }
    
    // Check if expired
    const expiresAt = new Date(request.expires_at);
    const now = new Date();
    if (expiresAt <= now) {
      return { success: false, error: 'REQUEST_EXPIRED' };
    }
    
    // Check rate limit (60 minutes = 3600 seconds)
    const RATE_LIMIT_MINUTES = 60;
    const RATE_LIMIT_MS = RATE_LIMIT_MINUTES * 60 * 1000;
    
    if (request.last_resent_at) {
      const lastResentAt = new Date(request.last_resent_at);
      const timeSinceLastResent = now.getTime() - lastResentAt.getTime();
      
      if (timeSinceLastResent < RATE_LIMIT_MS) {
        // Masih dalam rate limit - tolak pengiriman
        const remainingMs = RATE_LIMIT_MS - timeSinceLastResent;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return { 
          success: false, 
          error: 'RATE_LIMIT', 
          message: `⏳ Tunggu ${remainingMinutes} menit lagi sebelum bisa kirim ulang.` 
        };
      }
      // Rate limit sudah habis - boleh kirim ulang
    }
    // Jika belum pernah kirim ulang (last_resent_at null) - boleh kirim ulang
    
    // Get approval mode setting
    const { getTrackingRequestApprovalMode } = require('./trackingRequestSettings');
    const toBotOwner = await getTrackingRequestApprovalMode();
    
    // Get requester and owner info
    let requesterInfo = { userId: request.requester_id, username: 'N/A', firstName: 'N/A', lastName: '' };
    let ownerInfo = { userId: request.installation_owner_id, username: 'N/A', firstName: 'N/A', lastName: '' };
    
    try {
      const requesterChat = await bot.telegram.getChat(request.requester_id);
      requesterInfo = {
        userId: request.requester_id,
        username: requesterChat.username ? `@${requesterChat.username}` : 'N/A',
        firstName: requesterChat.first_name || 'N/A',
        lastName: requesterChat.last_name ? ` ${requesterChat.last_name}` : ''
      };
    } catch (e) {
      console.error('[TRACKING REQUEST RESEND] Error getting requester info:', e);
    }
    
    try {
      const ownerChat = await bot.telegram.getChat(request.installation_owner_id);
      ownerInfo = {
        userId: request.installation_owner_id,
        username: ownerChat.username ? `@${ownerChat.username}` : 'N/A',
        firstName: ownerChat.first_name || 'N/A',
        lastName: ownerChat.last_name ? ` ${ownerChat.last_name}` : ''
      };
    } catch (e) {
      console.error('[TRACKING REQUEST RESEND] Error getting owner info:', e);
    }
    
    // Get installation
    const installation = await dbAsync.get(
      `SELECT * FROM rdp_installations WHERE install_id = ?`,
      [request.install_id]
    );
    
    if (!installation) {
      return { success: false, error: 'INSTALLATION_NOT_FOUND' };
    }
    
    // Send to owner (not to channel)
    const { sendTrackingRequestToOwner } = require('./adminNotifications');
    const result = await sendTrackingRequestToOwner(bot, request, installation, requesterInfo, ownerInfo, toBotOwner);
    
    if (result) {
      // Update last_resent_at
      await dbAsync.run(
        `UPDATE rdp_tracking_requests SET last_resent_at = ? WHERE request_id = ?`,
        [now.toISOString(), requestId]
      );
      
      console.info(`[TRACKING REQUEST RESEND] ✅ Request ${requestId} resent to owner`);
      return { success: true, message: 'Pesan berhasil dikirim ulang ke owner.' };
    } else {
      return { success: false, error: 'SEND_FAILED' };
    }
  } catch (error) {
    console.error('[TRACKING REQUEST RESEND] Error resending request:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

module.exports = {
  getRdpData,
  formatRdpData,
  createTrackingRequest,
  getPendingTrackingRequests,
  handleTrackingRequest,
  getTrackingRequestStatus,
  cleanupExpiredTrackingRequests,
  checkTrackingRateLimit,
  resendTrackingRequestToOwner,
  canRequestTracking
};

