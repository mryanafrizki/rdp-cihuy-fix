const db = require('../config/database');
const BalanceManager = require('../handlers/balanceHandler');
const path = require('path');

// Helper function untuk mendapatkan bot instance dari cursor.js
const getTelegramBot = () => {
  try {
    const cursorPath = path.join(__dirname, '../../../cursor');
    const cursorExports = require(cursorPath);
    if (cursorExports.bot) {
      return cursorExports.bot;
    }
  } catch (e) {
    // Silent error
  }
  return null;
};

async function getUser(userId) {
  try {
    let user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [userId]);
    
    if (!user) {
      await db.run(
        'INSERT INTO users (telegram_id, balance) VALUES (?, 0)',
        [userId]
      );
      user = {
        telegram_id: userId,
        balance: 0,
        created_at: new Date().toISOString()
      };
      
      // Update statistik user (registered - RDP)
      try {
        const statisticsHandler = require('../../../statisticsHandler');
        await statisticsHandler.updateUserStatistics(userId.toString(), {
          registeredAt: new Date()
        });
      } catch (statsErr) {
        console.error('[STATISTICS] Error updating user statistics on RDP register:', statsErr);
      }

      // Send new user notification to channel
      try {
        const bot = getTelegramBot();
        if (bot) {
          const { sendNewUserNotification } = require('./adminNotifications');
          // Get user info from bot if possible
          let username = null;
          let firstName = null;
          let lastName = null;
          
          try {
            const telegramBot = bot.telegram || bot;
            const chat = await telegramBot.getChat(userId);
            if (chat.username) username = chat.username;
            if (chat.first_name) firstName = chat.first_name;
            if (chat.last_name) lastName = chat.last_name;
          } catch (e) {
            // Silent error - will use defaults in notification function
          }
          
          await sendNewUserNotification(bot, userId, username, firstName, lastName);
        } else {
          console.warn('[USER MANAGER] Bot instance not available for new user notification');
        }
      } catch (notifErr) {
        console.error('[USER MANAGER] Error sending new user notification:', notifErr);
        // Don't throw - notification failure shouldn't break user creation
      }
    }
    
    // Update last active (RDP) setiap kali user menggunakan bot RDP
    try {
      const statisticsHandler = require('../../../statisticsHandler');
      // Get user info from database if available
      const userInfo = user;
      await statisticsHandler.updateLastActiveRdp(userId.toString(), userInfo.first_name, userInfo.username);
    } catch (statsErr) {
      console.error('[STATISTICS] Error updating last active rdp:', statsErr);
    }
    
    return user;
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

async function getAllUsers() {
  try {
    return await db.all('SELECT * FROM users');
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

function isAdmin(userId) {
  const adminId = process.env.ADMIN_ID || process.env.OWNER_TELEGRAM_ID;
  if (!adminId) return false;
  return userId.toString() === adminId.toString();
}

async function addBalance(userId, amount) {
  try {
    // Ensure user exists
    await getUser(userId);
    
    // Use BalanceManager to handle the balance update
    const newBalance = await BalanceManager.updateBalance(userId, amount);
    
    // Verify balance consistency
    await BalanceManager.verifyBalance(userId);
    
    return newBalance;
  } catch (error) {
    console.error('Error adding balance:', error);
    throw error;
  }
}

async function deductBalance(userId, amount) {
  if (isAdmin(userId)) return true;
  
  try {
    // Verify balance before deduction
    const verifiedBalance = await BalanceManager.verifyBalance(userId);
    
    if (verifiedBalance >= amount) {
      const newBalance = await BalanceManager.updateBalance(userId, -amount);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deducting balance:', error);
    throw error;
  }
}

async function getBalance(userId) {
  if (isAdmin(userId)) return "Unlimited";
  
  try {
    // Get verified balance
    const balance = await BalanceManager.verifyBalance(userId);
    return balance;
  } catch (error) {
    console.error('Error getting balance:', error);
    throw error;
  }
}

module.exports = {
  getUser,
  getAllUsers,
  isAdmin,
  addBalance,
  deductBalance,
  getBalance
};