/**
 * binancePayment.js
 * Handler untuk Binance Payment Method (untuk order payment, bukan deposit saldo)
 * 
 * Flow:
 * 1. User konfirmasi pesanan -> pilih Binance payment
 * 2. Generate unique amount (harga + kode unik)
 * 3. User transfer via Binance dengan amount tersebut
 * 4. Email diterima dan di-parse
 * 5. Match dengan pending payment
 * 6. Jika match -> complete order langsung (tanpa masuk saldo)
 */

require('dotenv').config();
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const { htmlToText } = require('html-to-text');
const { PendingBinancePayment, Produk, ProfitTele, ProcessedEmail, PendingDepositTele } = require('./models');
const { LimitedOffer, LimitedClaim } = require('./limited.models');
const { paymentLimiter, qrisLimiter, depositLimiter } = require('./limits');

// ===== CONFIG =====
const EMAIL_CONF = {
  imap: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: Number(process.env.EMAIL_PORT || 993),
    tls: true,
    authTimeout: 10000, // Reduced from 30s to 10s
    connTimeout: 5000,  // Reduced from 10s to 5s
    tlsOptions: { rejectUnauthorized: false, servername: process.env.EMAIL_HOST || 'imap.gmail.com' },
  },
};

const SENDER_ALLOW = [
  'no-reply@binance.com',
  'mailer@go.binance.com',
  'noreply@mail.binance.com',
  'binance@binance.com',
  'do-not-reply@ses.binance.com',
];

const TEST_EMAIL = 'mryanafrizki@gmail.com';

const CURRENCY = 'USDT';
const PAYMENT_TTL_MIN = Number(process.env.BINANCE_PAYMENT_TTL_MIN || 15); // 15 menit
const LAST_N_EMAILS = Number(process.env.LAST_N_EMAILS || 30);

// ===== HELPERS =====
function floatEq(a, b) { 
  return Math.abs(Number(a) - Number(b)) < 0.01; // tolerance 0.01
}

function normName(s = '') { 
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); 
}

/**
 * Generate unique code: always 3 random digits (000-999)
 * This is used as both:
 * 1. The unique identifier appended to USDT amount
 * 2. The fee in IDR (0-999 rupiah)
 */
function generateUniqueCode() {
  return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

/**
 * Build unique amount for Binance payment
 * 
 * SYSTEM: Simple 3-digit code (for ORDER payment)
 * - Base amount always converted to 2 decimals
 * - Append 3 random digits (000-999)
 * - Code is also the fee in IDR
 * 
 * Examples:
 * - baseAmount: 1    => 1.00 + 123 => 1.00123 USDT (fee: Rp 123)
 * - baseAmount: 1.3  => 1.30 + 456 => 1.30456 USDT (fee: Rp 456)
 * - baseAmount: 1.34 => 1.34 + 789 => 1.34789 USDT (fee: Rp 789)
 * 
 * Note: For DEPOSIT to balance (not order), use system from b-update-13sep-1.js
 * which includes user ID last digit for verification.
 */
function buildUniqueAmount(baseAmountUSDT, baseAmountIDR, userId) {
  const USDT_RATE = Number(process.env.IDR_TO_USDT_RATE || 0.00006);
  
  // Generate random fee in IDR (500 - 2000 IDR)
  const feeIdr = Math.floor(Math.random() * 1501) + 500; // 500 to 2000 IDR
  
  // Calculate total in IDR first
  const totalIdr = baseAmountIDR + feeIdr; // e.g., 20,000 + 1,234 = 21,234 IDR
  
  // Convert total IDR to USDT
  const uniqueAmount = Number((totalIdr * USDT_RATE).toFixed(5)); // e.g., 21,234 × 0.000065 = 1.38021 USDT
  
  // Unique code is the last 3 digits of feeIdr
  const uniqueCode = String(feeIdr).slice(-3).padStart(3, '0'); // e.g., 1234 → "234"
  
  // Debug log
  console.info(`[CALC] Base IDR: ${baseAmountIDR}, Fee IDR: ${feeIdr}, Total IDR: ${totalIdr}, Rate: ${USDT_RATE}, Total USDT: ${uniqueAmount}`);
  
  return { uniqueAmount, uniqueCode, feeIdr, totalIdr };
}

/**
 * Parse Binance email untuk extract amount dan payer
 * Support both stacked headers and inline format
 */
function parseBinanceEmail(rawInput) {
  if (!rawInput) return null;
  let s = String(rawInput)
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();

  const lines = s.split('\n').map(l => l.trim());
  let from = null, amount = null, currency = null;

  // CASE A: header bertumpuk (Time\nFrom\nAmount format)
  for (let i = 0; i < lines.length - 6; i++) {
    if (/^Time[:：]?$/i.test(lines[i]) &&
        /^From[:：]?$/i.test(lines[i+1]) &&
        /^Amount[:：]?$/i.test(lines[i+2])) {
      const maybeFrom = lines[i+5];
      const maybeAmt  = lines[i+6];
      if (maybeFrom) from = maybeFrom;
      if (maybeAmt) {
        const m = maybeAmt.match(/([0-9][0-9,]*(?:\.\d+)?)\s*([A-Za-z]{2,6})/);
        if (m) { amount = Number(m[1].replace(/,/g,'')); currency = (m[2]||'').toUpperCase(); }
      }
      break;
    }
  }

  // CASE B: sejajar (From: xxx, Amount: xxx)
  if (!from || amount == null) {
    for (const l of lines) {
      if (/^From[:：]/i.test(l) && !from) from = l.replace(/^From[:：]\s*/i,'').trim();
      if (/^Amount[:：]/i.test(l) && amount == null) {
        const m = l.match(/([0-9][0-9,]*(?:\.\d+)?)\s*([A-Za-z]{2,6})/);
        if (m) { amount = Number(m[1].replace(/,/g,'')); currency = (m[2]||'').toUpperCase(); }
      }
    }
  }

  // CASE C: fallback global search
  if (!from) {
    const m = s.match(/(?:From|Sender|Username|Payer)\s*[:：]?\s*([^\n<]{2,80})/i);
    if (m) from = m[1].trim();
  }
  if (amount == null) {
    const m = s.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(USDT|USD|USDC|BUSD|BNB|BTC|ETH)\b/i);
    if (m) { amount = Number(m[1].replace(/,/g,'')); currency = (m[2]||'').toUpperCase(); }
  }

  return { from, amount, currency, raw: s };
}

/**
 * Parse Test Email (format khusus untuk test deposit)
 * Format: Time\nFrom\nAmount\n[values]
 */
function parseTestSimpleEmail(rawInput, debug = false) {
  if (!rawInput) return null;
  const s = String(rawInput).replace(/\r/g, '\n').replace(/\u00A0/g, ' ').trim();
  const lines = s.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (debug) {
    console.info('=== PARSE DEBUG ===');
    console.info('Total lines:', lines.length);
    lines.forEach((l, i) => console.info(`  [${i}] "${l}"`));
  }

  const idxTime   = lines.findIndex(l => /^time\s*:?\s*$/i.test(l));
  const idxFrom   = lines.findIndex(l => /^from\s*:?\s*$/i.test(l));
  const idxAmount = lines.findIndex(l => /^amount\s*:?\s*$/i.test(l));

  if (debug) {
    console.info('Indexes: Time:', idxTime, 'From:', idxFrom, 'Amount:', idxAmount);
  }

  // Find how many consecutive headers we have
  let headerCount = 0;
  let lastHeaderIdx = -1;
  
  if (idxTime >= 0) { headerCount++; lastHeaderIdx = Math.max(lastHeaderIdx, idxTime); }
  if (idxFrom >= 0) { headerCount++; lastHeaderIdx = Math.max(lastHeaderIdx, idxFrom); }
  if (idxAmount >= 0) { headerCount++; lastHeaderIdx = Math.max(lastHeaderIdx, idxAmount); }
  
  if (debug) {
    console.info('Header count:', headerCount, 'Last header at:', lastHeaderIdx);
  }

  // Values start after the last header
  // The order is: Time value, From value, Amount value
  const getValueForHeader = (headerIdx) => {
    if (headerIdx < 0) return null;
    
    // Find position of this header among all headers
    const headers = [
      { idx: idxTime, name: 'Time' },
      { idx: idxFrom, name: 'From' },
      { idx: idxAmount, name: 'Amount' }
    ].filter(h => h.idx >= 0).sort((a, b) => a.idx - b.idx);
    
    const headerPos = headers.findIndex(h => h.idx === headerIdx);
    if (headerPos < 0) return null;
    
    // Value is at: lastHeaderIdx + 1 + headerPos
    const valueIdx = lastHeaderIdx + 1 + headerPos;
    
    if (debug) {
      console.info(`Header at ${headerIdx} is position ${headerPos}, value should be at ${valueIdx}`);
    }
    
    return lines[valueIdx] || null;
  };

  const fromStr = getValueForHeader(idxFrom);
  const amtStr = getValueForHeader(idxAmount);
  
  if (debug) {
    console.info('fromStr:', fromStr);
    console.info('amtStr:', amtStr);
  }
  
  if (!amtStr) return null;

  const mAmt = amtStr.match(/([0-9][0-9,]*(?:\.\d+)?)(?:\s*([A-Za-z]{2,6}))?/);
  if (!mAmt) return null;
  const amount = Number((mAmt[1] || '0').replace(/,/g, ''));
  if (!isFinite(amount)) return null;
  const currency = (mAmt[2] || null) ? mAmt[2].toUpperCase() : null;

  if (debug) {
    console.info('RESULT: from:', fromStr, 'amount:', amount, 'currency:', currency);
    console.info('==================');
  }
  
  return { from: fromStr || null, amount, currency, raw: s };
}

/**
 * Cari pending Binance payment by amount dan optional payer
 */
async function findPendingByAmount(amount, payer) {
  const { PendingDepositTele } = require('./models');
  
  // Get all pending: both orders and deposits
  const allPending = await PendingBinancePayment.find({ status: 'pending' });
  const allDeposits = await PendingDepositTele.find({ 
    paymentMethod: 'binance', 
    status: 'pending' 
  });
  
  const payerNorm = normName(payer);
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  console.info(`[${timeStr} WIB] 🔍 [MATCH] Searching in ${allPending.length} pending order(s) + ${allDeposits.length} pending deposit(s)`);
  console.info(`[${timeStr} WIB] 🔍 [MATCH] Looking for: amount=${amount}, payer="${payerNorm || '(any)'}"`);
  
  // Check deposits first (higher priority)
  for (const deposit of allDeposits) {
    const hoursSinceExpired = (new Date() - deposit.expirationTime) / (1000 * 60 * 60);
    if (hoursSinceExpired > 24) {
      console.info(`[${timeStr} WIB] ⏭️  [MATCH] Skip DEPOSIT ${deposit.depositId}: EXPIRED > 24 hours ago`);
      continue;
    }
    
    console.info(`[${timeStr} WIB] 🔍 [MATCH] Checking DEPOSIT ${deposit.depositId}: amount=${deposit.usdtAmount}`);
    
    // Check amount match
    if (!floatEq(deposit.usdtAmount, amount)) {
      console.info(`[${timeStr} WIB] ⏭️  [MATCH] Skip DEPOSIT ${deposit.depositId}: Amount mismatch (${deposit.usdtAmount} !== ${amount})`);
      continue;
    }
    
    // Deposit matched!
    console.info(`[${timeStr} WIB] 💰 [MATCH] FOUND DEPOSIT: ${deposit.depositId} - ${amount} USDT`);
    return { ...deposit.toObject(), isDeposit: true };
  }
  
  // Check orders
  for (const payment of allPending) {
    // Check expiry - kasih grace period 24 jam untuk payment yang sudah expired
    const hoursSinceExpired = (new Date() - payment.expireAt) / (1000 * 60 * 60);
    if (hoursSinceExpired > 24) {
      console.info(`[${timeStr} WIB] ⏭️  [MATCH] Skip ORDER ${payment.paymentId}: EXPIRED > 24 hours ago`);
      continue;
    } else if (new Date() > payment.expireAt) {
      console.info(`[${timeStr} WIB] ⏰ [MATCH] Checking ORDER ${payment.paymentId} (expired ${hoursSinceExpired.toFixed(1)}h ago, within grace period)`);
    }
    
    console.info(`[${timeStr} WIB] 🔍 [MATCH] Checking ORDER ${payment.paymentId}: amount=${payment.uniqueAmount}, payer="${payment.payerName || '(any)'}"`);
    
    // Check amount match
    if (!floatEq(payment.uniqueAmount, amount)) {
      console.info(`[${timeStr} WIB] ⏭️  [MATCH] Skip ORDER ${payment.paymentId}: Amount mismatch (${payment.uniqueAmount} !== ${amount})`);
      continue;
    }
    
    // Check payer if required
    const pdPayerNorm = normName(payment.payerName);
    if (pdPayerNorm) {
      // Payer required, must match
      if (pdPayerNorm !== payerNorm) {
        console.info(`[${timeStr} WIB] ⏭️  [MATCH] Skip ORDER ${payment.paymentId}: Payer mismatch ("${pdPayerNorm}" !== "${payerNorm}")`);
        continue;
      }
    }
    // If pdPayerNorm is empty, payer is optional - any payer is OK
    
    console.info(`[${timeStr} WIB] ✅ [MATCH] FOUND ORDER: ${payment.paymentId} - ${amount} USDT ${pdPayerNorm ? `(payer: ${payment.payerName})` : '(no payer required)'}`);
    return { ...payment.toObject(), isDeposit: false };
  }
  
  console.info(`[${timeStr} WIB] ❌ [MATCH] No matching payment/deposit found`);
  return null;
}

/**
 * Complete deposit after Binance payment detected
 * Uses depositHandler.processDepositSuccess for consistency
 */
async function completeDeposit(depositData, bot) {
  const depositHandler = require('./features/deposit/depositHandler');
  
  try {
    const userId = depositData.userId.toString();
    const depositId = depositData.depositId;
    
    console.info(`[BINANCE-DEPOSIT] ✅ Completing deposit: ${depositId} for user ${userId}`);
    
    // Find the actual deposit document
    const deposit = await PendingDepositTele.findById(depositData._id);
    if (!deposit) {
      console.error(`[BINANCE-DEPOSIT] Deposit not found: ${depositId}`);
      return;
    }
    
    // Check if deposit is still pending (avoid processing completed deposits)
    if (deposit.status !== 'pending') {
      console.info(`[BINANCE-DEPOSIT] Deposit ${depositId} is already processed (status: ${deposit.status})`);
      return;
    }
    
    // Clear watchers
    const { depositWatchers } = depositHandler;
    const watchers = depositWatchers.get(userId);
    if (watchers) {
      // Clear all watchers (interval, expiry, reminder)
      if (watchers.intervalId) {
        clearInterval(watchers.intervalId);
      }
      if (watchers.expiryTimeout) {
        clearTimeout(watchers.expiryTimeout);
      }
      if (watchers.reminderTimeout) {
        clearTimeout(watchers.reminderTimeout);
      }
      depositWatchers.delete(userId);
      console.info(`[BINANCE-DEPOSIT] ✅ Cleared all watchers for user ${userId}`);
    }
    
    // Reset deposit limiter on successful payment
    if (typeof depositLimiter.reset === 'function') {
      depositLimiter.reset(userId);
    }
    
    // Delete pending deposit from database (pattern from QRIS watcher)
    await PendingDepositTele.findByIdAndDelete(deposit._id).catch(() => {});
    console.info(`[BINANCE-DEPOSIT] ✅ Removed pending deposit from database: ${depositId}`);
    
    // Delete instruction message if exists
    try {
      if (deposit.messageId) {
        // bot is already bot.telegram from completeOrder
        const telegram = bot.telegram || bot;
        await telegram.deleteMessage(userId, deposit.messageId);
      }
    } catch (e) {
      // Ignore deletion errors
    }
    
    // Use centralized success handler from depositHandler
    // bot is already bot.telegram from completeOrder, so use bot.telegram if available, otherwise bot
    const telegram = bot.telegram || bot;
    const mockCtx = { telegram, chat: { id: userId } };
    await depositHandler.processDepositSuccess(mockCtx, deposit);
    
    console.info(`[BINANCE-DEPOSIT] ✅ Deposit completed successfully: ${depositId}`);
    
  } catch (error) {
    console.error('[BINANCE-DEPOSIT] Error completing deposit:', error);
  }
}

/**
 * Complete order setelah payment match
 */
async function completeOrder(payment, bot, emailInfo, reminderTimeouts = null, reminderMessageIds = null, binancePaymentTimeouts = null) {
  try {
    // Check if this is a deposit
    if (payment.isDeposit) {
      return await completeDeposit(payment, bot);
    }
    
    console.info(`[BINANCE] Completing order for payment ${payment.paymentId}`);
    
    // Find the actual payment document from database (payment is plain object from findPendingByAmount)
    const paymentDoc = await PendingBinancePayment.findById(payment._id);
    if (!paymentDoc) {
      console.error(`[BINANCE] Payment document not found: ${payment.paymentId}`);
      return;
    }
    
    // Check if payment is still pending (avoid processing completed payments)
    if (paymentDoc.status !== 'pending') {
      console.info(`[BINANCE] Payment ${payment.paymentId} is already processed (status: ${paymentDoc.status})`);
      return;
    }
    
    // Mark payment as completed
    paymentDoc.status = 'completed';
    paymentDoc.completedAt = new Date();
    await paymentDoc.save();
    
    // ✅ Clear reminder timeout if exists
    const userId = paymentDoc.userId;
    if (reminderTimeouts && reminderTimeouts.has && reminderTimeouts.has(userId)) {
      const timeoutId = reminderTimeouts.get(userId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        reminderTimeouts.delete(userId);
        console.info(`[BINANCE] Reminder timeout cleared for user ${userId} (payment completed)`);
      }
    }

    // ✅ Delete reminder message if exists
    if (reminderMessageIds && reminderMessageIds.has && reminderMessageIds.has(userId)) {
      const msgId = reminderMessageIds.get(userId);
      if (msgId) {
        try {
          await bot.telegram.deleteMessage(userId, msgId);
          console.info(`[BINANCE] Reminder message deleted for user ${userId} (payment completed)`);
        } catch (e) {
          // Ignore deletion errors
        }
        reminderMessageIds.delete(userId);
      }
    }

    // ✅ Clear payment expiry timeout if exists
    if (binancePaymentTimeouts && binancePaymentTimeouts.has && binancePaymentTimeouts.has(userId)) {
      const timeoutId = binancePaymentTimeouts.get(userId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        binancePaymentTimeouts.delete(userId);
        console.info(`[BINANCE] Payment expiry timeout cleared for user ${userId} (payment completed)`);
      }
    }
    
    // Handle test deposit (no credit, just notify)
    if (paymentDoc.orderType === 'test_deposit') {
      
      if (paymentDoc.qrMessageId) {
        try {
          await bot.telegram.editMessageText(
            userId,
            paymentDoc.qrMessageId,
            undefined,
            `🧪 <b>TEST DEPOSIT - Match Berhasil!</b>\n\n` +
            `✅ Email terdeteksi dan matching berhasil!\n` +
            `Jumlah: <b>${emailInfo.amount || paymentDoc.uniqueAmount} USDT</b>\n` +
            `Payer: <b>${emailInfo.from || paymentDoc.payerName || '-'}</b>\n\n` +
            `<i>⚠️ Ini test mode, saldo tidak ditambahkan.</i>`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          console.error('[BINANCE] Failed to update test deposit message:', e.message);
        }
      }
      
      console.info(`✅ [BINANCE] TEST DEPOSIT completed: ${paymentDoc.paymentId}`);
      return;
    }
    
    // Proses berdasarkan orderType
    if (paymentDoc.orderType === 'limited') {
      // Complete LIMITED order
      const offer = await LimitedOffer.findOne({ 
        productId: paymentDoc.productId, 
        variantId: paymentDoc.variantId 
      });
      
      if (!offer || !offer.stock || offer.stock.length === 0) {
        // Stock habis - refund?
        console.error(`[BINANCE] Stock habis untuk ${paymentDoc.productId}/${paymentDoc.variantId}`);
        await bot.telegram.sendMessage(
          userId,
          `❌ *Pembayaran Diterima - Namun Stok Habis*\n\n` +
          `Maaf, stok untuk produk ini telah habis.\n` +
          `Silahkan hubungi admin untuk refund.\n\n` +
          `Order ID: \`${paymentDoc.orderId}\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Ambil stock
      const code = offer.stock.shift();
      offer.markModified('stock');
      await offer.save();
      
      // Simpan claim
      await LimitedClaim.create({
        userId,
        userName: paymentDoc.userName,
        userUsername: paymentDoc.userUsername,
        productId: paymentDoc.productId,
        variantId: paymentDoc.variantId,
        productName: offer.productName,
        variantName: offer.variantName,
        code,
        claimedAt: new Date()
      });
      
      // Log profit
      await ProfitTele.create({
        userId,
        userName: paymentDoc.userName,
        userUsername: paymentDoc.userUsername,
        productName: offer.productName,
        variantName: offer.variantName,
        quantity: 1,
        price: paymentDoc.baseAmount,
        discountPrice: 0,
        fee: 0,
        totalAmountPaid: paymentDoc.baseAmount,
        timestamp: new Date()
      });
      
      // Update statistik user (umum transaction)
      try {
        const statisticsHandler = require('./statisticsHandler');
        await statisticsHandler.incrementTransactionUmum(userId, paymentDoc.baseAmount);
        await statisticsHandler.updateLastActiveUmum(userId, paymentDoc.userName, paymentDoc.userUsername);
      } catch (statsErr) {
        console.error('[STATISTICS] Error updating user statistics:', statsErr);
      }
      
      // Send profit notification to CHANNEL_PROFIT
      try {
        const { sendChannelProfitNotification } = require('./cursor');
        // Ensure bot.telegram exists, fallback to bot if needed
        const telegram = bot.telegram || bot;
        if (!telegram || !telegram.sendMessage) {
          console.error('[BINANCE] Invalid bot/telegram object for profit notification');
          throw new Error('Invalid telegram bot instance');
        }
        const mockCtx = { telegram };
        const profitDataForChannel = {
          userId: userId,
          userName: paymentDoc.userName,
          userUsername: paymentDoc.userUsername || '',
          transactionType: 'limited',
          transactionId: paymentDoc.orderId,
          productName: offer.productName,
          variantName: offer.variantName,
          quantity: 1,
          totalAmountPaid: paymentDoc.baseAmount, // Nominal asli sebelum ditambah apapun
          profitAmount: paymentDoc.baseAmount,
          paymentMethod: 'binance'
        };
        await sendChannelProfitNotification(mockCtx, profitDataForChannel);
        console.info(`[BINANCE] ✅ Profit notification sent for LIMITED order ${paymentDoc.orderId}`);
      } catch (profitErr) {
        console.error('[BINANCE] ❌ Failed to send profit notification:', profitErr.message);
        console.error('[BINANCE] Profit error stack:', profitErr.stack);
      }
      
      // Send account/code to user
      const escapeMarkdown = (text) => {
        return String(text || '')
          .replace(/\_/g, '\\_')
          .replace(/\*/g, '\\*')
          .replace(/\[/g, '\\[')
          .replace(/\]/g, '\\]')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
          .replace(/\~/g, '\\~')
          .replace(/\`/g, '\\`')
          .replace(/\>/g, '\\>')
          .replace(/\#/g, '\\#')
          .replace(/\+/g, '\\+')
          .replace(/\-/g, '\\-')
          .replace(/\=/g, '\\=')
          .replace(/\|/g, '\\|')
          .replace(/\{/g, '\\{')
          .replace(/\}/g, '\\}')
          .replace(/\./g, '\\.')
          .replace(/\!/g, '\\!');
      };
      
      // Get current time in WIB
      const now = new Date();
      const wibTime = now.toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        dateStyle: 'long',
        timeStyle: 'medium'
      });
      
      // Create file content
      const fileContent = `═══════════════════════════════════════════
🎁 AKUN/CODE - ${offer.productName}
═══════════════════════════════════════════

📦 Produk: ${offer.productName}
📌 Variant: ${offer.variantName}
💵 Amount: ${emailInfo.amount || paymentDoc.uniqueAmount} USDT
👤 Payer: ${emailInfo.from || paymentDoc.payerName || '-'}
🔖 Order ID: ${paymentDoc.orderId}
📅 Waktu: ${wibTime}

═══════════════════════════════════════════
🎁 AKUN/CODE:
═══════════════════════════════════════════

${code}

═══════════════════════════════════════════
Terima kasih sudah berbelanja!
═══════════════════════════════════════════`;
      
      const fileName = `${paymentDoc.orderId}_${offer.productName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
      
      // Send file to user
      await bot.telegram.sendDocument(
        userId,
        {
          source: Buffer.from(fileContent, 'utf-8'),
          filename: fileName
        },
        {
          caption: `✅ *PEMBAYARAN BERHASIL \\- ORDER SELESAI*\n\n` +
            `💰 Pembayaran via Binance diterima\\!\n` +
            `📦 *Produk:* ${escapeMarkdown(offer.productName)}\n` +
            `📌 *Variant:* ${escapeMarkdown(offer.variantName)}\n` +
            `💵 *Amount:* ${escapeMarkdown(String(emailInfo.amount || paymentDoc.uniqueAmount))} USDT\n` +
            `👤 *Payer:* ${escapeMarkdown(emailInfo.from || paymentDoc.payerName || '-')}\n` +
            `🔖 *Order ID:* \`${escapeMarkdown(paymentDoc.orderId)}\`\n` +
            `📅 *Waktu:* ${escapeMarkdown(wibTime)}\n\n` +
            `_Terima kasih sudah berbelanja\\!_`,
          parse_mode: 'MarkdownV2'
        }
      );
      
      // ✅ RESET ALL RATE LIMITERS ON SUCCESSFUL PAYMENT!
      qrisLimiter.reset(userId);
      paymentLimiter.reset(userId);
      console.info(`[BINANCE] Limiters reset for user ${userId}`);
      
      // PENTING: Kirim notifikasi ke CHANNEL_PAY_REGULER (bukan ke owner)
      try {
        const { sendChannelPayNotification, sendFileToChannelFile } = require('./cursor');
        const mockCtx = { telegram: bot.telegram };
        
        // Kirim file ke CHANNEL_FILE
        const fileBuffer = Buffer.from(fileContent, 'utf-8');
        await sendFileToChannelFile(mockCtx, fileBuffer, fileName, paymentDoc.orderId);
        
        // Kirim notifikasi ke channel
        const orderDataForChannel = {
          transactionId: paymentDoc.orderId,
          userId: paymentDoc.userId,
          userName: paymentDoc.userName,
          userUsername: paymentDoc.userUsername || '',
          quantity: 1,
          totalAmount: paymentDoc.baseAmount,
          amount: paymentDoc.baseAmount,
          reservedCode: code,
          paymentMethod: 'binance'
        };
        const productForChannel = { name: offer.productName };
        const variantForChannel = { name: offer.variantName };
        await sendChannelPayNotification(mockCtx, orderDataForChannel, productForChannel, variantForChannel);
        console.info(`[BINANCE] Channel notification sent for LIMITED order ${paymentDoc.orderId}`);
      } catch (channelError) {
        console.error('[BINANCE] Failed to send channel notification:', channelError.message);
      }
      
      console.info(`✅ [BINANCE] LIMITED order completed: ${paymentDoc.paymentId}`);
      
    } else if (paymentDoc.orderType === 'regular') {
      // Complete REGULAR order
      const product = await Produk.findOne({ id: paymentDoc.productId });
      
      if (!product) {
        console.error(`[BINANCE] Product not found: ${paymentDoc.productId}`);
        await bot.telegram.sendMessage(
          userId,
          `❌ *Pembayaran Diterima - Namun Produk Tidak Ditemukan*\n\n` +
          `Silahkan hubungi admin.\n\n` +
          `Order ID: \`${paymentDoc.orderId}\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      const variant = product.variants.get(paymentDoc.variantId);
      if (!variant) {
        console.error(`[BINANCE] Variant not found: ${paymentDoc.variantId}`);
        await bot.telegram.sendMessage(
          userId,
          `❌ *Pembayaran Diterima - Namun Varian Tidak Ditemukan*\n\n` +
          `Silahkan hubungi admin.\n\n` +
          `Order ID: \`${paymentDoc.orderId}\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Check stock (should be in reservedStock)
      if (!paymentDoc.reservedStock || paymentDoc.reservedStock.length === 0) {
        console.error(`[BINANCE] No reserved stock for ${paymentDoc.paymentId}`);
        await bot.telegram.sendMessage(
          userId,
          `❌ *Pembayaran Diterima - Namun Stok Tidak Ditemukan*\n\n` +
          `Silahkan hubungi admin.\n\n` +
          `Order ID: \`${paymentDoc.orderId}\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Get stock codes
      const codes = paymentDoc.reservedStock.join('\n');
      
      // Update product stats (gunakan quantity untuk regular, atau length untuk limited)
      const quantity = paymentDoc.quantity || paymentDoc.reservedStock.length;
      variant.terjual += quantity;
      product.terjual += quantity;
      product.markModified('variants');
      await product.save();
      
      // Log profit
      await ProfitTele.create({
        userId,
        userName: paymentDoc.userName,
        userUsername: paymentDoc.userUsername,
        productName: product.name,
        variantName: variant.name,
        quantity: quantity,
        price: variant.price,
        discountPrice: 0,
        fee: 0,
        totalAmountPaid: paymentDoc.baseAmount,
        timestamp: new Date()
      });
      
      // Update statistik user (umum transaction)
      try {
        const statisticsHandler = require('./statisticsHandler');
        await statisticsHandler.incrementTransactionUmum(userId, paymentDoc.baseAmount);
        await statisticsHandler.updateLastActiveUmum(userId, paymentDoc.userName, paymentDoc.userUsername);
      } catch (statsErr) {
        console.error('[STATISTICS] Error updating user statistics:', statsErr);
      }
      
      // Send profit notification to CHANNEL_PROFIT
      try {
        const { sendChannelProfitNotification } = require('./cursor');
        // Ensure bot.telegram exists, fallback to bot if needed
        const telegram = bot.telegram || bot;
        if (!telegram || !telegram.sendMessage) {
          console.error('[BINANCE] Invalid bot/telegram object for profit notification');
          throw new Error('Invalid telegram bot instance');
        }
        const mockCtx = { telegram };
        const profitDataForChannel = {
          userId: userId,
          userName: paymentDoc.userName,
          userUsername: paymentDoc.userUsername || '',
          transactionType: 'regular',
          transactionId: paymentDoc.orderId,
          productName: product.name,
          variantName: variant.name,
          quantity: quantity,
          totalAmountPaid: paymentDoc.baseAmount, // Nominal asli sebelum ditambah apapun
          profitAmount: paymentDoc.baseAmount,
          paymentMethod: 'binance'
        };
        await sendChannelProfitNotification(mockCtx, profitDataForChannel);
        console.info(`[BINANCE] ✅ Profit notification sent for REGULAR order ${paymentDoc.orderId}`);
      } catch (profitErr) {
        console.error('[BINANCE] ❌ Failed to send profit notification:', profitErr.message);
        console.error('[BINANCE] Profit error stack:', profitErr.stack);
      }
      
      // Send account/code to user
      const escapeMarkdown = (text) => {
        return String(text || '')
          .replace(/\_/g, '\\_')
          .replace(/\*/g, '\\*')
          .replace(/\[/g, '\\[')
          .replace(/\]/g, '\\]')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
          .replace(/\~/g, '\\~')
          .replace(/\`/g, '\\`')
          .replace(/\>/g, '\\>')
          .replace(/\#/g, '\\#')
          .replace(/\+/g, '\\+')
          .replace(/\-/g, '\\-')
          .replace(/\=/g, '\\=')
          .replace(/\|/g, '\\|')
          .replace(/\{/g, '\\{')
          .replace(/\}/g, '\\}')
          .replace(/\./g, '\\.')
          .replace(/\!/g, '\\!');
      };
      
      // Get current time in WIB
      const now = new Date();
      const wibTime = now.toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        dateStyle: 'long',
        timeStyle: 'medium'
      });
      
      // Create file content
      const fileContent = `═══════════════════════════════════════════
🎁 AKUN/CODE - ${product.name}
═══════════════════════════════════════════

📦 Produk: ${product.name}
📌 Variant: ${variant.name}
📦 Jumlah: ${quantity}
💵 Amount: ${emailInfo.amount || paymentDoc.uniqueAmount} USDT
👤 Payer: ${emailInfo.from || paymentDoc.payerName || '-'}
🔖 Order ID: ${paymentDoc.orderId}
📅 Waktu: ${wibTime}

═══════════════════════════════════════════
🎁 AKUN/CODE:
═══════════════════════════════════════════

${codes}

═══════════════════════════════════════════
Terima kasih sudah berbelanja!
═══════════════════════════════════════════`;
      
      const fileName = `${paymentDoc.orderId}_${product.name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
      
      // Send file to user
      await bot.telegram.sendDocument(
        userId,
        {
          source: Buffer.from(fileContent, 'utf-8'),
          filename: fileName
        },
        {
          caption: `✅ *PEMBAYARAN BERHASIL \\- ORDER SELESAI*\n\n` +
            `💰 Pembayaran via Binance diterima\\!\n` +
            `📦 *Produk:* ${escapeMarkdown(product.name)}\n` +
            `📌 *Variant:* ${escapeMarkdown(variant.name)}\n` +
            `📦 *Jumlah:* ${quantity}\n` +
            `💵 *Amount:* ${escapeMarkdown(String(emailInfo.amount || paymentDoc.uniqueAmount))} USDT\n` +
            `👤 *Payer:* ${escapeMarkdown(emailInfo.from || paymentDoc.payerName || '-')}\n` +
            `🔖 *Order ID:* \`${escapeMarkdown(paymentDoc.orderId)}\`\n` +
            `📅 *Waktu:* ${escapeMarkdown(wibTime)}\n\n` +
            `_Terima kasih sudah berbelanja\\!_`,
          parse_mode: 'MarkdownV2'
        }
      );
      
      // ✅ RESET ALL RATE LIMITERS ON SUCCESSFUL PAYMENT!
      qrisLimiter.reset(userId);
      paymentLimiter.reset(userId);
      console.info(`[BINANCE] Limiters reset for user ${userId}`);
      
      // PENTING: Kirim notifikasi ke CHANNEL_PAY_REGULER (bukan ke owner)
      try {
        const { sendChannelPayNotification, sendFileToChannelFile } = require('./cursor');
        const mockCtx = { telegram: bot.telegram };
        
        // Kirim file ke CHANNEL_FILE
        const fileBuffer = Buffer.from(fileContent, 'utf-8');
        await sendFileToChannelFile(mockCtx, fileBuffer, fileName, paymentDoc.orderId);
        
        // Kirim notifikasi ke channel
        const orderDataForChannel = {
          transactionId: paymentDoc.orderId,
          userId: paymentDoc.userId,
          userName: paymentDoc.userName,
          userUsername: paymentDoc.userUsername || '',
          quantity: quantity,
          totalAmount: paymentDoc.baseAmount,
          amount: paymentDoc.baseAmount,
          reservedStock: paymentDoc.reservedStock || [],
          paymentMethod: 'binance'
        };
        await sendChannelPayNotification(mockCtx, orderDataForChannel, product, variant);
        console.info(`[BINANCE] Channel notification sent for REGULAR order ${paymentDoc.orderId}`);
      } catch (channelError) {
        console.error('[BINANCE] Failed to send channel notification:', channelError.message);
      }
      
      console.info(`✅ [BINANCE] REGULAR order completed: ${paymentDoc.paymentId}`);
    }
    
    // Delete payment message if exists
    if (paymentDoc.qrMessageId) {
      try {
        await bot.telegram.deleteMessage(userId, paymentDoc.qrMessageId);
      } catch (e) {
        console.info(`[BINANCE] Failed to delete payment message: ${e.message}`);
      }
    }
    
  } catch (e) {
    console.error(`[BINANCE] Error completing order:`, e);
  }
}

let __imapChecking = false; // guard to prevent simultaneous connections
let __lastCheckTime = 0;

/**
 * Check emails untuk Binance payments
 */
async function checkBinancePaymentEmails(bot, N = 30, reminderTimeouts = null, reminderMessageIds = null, binancePaymentTimeouts = null) {
  // Skip if email not configured
  if (!EMAIL_CONF.imap.user || !EMAIL_CONF.imap.password) {
    return; // Silent skip
  }

  // ✅ SMART CHECK: Only check if there are pending payments
  try {
    const pendingCount = await PendingBinancePayment.countDocuments({ 
      status: 'pending',
      expireAt: { $gt: new Date() }
    });
    
    if (pendingCount === 0) {
      // No pending payments, skip check silently (save resources!)
      return;
    }
  } catch (dbErr) {
    // If DB check fails, still try to check emails (safety fallback)
  }

  if (__imapChecking) {
    const elapsed = Date.now() - __lastCheckTime;
    // Reset flag jika sudah lebih dari 30 detik (stuck)
    if (elapsed > 30000) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      console.info(`[${timeStr} WIB] ⚠️ [BINANCE] Resetting stuck checker flag (stuck for ${Math.round(elapsed/1000)}s)`);
      __imapChecking = false;
    } else {
      return; // prevent overlap
    }
  }
  
  __imapChecking = true;
  __lastCheckTime = Date.now();
  
  let connection;
  
  try {
    connection = await imaps.connect(EMAIL_CONF);
    
    // Add comprehensive error handlers to prevent crashes
    if (connection) {
      // Connection level error handler
      connection.on('error', (err) => {
        // Silent suppress all errors to prevent crash
      });
      
      // IMAP socket level error handler
      if (connection.imap) {
        connection.imap.on('error', (err) => {
          // Silent suppress all errors to prevent crash
        });
        
        // TLS socket level error handler (underlying socket)
        if (connection.imap._sock) {
          connection.imap._sock.on('error', (err) => {
            // Silent suppress all socket errors
          });
        }
      }
    }
    
    await connection.openBox('INBOX');
    
    // Search for UNSEEN emails from last 24 hours only
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const searchCriteria = ['UNSEEN', ['SINCE', since]];
    const overview = await connection.search(searchCriteria, { 
      bodies: [''], 
      markSeen: false, 
      struct: true 
    });

    if (overview.length === 0) {
      // No new emails
      return;
    }

    // Silent check - only log when match found
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Batch check processed emails to reduce DB queries
    const allMessageIds = [];
    const emailData = [];
    
    for (const item of overview) {
      const uid = item.attributes.uid;
      const raw = item.parts.find(p => p.which === '')?.body;
      if (!raw) continue;
      
      try {
        const parsed = await simpleParser(raw);
        const messageId = parsed.messageId || `uid-${uid}`;
        const subject = parsed.subject || '';
        const fromHdr = parsed.from ? parsed.from.text.toLowerCase() : '';
        
        allMessageIds.push(messageId);
        emailData.push({ uid, messageId, subject, fromHdr, parsed });
      } catch (parseErr) {
        console.error(`[${timeStr} WIB] ❌ [BINANCE] Parse error:`, parseErr.message);
        continue;
      }
    }
    
    // Batch check all messageIds at once
    const processedEmails = await ProcessedEmail.find({ messageId: { $in: allMessageIds } }).select('messageId');
    const processedSet = new Set(processedEmails.map(e => e.messageId));
    
    for (const { uid, messageId, subject, fromHdr, parsed } of emailData) {
      // Check if already processed (idempotency)
      if (processedSet.has(messageId)) {
        // Silent skip - no need to log every processed email
        continue;
      }
      
      // Check if it's a test email or real Binance email
      const isTestEmail = fromHdr.includes(TEST_EMAIL.toLowerCase()) && /\[test\]\s*payment\s+receive\s+successful/i.test(subject);
      const isBinanceEmail = SENDER_ALLOW.some(s => fromHdr.includes(s)) || fromHdr.includes('binance');
      
      // Skip if neither test nor Binance
      if (!isTestEmail && !isBinanceEmail) {
        // Mark as processed to skip next time
        await ProcessedEmail.create({ messageId, uid, from: fromHdr, subject, processedAt: new Date() });
        continue;
      }
      
      // If Binance email, also check subject
      if (isBinanceEmail && !isTestEmail) {
        const subjectOk = /payment|transfer|received|incoming|success/i.test(subject);
        if (!subjectOk) {
          await ProcessedEmail.create({ messageId, uid, from: fromHdr, subject, processedAt: new Date() });
          continue;
        }
      }

      const html = parsed.html ? htmlToText(parsed.html, { wordwrap: false, preserveNewlines: true }) : '';
      const plain = parsed.text || '';
      
      // Use parseTestSimpleEmail for test emails, parseBinanceEmail for real emails
      let info;
      if (isTestEmail) {
        console.info(`[${timeStr} WIB] 📧 [BINANCE] Processing test email...`);
        // Try plain first
        info = parseTestSimpleEmail(plain, false);
        // If fails, try HTML
        if (!info || !info.amount) {
          info = parseTestSimpleEmail(html, false);
        }
        
        if (info && info.amount) {
          console.info(`[${timeStr} WIB] ✅ [BINANCE] Parsed: ${info.amount} USDT from "${info.from}"`);
        } else {
          console.info(`[${timeStr} WIB] ❌ [BINANCE] Failed to parse test email`);
        }
      } else {
        const combined = `${subject}\n${plain}\n${html}`;
        info = parseBinanceEmail(combined);
      }

      if (!info || !info.amount) {
        await ProcessedEmail.create({ messageId, uid, from: fromHdr, subject, processedAt: new Date() });
        continue;
      }
      if (info.amount < 0.01) {
        await ProcessedEmail.create({ messageId, uid, from: fromHdr, subject, amount: info.amount, processedAt: new Date() });
        continue;
      }

      console.info(`[${timeStr} WIB] 🔍 [BINANCE] Looking for pending: ${info.amount} USDT, payer: "${info.from || '(any)'}"`);
      const payment = await findPendingByAmount(info.amount, info.from);
      
      if (!payment) {
        console.info(`[${timeStr} WIB] ⚠️  [BINANCE] No matching pending payment found`);
        await ProcessedEmail.create({ messageId, uid, from: fromHdr, subject, amount: info.amount, processedAt: new Date(), matched: false });
        continue;
      }
      
      // Check if payment expired beyond grace period (24 hours)
      const hoursSinceExpired = (new Date() - payment.expireAt) / (1000 * 60 * 60);
      if (hoursSinceExpired > 24) {
        console.info(`[${timeStr} WIB] ⏰ [BINANCE] Payment expired > 24h ago: ${payment.paymentId}`);
        await ProcessedEmail.create({ messageId, uid, from: fromHdr, subject, amount: info.amount, processedAt: new Date(), matched: false });
        continue;
      } else if (new Date() > payment.expireAt) {
        console.info(`[${timeStr} WIB] ⏰ [BINANCE] Payment expired ${hoursSinceExpired.toFixed(1)}h ago, within grace period`);
      }

      // MATCH! Complete order
      console.info(`\n🎉 ============ BINANCE PAYMENT MATCHED! ============`);
      console.info(`[${timeStr}] ✅ User ${payment.userId}`);
      console.info(`   Amount: ${info.amount} USDT`);
      console.info(`   Payer: ${info.from || '-'}`);
      console.info(`   Order: ${payment.orderId}`);
      console.info(`   Type: ${payment.orderType}`);
      console.info(`===============================================\n`);

      // Mark as processed
      await ProcessedEmail.create({ 
        messageId, 
        uid, 
        from: fromHdr, 
        subject, 
        amount: info.amount, 
        processedAt: new Date(), 
        matched: true,
        paymentId: payment.paymentId
      });

      await completeOrder(payment, bot, info, reminderTimeouts, reminderMessageIds, binancePaymentTimeouts);
    }
  } catch (e) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // List of expected socket errors that should be suppressed (tidak crash app)
    const socketErrors = ['EPIPE', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNREFUSED'];
    const isSocketError = socketErrors.includes(e.code) || 
                          socketErrors.includes(e.errno) || 
                          e.message?.includes('ended by the other party') ||
                          e.message?.includes('socket');
    
    if (!isSocketError) {
      // Only log unexpected errors
      console.error(`[${timeStr} WIB] ❌ [BINANCE PAYMENT] Error:`, e.message);
    } else {
      // Silent suppress socket errors (normal behavior, tidak perlu log)
    }
  } finally {
    try { 
      if (connection) {
        // Remove all error listeners first
        try {
          connection.removeAllListeners('error');
          if (connection.imap) {
            connection.imap.removeAllListeners('error');
            if (connection.imap._sock) {
              connection.imap._sock.removeAllListeners('error');
            }
          }
        } catch {}
        
        // Safely close connection
        try {
          const closePromise = connection.end();
          const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1000));
          await Promise.race([closePromise, timeoutPromise]);
        } catch (closeErr) {
          // Silent suppress all close errors (EPIPE, socket closed, etc)
        }
      }
    } catch {}
    __imapChecking = false;
  }
}

/**
 * Expire sweep - cancel expired payments (backup to timeout-based expiry)
 */
async function expireBinancePayments(bot, reminderTimeouts = null, reminderMessageIds = null, binancePaymentTimeouts = null) {
  try {
    const now = new Date();
    const expired = await PendingBinancePayment.find({
      status: 'pending',
      expireAt: { $lt: now }
    });
    
    if (expired.length === 0) return;
    
    console.info(`[BINANCE] Expiring ${expired.length} payment(s)`);
    
    for (const payment of expired) {
      payment.status = 'expired';
      await payment.save();
      
      // ✅ Clear reminder timeout if exists
      const userId = payment.userId;
      if (reminderTimeouts && reminderTimeouts.has && reminderTimeouts.has(userId)) {
        const timeoutId = reminderTimeouts.get(userId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          reminderTimeouts.delete(userId);
          console.info(`[BINANCE] Reminder timeout cleared for user ${userId} (payment expired - sweep)`);
        }
      }

      // ✅ Delete reminder message if exists
      if (reminderMessageIds && reminderMessageIds.has && reminderMessageIds.has(userId)) {
        const msgId = reminderMessageIds.get(userId);
        if (msgId) {
          try {
            await bot.telegram.deleteMessage(userId, msgId);
            console.info(`[BINANCE] Reminder message deleted for user ${userId} (payment expired - sweep)`);
          } catch (e) {
            // Ignore deletion errors
          }
          reminderMessageIds.delete(userId);
        }
      }

      // ✅ Clear payment expiry timeout if exists
      if (binancePaymentTimeouts && binancePaymentTimeouts.has && binancePaymentTimeouts.has(userId)) {
        const timeoutId = binancePaymentTimeouts.get(userId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          binancePaymentTimeouts.delete(userId);
          console.info(`[BINANCE] Payment expiry timeout cleared for user ${userId} (payment expired - sweep)`);
        }
      }
      
      // Return stock if reserved (for BOTH limited and regular orders)
      if (payment.reservedStock && payment.reservedStock.length > 0) {
        if (payment.orderType === 'limited') {
          const offer = await LimitedOffer.findOne({
            productId: payment.productId,
            variantId: payment.variantId
          });
          
          if (offer) {
            offer.stock.push(...payment.reservedStock);
            offer.markModified('stock');
            await offer.save();
            // ✅ Console log: stok dikembalikan
            console.info(`🔁 [STOCK RETURNED] User ${userId} | Produk: ${offer.productName} | Variant: ${offer.variantName} | Jumlah: ${payment.reservedStock.length} stok | Payment ID: ${payment.paymentId} | Type: Limited Binance EXPIRED (sweep)`);
          }
        } else if (payment.orderType === 'regular') {
          // Return to regular product stock
          const product = await Produk.findOne({ id: payment.productId });
          if (product) {
            const variant = product.variants.get(payment.variantId);
            if (variant) {
              variant.stok.push(...payment.reservedStock);
              product.markModified('variants');
              await product.save();
              // ✅ Console log: stok dikembalikan
              console.info(`🔁 [STOCK RETURNED] User ${userId} | Produk: ${product.name} | Variant: ${variant.name} | Jumlah: ${payment.reservedStock.length} stok | Payment ID: ${payment.paymentId} | Type: Regular Binance EXPIRED (sweep)`);
            }
          }
        }
      }
      
      // Notify user
      try {
        await bot.telegram.sendMessage(
          payment.userId,
          `⏰ *Pembayaran Binance Expired*\n\n` +
          `Waktu pembayaran telah habis.\n` +
          `Order ID: \`${payment.orderId}\`\n\n` +
          `Silahkan pesan ulang jika masih ingin membeli.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.info(`[BINANCE] Failed to notify user ${payment.userId}: ${e.message}`);
      }
      
      // Delete payment message
      if (payment.qrMessageId) {
        try {
          await bot.telegram.deleteMessage(payment.userId, payment.qrMessageId);
        } catch {}
      }
    }
  } catch (e) {
    console.error('[BINANCE] Error in expire sweep:', e);
  }
}

module.exports = {
  buildUniqueAmount,
  generateUniqueCode,
  checkBinancePaymentEmails,
  expireBinancePayments,
  parseBinanceEmail,
  parseTestSimpleEmail,
  PAYMENT_TTL_MIN,
  CURRENCY
};

// Add test scanner for /testbinance
let __imapTestChecking = false;
let __lastTestCheckTime = 0;

async function testScanBinanceEmails(N = 5) {
  if (!EMAIL_CONF.imap.user || !EMAIL_CONF.imap.password) {
    return { ok: false, reason: 'EMAIL_NOT_CONFIGURED' };
  }
  
  // Check if TEST checker is busy (ignore production checker)
  if (__imapTestChecking) {
    const elapsed = Date.now() - __lastTestCheckTime;
    // Reset flag jika sudah lebih dari 30 detik (stuck)
    if (elapsed > 30000) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      console.info(`[${timeStr} WIB] ⚠️ [BINANCE TEST] Resetting stuck test checker flag (stuck for ${Math.round(elapsed/1000)}s)`);
      __imapTestChecking = false;
    } else {
      const remaining = Math.round((30000 - elapsed) / 1000);
      return { ok: false, reason: 'BUSY', remaining };
    }
  }
  
  // Wait for production checker to finish if it's running
  if (__imapChecking) {
    const elapsed = Date.now() - __lastCheckTime;
    if (elapsed < 10000) {
      // Production checker is actively running, wait a bit
      return { ok: false, reason: 'PRODUCTION_CHECKER_RUNNING', remaining: Math.round((10000 - elapsed) / 1000) };
    }
  }
  
  __imapTestChecking = true;
  __lastTestCheckTime = Date.now();
  let connection;
  
  try {
    connection = await imaps.connect(EMAIL_CONF);
    
    // Add error handlers for test scanner
    if (connection) {
      connection.on('error', () => {});
      if (connection.imap) {
        connection.imap.on('error', () => {});
        if (connection.imap._sock) {
          connection.imap._sock.on('error', () => {});
        }
      }
    }
    
    await connection.openBox('INBOX');
    
    // Get last N emails for scanning (show the most recent first)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    const overview = await connection.search(['ALL', ['SINCE', since]], { bodies: [''], markSeen: false, struct: true });
    const messages = overview.slice(-Math.max(1, N * 3)).reverse(); // Get more to filter, show N results
    const out = [];
    
    for (const msg of messages) {
      // Stop if we already have N results
      if (out.length >= N) break;
      
      const parsed = await simpleParser(msg.parts.find(p => p.which === '')?.body || '');
      const subject = parsed.subject || '';
      const from = parsed.from ? parsed.from.text : '';
      const fromLower = from.toLowerCase();
      const date = parsed.date || new Date();
      
      // Skip test emails - only check Binance emails
      if (fromLower.includes(TEST_EMAIL.toLowerCase())) {
        continue; // Skip test emails
      }
      
      // Only check Binance emails with "Payment Receive Successful" subject
      const isBinance = SENDER_ALLOW.some(s => fromLower.includes(s)) || fromLower.includes('binance');
      if (!isBinance) continue;
      
      // Skip non "Payment Receive Successful" emails (skip transaction details, etc)
      if (!/payment\s+receive\s+successful/i.test(subject)) continue;
      
      const html = parsed.html ? htmlToText(parsed.html, { wordwrap: false, preserveNewlines: true }) : '';
      const plain = parsed.text || '';
      const combined = `${subject}\n${plain}\n${html}`;
      const info = parseBinanceEmail(combined);
      const parseSuccess = !!(info && info.amount);
      
      const summary = {
        from,
        subject,
        date: date.toISOString(),
        amount: info?.amount || null,
        payer: info?.from || null,
        currency: info?.currency || null,
        parseSuccess
      };
      out.push(summary);
    }
    
    return { ok: true, items: out };
  } catch (e) {
    return { ok: false, reason: e.message || 'ERROR' };
  } finally {
    try {
      if (connection) {
        try {
          connection.removeAllListeners('error');
          if (connection.imap) {
            connection.imap.removeAllListeners('error');
            if (connection.imap._sock) {
              connection.imap._sock.removeAllListeners('error');
            }
          }
        } catch {}
        try {
          connection.end();
        } catch {}
      }
    } catch {}
    __imapTestChecking = false;
  }
}

module.exports.testScanBinanceEmails = testScanBinanceEmails;

