const { Markup } = require('telegraf');
const UsersDB = require('../utils/usersDb');
const AccountsDB = require('../utils/db');
const { editOrReply } = require('../utils/editOrReply');
const { createSession } = require('../utils/callbackSession');
const fs = require('fs');
const path = require('path');

const PER_PAGE = 10;
const MAX_PAGES = 5;

/**
 * Main owner page
 */
async function ownerPage(ctx) {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Anda tidak memiliki akses untuk perintah ini.');
  }

  const messageId = ctx.callbackQuery?.message?.message_id;

  const text = `🔐 <b>Halaman Owner</b>\n\n` +
    `Pilih menu yang ingin Anda akses:`;

  const buttons = [
    [Markup.button.callback('📢 Broadcast', 'owner_page:broadcast')],
    [Markup.button.callback('📊 Statistik Bot', 'owner_page:stats')]
  ];

  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

/**
 * Show stats with pagination
 */
async function ownerStatsPaged(ctx, page = 0) {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Anda tidak memiliki akses untuk perintah ini.');
  }

  const messageId = ctx.callbackQuery?.message?.message_id;

  try {
    const usersDb = new UsersDB();
    const allUsers = await usersDb.getAllUsers();

    // Get all accounts and count per user
    let totalAccounts = 0;
    const userStats = [];

    for (const user of allUsers) {
      const accountsDb = new AccountsDB(user.userId);
      const accounts = await accountsDb.all();
      const accountCount = accounts.length;

      totalAccounts += accountCount;
      userStats.push({
        userId: user.userId,
        username: user.username || 'N/A',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        registeredAt: user.registeredAt,
        lastActive: user.lastActive,
        accountCount: accountCount
      });
    }

    // Sort by account count (descending) - akun DO terbanyak
    userStats.sort((a, b) => b.accountCount - a.accountCount);

    // Calculate pagination
    const totalItems = userStats.length;
    const totalPages = Math.min(Math.ceil(totalItems / PER_PAGE), MAX_PAGES);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * PER_PAGE;
    const endIdx = Math.min(startIdx + PER_PAGE, totalItems);
    const pageStats = userStats.slice(startIdx, endIdx);

    // Build message
    let message = `📊 <b>Statistik Bot</b>\n\n`;
    message += `👥 <b>Total User:</b> ${allUsers.length}\n`;
    message += `🔑 <b>Total Akun DO:</b> ${totalAccounts}\n`;
    message += `📅 <b>Bot dibuat:</b> ${userStats.length > 0 ? formatDate(userStats[0].registeredAt) : 'N/A'}\n\n`;
    message += `<b>📋 Detail per User (Diurutkan dari Akun DO Terbanyak)</b>\n`;
    message += `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n`;
    message += `📄 Halaman: <b>${currentPage + 1}/${totalPages}</b>\n`;
    message += `📊 Menampilkan: <b>${startIdx + 1}-${endIdx}</b> dari <b>${totalItems}</b> user\n\n`;

    pageStats.forEach((user, index) => {
      const globalIndex = startIdx + index;
      const displayName = user.username && user.username !== 'N/A' 
        ? `@${user.username}` 
        : `${user.firstName} ${user.lastName}`.trim() || `User ${user.userId}`;
      
      message += `${globalIndex + 1}. <b>${displayName}</b>\n`;
      message += `   ID: <code>${user.userId}</code>\n`;
      message += `   Akun DO: <b>${user.accountCount}</b>\n`;
      message += `   Terdaftar: ${formatDate(user.registeredAt)}\n`;
      message += `   Aktif terakhir: ${formatDate(user.lastActive)}\n\n`;
    });

    // Build buttons
    const buttons = [];

    // Navigation buttons
    const navButtons = [];
    if (currentPage > 0) {
      const prevSession = createSession(ctx.from.id, { page: currentPage - 1, action: 'owner_stats' });
      navButtons.push(Markup.button.callback('⬅️ Sebelumnya', `owner_page:stats:${prevSession}`));
    }
    if (currentPage < totalPages - 1) {
      const nextSession = createSession(ctx.from.id, { page: currentPage + 1, action: 'owner_stats' });
      navButtons.push(Markup.button.callback('Berikutnya ➡️', `owner_page:stats:${nextSession}`));
    }
    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    // Download button
    buttons.push([Markup.button.callback('📥 Download Data', 'owner_page:download')]);

    // Back button
    buttons.push([Markup.button.callback('🔙 Kembali', 'owner_page:main')]);

    return editOrReply(ctx, messageId, message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('[ownerStatsPaged] Error:', error);
    return editOrReply(ctx, messageId, `⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

/**
 * Download stats data as file
 */
async function downloadStatsData(ctx) {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Anda tidak memiliki akses untuk perintah ini.');
  }

  try {
    const usersDb = new UsersDB();
    const allUsers = await usersDb.getAllUsers();

    // Get all accounts and count per user
    let totalAccounts = 0;
    const userStats = [];

    for (const user of allUsers) {
      const accountsDb = new AccountsDB(user.userId);
      const accounts = await accountsDb.all();
      const accountCount = accounts.length;

      totalAccounts += accountCount;
      userStats.push({
        userId: user.userId,
        username: user.username || 'N/A',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        registeredAt: user.registeredAt ? new Date(user.registeredAt).toISOString() : 'N/A',
        lastActive: user.lastActive ? new Date(user.lastActive).toISOString() : 'N/A',
        accountCount: accountCount
      });
    }

    // Sort by account count (descending)
    userStats.sort((a, b) => b.accountCount - a.accountCount);

    // Create CSV content
    let csvContent = 'No,User ID,Username,First Name,Last Name,Akun DO,Terdaftar,Aktif Terakhir\n';
    userStats.forEach((user, index) => {
      const displayName = user.username !== 'N/A' ? user.username : 
        `${user.firstName} ${user.lastName}`.trim() || `User ${user.userId}`;
      csvContent += `${index + 1},"${user.userId}","${displayName}","${user.firstName}","${user.lastName}",${user.accountCount},"${user.registeredAt}","${user.lastActive}"\n`;
    });

    // Create JSON content
    const jsonContent = JSON.stringify({
      totalUsers: allUsers.length,
      totalAccounts: totalAccounts,
      generatedAt: new Date().toISOString(),
      users: userStats
    }, null, 2);

    // Save files temporarily
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const csvPath = path.join(dataDir, `stats_${Date.now()}.csv`);
    const jsonPath = path.join(dataDir, `stats_${Date.now()}.json`);

    fs.writeFileSync(csvPath, csvContent, 'utf8');
    fs.writeFileSync(jsonPath, jsonContent, 'utf8');

    // Send files
    await ctx.answerCbQuery('📥 Mengirim data...');

    try {
      await ctx.replyWithDocument({
        source: csvPath,
        filename: `bot_stats_${new Date().toISOString().split('T')[0]}.csv`
      }, {
        caption: `📊 <b>Data Statistik Bot (CSV)</b>\n\n` +
          `👥 Total User: ${allUsers.length}\n` +
          `🔑 Total Akun DO: ${totalAccounts}\n` +
          `📅 Generated: ${new Date().toLocaleString('id-ID')}`,
        parse_mode: 'HTML'
      });

      await ctx.replyWithDocument({
        source: jsonPath,
        filename: `bot_stats_${new Date().toISOString().split('T')[0]}.json`
      }, {
        caption: `📊 <b>Data Statistik Bot (JSON)</b>`,
        parse_mode: 'HTML'
      });
    } catch (sendError) {
      console.error('[downloadStatsData] Error sending files:', sendError);
      // Fallback: send text if file send fails
      await ctx.reply(`📊 <b>Data Statistik Bot</b>\n\n` +
        `👥 Total User: ${allUsers.length}\n` +
        `🔑 Total Akun DO: ${totalAccounts}\n\n` +
        `⚠️ Gagal mengirim file. Silakan coba lagi.`,
        { parse_mode: 'HTML' }
      );
    }

    // Clean up files
    setTimeout(() => {
      try {
        if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
        if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }, 60000); // Delete after 1 minute

  } catch (error) {
    console.error('[downloadStatsData] Error:', error);
    await ctx.answerCbQuery('❌ Gagal mengunduh data');
    await ctx.reply(`⚠️ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

/**
 * Helper: Check if user is owner
 */
function isOwner(userId) {
  const OWNER_ID = process.env.OWNER_ID;
  if (!OWNER_ID) {
    return false;
  }
  return userId.toString() === OWNER_ID.toString();
}

/**
 * Helper: Format date
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

module.exports = {
  ownerPage,
  ownerStatsPaged,
  downloadStatsData
};

