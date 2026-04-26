// setpayment.js
// Konfigurasi Payment Settings untuk QRIS dan Binance

module.exports = {
  // ========================================
  // ⏰ WAKTU EXPIRED PAYMENT
  // ========================================
  qris: {
    // Waktu expired untuk pembayaran QRIS (dalam milidetik)
    expiredTime: 5 * 60 * 1000, // 5 menit (default)
    
    // Waktu reminder sebelum expired (dalam milidetik)
    // Contoh: 2 menit sebelum expired = 2 * 60 * 1000
    reminderTime: 2 * 60 * 1000, // 2 menit sebelum expired
    
    // Kode unik untuk QRIS
    // Range kode unik yang akan ditambahkan ke total pembayaran
    kodeUnik: {
      enabled: true,      // Aktifkan/nonaktifkan kode unik
      min: 1,             // Minimal kode unik (1 rupiah)
      max: 999            // Maksimal kode unik (999 rupiah)
    }
  },
  
  binance: {
    // Waktu expired untuk pembayaran Binance (dalam milidetik)
    expiredTime: 5 * 60 * 1000, // 15 menit (default)
    
    // Waktu reminder sebelum expired (dalam milidetik)
    // Contoh: 5 menit sebelum expired = 5 * 60 * 1000
    reminderTime: 4 * 60 * 1000, // 5 menit sebelum expired
    
    // Kode unik untuk Binance (dalam IDR, akan di-convert ke USDT)
    // Range fee yang akan ditambahkan ke total pembayaran
    kodeUnik: {
      enabled: true,      // Aktifkan/nonaktifkan kode unik
      min: 500,           // Minimal fee (500 rupiah)
      max: 2000           // Maksimal fee (2000 rupiah)
    }
  },
  
  deposit: {
    // Waktu expired untuk deposit saldo (dalam milidetik)
    expiredTime: 10 * 60 * 1000, // 10 menit (default)
    
    // Waktu reminder sebelum expired (dalam milidetik)
    reminderTime: 2 * 60 * 1000, // 3 menit sebelum expired
    
    // Kode unik untuk deposit
    kodeUnik: {
      enabled: true,      // Aktifkan/nonaktifkan kode unik
      min: 100,           // Minimal kode unik (100 rupiah)
      max: 999            // Maksimal kode unik (999 rupiah)
    }
  },
  
  // ========================================
  // 💰 DEPOSIT LIMITS
  // ========================================
  minDepositAmount: 1000,        // Minimal deposit Rp 5.000
  maxDepositAmount: 999999,    // Maksimal deposit Rp 10.000.000
  
  depositExpiredTime: 10 * 60 * 1000, // Shorthand untuk deposit.expiredTime
  
  // ========================================
  // 📝 HELPER FUNCTIONS
  // ========================================
  
  // Generate kode unik random untuk payment
  generateKodeUnik(type = 'qris') {
    const config = this[type]?.kodeUnik;
    if (!config || !config.enabled) return 0;
    
    return Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
  },
  
  // Get waktu expired dalam milidetik
  getExpiredTime(type = 'qris') {
    return this[type]?.expiredTime || 5 * 60 * 1000;
  },
  
  // Get waktu reminder dalam milidetik
  getReminderTime(type = 'qris') {
    return this[type]?.reminderTime || 2 * 60 * 1000;
  },
  
  // Format waktu untuk display (5 menit, 15 menit, dll)
  formatExpiredTime(type = 'qris') {
    const ms = this.getExpiredTime(type);
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (minutes > 0 && seconds > 0) {
      return `${minutes} menit ${seconds} detik`;
    } else if (minutes > 0) {
      return `${minutes} menit`;
    } else {
      return `${seconds} detik`;
    }
  },
  
  // Format waktu reminder untuk display
  formatReminderTime(type = 'qris') {
    const ms = this.getReminderTime(type);
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (minutes > 0 && seconds > 0) {
      return `${minutes} menit ${seconds} detik`;
    } else if (minutes > 0) {
      return `${minutes} menit`;
    } else {
      return `${seconds} detik`;
    }
  },
  
  // Check apakah kode unik aktif
  isKodeUnikEnabled(type = 'qris') {
    return this[type]?.kodeUnik?.enabled || false;
  },
  
  // ========================================
  // 💎 BINANCE UNIQUE AMOUNT BUILDER
  // ========================================
  
  /**
   * Build unique amount for Binance payment
   * Adds random fee in IDR, then converts total to USDT
   * 
   * @param {number} baseAmountUSDT - Base amount in USDT (for reference)
   * @param {number} baseAmountIDR - Base amount in IDR
   * @param {string} userId - User ID for logging
   * @returns {object} { uniqueAmount, uniqueCode, feeIdr, totalIdr }
   * 
   * Example:
   * - baseAmountIDR: 20,000 IDR
   * - feeIdr: 1,234 IDR (random 500-2000)
   * - totalIdr: 21,234 IDR
   * - uniqueAmount: 1.38021 USDT (21,234 × rate)
   * - uniqueCode: "234" (last 3 digits of fee)
   */
  buildBinanceUniqueAmount(baseAmountUSDT, baseAmountIDR, userId) {
    const USDT_RATE = Number(process.env.IDR_TO_USDT_RATE || 0.00006);
    const config = this.binance.kodeUnik;
    
    // Generate random fee in IDR (dari config)
    let feeIdr = 0;
    if (config.enabled) {
      feeIdr = Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
    }
    
    // Calculate total in IDR first
    const totalIdr = baseAmountIDR + feeIdr;
    
    // Convert total IDR to USDT
    const uniqueAmount = Number((totalIdr * USDT_RATE).toFixed(5));
    
    // Unique code is the last 3 digits of feeIdr
    const uniqueCode = String(feeIdr).slice(-3).padStart(3, '0');
    
    // Debug log
    console.info(`[CALC BINANCE] Base IDR: ${baseAmountIDR}, Fee IDR: ${feeIdr}, Total IDR: ${totalIdr}, Rate: ${USDT_RATE}, Total USDT: ${uniqueAmount}`);
    
    return { uniqueAmount, uniqueCode, feeIdr, totalIdr };
  }
};

