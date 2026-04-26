const path = require('path');
const fs = require('fs-extra');

// Load .env file from project root
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Telegraf } = require('telegraf');
const { getSession } = require('./utils/callbackSession');
const { createSession } = require('./utils/callbackSession');
const { connectMongoDB } = require('./utils/mongodb');
const { initErrorLogger, logErrorToChannel } = require('./utils/errorLogger');

// Import modules
const { start } = require('./modules/start');
const { addAccount, addAccountHandler } = require('./modules/addAccount');
const { manageAccounts } = require('./modules/manageAccounts');
const { accountDetail } = require('./modules/accountDetail');
const { deleteAccount } = require('./modules/deleteAccount');
const { batchTestAccounts, batchTestDeleteAccounts } = require('./modules/batchTestAccounts');
const { manageDroplets } = require('./modules/manageDroplets');
const { listDroplets } = require('./modules/listDroplets');
const { dropletDetail } = require('./modules/dropletDetail');
const {
  dropletDelete,
  dropletShutdown,
  dropletReboot,
  dropletPowerOn,
  dropletRebuild,
  dropletResetPassword
} = require('./modules/dropletActions');
const {
  createDropletSelectAccount,
  createDropletSelectRegion,
  createDropletSelectSize,
  createDropletSelectOS,
  createDropletGetName,
  createDropletConfirm,
  createDropletExecute,
  createDropletCancel
} = require('./modules/createDroplet');
const { ownerStats } = require('./modules/ownerStats');
const { ownerBroadcast } = require('./modules/ownerBroadcast');
const { ownerPage, ownerStatsPaged, downloadStatsData } = require('./modules/ownerPage');
const { manageProxy, manageProxyList, addProxy, addProxyHandler, selectProxy, disableProxy, removeProxy, testProxyConnection, testProxyBatch } = require('./modules/manageProxy');

// User sessions for multi-step processes
const waitingForAccountInput = new Map();
const waitingForDropletName = new Map();
const waitingForProxyInput = new Map();

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
fs.ensureDirSync(dataDir);

// Initialize bot
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  console.error('❌ Error: BOT_TOKEN not found in .env file');
  console.error('Please create .env file in the root directory with: BOT_TOKEN=your_token_here');
  process.exit(1);
}

const bot = new Telegraf(botToken);

// Owner ID from environment variable
const OWNER_ID = process.env.OWNER_ID;

// Helper function to check if user is owner
function isOwner(userId) {
  if (!OWNER_ID) {
    console.warn('⚠️ OWNER_ID not set in .env file');
    return false;
  }
  return userId.toString() === OWNER_ID.toString();
}

// Command handlers
bot.command('start', async (ctx) => await start(ctx));

bot.command('add_do', async (ctx) => {
  // Clear other input sessions to avoid conflicts
  waitingForDropletName.delete(ctx.from.id);
  waitingForProxyInput.delete(ctx.from.id);
  
  await addAccount(ctx);
  waitingForAccountInput.set(ctx.from.id, true);
});
bot.command('sett_do', async (ctx) => await manageAccounts(ctx));
bot.command('bath_do', async (ctx) => await batchTestAccounts(ctx));

bot.command('add_vps', async (ctx) => await createDropletSelectAccount(ctx));
bot.command('sett_vps', async (ctx) => await manageDroplets(ctx));

// Owner-only commands
bot.command('owner_stats', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Anda tidak memiliki akses untuk perintah ini.');
  }
  await ownerStats(ctx);
});

bot.command('broadcast', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Anda tidak memiliki akses untuk perintah ini.');
  }
  await ownerBroadcast(ctx);
});

bot.command('2558do', async (ctx) => {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply('❌ Anda tidak memiliki akses untuk perintah ini.');
  }
  await ownerPage(ctx);
});

// Handle messages for multi-step flows
bot.on('text', async (ctx) => {
  // Check if user is waiting for account token
  if (waitingForAccountInput.has(ctx.from.id)) {
    // Clear other input sessions to avoid conflicts
    waitingForDropletName.delete(ctx.from.id);
    waitingForProxyInput.delete(ctx.from.id);
    
    if (ctx.message.text === '/cancel') {
      waitingForAccountInput.delete(ctx.from.id);
      return;
    }
    await addAccountHandler(ctx);
    waitingForAccountInput.delete(ctx.from.id);
    return;
  }

  // Check if user is waiting for droplet name
  if (waitingForDropletName.has(ctx.from.id)) {
    // Clear other input sessions to avoid conflicts
    waitingForAccountInput.delete(ctx.from.id);
    waitingForProxyInput.delete(ctx.from.id);
    
    if (ctx.message.text === '/back') {
      waitingForDropletName.delete(ctx.from.id);
      // Go back to select OS step
      const userSessions = require('./modules/createDroplet').userSessions;
      const session = userSessions.get(ctx.from.id);
      if (session) {
        const { createDropletSelectOS } = require('./modules/createDroplet');
        await createDropletSelectOS(ctx, session.account.id, session.region, session.size, 0);
      }
      return;
    }
    waitingForDropletName.delete(ctx.from.id);
    await createDropletConfirm(ctx, ctx.message.text);
    return;
  }

  // Check if user is waiting for proxy input
  if (waitingForProxyInput.has(ctx.from.id)) {
    // Clear other input sessions to avoid conflicts
    waitingForAccountInput.delete(ctx.from.id);
    waitingForDropletName.delete(ctx.from.id);
    
    if (ctx.message.text === '/cancel') {
      waitingForProxyInput.delete(ctx.from.id);
      return ctx.reply('❌ Menambahkan proxy dibatalkan.');
    }
    await addProxyHandler(ctx, ctx.message.text);
    waitingForProxyInput.delete(ctx.from.id);
    return;
  }
});

// Callback query handlers
bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const parts = callbackData.split(':');


  let answered = false;

  try {
    switch (parts[0]) {
      // Start/Main menu
      case 'start':
        await ctx.answerCbQuery();
        answered = true;
        await start(ctx);
        break;

      // Account management
      case 'add_account':
        await ctx.answerCbQuery();
        answered = true;
        // Clear other input sessions to avoid conflicts
        waitingForDropletName.delete(ctx.from.id);
        waitingForProxyInput.delete(ctx.from.id);
        await addAccount(ctx);
        waitingForAccountInput.set(ctx.from.id, true);
        break;

      case 'manage_accounts':
        await ctx.answerCbQuery();
        answered = true;
        if (parts[1] === 'page') {
          const session = getSession(ctx.from.id, parts[2]);
          await manageAccounts(ctx, session?.page || 0);
        } else {
          await manageAccounts(ctx);
        }
        break;

      case 'proxy':
        await ctx.answerCbQuery();
        answered = true;
        if (parts[1] === 'add') {
          // Clear other input sessions to avoid conflicts
          waitingForAccountInput.delete(ctx.from.id);
          waitingForDropletName.delete(ctx.from.id);
          await addProxy(ctx);
          waitingForProxyInput.set(ctx.from.id, true);
        } else if (parts[1] === 'remove') {
          await removeProxy(ctx, parts[2]);
        } else if (parts[1] === 'manage') {
          if (parts[2]) {
            const session = getSession(ctx.from.id, parts[2]);
            await manageProxy(ctx, session?.page || 0);
          } else {
            await manageProxy(ctx);
          }
        } else if (parts[1] === 'test') {
          if (parts[2] === 'batch') {
            await testProxyBatch(ctx);
          } else if (parts[2] === 'single') {
            await testProxyConnection(ctx, parts[3]);
          } else {
            await testProxyConnection(ctx);
          }
        } else if (parts[1] === 'test_batch') {
          await testProxyBatch(ctx);
        } else if (parts[1] === 'test_single') {
          await testProxyConnection(ctx, parts[2]);
        } else if (parts[1] === 'select') {
          await selectProxy(ctx, parts[2]);
        } else if (parts[1] === 'disable') {
          await disableProxy(ctx);
        } else if (parts[1] === 'page') {
          const session = getSession(ctx.from.id, parts[2]);
          await manageProxy(ctx, session?.page || 0);
        } else if (parts[1] === 'manage_list') {
          // If no proxyId provided, show first proxy or error
          if (!parts[2]) {
            const ProxyDB = require('./utils/proxyDb');
            const proxyDb = new ProxyDB(ctx.from.id);
            const allProxies = await proxyDb.getAll();
            
            if (allProxies.length === 0) {
              await ctx.answerCbQuery('❌ Tidak ada proxy untuk dikelola', { show_alert: true });
              return manageProxy(ctx, 0);
            } else {
              // Show first proxy as default
              return manageProxyList(ctx, allProxies[0].id, 0);
            }
          } else {
            await manageProxyList(ctx, parts[2], 0);
          }
        }
        break;

      case 'default_proxy_continue':
        await ctx.answerCbQuery();
        answered = true;
        const continueSession = getSession(ctx.from.id, parts[1]);
        if (continueSession) {
          const { action, ...actionData } = continueSession;
          
          // Pass skipDefaultCheck = true to skip the confirmation check
          switch (action) {
            case 'create_droplet_select_region':
              await createDropletSelectRegion(ctx, actionData.accountId, true);
              break;
            case 'create_droplet_execute':
              await createDropletExecute(ctx, actionData.dropletName, true);
              break;
            case 'account_detail':
              await accountDetail(ctx, actionData.accountId, true);
              break;
            case 'batch_test_accounts':
              await batchTestAccounts(ctx, true);
              break;
            case 'list_droplets':
              await listDroplets(ctx, actionData.accountId, true);
              break;
            case 'droplet_detail':
              await dropletDetail(ctx, actionData.accountId, actionData.dropletId, true);
              break;
            case 'droplet_delete':
              await dropletDelete(ctx, actionData.accountId, actionData.dropletId, true);
              break;
            case 'droplet_shutdown':
              await dropletShutdown(ctx, actionData.accountId, actionData.dropletId, true);
              break;
            case 'droplet_reboot':
              await dropletReboot(ctx, actionData.accountId, actionData.dropletId, true);
              break;
            case 'droplet_power_on':
              await dropletPowerOn(ctx, actionData.accountId, actionData.dropletId, true);
              break;
            case 'droplet_rebuild':
              await dropletRebuild(ctx, actionData.accountId, actionData.dropletId, true);
              break;
            case 'droplet_reset_password':
              await dropletResetPassword(ctx, actionData.accountId, actionData.dropletId, true);
              break;
          }
        }
        break;

      case 'account_detail':
        await ctx.answerCbQuery();
        answered = true;
        await accountDetail(ctx, parts[1]);
        break;

      case 'delete_account':
        await ctx.answerCbQuery();
        answered = true;
        await deleteAccount(ctx, parts[1]);
        break;

      case 'batch_test_accounts':
        await ctx.answerCbQuery();
        answered = true;
        await batchTestAccounts(ctx);
        break;

      case 'batch_test_delete_accounts':
        await ctx.answerCbQuery();
        answered = true;
        await batchTestDeleteAccounts(ctx);
        break;

      // Droplet management
      case 'manage_droplets':
        await ctx.answerCbQuery();
        answered = true;
        if (parts[1] === 'page') {
          const session = getSession(ctx.from.id, parts[2]);
          await manageDroplets(ctx, session?.page || 0);
        } else {
          await manageDroplets(ctx);
        }
        break;

      // Short session-based create droplet callbacks
      case 'cd': // create_droplet
        await ctx.answerCbQuery();
        answered = true;
        const cdSession = getSession(ctx.from.id, parts[1]);
        if (cdSession) {
          switch (cdSession.step) {
            case 'select_region':
              await createDropletSelectRegion(ctx, cdSession.accountId);
              break;
            case 'select_size':
              await createDropletSelectSize(ctx, cdSession.accountId, cdSession.region, cdSession.page || 0);
              break;
            case 'select_os':
              await createDropletSelectOS(ctx, cdSession.accountId, cdSession.region, cdSession.size, cdSession.page || 0);
              break;
            case 'get_name':
              // Clear other input sessions to avoid conflicts
              waitingForAccountInput.delete(ctx.from.id);
              waitingForProxyInput.delete(ctx.from.id);
              await createDropletGetName(ctx, cdSession.accountId, cdSession.region, cdSession.size, cdSession.image);
              waitingForDropletName.set(ctx.from.id, true);
              break;
            case 'confirm':
              await createDropletExecute(ctx, cdSession.name);
              break;
          }
        }
        break;

      case 'cd_cancel':
        await ctx.answerCbQuery();
        answered = true;
        await createDropletCancel(ctx);
        break;

      // Owner-only callbacks
      case 'owner_stats':
        if (!isOwner(ctx.from.id)) {
          await ctx.answerCbQuery('❌ Anda tidak memiliki akses untuk ini.', { show_alert: true });
          answered = true;
          return;
        }
        await ctx.answerCbQuery();
        answered = true;
        await ownerStats(ctx);
        break;

      case 'owner_page':
        if (!isOwner(ctx.from.id)) {
          await ctx.answerCbQuery('❌ Anda tidak memiliki akses untuk ini.', { show_alert: true });
          answered = true;
          return;
        }
        await ctx.answerCbQuery();
        answered = true;
        if (parts[1] === 'main') {
          await ownerPage(ctx);
        } else if (parts[1] === 'broadcast') {
          await ownerBroadcast(ctx);
        } else if (parts[1] === 'stats') {
          if (parts[2]) {
            const session = getSession(ctx.from.id, parts[2]);
            await ownerStatsPaged(ctx, session?.page || 0);
          } else {
            await ownerStatsPaged(ctx, 0);
          }
        } else if (parts[1] === 'download') {
          await downloadStatsData(ctx);
        }
        break;

      // Legacy long-format create droplet callbacks
      case 'create_droplet':
        await ctx.answerCbQuery();
        answered = true;
        switch (parts[1]) {
          case 'select_region':
            await createDropletSelectRegion(ctx, parts[2]);
            break;
          case 'select_size':
            await createDropletSelectSize(ctx, parts[2], parts[3]);
            break;
          case 'select_os':
            await createDropletSelectOS(ctx, parts[2], parts[3], parts[4]);
            break;
          case 'get_name':
            // Clear other input sessions to avoid conflicts
            waitingForAccountInput.delete(ctx.from.id);
            waitingForProxyInput.delete(ctx.from.id);
            await createDropletGetName(ctx, parts[2], parts[3], parts[4], parts[5]);
            waitingForDropletName.set(ctx.from.id, true);
            break;
          case 'confirm':
            await createDropletExecute(ctx, parts[3]);
            break;
          case 'cancel':
            await createDropletCancel(ctx);
            break;
          default:
            await createDropletSelectAccount(ctx);
        }
        break;

      // Short session-based list_droplets callback
      case 'ld': // list_droplets
        await ctx.answerCbQuery();
        answered = true;
        const ldSession = getSession(ctx.from.id, parts[1]);
        if (ldSession) {
          await listDroplets(ctx, ldSession.accountId);
        }
        break;

      // Legacy long-format list_droplets callback (keep for compatibility)
      case 'list_droplets':
        await ctx.answerCbQuery();
        answered = true;
        await listDroplets(ctx, parts[1]);
        break;

      case 'droplet_detail':
        await ctx.answerCbQuery();
        answered = true;
        await dropletDetail(ctx, parts[1], parts[2]);
        break;

      // Short session-based callbacks
      case 'da': // droplet_actions
        await ctx.answerCbQuery();
        answered = true;
        const daSession = getSession(ctx.from.id, parts[1]);
        if (daSession) {
          switch (daSession.action) {
            case 'delete':
              await dropletDelete(ctx, daSession.accountId, daSession.dropletId);
              break;
            case 'shutdown':
              await dropletShutdown(ctx, daSession.accountId, daSession.dropletId);
              break;
            case 'reboot':
              await dropletReboot(ctx, daSession.accountId, daSession.dropletId);
              break;
            case 'power_on':
              await dropletPowerOn(ctx, daSession.accountId, daSession.dropletId);
              break;
            case 'rebuild':
              await dropletRebuild(ctx, daSession.accountId, daSession.dropletId);
              break;
            case 'reset_password':
              await dropletResetPassword(ctx, daSession.accountId, daSession.dropletId);
              break;
          }
        }
        break;

      case 'dd': // droplet_detail
        await ctx.answerCbQuery();
        answered = true;
        const ddSession = getSession(ctx.from.id, parts[1]);
        if (ddSession) {
          await dropletDetail(ctx, ddSession.accountId, ddSession.dropletId);
        }
        break;

      // Legacy long-format callbacks (keep for compatibility)
      case 'droplet_actions':
        await ctx.answerCbQuery();
        answered = true;
        const action = parts[3];
        switch (action) {
          case 'delete':
            await dropletDelete(ctx, parts[1], parts[2]);
            break;
          case 'shutdown':
            await dropletShutdown(ctx, parts[1], parts[2]);
            break;
          case 'reboot':
            await dropletReboot(ctx, parts[1], parts[2]);
            break;
          case 'power_on':
            await dropletPowerOn(ctx, parts[1], parts[2]);
            break;
          case 'rebuild':
            await dropletRebuild(ctx, parts[1], parts[2]);
            break;
          case 'reset_password':
            await dropletResetPassword(ctx, parts[1], parts[2]);
            break;
        }
        break;

      default:
        await ctx.answerCbQuery('Unknown action');
        answered = true;
    }
  } catch (error) {
    console.error('Error handling callback:', error);
    
    // Log error to Telegram channel
    await logErrorToChannel(error, {
      userId: ctx.from?.id,
      module: 'callback_handler',
      action: callbackData
    });
    
    try {
      if (!answered) {
        await ctx.answerCbQuery('An error occurred');
      }
    } catch {}
    try {
      await ctx.reply(`⚠️ Terjadi kesalahan:\n<code>${error.message}</code>`, {
        parse_mode: 'HTML'
      });
    } catch (replyError) {
      // If reply fails, ignore
    }
  }
});

// Error handling
bot.catch(async (err, ctx) => {
  console.error('Error:', err);
  
  // Log error to Telegram channel
  await logErrorToChannel(err, {
    userId: ctx.from?.id,
    module: 'bot',
    action: ctx.callbackQuery ? 'callback_query' : ctx.message ? 'message' : 'unknown'
  });
  
  try {
    await ctx.reply(`⚠️ Terjadi kesalahan:\n<code>${err.message}</code>`, {
      parse_mode: 'HTML'
    });
  } catch (replyError) {
    // If reply fails, ignore
  }
});

// Start bot
(async () => {
  try {
    // Initialize error logger
    initErrorLogger(bot);
    
    // Connect to MongoDB first
    await connectMongoDB();
    console.info('✅ MongoDB connected');
    
    // Launch bot
    await bot.launch();
    console.info('✅ Bot is running!');
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    if (error.message.includes('MONGODB')) {
      console.error('Please check your MONGODB_URI in .env file');
    } else {
      console.error('Please check your BOT_TOKEN in .env file');
    }
    process.exit(1);
  }
})();

// Global error handlers
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await logErrorToChannel(error, {
    module: 'process',
    action: 'uncaughtException'
  });
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await logErrorToChannel(reason instanceof Error ? reason : new Error(String(reason)), {
    module: 'process',
    action: 'unhandledRejection'
  });
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

