const { CounterLimiter } = require('./counterlimiter');
const path = require('path');

// ✅ paymentLimiter: untuk cancel payment (batalkan)
// Limit: 5x cancel dalam 30 menit
// Auto-reset: setelah 30 menit dari action pertama ATAU payment berhasil
const paymentLimiter = new CounterLimiter({
  limit: 50,
  windowMs: 24 * 60 * 1000, // 30 menit
  persistFile: path.join(__dirname, '.limiter_payment.json')
});

// ✅ depositLimiter: untuk deposit saldo
// Limit: 3x deposit dalam 24 jam (window panjang untuk track offense)
// Auto-reset: setelah 24 jam dari action pertama ATAU deposit berhasil
// 
// Progressive strike escalation (sama seperti qrisLimiter):
//   • Offense 1 (3x pertama): block 30 menit
//   • Offense 2 (3x kedua): block 60 menit
//   • Offense 3+ (3x ketiga dst): block 24 jam
// - Offense reset otomatis setelah window 24 jam habis ATAU deposit berhasil (reset manual)
const depositLimiter = new CounterLimiter({
  limit: 3,
  windowMs: 24 * 60 * 60 * 1000, // 24 jam
  escalateBlocks: [
    2 * 60 * 1000,       // offense #1 → 30m
    3 * 60 * 1000,       // offense #2 → 60m
    4 * 60 * 1000,  // offense #3+ → 24h
  ],
  persistFile: path.join(__dirname, '.limiter_deposit.json')
});

// ✅ qrisLimiter: untuk create QR payment
// Limit: 3x qris dalam 24 jam (window panjang untuk track offense)
// Auto-reset: setelah 24 jam dari action pertama ATAU payment berhasil
// 
// Logic: 
// - Window 24 jam → semua aktivitas create/cancel dalam 24 jam masuk 1 window
// - Setiap 3x dalam window → offense +1 dan kena block eskalasi
// - Offense bertambah terus selama masih dalam window 24 jam yang sama
// 
// Progressive strike escalation:
//   • Offense 1 (3x pertama): block 30 menit
//   • Offense 2 (3x kedua): block 60 menit
//   • Offense 3+ (3x ketiga dst): block 24 jam
// - Offense reset otomatis setelah window 24 jam habis ATAU payment berhasil (reset manual)
const qrisLimiter = new CounterLimiter({
  limit: 3,
  windowMs: 24 * 60 * 60 * 1000, // 24 jam
  escalateBlocks: [
    2 * 60 * 1000,       // offense #1 → 30m
    3 * 60 * 1000,       // offense #2 → 60m
    4 * 60 * 1000,  // offense #3+ → 24h
  ],
  persistFile: path.join(__dirname, '.limiter_qris.json')
});

// ✅ depositRDPLimiter: untuk deposit RDP (cancel/expired)
// Limit: 3x deposit RDP dalam 24 jam (window panjang untuk track offense)
// Auto-reset: setelah 24 jam dari action pertama ATAU deposit RDP berhasil
// 
// Progressive strike escalation:
//   • Offense 1 (3x pertama): block 30 menit
//   • Offense 2 (3x kedua): block 60 menit
//   • Offense 3+ (3x ketiga dst): block 24 jam
// - Offense reset otomatis setelah window 24 jam habis ATAU deposit RDP berhasil (reset manual)
const depositRDPLimiter = new CounterLimiter({
  limit: 3,
  windowMs: 24 * 60 * 60 * 1000, // 24 jam
  escalateBlocks: [
    2 * 60 * 1000,       // offense #1 → 30m
    3 * 60 * 1000,       // offense #2 → 60m
    4 * 60 * 1000,  // offense #3+ → 24h
  ],
  persistFile: path.join(__dirname, '.limiter_deposit_rdp.json')
});

// Auto-save every 30 minutes (for all limiters) - safety backup
// PENTING: Debounced save sudah handle perubahan real-time (save setelah 1 detik idle)
// Interval ini hanya sebagai safety backup jika debounced save terlewat
// Save on exit juga sudah ada untuk memastikan data tersimpan saat shutdown
setInterval(() => {
  paymentLimiter.save().catch(e => console.error('[LIMITER] Auto-save error (payment):', e.message));
  depositLimiter.save().catch(e => console.error('[LIMITER] Auto-save error (deposit):', e.message));
  qrisLimiter.save().catch(e => console.error('[LIMITER] Auto-save error (qris):', e.message));
  depositRDPLimiter.save().catch(e => console.error('[LIMITER] Auto-save error (depositRDP):', e.message));
  // COMMENTED: Logging untuk mengurangi noise
  // console.info('[LIMITER] Auto-save completed (every 30 minutes)');
}, 30 * 60 * 1000); // 30 menit (dari 5 menit)

// Also save on process exit (await untuk memastikan data tersimpan)
process.on('SIGINT', async () => {
  console.info('\n[LIMITER] Saving state before exit...');
  await Promise.all([
    paymentLimiter.save().catch(e => console.error('[LIMITER] Save error (payment):', e.message)),
    depositLimiter.save().catch(e => console.error('[LIMITER] Save error (deposit):', e.message)),
    qrisLimiter.save().catch(e => console.error('[LIMITER] Save error (qris):', e.message)),
    depositRDPLimiter.save().catch(e => console.error('[LIMITER] Save error (depositRDP):', e.message))
  ]);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.info('\n[LIMITER] Saving state before exit...');
  await Promise.all([
    paymentLimiter.save().catch(e => console.error('[LIMITER] Save error (payment):', e.message)),
    depositLimiter.save().catch(e => console.error('[LIMITER] Save error (deposit):', e.message)),
    qrisLimiter.save().catch(e => console.error('[LIMITER] Save error (qris):', e.message)),
    depositRDPLimiter.save().catch(e => console.error('[LIMITER] Save error (depositRDP):', e.message))
  ]);
  process.exit(0);
});

module.exports = { paymentLimiter, depositLimiter, qrisLimiter, depositRDPLimiter };