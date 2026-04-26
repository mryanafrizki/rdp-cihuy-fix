const mongoose = require('mongoose');
const { ProfitTele, PenggunaTele, UserStatistics } = require('./models');
const dbAsync = require('./rdp/src/config/database');

/**
 * Update atau create user statistics
 */
async function updateUserStatistics(userId, data = {}) {
  try {
    const updateData = {
      userId: String(userId),
      ...data,
      updatedAt: new Date()
    };
    
    // Remove userId from data to avoid duplication
    delete updateData.userId;
    
    await UserStatistics.findOneAndUpdate(
      { userId: String(userId) },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error('[STATISTICS] Error updating user statistics:', error);
  }
}

/**
 * Update last active (umum)
 */
async function updateLastActiveUmum(userId, firstName = null, userUsername = null) {
  try {
    await updateUserStatistics(userId, {
      userId: String(userId),
      firstName,
      userUsername,
      lastActiveUmum: new Date()
    });
  } catch (error) {
    console.error('[STATISTICS] Error updating last active umum:', error);
  }
}

/**
 * Update last active (rdp)
 */
async function updateLastActiveRdp(userId, firstName = null, userUsername = null) {
  try {
    await updateUserStatistics(userId, {
      userId: String(userId),
      firstName,
      userUsername,
      lastActiveRdp: new Date()
    });
  } catch (error) {
    console.error('[STATISTICS] Error updating last active rdp:', error);
  }
}

/**
 * Get user statistics
 */
async function getUserStatistics(userId) {
  try {
    const stats = await UserStatistics.findOne({ userId: String(userId) });
    if (stats) {
      return stats.toObject ? stats.toObject() : stats;
    }
    return null;
  } catch (error) {
    console.error('[STATISTICS] Error getting user statistics:', error);
    return null;
  }
}

/**
 * Increment transaction count (umum)
 */
async function incrementTransactionUmum(userId, amount = 0) {
  try {
    const stats = await UserStatistics.findOne({ userId: String(userId) });
    if (stats) {
      stats.totalTransactionsUmum = (stats.totalTransactionsUmum || 0) + 1;
      stats.totalRevenueUmum = (stats.totalRevenueUmum || 0) + (amount || 0);
      stats.updatedAt = new Date();
      await stats.save();
    } else {
      // Create new if doesn't exist
      await updateUserStatistics(userId, {
        totalTransactionsUmum: 1,
        totalRevenueUmum: amount || 0
      });
    }
  } catch (error) {
    console.error('[STATISTICS] Error incrementing transaction umum:', error);
  }
}

/**
 * Increment transaction count (rdp)
 */
async function incrementTransactionRdp(userId, amount = 0) {
  try {
    const stats = await UserStatistics.findOne({ userId: String(userId) });
    if (stats) {
      stats.totalTransactionsRdp = (stats.totalTransactionsRdp || 0) + 1;
      stats.totalRevenueRdp = (stats.totalRevenueRdp || 0) + (amount || 0);
      stats.updatedAt = new Date();
      await stats.save();
    } else {
      // Create new if doesn't exist
      await updateUserStatistics(userId, {
        totalTransactionsRdp: 1,
        totalRevenueRdp: amount || 0
      });
    }
  } catch (error) {
    console.error('[STATISTICS] Error incrementing transaction rdp:', error);
  }
}

/**
 * Sync user statistics from existing data
 */
async function syncUserStatistics() {
  try {
    console.info('[STATISTICS] Starting user statistics sync...');
    
    // Sync from PenggunaTele for registered users (umum)
    const users = await PenggunaTele.find({}).lean();
    for (const user of users) {
      if (user.userId) {
        const stats = await UserStatistics.findOne({ userId: String(user.userId) });
        if (!stats) {
          await updateUserStatistics(String(user.userId), {
            firstName: user.firstName,
            userUsername: user.userUsername,
            registeredAt: user.registeredAt || new Date()
          });
        } else {
          // Update user info if missing
          if (!stats.firstName && user.firstName) {
            stats.firstName = user.firstName;
            stats.userUsername = user.userUsername || stats.userUsername;
            await stats.save();
          }
        }
      }
    }
    
    // Sync from ProfitTele (umum transactions) - recalculate all
    const profitTransactions = await ProfitTele.find({}).lean();
    const userTransactionMap = new Map();
    const userRevenueMap = new Map();
    
    for (const transaction of profitTransactions) {
      if (transaction.userId) {
        const userIdStr = String(transaction.userId);
        userTransactionMap.set(userIdStr, (userTransactionMap.get(userIdStr) || 0) + 1);
        userRevenueMap.set(userIdStr, (userRevenueMap.get(userIdStr) || 0) + (transaction.totalAmountPaid || 0));
        
        // Update registeredAt from earliest transaction
        const stats = await UserStatistics.findOne({ userId: userIdStr });
        if (!stats || !stats.registeredAt) {
          await updateUserStatistics(userIdStr, {
            firstName: transaction.userName,
            userUsername: transaction.userUsername,
            registeredAt: transaction.timestamp || new Date()
          });
        }
      }
    }
    
    // Update all transaction counts and revenue
    for (const [userId, count] of userTransactionMap) {
      const stats = await UserStatistics.findOne({ userId });
      if (stats) {
        stats.totalTransactionsUmum = count;
        stats.totalRevenueUmum = userRevenueMap.get(userId) || 0;
        await stats.save();
      } else {
        await updateUserStatistics(userId, {
          totalTransactionsUmum: count,
          totalRevenueUmum: userRevenueMap.get(userId) || 0
        });
      }
    }
    
    // Sync from RDP installations (rdp transactions) - recalculate all
    const installations = await dbAsync.all(
      `SELECT user_id, cost, status, created_at FROM rdp_installations WHERE status = 'completed'`
    );
    const userRdpTransactionMap = new Map();
    const userRdpRevenueMap = new Map();
    
    for (const installation of installations) {
      if (installation.user_id) {
        const userIdStr = String(installation.user_id);
        userRdpTransactionMap.set(userIdStr, (userRdpTransactionMap.get(userIdStr) || 0) + 1);
        userRdpRevenueMap.set(userIdStr, (userRdpRevenueMap.get(userIdStr) || 0) + (installation.cost || 0));
        
        // Update registeredAt if not set
        const stats = await UserStatistics.findOne({ userId: userIdStr });
        if (!stats || !stats.registeredAt) {
          await updateUserStatistics(userIdStr, {
            registeredAt: installation.created_at ? new Date(installation.created_at) : new Date()
          });
        }
      }
    }
    
    // Update all RDP transaction counts and revenue
    for (const [userId, count] of userRdpTransactionMap) {
      const stats = await UserStatistics.findOne({ userId });
      if (stats) {
        stats.totalTransactionsRdp = count;
        stats.totalRevenueRdp = userRdpRevenueMap.get(userId) || 0;
        await stats.save();
      } else {
        await updateUserStatistics(userId, {
          totalTransactionsRdp: count,
          totalRevenueRdp: userRdpRevenueMap.get(userId) || 0
        });
      }
    }
    
    // Sync from RDP users table
    const rdpUsers = await dbAsync.all(`SELECT * FROM users`);
    for (const rdpUser of rdpUsers) {
      if (rdpUser.telegram_id) {
        const userIdStr = String(rdpUser.telegram_id);
        const stats = await UserStatistics.findOne({ userId: userIdStr });
        if (!stats || !stats.registeredAt) {
          await updateUserStatistics(userIdStr, {
            registeredAt: rdpUser.created_at ? new Date(rdpUser.created_at) : new Date()
          });
        }
      }
    }
    
    console.info('[STATISTICS] User statistics sync completed');
  } catch (error) {
    console.error('[STATISTICS] Error syncing user statistics:', error);
  }
}

/**
 * Get global statistics
 */
async function getGlobalStatistics() {
  try {
    // Total user (umum + rdp) - unique users from both systems
    const usersUmum = await PenggunaTele.distinct('userId');
    const usersRdp = await dbAsync.all(`SELECT DISTINCT telegram_id FROM users`);
    const allUserIds = new Set([
      ...usersUmum.map(u => String(u)), 
      ...usersRdp.map(u => String(u.telegram_id || u.user_id)).filter(u => u && u !== 'undefined')
    ]);
    const totalUsers = allUserIds.size;
    
    // Total transaksi berhasil (umum)
    // PENTING: Deposit TIDAK masuk ke revenue - filter deposit dari calculation
    const totalTransactionsUmum = await ProfitTele.countDocuments({
      productName: { $ne: 'DEPOSIT SALDO' } // Exclude deposit
    });
    const revenueUmum = await ProfitTele.aggregate([
      { $match: { productName: { $ne: 'DEPOSIT SALDO' } } }, // Exclude deposit
      { $group: { _id: null, total: { $sum: '$totalAmountPaid' } } }
    ]);
    const totalRevenueUmum = revenueUmum[0]?.total || 0;
    
    // Total transaksi berhasil (rdp)
    const transactionsRdp = await dbAsync.get(
      `SELECT COUNT(*) as count, SUM(cost) as total FROM rdp_installations WHERE status = 'completed'`
    );
    const totalTransactionsRdp = transactionsRdp?.count || 0;
    const totalRevenueRdp = transactionsRdp?.total || 0;
    
    // Total saldo global (umum)
    const saldoUmumResult = await PenggunaTele.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const totalSaldoUmum = saldoUmumResult[0]?.total || 0;
    
    // Total saldo global (rdp)
    const saldoRdpResult = await dbAsync.get(
      `SELECT SUM(balance) as total FROM users`
    );
    const totalSaldoRdp = saldoRdpResult?.total || 0;
    const totalSaldo = totalSaldoUmum + totalSaldoRdp;
    
    // Bot dibuat - ambil dari earliest user registration
    const earliestUser = await PenggunaTele.findOne({}).sort({ registeredAt: 1 });
    const botCreatedAt = earliestUser?.registeredAt || new Date();
    
    return {
      totalUsers,
      totalTransactionsUmum,
      totalTransactionsRdp,
      totalTransactions: totalTransactionsUmum + totalTransactionsRdp,
      totalRevenueUmum,
      totalRevenueRdp,
      totalRevenue: totalRevenueUmum + totalRevenueRdp,
      totalSaldoUmum,
      totalSaldoRdp,
      totalSaldo,
      botCreatedAt
    };
  } catch (error) {
    console.error('[STATISTICS] Error getting global statistics:', error);
    return {
      totalUsers: 0,
      totalTransactionsUmum: 0,
      totalTransactionsRdp: 0,
      totalTransactions: 0,
      totalRevenueUmum: 0,
      totalRevenueRdp: 0,
      totalRevenue: 0,
      totalSaldoUmum: 0,
      totalSaldoRdp: 0,
      totalSaldo: 0,
      botCreatedAt: new Date()
    };
  }
}

/**
 * Get user detail statistics
 */
async function getUserDetailStatistics(userId) {
  try {
    const stats = await UserStatistics.findOne({ userId: String(userId) });
    
    // Get saldo dari database (umum dan rdp)
    const userUmum = await PenggunaTele.findOne({ userId: String(userId) });
    const userRdp = await dbAsync.get(`SELECT * FROM users WHERE telegram_id = ?`, [userId]);
    
    const saldoUmum = userUmum?.balance || 0;
    const saldoRdp = userRdp?.balance || 0;
    const totalSaldo = saldoUmum + saldoRdp;
    
    if (!stats) {
      // Try to get from other sources
      if (!userUmum && !userRdp) {
        return null;
      }
      
      // Create stats from existing data
      const transactionsUmum = await ProfitTele.countDocuments({ userId: String(userId) });
      const revenueUmum = await ProfitTele.aggregate([
        { $match: { userId: String(userId) } },
        { $group: { _id: null, total: { $sum: '$totalAmountPaid' } } }
      ]);
      
      const transactionsRdpResult = await dbAsync.get(
        `SELECT COUNT(*) as count, SUM(cost) as total FROM rdp_installations WHERE user_id = ? AND status = 'completed'`,
        [userId]
      );
      const transactionsRdp = transactionsRdpResult ? [transactionsRdpResult] : [{ count: 0, total: 0 }];
      
      return {
        userId: String(userId),
        firstName: userUmum?.firstName || userRdp?.first_name || 'N/A',
        userUsername: userUmum?.userUsername || userRdp?.username || 'N/A',
        registeredAt: userUmum?.registeredAt || userRdp?.created_at || new Date(),
        lastActiveUmum: null,
        lastActiveRdp: null,
        totalTransactionsUmum: transactionsUmum || 0,
        totalTransactionsRdp: transactionsRdp[0]?.count || 0,
        totalTransactions: transactionsUmum + (transactionsRdp[0]?.count || 0),
        totalRevenueUmum: revenueUmum[0]?.total || 0,
        totalRevenueRdp: transactionsRdp[0]?.total || 0,
        totalRevenue: (revenueUmum[0]?.total || 0) + (transactionsRdp[0]?.total || 0),
        saldoUmum,
        saldoRdp,
        totalSaldo
      };
    }
    
    return {
      userId: stats.userId,
      firstName: stats.firstName || 'N/A',
      userUsername: stats.userUsername || 'N/A',
      registeredAt: stats.registeredAt || new Date(),
      lastActiveUmum: stats.lastActiveUmum,
      lastActiveRdp: stats.lastActiveRdp,
      totalTransactionsUmum: stats.totalTransactionsUmum || 0,
      totalTransactionsRdp: stats.totalTransactionsRdp || 0,
      totalTransactions: (stats.totalTransactionsUmum || 0) + (stats.totalTransactionsRdp || 0),
      totalRevenueUmum: stats.totalRevenueUmum || 0,
      totalRevenueRdp: stats.totalRevenueRdp || 0,
      totalRevenue: (stats.totalRevenueUmum || 0) + (stats.totalRevenueRdp || 0),
      saldoUmum,
      saldoRdp,
      totalSaldo
    };
  } catch (error) {
    console.error('[STATISTICS] Error getting user detail statistics:', error);
    return null;
  }
}

/**
 * Get all users with statistics (paginated)
 * Sort by last active (most recent first)
 * OPTIMIZED: Uses MongoDB aggregation for efficient sorting and pagination (safe for 10k+ users)
 */
async function getAllUsersStatistics(page = 1, limit = 20) {
  try {
    const skip = (page - 1) * limit;
    
    // Get total count first (for pagination info)
    const total = await UserStatistics.countDocuments({});
    
    // Use aggregation pipeline for efficient sorting and pagination at database level
    // This avoids loading all users into memory (safe for 10k+ users)
    const users = await UserStatistics.aggregate([
      {
        // Add computed field for most recent last active
        $addFields: {
          lastActiveComputed: {
            $cond: {
              if: { $and: ['$lastActiveUmum', '$lastActiveRdp'] },
              then: {
                $cond: {
                  if: { $gt: ['$lastActiveUmum', '$lastActiveRdp'] },
                  then: '$lastActiveUmum',
                  else: '$lastActiveRdp'
                }
              },
              else: {
                $ifNull: ['$lastActiveUmum', '$lastActiveRdp']
              }
            }
          }
        }
      },
      // Sort by computed last active (most recent first)
      {
        $sort: {
          lastActiveComputed: -1,
          // Secondary sort by userId for consistency
          userId: 1
        }
      },
      // Pagination at database level
      { $skip: skip },
      { $limit: limit }
    ]);
    
    // Format last active for each user
    const now = new Date();
    users.forEach(user => {
      const lastActiveUmum = user.lastActiveUmum ? new Date(user.lastActiveUmum) : null;
      const lastActiveRdp = user.lastActiveRdp ? new Date(user.lastActiveRdp) : null;
      
      let lastActive = null;
      if (lastActiveUmum && lastActiveRdp) {
        lastActive = lastActiveUmum > lastActiveRdp ? lastActiveUmum : lastActiveRdp;
      } else {
        lastActive = lastActiveUmum || lastActiveRdp;
      }
      
      // Format as "Xd Xh Xm" or "N/A"
      if (lastActive) {
        const diffMs = now - lastActive;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        let formatted = '';
        if (diffDays > 0) {
          formatted += `${diffDays}d `;
        }
        if (diffHours > 0) {
          formatted += `${diffHours}h `;
        }
        if (diffMinutes > 0 || formatted === '') {
          formatted += `${diffMinutes}m`;
        }
        user.formattedLastActive = formatted.trim();
      } else {
        user.formattedLastActive = 'N/A';
      }
      
      // Calculate total transactions
      user.totalTransactions = (user.totalTransactionsUmum || 0) + (user.totalTransactionsRdp || 0);
    });
    
    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('[STATISTICS] Error getting all users statistics:', error);
    return {
      users: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0
    };
  }
}

module.exports = {
  updateUserStatistics,
  updateLastActiveUmum,
  updateLastActiveRdp,
  getUserStatistics,
  incrementTransactionUmum,
  incrementTransactionRdp,
  syncUserStatistics,
  getGlobalStatistics,
  getUserDetailStatistics,
  getAllUsersStatistics
};

