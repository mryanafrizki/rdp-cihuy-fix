// set_timer.js
// Konfigurasi Timer/Timeout untuk berbagai operasi bot

module.exports = {
  // ========================================
  // ⏰ USER INPUT TIMEOUTS
  // ========================================
  
  // Waktu tunggu untuk user input custom quantity
  customQuantityTimeout: 1 * 60 * 1000, // 1 menit (60 detik)
  
  // Waktu tunggu untuk user input payer name (Binance)
  payerNameTimeout: 2 * 60 * 1000, // 2 menit (120 detik)
  
  // Waktu tunggu untuk user input deposit amount
  depositAmountTimeout: 2 * 60 * 1000, // 2 menit (120 detik)
  
  // Waktu tunggu untuk user input deposit RDP amount (custom amount)
  rdpDepositAmountTimeout: 1 * 60 * 1000, // 1 menit (60 detik) - sama dengan custom quantity
  
  // ========================================
  // 🔔 NOTIFICATION TIMEOUTS
  // ========================================
  
  // Waktu auto-delete untuk flash notification
  flashNoticeTimeout: 2500, // 2.5 detik
  
  // Waktu auto-delete untuk temporary alert
  tempAlertTimeout: 1500, // 1.5 detik
  
  // Waktu auto-delete untuk notify message
  notifyTimeout: 2500, // 2.5 detik
  
  // ========================================
  // ⚠️ WARNING & CANCEL BUTTON TIMEOUTS
  // ========================================
  
  // Waktu tampil button "Batalkan Pesanan/Deposit" setelah QR code dibuat
  // Digunakan untuk: Order, Deposit, Deposit RDP
  cancelButtonDelay: 4 * 1000, // 20 detik
  
  // Reminder waktu tersisa QRIS (kirim reminder X menit sebelum expired)
  qrisReminderDelay: 2 * 60 * 1000, // 2 menit sebelum expired
  
  // Waktu auto-delete warning message (rate limit, dll)
  warningMessageTimeout: 10 * 1000, // 10 detik
  
  // Waktu cooldown message auto-delete
  cooldownMessageTimeout: 5 * 1000, // 5 detik
  
  // ========================================
  // 🔄 REFRESH & UPDATE INTERVALS
  // ========================================
  
  // Interval untuk refresh countdown payment
  countdownRefreshInterval: 10 * 1000, // 10 detik
  
  // Interval untuk check payment status
  paymentCheckInterval: 5 * 1000, // 5 detik
  
  // ========================================
  // 📢 CHANNEL MESSAGE DELAYS
  // ========================================
  
  // Delay random minimum untuk setiap pesan yang dikirim ke channel (untuk menghindari rate limit)
  channelMessageDelayMin: 2 * 1000, // 4 detik (minimum)
  
  // Delay random maximum untuk setiap pesan yang dikirim ke channel
  channelMessageDelayMax: 4 * 1000, // 8 detik (maximum)
  
  // ========================================
  // 📝 HELPER FUNCTIONS
  // ========================================
  
  // Format waktu untuk display (2 menit, 20 detik, dll)
  formatTime(ms) {
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
  
  // Get timeout dalam detik (untuk display)
  getTimeoutInSeconds(timeoutKey) {
    const ms = this[timeoutKey];
    return Math.floor(ms / 1000);
  },
  
  // Get timeout dalam menit (untuk display)
  getTimeoutInMinutes(timeoutKey) {
    const ms = this[timeoutKey];
    return Math.floor(ms / 60000);
  }
};

