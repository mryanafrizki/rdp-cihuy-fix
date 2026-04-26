const { BUTTONS } = require('../config/buttons');

async function handleTutorial(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const tutorialText = `📚 *Tutorial Penggunaan Bot*

*Cara Deposit Saldo:*
1. Klik tombol '💰 Deposit'.
2. Masukkan jumlah deposit (minimal Rp 10.000).
3. Lakukan pembayaran menggunakan QRIS atau metode yang tersedia.
4. Saldo akan otomatis masuk setelah pembayaran berhasil.

*Cara Beli VPS:*
1. Pilih '🖥️ VPS Services'.
2. Pilih '🖥️ VPS Biasa'.
3. Pilih paket VPS yang sesuai dengan kebutuhan Anda.
4. Pilih region (lokasi server).
5. Pilih sistem operasi (misalnya, Ubuntu 22.04).
6. VPS akan dibuat secara otomatis setelah pembayaran berhasil, dan Anda akan menerima detail IP, username, dan password.

*Cara Beli RDP (VPS + Windows):*
1. Pastikan saldo mencukupi.
2. Pilih '🖥️ VPS Services' > '🪟 RDP'.
3. Pilih paket VPS yang diinginkan.
4. Pilih region (lokasi server).
5. Pilih versi Windows yang akan diinstall.
6. Masukkan password untuk RDP.
7. Sistem akan membuat VPS dan menginstall Windows secara otomatis (30-45 menit).

*Cara Install RDP Docker:*
1. Siapkan VPS Ubuntu 22.04 (rekomendasi 2 Core, 4GB RAM).
2. Pastikan saldo mencukupi (Rp 1.000).
3. Pilih '🖥️ Install RDPmu' > '🐳 Docker RDP'.
4. Masukkan IP dan password root VPS Anda.
5. Pilih versi Windows.
6. Masukkan password untuk RDP.
7. Tunggu instalasi selesai (10-15 menit).

*Cara Install RDP Dedicated:*
1. Siapkan VPS Ubuntu 24.04 (rekomendasi 2 Core, 4GB RAM).
2. Pastikan saldo mencukupi (Rp 3.000).
3. Pilih '🖥️ Install RDPmu' > '🖥️ Dedicated RDP'.
4. Masukkan IP dan password root VPS Anda.
5. Pilih versi Windows.
6. Masukkan password untuk RDP.
7. Tunggu instalasi selesai (15-30 menit). OS VPS Anda akan diganti dengan Windows.

*Butuh Bantuan?*
- Cek menu '❓ FAQ' untuk pertanyaan umum.
- Cek '🏢 Provider' untuk rekomendasi VPS.
- Hubungi admin jika kendala berlanjut.`;

  await bot.editMessageText(tutorialText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [BUTTONS.BACK_TO_MENU]
      ]
    }
  });
}

module.exports = {
  handleTutorial
};