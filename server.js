/**
 * Telegram Bot Server - Webhook & Polling Mode
 * 
 * Server ini mendukung 2 mode:
 * 1. WEBHOOK MODE (jika WEBHOOK_MODE=true di .env)
 *    - Menerima webhook dari Telegram
 *    - Dapat digunakan dengan:
 *      - Cloudflare Tunnel (cloudflared) - RECOMMENDED untuk Cloudflare tanpa hosting
 *      - Reverse Proxy (Nginx/Apache)
 *      - Direct HTTPS (dengan Let's Encrypt)
 * 
 * 2. POLLING MODE (jika WEBHOOK_MODE=false atau tidak di-set)
 *    - Bot akan polling update dari Telegram
 *    - Tidak perlu webhook URL atau server HTTP
 * 
 * Konfigurasi di .env:
 * - WEBHOOK_MODE=true/false (enable/disable webhook mode)
 * - WEBHOOK_URL=https://yourdomain.com (hanya untuk webhook mode)
 * - WEBHOOK_SECRET_TOKEN=your_secret_token (hanya untuk webhook mode, optional)
 * 
 * Untuk Cloudflare Tunnel:
 * 1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
 * 2. Jalankan: cloudflared tunnel --url http://localhost:3000
 * 3. Set WEBHOOK_URL di .env ke URL yang diberikan cloudflared
 */

require('dotenv').config();
const express = require('express');

// Set flag untuk skip auto-start di cursor.js SEBELUM require
process.env.SKIP_AUTO_START = 'true';

// Load bot instance dari cursor.js
let bot;
try {
  console.log('🔄 Loading bot from cursor.js...');
  
  // Import bot dari cursor.js
  // Note: cursor.js akan di-load tapi tidak akan auto-start karena SKIP_AUTO_START
  const cursorModule = require('./cursor');
  bot = cursorModule.bot;
  
  if (!bot) {
    console.error('❌ Bot instance tidak ditemukan di cursor.js');
    console.error('⚠️  Pastikan cursor.js mengexport bot instance');
    process.exit(1);
  }
  
  console.log('✅ Bot instance loaded dari cursor.js');
  
  // Verify bot instance
  if (!bot.telegram) {
    console.error('❌ Bot instance tidak memiliki telegram property');
    process.exit(1);
  }
  
  // Test bot instance dengan getMe
  bot.telegram.getMe().then(botInfo => {
    console.log(`✅ Bot verified: @${botInfo.username} (${botInfo.id})`);
    console.log(`   Bot name: ${botInfo.first_name}`);
  }).catch(err => {
    console.error('❌ Error verifying bot:', err.message);
  });
  
} catch (error) {
  console.error('❌ Gagal load bot dari cursor.js:', error.message);
  console.error('Stack:', error.stack?.split('\n').slice(0, 10).join('\n'));
  process.exit(1);
}

// Check webhook mode (enable/disable)
const WEBHOOK_MODE_ENABLED = process.env.WEBHOOK_MODE === 'true' || process.env.WEBHOOK_MODE === '1' || process.env.WEBHOOK_MODE === 'enable';

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3000;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || `/webhook/${process.env.TELEGRAM_TOKEN}`;

// Secret token untuk verify webhook dari Telegram
// Telegram hanya menerima: alphanumeric (a-z, A-Z, 0-9), underscore (_), hyphen (-)
// Generate dengan: openssl rand -hex 32 (hex only contains 0-9, a-f)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_TOKEN;

// Validate secret token format
if (WEBHOOK_SECRET) {
  // Telegram secret token hanya boleh mengandung: a-z, A-Z, 0-9, _, -
  const validTokenPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validTokenPattern.test(WEBHOOK_SECRET)) {
    console.error('❌ [SECURITY] WEBHOOK_SECRET_TOKEN contains invalid characters!');
    console.error('   Telegram only allows: a-z, A-Z, 0-9, underscore (_), hyphen (-)');
    console.error('   Generate new token with: openssl rand -hex 32');
    process.exit(1);
  }
  
  // Telegram secret token must be 1-256 characters
  if (WEBHOOK_SECRET.length < 1 || WEBHOOK_SECRET.length > 256) {
    console.error('❌ [SECURITY] WEBHOOK_SECRET_TOKEN length invalid!');
    console.error('   Telegram requires: 1-256 characters');
    process.exit(1);
  }
}

// Middleware
// IMPORTANT: Increase body size limit for webhook updates
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy (penting untuk Cloudflare/reverse proxy)
app.set('trust proxy', true);

// Add timeout untuk prevent hanging requests
app.use((req, res, next) => {
  // Set timeout to 55 seconds (Telegram allows max 60 seconds)
  req.setTimeout(55000, () => {
    if (!res.headersSent) {
      res.status(200).json({ ok: false, error: 'Request timeout' });
    }
  });
  next();
});

// Security middleware untuk verify Telegram webhook secret token
// Hanya allow request dari Telegram yang memiliki secret token valid
const verifyTelegramWebhook = (req, res, next) => {
  // Skip verification jika WEBHOOK_SECRET_TOKEN tidak di-set (untuk development)
  if (!WEBHOOK_SECRET) {
    console.warn('⚠️  WEBHOOK_SECRET_TOKEN tidak di-set di .env - Webhook tidak protected!');
    return next();
  }
  
  // Check jika request ke webhook endpoint
  if (req.path.includes('/webhook/')) {
    const secretToken = req.get('X-Telegram-Bot-Api-Secret-Token');
    
    if (!secretToken) {
      console.warn('🚫 [SECURITY] Webhook request rejected: Missing X-Telegram-Bot-Api-Secret-Token header');
      console.warn(`   IP: ${req.ip || req.connection.remoteAddress}`);
      console.warn(`   User-Agent: ${req.get('User-Agent') || 'N/A'}`);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Missing or invalid secret token'
      });
    }
    
    if (secretToken !== WEBHOOK_SECRET) {
      console.warn('🚫 [SECURITY] Webhook request rejected: Invalid secret token');
      console.warn(`   IP: ${req.ip || req.connection.remoteAddress}`);
      console.warn(`   User-Agent: ${req.get('User-Agent') || 'N/A'}`);
      console.warn(`   Provided token: ${secretToken.substring(0, 10)}... (truncated)`);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Invalid secret token'
      });
    }
    
    // Valid secret token
    console.log('✅ [SECURITY] Webhook request verified with valid secret token');
  }
  
  next();
};

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  
  // Skip logging untuk health checks
  if (req.path === '/health' || req.path === '/healthz') {
    return next();
  }
  
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip || req.connection.remoteAddress}`);
  
  // Log webhook requests dengan detail
  if (req.path.includes('/webhook/')) {
    console.log(`📥 Incoming webhook request`);
    console.log(`   Path: ${req.path}`);
    console.log(`   Method: ${req.method}`);
    console.log(`   Content-Type: ${req.get('Content-Type') || 'N/A'}`);
    console.log(`   User-Agent: ${req.get('User-Agent') || 'N/A'}`);
    console.log(`   X-Forwarded-For: ${req.get('X-Forwarded-For') || 'N/A'}`);
    if (req.body) {
      console.log(`   Body keys: ${Object.keys(req.body).join(', ')}`);
      console.log(`   Update ID: ${req.body.update_id || 'N/A'}`);
    } else {
      console.log(`   ⚠️  No body received`);
    }
  }
  
  next();
});

// Apply security middleware BEFORE webhook endpoint
app.use(verifyTelegramWebhook);

// Webhook endpoint - menggunakan bot.handleUpdate() langsung
// IMPORTANT: Must return 200 OK within 60 seconds (Telegram requirement)
app.post(WEBHOOK_PATH, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const update = req.body;
    
    if (!update || !update.update_id) {
      console.warn('⚠️  [WEBHOOK] Received invalid or empty update');
      return res.status(200).json({ ok: true, received: false });
    }
    
    console.log(`📥 [WEBHOOK] Received update ${update.update_id}`);
    
    if (update.message) {
      const msg = update.message;
      const user = msg.from;
      const text = msg.text || msg.caption || '[non-text]';
      console.log(`   💬 Message from @${user.username || user.first_name || 'N/A'} (${user.id}): ${text.substring(0, 100)}`);
      
      // Log command jika ada
      if (msg.entities) {
        const commands = msg.entities.filter(e => e.type === 'bot_command');
        if (commands.length > 0) {
          console.log(`   📝 Commands detected: ${commands.map(c => text.substring(c.offset, c.offset + c.length)).join(', ')}`);
        }
      }
    } else if (update.callback_query) {
      const cb = update.callback_query;
      const user = cb.from;
      console.log(`   🔘 Callback from @${user.username || user.first_name || 'N/A'} (${user.id}): ${cb.data?.substring(0, 100) || 'N/A'}`);
    } else {
      console.log(`   📨 Other update type: ${Object.keys(update).filter(k => k !== 'update_id').join(', ')}`);
    }
    
    // Send immediate response to Telegram (important!)
    // Telegram requires response within 60 seconds, but we send it immediately
    // and process update asynchronously
    res.status(200).json({ ok: true, update_id: update.update_id });
    
    // Handle update dengan bot (async, tidak blocking response)
    console.log(`   ⚙️  Processing update...`);
    try {
      await bot.handleUpdate(update);
      const processingTime = Date.now() - startTime;
      console.log(`   ✅ Update processed successfully (${processingTime}ms)`);
    } catch (handleError) {
      const processingTime = Date.now() - startTime;
      console.error(`   ❌ Error processing update (${processingTime}ms):`, handleError.message);
      console.error('   Stack:', handleError.stack?.split('\n').slice(0, 5).join('\n'));
    }
    
  } catch (error) {
    console.error('❌ [WEBHOOK] Error handling webhook update:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 10).join('\n'));
    // Always return 200 to Telegram
    if (!res.headersSent) {
      res.status(200).json({ ok: false, error: error.message });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    webhook_path: WEBHOOK_PATH,
    node_version: process.version
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Telegram Bot Webhook Server',
    status: 'running',
    webhook_path: WEBHOOK_PATH,
    health_check: '/health',
    webhook_url: process.env.WEBHOOK_URL ? `${process.env.WEBHOOK_URL}${WEBHOOK_PATH}` : 'Not set'
  });
});

// Test endpoint untuk verify webhook bisa menerima POST
app.post('/test-webhook', (req, res) => {
  console.log('🧪 [TEST] Test webhook endpoint called');
  console.log('   Body:', JSON.stringify(req.body, null, 2));
  res.json({
    status: 'ok',
    message: 'Webhook endpoint is accessible',
    received: req.body
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Initialize bot (setup handlers, resume payments, etc.)
async function initializeBot() {
  try {
    console.log('🔄 Initializing bot...');
    
    // Import necessary modules
    const cursorModule = require('./cursor');
    const binancePayment = require('./binancePayment');
    const deposit = require('./features/deposit/depositHandler');
    
    // Resume pending payments yang masih aktif
    if (cursorModule.resumePendingPayments) {
      await cursorModule.resumePendingPayments(bot);
    }
    
    // Resume pending deposits
    if (deposit && deposit.resumePendingDeposits) {
      await deposit.resumePendingDeposits(bot);
    }
    
    // Resume RDP pending payments
    try {
      const rdpModule = require('./rdp/src/index');
      if (rdpModule && rdpModule.resumePendingPayments) {
        await rdpModule.resumePendingPayments(bot);
      }
    } catch (e) {
      console.warn('⚠️  RDP module tidak tersedia:', e.message);
    }
    
    // Setup warranty reminders checker
    if (cursorModule.checkWarrantyReminders) {
      setInterval(() => cursorModule.checkWarrantyReminders(bot), 60000);
      console.log('⏰ Sistem pengecekan pengingat garansi aktif.');
    }
    
    // Setup Binance Payment Email Checker
    const BINANCE_CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL_MS || 10000);
    const reminderTimeouts = new Map();
    const reminderMessageIds = new Map();
    const binancePaymentTimeouts = new Map();
    
    setInterval(() => {
      binancePayment.checkBinancePaymentEmails(bot, 30, reminderTimeouts, reminderMessageIds, binancePaymentTimeouts).catch(e => {
        console.error('[BINANCE] Email check error:', e.message);
      });
    }, BINANCE_CHECK_INTERVAL);
    console.log(`💎 Binance payment checker aktif (interval: ${BINANCE_CHECK_INTERVAL}ms)`);
    
    // Run first check immediately
    binancePayment.checkBinancePaymentEmails(bot, 30, reminderTimeouts, reminderMessageIds, binancePaymentTimeouts).catch(e => {
      console.error('[BINANCE] First email check error:', e.message);
    });
    
    // Binance Payment Expire Sweep
    setInterval(() => {
      binancePayment.expireBinancePayments(bot, reminderTimeouts, reminderMessageIds, binancePaymentTimeouts).catch(e => {
        console.error('[BINANCE] Expire sweep error:', e.message);
      });
    }, 60000);
    console.log('🔄 Binance payment expire sweep aktif (backup).');
    
    // RDP Database & File Cleanup
    try {
      const rdpModule = require('./rdp/src/index');
      if (rdpModule) {
        const { cleanupRdpDatabase } = require('./rdp/src/utils/dbCleanup');
        const { cleanupOldRdpFiles } = require('./rdp/src/utils/rdpFileGenerator');
        
        cleanupRdpDatabase().then(result => {
          if (result.completed > 0 || result.pending > 0) {
            console.log(`🧹 [RDP CLEANUP] Initial cleanup: ${result.completed} completed, ${result.pending} pending/failed`);
          }
        }).catch(e => {
          console.error('[RDP CLEANUP] Error on initial cleanup:', e.message);
        });
        
        cleanupOldRdpFiles();
        console.log('🧹 [RDP FILE] Initial file cleanup completed');
      }
    } catch (e) {
      console.warn('[RDP CLEANUP] Error setting up cleanup:', e.message);
    }
    
    console.log('✅ Bot initialized');
  } catch (error) {
    console.error('❌ Error initializing bot:', error);
    // Don't exit, let server continue
  }
}

// Setup webhook setelah server ready
async function setupWebhook() {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (webhookUrl) {
    try {
      // Check jika secret token sudah di-set
      if (!WEBHOOK_SECRET) {
        console.warn('⚠️  WEBHOOK_SECRET_TOKEN tidak di-set di .env');
        console.warn('⚠️  Webhook akan di-set TANPA secret token protection!');
        console.warn('💡 Untuk security, generate secret token:');
        console.warn('   Linux/Mac: openssl rand -hex 32');
        console.warn('   Windows: openssl rand -hex 32 (jika OpenSSL installed)');
        console.warn('   Atau: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      }
      
      // Delete existing webhook first
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('✅ Existing webhook deleted');
      
      // Set new webhook
      const finalWebhookUrl = webhookUrl.endsWith('/') 
        ? `${webhookUrl}webhook/${process.env.TELEGRAM_TOKEN}`
        : `${webhookUrl}/webhook/${process.env.TELEGRAM_TOKEN}`;
      
      const webhookOptions = {
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query', 'inline_query', 'pre_checkout_query', 'shipping_query']
      };
      
      // Add secret token jika sudah di-set
      if (WEBHOOK_SECRET) {
        webhookOptions.secret_token = WEBHOOK_SECRET;
        console.log('🔒 Setting webhook with secret token protection');
      }
      
      await bot.telegram.setWebhook(finalWebhookUrl, webhookOptions);
      
      console.log('✅ Webhook berhasil diatur!');
      console.log(`📡 Webhook URL: ${finalWebhookUrl}`);
      if (WEBHOOK_SECRET) {
        console.log('🔒 Secret token protection: ENABLED');
      } else {
        console.log('⚠️  Secret token protection: DISABLED');
      }
    } catch (error) {
      console.error('❌ Gagal mengatur webhook:', error.message);
      console.error('⚠️  Pastikan WEBHOOK_URL sudah di-set dengan benar di .env');
    }
  } else {
    console.log('⚠️  WEBHOOK_URL tidak di-set, webhook tidak akan diatur');
    console.log('💡 Tambahkan WEBHOOK_URL ke .env untuk mengaktifkan webhook mode');
  }
}

// Start bot berdasarkan mode
let server = null;

if (WEBHOOK_MODE_ENABLED) {
  // ===== WEBHOOK MODE =====
  console.log('='.repeat(50));
  console.log('🌐 WEBHOOK MODE ENABLED');
  console.log('='.repeat(50));
  
  // Start HTTP server untuk webhook
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Webhook Server Started');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 Webhook Path: ${WEBHOOK_PATH}`);
    console.log(`💚 Health Check: http://localhost:${PORT}/health`);
    console.log('='.repeat(50));
    
    // Initialize bot dan setup webhook setelah server ready
    setTimeout(async () => {
      try {
        console.log('🔄 Starting bot initialization...');
        await initializeBot();
        
        if (process.env.WEBHOOK_URL) {
          console.log(`📝 Setting up webhook...`);
          console.log(`   URL: ${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`);
          await setupWebhook();
          
          // Verify webhook setelah setup
          try {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            const webhookInfo = await bot.telegram.getWebhookInfo();
            console.log('📊 Webhook Info:');
            console.log(`   URL: ${webhookInfo.url || 'Not set'}`);
            console.log(`   Has custom certificate: ${webhookInfo.has_custom_certificate || false}`);
            console.log(`   Pending updates: ${webhookInfo.pending_update_count || 0}`);
            if (webhookInfo.last_error_message) {
              console.log(`   ⚠️  Last error: ${webhookInfo.last_error_message}`);
              console.log(`   ⚠️  Last error date: ${webhookInfo.last_error_date ? new Date(webhookInfo.last_error_date * 1000).toISOString() : 'N/A'}`);
            } else {
              console.log(`   ✅ No errors`);
            }
            
            if (webhookInfo.pending_update_count > 0) {
              console.log(`   📬 There are ${webhookInfo.pending_update_count} pending updates`);
            }
          } catch (e) {
            console.warn('⚠️  Could not get webhook info:', e.message);
          }
        } else {
          console.log('⚠️  WEBHOOK_URL tidak di-set di .env');
          console.log('💡 Untuk menggunakan webhook, tambahkan WEBHOOK_URL ke .env');
        }
        
        console.log('✅ Bot setup completed');
        console.log('💡 Bot is ready to receive webhook updates!');
        console.log(`📡 Webhook endpoint: ${WEBHOOK_PATH}`);
        console.log(`🌐 Test URL: ${process.env.WEBHOOK_URL || 'Not set'}${WEBHOOK_PATH}`);
      } catch (error) {
        console.error('❌ Error during bot setup:', error);
        console.error('Stack:', error.stack?.split('\n').slice(0, 10).join('\n'));
      }
    }, 2000); // Wait 2 seconds untuk memastikan server ready
    
    console.log('='.repeat(50));
    console.log('📖 Untuk setup Cloudflare Tunnel, lihat: cloudflare-tunnel-setup.md');
    
    // Security reminder
    if (!WEBHOOK_SECRET) {
      console.log('⚠️  SECURITY WARNING: WEBHOOK_SECRET_TOKEN tidak di-set!');
      console.log('💡 Generate secret token:');
      console.log('   Linux/Mac: openssl rand -hex 32');
      console.log('   Windows: openssl rand -hex 32 (jika OpenSSL installed)');
      console.log('   Node.js: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      console.log('💡 Tambahkan ke .env: WEBHOOK_SECRET_TOKEN=<generated_token>');
      console.log('⚠️  Token harus hanya mengandung: a-z, A-Z, 0-9, underscore (_), hyphen (-)');
    } else {
      console.log('🔒 Webhook secret token protection: ENABLED');
      console.log(`   Token length: ${WEBHOOK_SECRET.length} characters`);
    }
    
    console.log('='.repeat(50));
  });
  
  // Graceful shutdown untuk webhook mode
  const shutdownWebhook = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    if (server) {
      server.close(() => {
        console.log('✅ HTTP server closed');
      });
    }
    
    try {
      if (bot && bot.stop) {
        await bot.stop(signal);
        console.log('✅ Bot stopped');
      }
    } catch (error) {
      console.error('❌ Error stopping bot:', error);
    }
    
    process.exit(0);
  };
  
  process.once('SIGINT', () => shutdownWebhook('SIGINT'));
  process.once('SIGTERM', () => shutdownWebhook('SIGTERM'));
  
} else {
  // ===== POLLING MODE =====
  console.log('='.repeat(50));
  console.log('📡 POLLING MODE ENABLED');
  console.log('='.repeat(50));
  console.log('💡 Webhook mode disabled, using polling mode');
  console.log('💡 To enable webhook mode, set WEBHOOK_MODE=true in .env');
  console.log('='.repeat(50));
  
  // Initialize bot dan start polling
  setTimeout(async () => {
    try {
      console.log('🔄 Starting bot initialization...');
      await initializeBot();
      
      // Delete any existing webhook
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('✅ Existing webhook deleted (switching to polling)');
      } catch (e) {
        console.warn('⚠️  Could not delete webhook:', e.message);
      }
      
      // Start polling
      console.log('🚀 Starting bot with polling...');
      bot.launch();
      console.log('✅ Bot started in polling mode');
      console.log('💡 Bot is ready to receive updates via polling!');
      console.log('='.repeat(50));
      
    } catch (error) {
      console.error('❌ Error during bot setup:', error);
      console.error('Stack:', error.stack?.split('\n').slice(0, 10).join('\n'));
      process.exit(1);
    }
  }, 1000);
  
  // Graceful shutdown untuk polling mode
  const shutdownPolling = async (signal) => {
    console.log(`\n🛑 Received ${signal}, stopping bot...`);
    try {
      if (bot && bot.stop) {
        await bot.stop(signal);
        console.log('✅ Bot stopped');
      }
    } catch (error) {
      console.error('❌ Error stopping bot:', error);
    }
    process.exit(0);
  };
  
  process.once('SIGINT', () => shutdownPolling('SIGINT'));
  process.once('SIGTERM', () => shutdownPolling('SIGTERM'));
}

// Global shutdown function for uncaught errors
const shutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  // Close HTTP server if running
  if (server) {
    try {
      server.close(() => {
        console.log('✅ HTTP server closed');
      });
    } catch (e) {
      console.error('❌ Error closing server:', e);
    }
  }
  
  // Stop bot
  try {
    if (bot && bot.stop) {
      await bot.stop(signal);
      console.log('✅ Bot stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping bot:', error);
  }
  
  process.exit(1);
};

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});


