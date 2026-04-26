const { roundUpSpecs } = require('./specFormatter');

function createPaymentMessage(paymentData, amount) {
  const messageText =
    `💰 *Deposit Saldo*\n\n` +
    `Nominal Deposit: Rp ${amount.toLocaleString('id-ID')}\n` +
    `Total Bayar: Rp ${amount.toLocaleString('id-ID')}\n\n` +
    `*Panduan Pembayaran QRIS:*\n` +
    `1. Buka aplikasi e-wallet atau m-banking Anda\n` +
    `2. Pilih bayar dengan QRIS\n` +
    `3. Scan QR Code di atas\n` +
    `4. Masukkan nominal sesuai yang tertera\n` +
    `5. Konfirmasi dan selesaikan pembayaran\n\n` +
    `⏳ Pembayaran akan kadaluarsa dalam 30 menit`;

  const keyboard = {
    inline_keyboard: [[
      { text: '« Kembali ke Menu', callback_data: 'back_to_menu' }
    ]]
  };

  return {
    messageText,
    keyboard,
    qrCode: paymentData.qrcode_url
  };
}

function createPendingPaymentMessage(payment, qrCode) {
  const timeLeft = Math.floor((payment.expiry_time - Date.now()) / 1000 / 60);
  const messageText =
    `📋 *Tagihan Pembayaran Tertunda*\n\n` +
    `💰 Jumlah: Rp ${payment.amount.toLocaleString()}\n` +
    `⏳ Waktu tersisa: ${timeLeft} menit\n\n` +
    `*Panduan Pembayaran QRIS:*\n` +
    `1. Buka aplikasi e-wallet atau m-banking Anda\n` +
    `2. Pilih bayar dengan QRIS\n` +
    `3. Scan QR Code di atas\n` +
    `4. Masukkan nominal sesuai yang tertera\n` +
    `5. Konfirmasi dan selesaikan pembayaran`;

  const keyboard = {
    inline_keyboard: [[
      { text: '« Kembali ke Menu', callback_data: 'back_to_menu' }
    ]]
  };

  return {
    messageText,
    keyboard,
    qrCode
  };
}

function createSuccessMessage(amount, newBalance) {
  return {
    text:
      `✅ *Pembayaran Berhasil!*\n\n` +
      `💰 Saldo ditambahkan: Rp ${amount.toLocaleString('id-ID')}\n` +
      `💳 Saldo saat ini: Rp ${newBalance.toLocaleString('id-ID')}`,
    keyboard: {
      inline_keyboard: [[
        { text: '« Kembali ke Menu', callback_data: 'back_to_menu' }
      ]]
    }
  };
}

function createErrorMessage(status) {
  return status === 'Expired'
    ? '⏰ Waktu pembayaran telah habis.'
    : '❌ Pembayaran dibatalkan.';
}

function formatVPSSpecs(rawSpecs, configSpecs) {
  return `📊 **Spesifikasi VPS Terdeteksi:**\n` +
    `• CPU: ${rawSpecs.cpu} Core\n` +
    `• RAM: ${rawSpecs.ram}GB\n` +
    `• Storage: ${rawSpecs.storage}GB\n\n` +
    `⚙️ **Spesifikasi Setelah Instalasi:**\n` +
    `• CPU: ${configSpecs.cpu} Core\n` +
    `• RAM: ${configSpecs.ram}GB\n` +
    `• Storage: ${configSpecs.storage}GB\n\n`;
}

module.exports = {
  createPaymentMessage,
  createPendingPaymentMessage,
  createSuccessMessage,
  createErrorMessage,
  formatVPSSpecs
};
