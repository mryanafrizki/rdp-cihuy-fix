const crypto = require('crypto');
const VPSProductManager = require('../config/vpsProducts');
const digitalOcean = require('../config/digitalOcean');
const { DEDICATED_OS_VERSIONS } = require('../config/constants');
const { deductBalance, isAdmin, checkBalance } = require('../utils/userManager');
const { awardCommission } = require('../utils/commission');
const { installDedicatedRDP } = require('../utils/dedicatedRdpInstaller');
const safeMessageEditor = require('../utils/safeMessageEdit');
const RDPMonitor = require('../utils/rdpMonitor');
const { getActivePromo } = require('../utils/promoManager');

class VPSHandler {
  static async handleVPSMenu(bot, chatId, messageId) {
    await safeMessageEditor.editMessage(bot, chatId, messageId,
      '🖥️ **VPS Services**\n\nPilih jenis layanan VPS yang Anda inginkan:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🖥️ VPS Biasa', callback_data: 'vps_regular' }],
            [{ text: '🪟 RDP', callback_data: 'vps_rdp' }],
            [{ text: '📋 Pesanan Saya', callback_data: 'my_vps_orders' }],
            [{ text: '« Kembali', callback_data: 'back_to_menu' }]
          ]
        }
      });
  }

  static async handleVPSRegular(bot, chatId, messageId) {
    try {
      const products = await VPSProductManager.getProducts();
      if (products.length === 0) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
          '❌ Belum ada produk VPS yang tersedia.\n\nSilakan hubungi admin untuk menambahkan produk.',
          { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'vps_menu' }]] } });
        return;
      }
      let messageText = `🖥️ **VPS Biasa - Pilih Paket**\n\n`;
      const keyboard = [];
      const promo = await getActivePromo('vps_regular');
      if (promo) {
        messageText += `🎉 **PROMO!** Dapatkan diskon ${promo.discount_percentage}% untuk semua produk VPS Biasa!\n\n`;
      }

      products.forEach((product, i) => {
        let price = product.price;
        if (promo) {
            price = price * (1 - promo.discount_percentage / 100);
        }
        messageText += `${i + 1}. **${product.name}**\n` +
          ` 💰 Harga: Rp ${price.toLocaleString()}/bulan\n` +
          ` ⚡ CPU: ${product.cpu} Core\n` +
          ` 💾 RAM: ${product.memory} MB\n` +
          ` 💽 Disk: ${product.disk} GB\n` +
          ` 🌍 Regions: ${product.regions.length} tersedia\n\n`;
        keyboard.push([{ text: `${i + 1}. ${product.name} - Rp ${price.toLocaleString()}`, callback_data: `select_vps_regular_${product.id}` }]);
      });
      keyboard.push([{ text: '« Kembali', callback_data: 'vps_menu' }]);
      await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, { reply_markup: { inline_keyboard: keyboard } });
    } catch (error) {
      console.error('Error handling VPS regular:', error);
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        '❌ Terjadi kesalahan saat mengambil data produk VPS.',
        { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'vps_menu' }]] } });
    }
  }

  static async handleVPSRDP(bot, chatId, messageId) {
    try {
      const products = await VPSProductManager.getProducts();
      if (products.length === 0) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
          '❌ Belum ada produk VPS yang tersedia.\n\nSilakan hubungi admin untuk menambahkan produk.',
          { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'vps_menu' }]] } });
        return;
      }
      let messageText = `🪟 **VPS + RDP - Pilih Paket**\n\n` +
        `💡 **Fitur VPS + RDP:**\n` +
        `• VPS dengan Ubuntu 24.04 LTS\n` +
        `• Instalasi Windows otomatis\n` +
        `• RDP siap pakai\n` +
        `• Port custom 8765\n\n`;
      const keyboard = [];
      const promo = await getActivePromo('vps_rdp');
      if (promo) {
        messageText += `🎉 **PROMO!** Dapatkan diskon ${promo.discount_percentage}% untuk semua produk VPS + RDP!\n\n`;
      }

      products.forEach((product, i) => {
        let price = product.price;
        if (promo) {
            price = price * (1 - promo.discount_percentage / 100);
        }
        messageText += `${i + 1}. **${product.name}**\n` +
          ` 💰 Harga: Rp ${price.toLocaleString()}/bulan\n` +
          ` ⚡ CPU: ${product.cpu} Core\n` +
          ` 💾 RAM: ${product.memory} MB\n` +
          ` 💽 Disk: ${product.disk} GB\n` +
          ` 🌍 Regions: ${product.regions.length} tersedia\n\n`;
        keyboard.push([{ text: `${i + 1}. ${product.name} - Rp ${price.toLocaleString()}`, callback_data: `select_vps_rdp_${product.id}` }]);
      });
      keyboard.push([{ text: '« Kembali', callback_data: 'vps_menu' }]);
      await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, { reply_markup: { inline_keyboard: keyboard } });
    } catch (error) {
      console.error('Error handling VPS RDP:', error);
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        '❌ Terjadi kesalahan saat mengambil data produk VPS.',
        { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'vps_menu' }]] } });
    }
  }

  static async handleSelectVPSRegular(bot, query, sessionManager) {
    const productId = parseInt(query.data.split('_')[3]);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    try {
      const product = await VPSProductManager.getProductById(productId);
      if (!product) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Produk tidak ditemukan.', show_alert: true });
        return;
      }
      const promo = await getActivePromo('vps_regular');
      let price = product.price;
      if (promo) {
        price = price * (1 - promo.discount_percentage / 100);
      }

      if (!isAdmin(chatId) && !(await checkBalance(chatId, price))) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
          `💰 Saldo tidak mencukupi untuk ${product.name} (Rp ${price.toLocaleString()}).\n\nSilakan deposit terlebih dahulu.`, 
          { reply_markup: { inline_keyboard: [[{ text: '💳 Deposit', callback_data: 'deposit' }], [{ text: '« Kembali', callback_data: 'vps_regular' }]] } });
        return;
      }
      await this.showRegionSelection(bot, chatId, messageId, product, 'regular', sessionManager);
    } catch (error) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Terjadi kesalahan.', show_alert: true });
    }
  }

  static async handleSelectVPSRDP(bot, query, sessionManager) {
    const productId = parseInt(query.data.split('_')[3]);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    try {
      const product = await VPSProductManager.getProductById(productId);
      if (!product) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Produk tidak ditemukan.', show_alert: true });
        return;
      }
      const promo = await getActivePromo('vps_rdp');
      let price = product.price;
      if (promo) {
        price = price * (1 - promo.discount_percentage / 100);
      }

      if (!isAdmin(chatId) && !(await checkBalance(chatId, price))) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
          `💰 Saldo tidak mencukupi untuk ${product.name} (Rp ${price.toLocaleString()}).\n\nSilakan deposit terlebih dahulu.`, 
          { reply_markup: { inline_keyboard: [[{ text: '💳 Deposit', callback_data: 'deposit' }], [{ text: '« Kembali', callback_data: 'vps_rdp' }]] } });
        return;
      }
      await this.showRegionSelection(bot, chatId, messageId, product, 'rdp', sessionManager);
    } catch (error) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Terjadi kesalahan.', show_alert: true });
    }
  }

  static async showRegionSelection(bot, chatId, messageId, product, type, sessionManager) {
    try {
      const adminToken = await VPSProductManager.getDOToken(product.admin_id);
      if (!adminToken) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
          '❌ Konfigurasi admin tidak lengkap. Hubungi admin.',
          { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: type === 'rdp' ? 'vps_rdp' : 'vps_regular' }]] } });
        return;
      }
      digitalOcean.setToken(product.admin_id, adminToken);
      const allRegions = await digitalOcean.getRegions(product.admin_id);
      const availableRegions = allRegions.filter(region => product.regions.includes(region.slug));
      let messageText = `🌍 **Pilih Region untuk ${product.name}**\n\n` +
        `💰 Harga: Rp ${product.price.toLocaleString()}/bulan\n` +
        `⚡ Spesifikasi: ${product.cpu}C/${product.memory}MB/${product.disk}GB\n\n`;
      const keyboard = [];
      availableRegions.forEach(region => {
        keyboard.push([{ text: `🌍 ${region.name}`, callback_data: `select_region_${type}_${product.id}_${region.slug}` }]);
      });
      keyboard.push([{ text: '« Kembali', callback_data: type === 'rdp' ? 'vps_rdp' : 'vps_regular' }]);
      await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, { reply_markup: { inline_keyboard: keyboard } });
      sessionManager.setUserSession(chatId, { step: 'region_selection', type, product, adminToken });
    } catch (error) {
      console.error('Error showing region selection:', error);
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        '❌ Terjadi kesalahan saat mengambil data region.',
        { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: type === 'rdp' ? 'vps_rdp' : 'vps_regular' }]] } });
    }
  }

  static async handleSelectRegion(bot, query, sessionManager) {
    const [, , type, productId, regionSlug] = query.data.split('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getUserSession(chatId);
    if (!session || session.step !== 'region_selection') {
      await bot.answerCallbackQuery(query.id, { text: '❌ Sesi tidak valid.', show_alert: true });
      return;
    }
    if (type === 'regular') {
      await this.showImageSelection(bot, chatId, messageId, session, regionSlug, sessionManager, 0);
    } else {
      await this.showWindowsSelection(bot, chatId, messageId, session, regionSlug, sessionManager);
    }
  }

  static async showImageSelection(bot, chatId, messageId, session, regionSlug, sessionManager, page = 0) {
    try {
        const adminToken = session.adminToken;
        digitalOcean.setToken(session.product.admin_id, adminToken);
        const images = await digitalOcean.getDistributionImages(session.product.admin_id);
        
        const availableImages = images.filter(img => img.status === 'available').sort((a, b) => a.distribution.localeCompare(b.distribution) || b.name.localeCompare(a.name));

        const itemsPerPage = 10;
        const startIndex = page * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedImages = availableImages.slice(startIndex, endIndex);
        const totalPages = Math.ceil(availableImages.length / itemsPerPage);

        let messageText = `🖼️ **Pilih Sistem Operasi untuk ${session.product.name}**\n\n` +
            `💰 Harga: Rp ${session.product.price.toLocaleString()}/bulan\n` +
            `🌍 Region: ${regionSlug}\n\n` +
            `Pilih salah satu OS di bawah ini (Halaman ${page + 1}/${totalPages}):`;

        const keyboard = [];
        paginatedImages.forEach(image => {
            keyboard.push([{ text: `💿 ${image.distribution} - ${image.name}`, callback_data: `select_image_regular_${session.product.id}_${regionSlug}_${image.slug}` }]);
        });

        const navigation = [];
        if (page > 0) {
            navigation.push({ text: '« Sebelumnya', callback_data: `page_image_${page - 1}` });
        }
        if (endIndex < availableImages.length) {
            navigation.push({ text: 'Selanjutnya »', callback_data: `page_image_${page + 1}` });
        }
        if (navigation.length > 0) {
            keyboard.push(navigation);
        }

        keyboard.push([{ text: '« Kembali', callback_data: `select_vps_regular_${session.product.id}` }]);
        
        await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, { reply_markup: { inline_keyboard: keyboard } });

        session.step = 'image_selection';
        session.regionSlug = regionSlug;
        sessionManager.setUserSession(chatId, session);
    } catch (error) {
        console.error('Error showing image selection:', error);
        await safeMessageEditor.editMessage(bot, chatId, messageId,
            '❌ Terjadi kesalahan saat mengambil data image OS.',
            { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: `select_vps_regular_${session.product.id}` }]] } });
    }
  }

  static async handleImagePage(bot, query, sessionManager) {
    const page = parseInt(query.data.split('_')[2]);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getUserSession(chatId);

    if (!session || session.step !== 'image_selection') {
        await bot.answerCallbackQuery(query.id, { text: '❌ Sesi tidak valid.', show_alert: true });
        return;
    }

    await this.showImageSelection(bot, chatId, messageId, session, session.regionSlug, sessionManager, page);
  }

  static async handleSelectImage(bot, query, sessionManager) {
    const [, , , productId, regionSlug, imageSlug] = query.data.split('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getUserSession(chatId);

    if (!session || session.step !== 'image_selection' || session.product.id != productId) {
      await bot.answerCallbackQuery(query.id, { text: '❌ Sesi tidak valid atau produk tidak cocok.', show_alert: true });
      return;
    }

    session.imageSlug = imageSlug;
    sessionManager.setUserSession(chatId, session);

    // Generate random password
    const rootPassword = crypto.randomBytes(8).toString('hex');

    await this.createRegularVPS(bot, chatId, messageId, session, regionSlug, imageSlug, rootPassword, sessionManager);
  }

  static async createRegularVPS(bot, chatId, messageId, session, regionSlug, imageSlug, rootPassword, sessionManager) {
    if (!isAdmin(chatId) && !(await deductBalance(chatId, session.product.price))) {
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        `💰 Saldo tidak mencukupi untuk ${session.product.name} (Rp ${session.product.price.toLocaleString()}).\n\nSilakan deposit terlebih dahulu.`, 
        { reply_markup: { inline_keyboard: [[{ text: '💳 Deposit', callback_data: 'deposit' }], [{ text: '« Kembali', callback_data: 'vps_regular' }]] } });
      return;
    }
    if (!isAdmin(chatId)) {
        await awardCommission(bot, chatId, session.product.price, 'VPS Biasa');
    }

    try {
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        '🚀 **Membuat VPS...**\n\n⏳ Sedang membuat droplet di Digital Ocean...\nProses ini membutuhkan waktu 2-3 menit.',
        { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'cancel_vps_creation' }]] } });
      
      const product = session.product;
      const userData = `#cloud-config
password: ${rootPassword}
chpasswd: { expire: False }
ssh_pwauth: True`;

      digitalOcean.setToken(product.admin_id, session.adminToken);
      const orderId = await VPSProductManager.createOrder(chatId, product.id, regionSlug);
      
      const dropletConfig = { 
        name: `vps-${chatId}-${Date.now()}`,
        region: regionSlug, 
        size: product.do_size_slug, 
        image: imageSlug,
        user_data: userData,
        userId: chatId 
      };

      const droplet = await digitalOcean.createDroplet(product.admin_id, dropletConfig);
      await VPSProductManager.updateOrder(orderId, { droplet_id: droplet.id, root_password: rootPassword, status: 'creating' });
      
      const readyDroplet = await digitalOcean.waitForDropletReady(product.admin_id, droplet.id);
      const publicIP = readyDroplet.networks.v4.find(net => net.type === 'public')?.ip_address;
      
      const completedAt = new Date();
      const expiresAt = new Date(completedAt.setMonth(completedAt.getMonth() + 1));

      await VPSProductManager.updateOrder(orderId, { status: 'completed', ip_address: publicIP, completed_at: new Date().toISOString(), expires_at: expiresAt.toISOString() });
      
      const imageInfo = await digitalOcean.getImageInfo(product.admin_id, imageSlug);
      const osName = imageInfo ? imageInfo.description : imageSlug;

      await safeMessageEditor.editMessage(bot, chatId, messageId,
        `✅ **VPS Berhasil Dibuat!**\n\n` +
        `📦 **${product.name}**\n` +
        `🌍 Region: ${regionSlug}\n` +
        `🌐 IP Address: 
${publicIP}
` + 
        `💻 OS: ${osName}\n` +
        `👤 Username: root\n` +
        `🔑 Password: ${rootPassword}\n\n` + 
        `⚡ **Spesifikasi:**\n` +
        `• CPU: ${product.cpu} Core\n` +
        `• RAM: ${product.memory} MB\n` +
        `• Disk: ${product.disk} GB\n\n` + 
        `🆔 Order ID: ${orderId}`,
        { reply_markup: { inline_keyboard: [[{ text: '📋 Pesanan Saya', callback_data: 'my_vps_orders' }], [{ text: '🏠 Menu Utama', callback_data: 'back_to_menu' }]] } });
      
      sessionManager.clearUserSession(chatId);
    } catch (error) {
      console.error('Error creating regular VPS:', error);
      if (!isAdmin(chatId)) {
        const BalanceManager = require('../handlers/balanceHandler');
        await BalanceManager.updateBalance(chatId, session.product.price);
      }
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        `❌ **Gagal membuat VPS**\n\nError: ${error.response ? JSON.stringify(error.response.data) : error.message}\n\nSaldo Anda akan dikembalikan.`, 
        { reply_markup: { inline_keyboard: [[{ text: '🔄 Coba Lagi', callback_data: 'vps_regular' }]] } });
      sessionManager.clearUserSession(chatId);
    }
  }

  static async showWindowsSelection(bot, chatId, messageId, session, regionSlug, sessionManager) {
    const keyboard = [];
    let messageText = `🪟 **Pilih OS Windows untuk RDP**\n\n🏆 **STANDARD VERSIONS**\n`;
    DEDICATED_OS_VERSIONS.filter(os => os.price === 3000 && !os.version.includes('lite') && !os.version.includes('uefi')).forEach(os => {
      messageText += `${os.id}. ${os.name}\n`;
      keyboard.push([{ text: `${os.id}. ${os.name}`, callback_data: `vps_windows_${os.id}_${regionSlug}` }]);
    });
    messageText += '\n💎 **LITE VERSIONS** (Hemat Resource)\n';
    DEDICATED_OS_VERSIONS.filter(os => os.version.includes('lite')).forEach(os => {
      messageText += `${os.id}. ${os.name}\n`;
      keyboard.push([{ text: `${os.id}. ${os.name} (Lite)`, callback_data: `vps_windows_${os.id}_${regionSlug}` }]);
    });
    keyboard.push([{ text: '« Kembali', callback_data: 'vps_rdp' }]);
    await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, { reply_markup: { inline_keyboard: keyboard } });
    session.step = 'windows_selection';
    session.regionSlug = regionSlug;
    sessionManager.setUserSession(chatId, session);
  }

  static async handleWindowsSelection(bot, query, sessionManager) {
    const [, , windowsId, regionSlug] = query.data.split('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager.getUserSession(chatId);
    if (!session || session.step !== 'windows_selection') {
      await bot.answerCallbackQuery(query.id, { text: '❌ Sesi tidak valid.', show_alert: true });
      return;
    }
    const selectedOS = DEDICATED_OS_VERSIONS.find(os => os.id === parseInt(windowsId));
    if (!selectedOS) {
      await bot.answerCallbackQuery(query.id, { text: '❌ OS tidak valid.', show_alert: true });
      return;
    }
    await safeMessageEditor.editMessage(bot, chatId, messageId,
      `🔑 **Set Password RDP**\n\n📦 VPS: ${session.product.name}\n🌍 Region: ${regionSlug}\n🪟 OS: ${selectedOS.name}\n\nMasukkan password untuk RDP Windows:\n(Min. 8 karakter, kombinasi huruf dan angka)`,
      { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'vps_rdp' }]] } });
    session.step = 'rdp_password';
    session.selectedOS = selectedOS;
    session.messageId = messageId;
    sessionManager.setUserSession(chatId, session);
  }

  static async handleRDPPassword(bot, msg, sessionManager) {
    const chatId = msg.chat.id;
    const session = sessionManager.getUserSession(chatId);
    if (!session || session.step !== 'rdp_password') {
      await bot.sendMessage(chatId, '❌ Sesi tidak valid.');
      return;
    }
    try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
    const password = msg.text.trim();
    if (password.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@#$%^&+=]{8,}$/.test(password)) {
      await bot.sendMessage(chatId, '❌ Password tidak memenuhi syarat. Harus minimal 8 karakter dan mengandung huruf dan angka.');
      return;
    }
    await this.createVPSWithRDP(bot, chatId, session, password, sessionManager, session.messageId);
  }

  static async createVPSWithRDP(bot, chatId, session, rdpPassword, sessionManager, messageId) {
    if (!isAdmin(chatId) && !(await deductBalance(chatId, session.product.price))) {
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        `💰 Saldo tidak mencukupi untuk ${session.product.name} (Rp ${session.product.price.toLocaleString()}).\n\nSilakan deposit terlebih dahulu.`, 
        { reply_markup: { inline_keyboard: [[{ text: '💳 Deposit', callback_data: 'deposit' }], [{ text: '« Kembali', callback_data: 'vps_rdp' }]] } });
      return;
    }
    if (!isAdmin(chatId)) {
        await awardCommission(bot, chatId, session.product.price, 'VPS + RDP');
    }

    try {
      await safeMessageEditor.editMessage(bot, chatId, messageId, '🚀 **Membuat VPS + RDP...**\n\n⏳ Tahap 1: Membuat droplet di Digital Ocean...\nProses ini membutuhkan waktu 30-45 menit total.', { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'cancel_vps_creation' }]] } });
      
      const product = session.product;
      const rootPassword = rdpPassword; 
      const userData = `#!/bin/bash
echo "root:${rootPassword}" | chpasswd
sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config
systemctl restart sshd`;

      digitalOcean.setToken(product.admin_id, session.adminToken);
      const orderId = await VPSProductManager.createOrder(chatId, product.id, session.regionSlug, session.selectedOS.version, rdpPassword);
      
      const dropletConfig = { 
        name: `vps-rdp-${chatId}-${Date.now()}`,
        region: session.regionSlug, 
        size: product.do_size_slug, 
        image: "ubuntu-24-04-x64",
        user_data: userData
      };
      
      const droplet = await digitalOcean.createDroplet(product.admin_id, dropletConfig);
      await VPSProductManager.updateOrder(orderId, { droplet_id: droplet.id, root_password: rootPassword, status: 'creating_vps' });
      
      await safeMessageEditor.editMessage(bot, chatId, messageId, '🚀 **Membuat VPS + RDP...**\n\n⏳ Tahap 2: Menunggu VPS siap...\nDroplet sedang dibuat di Digital Ocean...');
      const readyDroplet = await digitalOcean.waitForDropletReady(product.admin_id, droplet.id);
      const publicIP = readyDroplet.networks.v4.find(net => net.type === 'public')?.ip_address;
      
      await VPSProductManager.updateOrder(orderId, { status: 'installing_rdp', ip_address: publicIP });

      await safeMessageEditor.editMessage(bot, chatId, messageId, `✅ **VPS Telah Dibuat!**

🌐 IP Address: 
${publicIP}
👤 Username: 
root
🔑 Password: 
${rootPassword}

Sekarang, sistem akan memulai instalasi RDP. Proses ini akan memakan waktu 30-45 menit.

⏳ Tahap 3: Menginstall Windows RDP...
Proses instalasi Windows sedang berjalan...`);
      
      await new Promise(r => setTimeout(r, 60000));
      
      await installDedicatedRDP(publicIP, 'root', rootPassword, { osVersion: session.selectedOS.version, password: rdpPassword }, log => console.log(`[${publicIP}] ${log}`));
      
      const monitor = new RDPMonitor(publicIP, 'root', rootPassword, rdpPassword, 8765);
      const rdpResult = await monitor.waitForRDPReady(30 * 60 * 1000);
      monitor.disconnect();
      
      const completedAt = new Date();
      const expiresAt = new Date(completedAt.setMonth(completedAt.getMonth() + 1));

      await VPSProductManager.updateOrder(orderId, { status: 'completed', completed_at: new Date().toISOString(), expires_at: expiresAt.toISOString() });
      
      const statusMessage = rdpResult.rdpReady ? '✅ **VPS + RDP Siap Digunakan!**' : '⚠️ **VPS Dibuat, RDP Sedang Finishing**';
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        `${statusMessage}\n\n📦 **${product.name}**\n🌍 Region: ${session.regionSlug}\n🖹 OS: ${session.selectedOS.name}\n🌐 Server: 
${publicIP}:8765
👤 Username: administrator
🔑 Password: ${rdpPassword}\n\n⚡ **Spesifikasi:**\n• CPU: ${product.cpu} Core\n• RAM: ${product.memory} MB\n• Disk: ${product.disk} GB\n\n🆔 Order ID: ${orderId}\n${rdpResult.rdpReady ? '🎉 RDP siap connect sekarang!' : '⏳ Tunggu 10-15 menit untuk RDP siap'}`,
        { reply_markup: { inline_keyboard: [[{ text: '📋 Copy Detail RDP', callback_data: `copy_vps_rdp_${publicIP}_${rdpPassword}` }], [{ text: '📋 Pesanan Saya', callback_data: 'my_vps_orders' }], [{ text: '🏠 Menu Utama', callback_data: 'back_to_menu' }]] } });
      
      sessionManager.clearUserSession(chatId);
    } catch (error) {
      console.error('Error creating VPS with RDP:', error);
      if (!isAdmin(chatId)) {
        const BalanceManager = require('../handlers/balanceHandler');
        await BalanceManager.updateBalance(chatId, session.product.price);
      }
      await bot.sendMessage(chatId, `❌ **Gagal membuat VPS + RDP**\n\nError: ${error.message}\n\nSaldo Anda akan dikembalikan.`,
        { reply_markup: { inline_keyboard: [[{ text: '🔄 Coba Lagi', callback_data: 'vps_rdp' }]] } });
      sessionManager.clearUserSession(chatId);
    }
  }

  static async handleMyVPSOrders(bot, chatId, messageId, page = 0) {
    try {
      const orders = await VPSProductManager.getUserOrders(chatId);
      const isUserAdmin = isAdmin(chatId);

      if (orders.length === 0) {
        await safeMessageEditor.editMessage(bot, chatId, messageId,
          '📋 **Pesanan VPS Saya**\n\nAnda belum memiliki pesanan VPS.',
          { reply_markup: { inline_keyboard: [[{ text: '🖥️ Pesan VPS', callback_data: 'vps_menu' }]] } });
        return;
      }

      const ordersPerPage = 5;
      const totalPages = Math.ceil(orders.length / ordersPerPage);
      const startIndex = page * ordersPerPage;
      const endIndex = startIndex + ordersPerPage;
      const paginatedOrders = orders.slice(startIndex, endIndex);

      let messageText = `📋 **Pesanan VPS Saya (Halaman ${page + 1}/${totalPages})**\n\n`;
      const keyboard = [];

      paginatedOrders.forEach((order, i) => {
        const date = new Date(order.created_at).toLocaleDateString('id-ID');
        const statusIcon = order.status === 'completed' ? '✅' : (order.status === 'creating' || order.status === 'creating_vps') ? '⏳' : order.status === 'installing_rdp' ? '🔄' : order.status === 'terminated' ? '❌' : '❓';
        
        messageText += `${startIndex + i + 1}. ${statusIcon} **${order.product_name || 'N/A'}** (Status: ${order.status || 'N/A'})\n`;
        messageText += `   🆔 Order: ${order.id}\n`;
        messageText += `   🌍 Region: ${order.region || 'N/A'}\n`;
        if (order.ip_address) {
          messageText += `   🌐 IP: 
${order.ip_address}
`;
        }
        messageText += `   📅 Tanggal: ${date}\n\n`;

        if (order.droplet_id && order.status !== 'terminated') {
            const buttons = [];
            buttons.push({ text: `🔄 Reboot (${order.id})`, callback_data: `reboot_droplet_${order.id}_${order.droplet_id}` });
            buttons.push({ text: `❌ Hapus (${order.id})`, callback_data: `delete_droplet_${order.id}_${order.droplet_id}` });
            keyboard.push(buttons);
        }
      });

      const navigationButtons = [];
      if (page > 0) {
        navigationButtons.push({ text: '« Halaman Sebelumnya', callback_data: `my_vps_orders_${page - 1}` });
      }
      if (endIndex < orders.length) {
        navigationButtons.push({ text: 'Halaman Selanjutnya »', callback_data: `my_vps_orders_${page + 1}` });
      }

      if (navigationButtons.length > 0) {
        keyboard.push(navigationButtons);
      }

      keyboard.push([{ text: '🔄 Refresh', callback_data: 'my_vps_orders_0' }]);
      keyboard.push([{ text: '« Kembali', callback_data: 'vps_menu' }]);

      await safeMessageEditor.editMessage(bot, chatId, messageId, messageText, {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      console.error('Error getting VPS orders:', error);
      await safeMessageEditor.editMessage(bot, chatId, messageId,
        `❌ Terjadi kesalahan saat mengambil data pesanan.\n\nError: ${error.message}`,
        { reply_markup: { inline_keyboard: [[{ text: '« Kembali', callback_data: 'vps_menu' }]] } });
    }
  }

  static async handleRebootDroplet(bot, query) {
    const [, , orderId, dropletId] = query.data.split('_');
    const chatId = query.message.chat.id;

    try {
        const order = await VPSProductManager.getOrder(orderId);
        if (!order) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Pesanan tidak ditemukan.', show_alert: true });
            return;
        }

        const adminToken = await VPSProductManager.getDOToken(order.admin_id);
        if (!adminToken) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Konfigurasi admin tidak ditemukan.', show_alert: true });
            return;
        }

        digitalOcean.setToken(order.admin_id, adminToken);
        await digitalOcean.rebootDroplet(order.admin_id, dropletId);

        await bot.answerCallbackQuery(query.id, { text: `✅ Droplet ${dropletId} sedang direboot.`, show_alert: true });
    } catch (error) {
        console.error(`Error rebooting droplet ${dropletId}:`, error);
        await bot.answerCallbackQuery(query.id, { text: `❌ Gagal mereboot droplet.`, show_alert: true });
    }
  }

  static async handleDeleteDroplet(bot, query) {
    const [, , orderId, dropletId] = query.data.split('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '⚠️ Ya, Hapus', callback_data: `confirm_delete_droplet_${orderId}_${dropletId}` },
                { text: 'Batal', callback_data: 'my_vps_orders' }
            ]
        ]
    };

    await safeMessageEditor.editMessage(bot, chatId, messageId,
        `❓ **Anda yakin ingin menghapus droplet ini?**\n\nDroplet ID: ${dropletId}\nOrder ID: ${orderId}\n\n**Tindakan ini tidak dapat diurungkan.**`,
        { reply_markup: keyboard });
  }

  static async handleConfirmDeleteDroplet(bot, query) {
    const [, , , orderId, dropletId] = query.data.split('_');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
        const order = await VPSProductManager.getOrder(orderId);
        if (!order) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Pesanan tidak ditemukan.', show_alert: true });
            return;
        }

        const adminToken = await VPSProductManager.getDOToken(order.admin_id);
        if (!adminToken) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Konfigurasi admin tidak ditemukan.', show_alert: true });
            return;
        }

        digitalOcean.setToken(order.admin_id, adminToken);
        await digitalOcean.deleteDroplet(order.admin_id, dropletId);
        await VPSProductManager.updateOrder(orderId, { status: 'terminated' });

        await bot.answerCallbackQuery(query.id, { text: `✅ Droplet ${dropletId} telah dihapus.`, show_alert: true });
        await bot.deleteMessage(chatId, messageId);
        await this.handleMyVPSOrders(bot, chatId, null); // Refresh the orders list
    } catch (error) {
        console.error(`Error deleting droplet ${dropletId}:`, error);
        await bot.answerCallbackQuery(query.id, { text: `❌ Gagal menghapus droplet.`, show_alert: true });
    }
  }
}

module.exports = VPSHandler;