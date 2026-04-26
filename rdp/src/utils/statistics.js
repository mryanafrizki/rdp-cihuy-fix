const dbAsync = require('../config/database');

/**
 * Get current timestamp in WIB (Waktu Indonesia Barat) timezone
 * @returns {string} ISO timestamp string in WIB
 */
function getWIBTimestamp() {
  const now = new Date();
  // Convert to WIB (UTC+7)
  const wibOffset = 7 * 60; // 7 hours in minutes
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const wibTime = new Date(utc + (wibOffset * 60000));
  
  // Format as ISO string for SQLite (YYYY-MM-DD HH:MM:SS)
  const year = wibTime.getFullYear();
  const month = String(wibTime.getMonth() + 1).padStart(2, '0');
  const day = String(wibTime.getDate()).padStart(2, '0');
  const hours = String(wibTime.getHours()).padStart(2, '0');
  const minutes = String(wibTime.getMinutes()).padStart(2, '0');
  const seconds = String(wibTime.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Update RDP statistics
 */
async function updateStat(statKey, value) {
  try {
    await dbAsync.run(
      'INSERT OR REPLACE INTO rdp_statistics (stat_key, stat_value, updated_at) VALUES (?, ?, ?)',
      [statKey, value.toString(), getWIBTimestamp()]
    );
  } catch (error) {
    console.error(`[RDP STATS] Error updating stat ${statKey}:`, error);
  }
}

/**
 * Get statistic value
 */
async function getStat(statKey, defaultValue = 0) {
  try {
    const row = await dbAsync.get(
      'SELECT stat_value FROM rdp_statistics WHERE stat_key = ?',
      [statKey]
    );
    if (!row) {
      return defaultValue;
    }
    const parsed = parseFloat(row.stat_value);
    // Check if parsed is valid number (not NaN)
    return isNaN(parsed) ? defaultValue : parsed;
  } catch (error) {
    console.error(`[RDP STATS] Error getting stat ${statKey}:`, error);
    return defaultValue;
  }
}

/**
 * Increment statistic value
 */
async function incrementStat(statKey, amount = 1) {
  try {
    const currentValue = await getStat(statKey, 0);
    const newValue = currentValue + amount;
    await updateStat(statKey, newValue);
    return newValue;
  } catch (error) {
    console.error(`[RDP STATS] Error incrementing stat ${statKey}:`, error);
    return 0;
  }
}

/**
 * Generate install ID format: tanggalbulantahun-acak
 * Format: DDMMYYYY-XXXXX (5 karakter random alphanumeric)
 */
function generateInstallId() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  
  // Generate random 5 character alphanumeric string
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 5; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `${day}${month}${year}-${randomStr}`;
}

/**
 * Start RDP installation (generate Install ID at the beginning)
 * @param {number} userId - User ID
 * @param {string} ipAddress - VPS IP address (optional, can be updated later)
 * @param {string} osType - OS type
 * @param {string} installType - 'docker' or 'dedicated'
 * @param {number} cost - Installation cost
 * @returns {string|null} - Install ID or null if failed
 */
async function startInstallation(userId, ipAddress, osType, installType, cost) {
  try {
    // Generate unique install ID
    let installId = generateInstallId();
    let attempts = 0;
    const maxAttempts = 10;
    
    // Ensure install ID is unique (try max 10 times)
    while (attempts < maxAttempts) {
      try {
        // Use WIB timestamp instead of CURRENT_TIMESTAMP
        const wibTimestamp = getWIBTimestamp();
        await dbAsync.run(
          `INSERT INTO rdp_installations (install_id, user_id, ip_address, hostname, os_type, install_type, cost, status, created_at)
           VALUES (?, ?, ?, NULL, ?, ?, ?, 'pending', ?)`,
          [installId, userId, ipAddress || null, osType, installType, cost, wibTimestamp]
        );
        
        console.info(`[RDP STATS] Started installation ID ${installId}: ${installType} (Rp ${cost}) for user ${userId} - Status: pending${ipAddress ? ' - IP: ' + ipAddress : ''}`);
        
        return installId;
      } catch (error) {
        if (error.message && error.message.includes('UNIQUE constraint')) {
          // Install ID already exists, generate new one
          installId = generateInstallId();
          attempts++;
          continue;
        }
        throw error;
      }
    }
    
    console.error('[RDP STATS] Failed to generate unique install ID after', maxAttempts, 'attempts');
    return null;
  } catch (error) {
    console.error('[RDP STATS] Error starting installation:', error);
    return null;
  }
}

/**
 * Update installation IP address
 * @param {string} installId - Install ID
 * @param {string} ipAddress - VPS IP address
 * @returns {boolean} - Success status
 */
async function updateInstallationIP(installId, ipAddress) {
  try {
    await dbAsync.run(
      `UPDATE rdp_installations SET ip_address = ? WHERE install_id = ?`,
      [ipAddress, installId]
    );
    
    console.info(`[RDP STATS] Updated IP address for installation ID ${installId}: ${ipAddress}`);
    
    return true;
  } catch (error) {
    console.error('[RDP STATS] Error updating installation IP:', error);
    return false;
  }
}

/**
 * Complete RDP installation (update status to completed)
 * @param {string} installId - Install ID
 * @param {string} hostname - Hostname (optional)
 * @param {string} osName - OS Name (optional)
 * @param {string} locationInfo - Location info (optional, format: "Country (CC) - Region")
 * @param {string} rdpUsername - RDP Username (optional)
 * @param {string} rdpPassword - RDP Password (optional)
 * @returns {boolean} - Success status
 */
async function completeInstallation(installId, hostname = null, osName = null, locationInfo = null, rdpUsername = null, rdpPassword = null) {
  try {
    // Get installation data first
    const installation = await dbAsync.get(
      `SELECT * FROM rdp_installations WHERE install_id = ?`,
      [installId]
    );
    
    if (!installation) {
      console.error(`[RDP STATS] Installation ${installId} not found`);
      return false;
    }
    
    // Update status to completed (update hostname, os_type, location_info, rdp_username, and rdp_password if provided)
    const updates = [];
    const values = [];
    
    if (hostname !== null && hostname !== undefined && hostname !== '' && hostname !== 'N/A' && !hostname.startsWith('RDP-')) {
      updates.push('hostname = ?');
      values.push(hostname);
    }
    
    if (osName !== null && osName !== undefined && osName !== '') {
      // Store OS name in os_type field
      updates.push('os_type = ?');
      values.push(osName);
    }
    
    if (locationInfo !== null && locationInfo !== undefined && locationInfo !== '' && locationInfo !== 'N/A') {
      updates.push('location_info = ?');
      values.push(locationInfo);
    }
    
    if (rdpUsername !== null && rdpUsername !== undefined && rdpUsername !== '') {
      updates.push('rdp_username = ?');
      values.push(rdpUsername);
    }
    
    if (rdpPassword !== null && rdpPassword !== undefined && rdpPassword !== '') {
      updates.push('rdp_password = ?');
      values.push(rdpPassword);
    }
    
    // Ensure IP address is saved if not already saved
    if (!installation.ip_address || installation.ip_address === 'N/A' || installation.ip_address === null) {
      // Try to get IP from installation data if available
      // IP should already be saved via updateInstallationIP, but double-check
    }
    
    // Use WIB timestamp instead of CURRENT_TIMESTAMP
    const wibTimestamp = getWIBTimestamp();
    
    const updateClause = updates.length > 0 
      ? `, ${updates.join(', ')}` 
      : '';
    
    await dbAsync.run(
      `UPDATE rdp_installations 
       SET status = 'completed', completed_at = ?${updateClause}
       WHERE install_id = ?`,
      [wibTimestamp, ...values, installId]
    );
    
    // Increment total successful installations count
    await incrementStat('total_installations', 1);
    
    // Add to total installation revenue
    await incrementStat('total_installation_revenue', installation.cost || 0);
    
    // Increment user-specific installation count (so it won't be reset when data is deleted)
    const userInstallCountKey = `user_install_count_${installation.user_id}`;
    await incrementStat(userInstallCountKey, 1);
    
    // Increment user-specific installation type counts
    if (installation.install_type === 'docker') {
      const userDockerCountKey = `user_docker_count_${installation.user_id}`;
      await incrementStat(userDockerCountKey, 1);
    } else if (installation.install_type === 'dedicated') {
      const userDedicatedCountKey = `user_dedicated_count_${installation.user_id}`;
      await incrementStat(userDedicatedCountKey, 1);
    }
    
    // Add to user-specific installation revenue (so it won't be reset when data is deleted)
    const userInstallRevenueKey = `user_install_revenue_${installation.user_id}`;
    await incrementStat(userInstallRevenueKey, installation.cost || 0);
    
    // Update user statistics (RDP transaction)
    try {
      const statisticsHandler = require('../../../statisticsHandler');
      await statisticsHandler.incrementTransactionRdp(installation.user_id, installation.cost || 0);
      
      // Get user info for last active update
      const userRdp = await dbAsync.get(`SELECT * FROM users WHERE telegram_id = ?`, [installation.user_id]);
      if (userRdp) {
        await statisticsHandler.updateLastActiveRdp(installation.user_id, userRdp.first_name, userRdp.username);
      }
    } catch (statsErr) {
      console.error('[RDP STATS] Error updating user statistics:', statsErr);
    }
    
    // Send profit notification to CHANNEL_PROFIT
    try {
      const cursorExports = require('../../../cursor');
      const { sendChannelProfitNotification } = cursorExports;
      const bot = cursorExports.bot;
      
      if (sendChannelProfitNotification && bot) {
        const userRdp = await dbAsync.get(`SELECT * FROM users WHERE telegram_id = ?`, [installation.user_id]);
        const mockCtx = { telegram: bot.telegram || bot };
        const profitDataForChannel = {
          userId: installation.user_id,
          userName: userRdp?.first_name || 'N/A',
          userUsername: userRdp?.username || '',
          transactionType: 'rdp',
          installId: installId,
          installType: installation.install_type,
          totalAmountPaid: installation.cost || 0, // Nominal asli sebelum ditambah apapun
          profitAmount: installation.cost || 0,
          paymentMethod: 'Saldo' // RDP installation selalu pakai saldo
        };
        await sendChannelProfitNotification(mockCtx, profitDataForChannel);
        console.info(`[RDP STATS] Profit notification sent for installation ${installId}`);
      }
    } catch (profitErr) {
      console.error('[RDP STATS] Failed to send profit notification:', profitErr.message);
    }
    
    console.info(`[RDP STATS] Completed installation ID ${installId}: ${installation.install_type} (Rp ${installation.cost || 0})`);
    
    return true;
  } catch (error) {
    console.error('[RDP STATS] Error completing installation:', error);
    return false;
  }
}

/**
 * Get latest installation ID by user ID and IP address
 * @param {number} userId - User ID
 * @param {string} ipAddress - IP address (optional)
 * @returns {string|null} - Install ID or null if not found
 */
async function getLatestInstallationId(userId, ipAddress = null) {
  try {
    let query;
    let params;
    
    if (ipAddress) {
      // Get by user ID and IP address (most specific)
      // Cari yang status 'completed' dulu (karena instalasi sudah selesai), jika tidak ada baru cari 'pending'
      query = `SELECT install_id FROM rdp_installations 
               WHERE user_id = ? AND ip_address = ? AND (status = 'completed' OR status = 'pending')
               ORDER BY 
                 CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
                 created_at DESC 
               LIMIT 1`;
      params = [userId, ipAddress];
      console.info(`[RDP STATS] Querying installId for userId=${userId}, ipAddress=${ipAddress}`);
    } else {
      // Get by user ID only (latest installation, prefer completed over pending)
      query = `SELECT install_id FROM rdp_installations 
               WHERE user_id = ? AND (status = 'completed' OR status = 'pending')
               ORDER BY 
                 CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
                 created_at DESC 
               LIMIT 1`;
      params = [userId];
      console.info(`[RDP STATS] Querying installId for userId=${userId} (without IP)`);
    }
    
    const row = await dbAsync.get(query, params);
    const result = row ? row.install_id : null;
    console.info(`[RDP STATS] Query result: ${result || 'NOT FOUND'}`);
    
    // Jika tidak ditemukan, coba query semua untuk debug
    if (!result) {
      const allInstallations = await dbAsync.all(
        `SELECT install_id, user_id, ip_address, status, created_at FROM rdp_installations 
         WHERE user_id = ? 
         ORDER BY created_at DESC LIMIT 5`,
        [userId]
      );
      console.info(`[RDP STATS] Latest 5 installations for userId=${userId}:`, 
        allInstallations.map(i => `${i.install_id} (${i.status}, IP: ${i.ip_address || 'NULL'})`).join(', '));
    }
    
    return result;
  } catch (error) {
    console.error('[RDP STATS] Error getting latest installation ID:', error);
    return null;
  }
}

/**
 * Fail RDP installation (update status to failed)
 * @param {string} installId - Install ID
 * @param {string} errorMessage - Error message (optional)
 * @returns {boolean} - Success status
 */
async function failInstallation(installId, errorMessage = null) {
  try {
    // Use WIB timestamp instead of CURRENT_TIMESTAMP
    const wibTimestamp = getWIBTimestamp();
    await dbAsync.run(
      `UPDATE rdp_installations 
       SET status = 'failed', completed_at = ?
       WHERE install_id = ?`,
      [wibTimestamp, installId]
    );
    
    console.info(`[RDP STATS] Failed installation ID ${installId}${errorMessage ? ': ' + errorMessage : ''}`);
    
    return true;
  } catch (error) {
    console.error('[RDP STATS] Error failing installation:', error);
    return false;
  }
}

/**
 * Record successful RDP installation (legacy function, use startInstallation + completeInstallation instead)
 * @deprecated Use startInstallation + completeInstallation instead
 */
async function recordInstallation(userId, ipAddress, hostname, osType, installType, cost) {
  try {
    // For backward compatibility, start and immediately complete
    const installId = await startInstallation(userId, ipAddress, osType, installType, cost);
    if (installId) {
      await completeInstallation(installId, hostname);
      return installId;
    }
    return null;
  } catch (error) {
    console.error('[RDP STATS] Error recording installation:', error);
    return null;
  }
}

/**
 * Record successful deposit
 */
async function recordDeposit(userId, amount) {
  try {
    // Increment total successful deposits count
    await incrementStat('total_deposits', 1);
    
    // Add to total deposit amount
    await incrementStat('total_deposit_amount', amount);
    
    console.info(`[RDP STATS] Recorded deposit: Rp ${amount} for user ${userId}`);
  } catch (error) {
    console.error('[RDP STATS] Error recording deposit:', error);
  }
}

/**
 * Get all statistics
 */
async function getAllStats() {
  try {
    const stats = await dbAsync.all('SELECT stat_key, stat_value FROM rdp_statistics');
    const result = {};
    stats.forEach(stat => {
      result[stat.stat_key] = parseFloat(stat.stat_value) || 0;
    });
    return result;
  } catch (error) {
    console.error('[RDP STATS] Error getting all stats:', error);
    return {};
  }
}

/**
 * Get formatted statistics for display
 */
async function getFormattedStats() {
  try {
    const stats = await getAllStats();
    const totalInstallations = stats.total_installations || 0;
    const totalInstallationRevenue = stats.total_installation_revenue || 0;
    const totalDeposits = stats.total_deposits || 0;
    const totalDepositAmount = stats.total_deposit_amount || 0;
    
    return {
      totalInstallations,
      totalInstallationRevenue,
      totalDeposits,
      totalDepositAmount,
      formatted: {
        totalInstallations: totalInstallations.toLocaleString('id-ID'),
        totalInstallationRevenue: `Rp ${totalInstallationRevenue.toLocaleString('id-ID')}`,
        totalDeposits: totalDeposits.toLocaleString('id-ID'),
        totalDepositAmount: `Rp ${totalDepositAmount.toLocaleString('id-ID')}`
      }
    };
  } catch (error) {
    console.error('[RDP STATS] Error formatting stats:', error);
    return {
      totalInstallations: 0,
      totalInstallationRevenue: 0,
      totalDeposits: 0,
      totalDepositAmount: 0,
      formatted: {
        totalInstallations: '0',
        totalInstallationRevenue: 'Rp 0',
        totalDeposits: '0',
        totalDepositAmount: 'Rp 0'
      }
    };
  }
}

/**
 * Get user statistics per user
 */
async function getUserStats(userId) {
  try {
    // Get total deposit count and amount for user
    // Note: deposits are tracked in transactions table with type = 'deposit'
    // But we also need to check pending_payments that were successfully completed
    const depositTransactions = await dbAsync.all(
      `SELECT COUNT(*) as count, SUM(amount) as total 
       FROM transactions 
       WHERE user_id = ? AND type = 'deposit'`,
      [userId]
    );
    const depositCount = depositTransactions[0]?.count || 0;
    const totalDepositAmount = depositTransactions[0]?.total || 0;
    
    // Also count successful deposits from transactions (if they're stored there)
    // For now, we use the transactions table which should have all deposits
    
    // Get installation counts from statistics (persistent, won't reset when data is deleted)
    // For backward compatibility, if stats don't exist yet, sync from current database
    const userInstallCountKey = `user_install_count_${userId}`;
    const userDockerCountKey = `user_docker_count_${userId}`;
    const userDedicatedCountKey = `user_dedicated_count_${userId}`;
    const userInstallRevenueKey = `user_install_revenue_${userId}`;
    
    let installCount = await getStat(userInstallCountKey, null);
    let dockerCount = await getStat(userDockerCountKey, null);
    let dedicatedCount = await getStat(userDedicatedCountKey, null);
    let installRevenue = await getStat(userInstallRevenueKey, null);
    
    // If stats don't exist (backward compatibility), sync from database
    if (installCount === null || dockerCount === null || dedicatedCount === null || installRevenue === null) {
      const installations = await dbAsync.all(
        `SELECT COUNT(*) as count, SUM(cost) as total_revenue,
         SUM(CASE WHEN install_type = 'docker' THEN 1 ELSE 0 END) as docker_count,
         SUM(CASE WHEN install_type = 'dedicated' THEN 1 ELSE 0 END) as dedicated_count
         FROM rdp_installations 
         WHERE user_id = ? AND status = 'completed'`,
        [userId]
      );
      
      const dbInstallCount = installations[0]?.count || 0;
      const dbInstallRevenue = installations[0]?.total_revenue || 0;
      const dbDockerCount = installations[0]?.docker_count || 0;
      const dbDedicatedCount = installations[0]?.dedicated_count || 0;
      
      // Sync to statistics if they don't exist
      if (installCount === null) {
        await updateStat(userInstallCountKey, dbInstallCount);
        installCount = dbInstallCount;
      }
      if (dockerCount === null) {
        await updateStat(userDockerCountKey, dbDockerCount);
        dockerCount = dbDockerCount;
      }
      if (dedicatedCount === null) {
        await updateStat(userDedicatedCountKey, dbDedicatedCount);
        dedicatedCount = dbDedicatedCount;
      }
      if (installRevenue === null) {
        await updateStat(userInstallRevenueKey, dbInstallRevenue);
        installRevenue = dbInstallRevenue;
      }
    }
    
    // Convert to numbers (in case they're strings)
    installCount = parseFloat(installCount) || 0;
    dockerCount = parseFloat(dockerCount) || 0;
    dedicatedCount = parseFloat(dedicatedCount) || 0;
    installRevenue = parseFloat(installRevenue) || 0;
    
    // Get current balance
    const user = await dbAsync.get(
      'SELECT balance FROM users WHERE telegram_id = ?',
      [userId]
    );
    const currentBalance = user?.balance || 0;
    
    return {
      userId,
      totalDepositAmount: totalDepositAmount || 0,
      depositCount: depositCount || 0,
      installCount: installCount || 0,
      dockerCount: dockerCount || 0,
      dedicatedCount: dedicatedCount || 0,
      installRevenue: installRevenue || 0,
      currentBalance: currentBalance || 0
    };
  } catch (error) {
    console.error(`[RDP STATS] Error getting user stats for ${userId}:`, error);
    return {
      userId,
      totalDepositAmount: 0,
      depositCount: 0,
      installCount: 0,
      dockerCount: 0,
      dedicatedCount: 0,
      installRevenue: 0,
      currentBalance: 0
    };
  }
}

/**
 * Get all users statistics
 */
async function getAllUsersStats(sortBy = 'totalDepositAmount') {
  try {
    // Get all users with their stats
    const users = await dbAsync.all('SELECT telegram_id FROM users');
    const userStats = [];
    
    for (const user of users) {
      const stats = await getUserStats(user.telegram_id);
      userStats.push(stats);
    }
    
    // Sort by specified field (default: totalDepositAmount)
    const validSortFields = ['totalDepositAmount', 'installCount', 'depositCount', 'installRevenue', 'currentBalance'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'totalDepositAmount';
    
    userStats.sort((a, b) => {
      // Sort descending
      return b[sortField] - a[sortField];
    });
    
    return userStats;
  } catch (error) {
    console.error('[RDP STATS] Error getting all users stats:', error);
    return [];
  }
}

/**
 * Generate TXT file content with user statistics
 */
async function generateStatsTXT(sortBy = 'totalDepositAmount') {
  try {
    const userStats = await getAllUsersStats(sortBy);
    const { getFormattedStats } = require('./statistics');
    const totalStats = await getFormattedStats();
    
    let content = '='.repeat(80) + '\n';
    content += 'RDP STATISTICS REPORT\n';
    content += `Generated: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
    content += `Sorted by: ${sortBy}\n`;
    content += '='.repeat(80) + '\n\n';
    
    content += 'TOTAL STATISTICS (All Users):\n';
    content += '-'.repeat(80) + '\n';
    content += `Total Installations: ${totalStats.formatted.totalInstallations}\n`;
    content += `Total Installation Revenue: ${totalStats.formatted.totalInstallationRevenue}\n`;
    content += `Total Deposits: ${totalStats.formatted.totalDeposits}\n`;
    content += `Total Deposit Amount: ${totalStats.formatted.totalDepositAmount}\n\n`;
    content += '='.repeat(80) + '\n\n';
    
    content += 'PER USER STATISTICS:\n';
    content += '-'.repeat(80) + '\n\n';
    
    if (userStats.length === 0) {
      content += 'No user data found.\n';
    } else {
      for (let i = 0; i < userStats.length; i++) {
        const stats = userStats[i];
        
        // Get user info (username and name) - will be fetched separately in handler
        content += `${i + 1}.) ID TELE: ${stats.userId} - USER NAME: [WILL BE FETCHED] - NAMA: [WILL BE FETCHED]\n`;
        content += `   Total Saldo: Rp ${stats.totalDepositAmount.toLocaleString('id-ID')}\n`;
        content += `   Total Berhasil Install RDP: ${stats.installCount} (Dedicated: ${stats.dedicatedCount} / Docker: ${stats.dockerCount})\n`;
        content += `   Total Deposit Berhasil: ${stats.depositCount}\n`;
        content += `   Total Revenue dari Instalasi RDP: Rp ${stats.installRevenue.toLocaleString('id-ID')}\n`;
        content += `   Saldo Saat Ini: Rp ${stats.currentBalance.toLocaleString('id-ID')}\n\n`;
      }
    }
    
    content += '='.repeat(80) + '\n';
    content += `Total Users: ${userStats.length}\n`;
    content += '='.repeat(80) + '\n';
    
    return content;
  } catch (error) {
    console.error('[RDP STATS] Error generating stats TXT:', error);
    throw error;
  }
}

/**
 * Generate TXT file with user info (username and name) fetched from bot
 */
async function generateStatsTXTWithUserInfo(bot, sortBy = 'totalDepositAmount') {
  try {
    const userStats = await getAllUsersStats(sortBy);
    const { getFormattedStats } = require('./statistics');
    const totalStats = await getFormattedStats();
    
    let content = '='.repeat(80) + '\n';
    content += 'RDP STATISTICS REPORT\n';
    content += `Generated: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
    content += `Sorted by: ${sortBy}\n`;
    content += '='.repeat(80) + '\n\n';
    
    content += 'TOTAL STATISTICS (All Users):\n';
    content += '-'.repeat(80) + '\n';
    content += `Total Installations: ${totalStats.formatted.totalInstallations}\n`;
    content += `Total Installation Revenue: ${totalStats.formatted.totalInstallationRevenue}\n`;
    content += `Total Deposits: ${totalStats.formatted.totalDeposits}\n`;
    content += `Total Deposit Amount: ${totalStats.formatted.totalDepositAmount}\n\n`;
    content += '='.repeat(80) + '\n\n';
    
    content += 'PER USER STATISTICS:\n';
    content += '-'.repeat(80) + '\n\n';
    
    if (userStats.length === 0) {
      content += 'No user data found.\n';
    } else {
      for (let i = 0; i < userStats.length; i++) {
        const stats = userStats[i];
        
        // Get user info from bot
        let username = 'N/A';
        let firstName = 'N/A';
        let lastName = '';
        
        try {
          const telegramBot = bot.telegram || bot;
          const chat = await telegramBot.getChat(stats.userId);
          username = chat.username ? `@${chat.username}` : 'N/A';
          firstName = chat.first_name || 'N/A';
          lastName = chat.last_name ? ` ${chat.last_name}` : '';
        } catch (e) {
          // Silent error if cannot get chat info
        }
        
        // Format: ID TELE - USER NAME - NAMA
        content += `${i + 1}.) ${stats.userId} - ${username} - ${firstName}${lastName}\n`;
        // Format: Total Saldo - Total Berhasil Install RDP (Dedicated: X / Docker: Y) - Total Deposit Berhasil - Total Revenue dari Instalasi RDP - Saldo Saat Ini
        content += `   Total Saldo: Rp ${stats.totalDepositAmount.toLocaleString('id-ID')} - Total Berhasil Install RDP: ${stats.installCount} (Dedicated: ${stats.dedicatedCount} / Docker: ${stats.dockerCount}) - Total Deposit Berhasil: ${stats.depositCount} - Total Revenue dari Instalasi RDP: Rp ${stats.installRevenue.toLocaleString('id-ID')} - Saldo Saat Ini: Rp ${stats.currentBalance.toLocaleString('id-ID')}\n\n`;
      }
    }
    
    content += '='.repeat(80) + '\n';
    content += `Total Users: ${userStats.length}\n`;
    content += '='.repeat(80) + '\n';
    
    return content;
  } catch (error) {
    console.error('[RDP STATS] Error generating stats TXT with user info:', error);
    throw error;
  }
}

module.exports = {
  updateStat,
  getStat,
  incrementStat,
  startInstallation,
  updateInstallationIP,
  completeInstallation,
  failInstallation,
  getLatestInstallationId,
  recordInstallation, // Legacy function
  recordDeposit,
  getAllStats,
  getFormattedStats,
  getUserStats,
  getAllUsersStats,
  generateStatsTXT,
  generateStatsTXTWithUserInfo,
  generateInstallId
};

