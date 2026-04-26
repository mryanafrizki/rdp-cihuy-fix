const { WINDOWS_VERSIONS } = require('../config/constants');
const { getDockerRdpPrice, getDedicatedRdpPrice } = require('../utils/priceManager');
const { BUTTONS, BUTTON_COMBINATIONS } = require('../config/buttons');
const { checkVPSSupport } = require('../utils/vpsChecker');
const { detectVPSSpecs } = require('../utils/vpsSpecs');
const { installRDP } = require('../utils/rdpInstaller');
const { installDedicatedRDP } = require('../utils/dedicatedRdpInstaller');
const { deductBalance, isAdmin, checkBalance } = require('../utils/userManager');
const { formatVPSSpecs } = require('../utils/messageFormatter');
const ValidationUtils = require('../utils/validation');
const { awardCommission } = require('../utils/commission');
const db = require('../config/database');
const { getActivePromo } = require('../utils/promoManager');

async function handleInstallRDP(bot, chatId, messageId, userSessions) {
    let dockerPrice = await getDockerRdpPrice();
    let dedicatedPrice = await getDedicatedRdpPrice();

    const dockerPromo = await getActivePromo('docker_rdp');
    const dedicatedPromo = await getActivePromo('dedicated_rdp');

    let message = '🖥️ **Pilih Jenis RDP Installation:**\n\n';

    if (dockerPromo) {
        const newPrice = dockerPrice * (1 - dockerPromo.discount_percentage / 100);
        message += `🎉 **PROMO**\n`;
        message += `🐳 **Docker RDP** - ~Rp ${dockerPrice.toLocaleString()}~ Rp ${newPrice.toLocaleString()}\n`;
        dockerPrice = newPrice;
    } else {
        message += `🐳 **Docker RDP** - Rp ${dockerPrice.toLocaleString()}\n`;
    }

    message += '• Instalasi cepat (10-15 menit)\n' +
        '• Berbagai versi Windows tersedia\n' +
        '• Port 3389 & 8006 (web interface)\n' +
        '• Cocok untuk testing & development\n\n';

    if (dedicatedPromo) {
        const newPrice = dedicatedPrice * (1 - dedicatedPromo.discount_percentage / 100);
        message += `🎉 **PROMO**\n`;
        message += `🖥️ **Dedicated RDP** - ~Rp ${dedicatedPrice.toLocaleString()}~ Rp ${newPrice.toLocaleString()}\n`;
        dedicatedPrice = newPrice;
    } else {
        message += `🖥️ **Dedicated RDP** - Rp ${dedicatedPrice.toLocaleString()}\n`;
    }
    
    message += '• Windows langsung di VPS (15-30 menit)\n' +
        '• Performa optimal\n' +
        '• Port 8765 (custom untuk keamanan)\n' +
        '• Cocok untuk production use';

    await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `🐳 Docker RDP (Rp ${dockerPrice.toLocaleString()})`, callback_data: 'install_docker_rdp' }
                ],
                [
                    { text: `🖥️ Dedicated RDP (Rp ${dedicatedPrice.toLocaleString()})`, callback_data: 'install_dedicated_rdp' }
                ],
                [BUTTONS.BACK_TO_MENU]
            ]
        }
    });
}

async function handleInstallDockerRDP(bot, chatId, messageId, sessionManager) {
    const session = sessionManager.getUserSession(chatId) || {};
    let dockerPrice = await getDockerRdpPrice();
    const promo = await getActivePromo('docker_rdp');
    if (promo) {
        dockerPrice = dockerPrice * (1 - promo.discount_percentage / 100);
    }
    
    if (!isAdmin(chatId) && !await checkBalance(chatId, dockerPrice)) {
        await bot.editMessageText(
            `❌ Saldo tidak mencukupi untuk Docker RDP (Rp ${dockerPrice.toLocaleString()}). Silakan deposit terlebih dahulu.`, 
            {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [BUTTON_COMBINATIONS.DEPOSIT_AND_BACK]
                }
            }
        );
        return;
    }

    session.installType = 'docker';
    
    const msg = await bot.editMessageText(
        '🐳 **Docker RDP Installation**\n\n' +
        `💰 **Harga:** Rp ${dockerPrice.toLocaleString()}\n` +
        '🔧 **Fitur:** Windows di Docker Container\n' + 
        '🔌 **Port:** 3389 (RDP) & 8006 (Web Interface)\n\n' + 
        '⚡️ **Spesifikasi Minimal:**\n' + 
        '• CPU: 2 Core\n' + 
        '• RAM: 4 GB\n' + 
        '• Storage: 40 GB\n\n' + 
        '🌐 **Masukkan IP VPS:**\n' + 
        '_IP akan dihapus otomatis setelah dikirim_\n\n' + 
        '⚠️ **PENTING:** VPS Wajib Fresh Install Ubuntu 22.04',
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[ 
                    BUTTONS.CANCEL
                ]]
            }
        }
    );

    session.step = 'waiting_ip';
    session.startTime = Date.now();
    session.messageId = msg.message_id;
    sessionManager.setUserSession(chatId, session);
}

async function handleInstallDedicatedRDP(bot, chatId, messageId, userSessions) {
    const session = sessionManager.getUserSession(chatId) || {};
    let cost = await getDedicatedRdpPrice();
    const promo = await getActivePromo('dedicated_rdp');
    if (promo) {
        cost = cost * (1 - promo.discount_percentage / 100);
    }

    if (!isAdmin(chatId) && !await checkBalance(chatId, cost)) {
        await bot.editMessageText(
            `❌ Saldo tidak mencukupi untuk Dedicated RDP (Rp ${cost.toLocaleString()}). Silakan deposit terlebih dahulu.`,
            {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [[
                        { text: '💰 Deposit', callback_data: 'deposit' },
                        { text: '🏠 Kembali ke Menu Utama', callback_data: 'back_to_menu' }
                    ]]
                }
            }
        );
        return;
    }

    // Deduct balance before proceeding
    if (!isAdmin(chatId)) {
        await deductBalance(chatId, cost);
        // Award commission for Dedicated RDP purchase
        await awardCommission(chatId, cost, bot);
    }

    session.installType = 'dedicated';
    
    const msg = await bot.editMessageText(
        '🖥️ **Dedicated RDP Installation**\n\n' + 
        `💰 **Harga:** Rp ${cost.toLocaleString()}\n` + 
        '🔧 **Fitur:** Windows langsung mengganti OS VPS\n' + 
        '🔌 **Port:** 8765 (Custom untuk keamanan)\n\n' + 
        '⚡️ **Spesifikasi Minimal:**\n' + 
        '• CPU: 2 Core\n' + 
        '• RAM: 4 GB\n' + 
        '• Storage: 40 GB\n\n' + 
        '🌐 **Masukkan IP VPS:**\n' + 
        '_IP akan dihapus otomatis setelah dikirim_\n\n' + 
        '⚠️ **PENTING:** VPS Wajib Fresh Install Ubuntu 24.04 LTS',
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[ 
                    BUTTONS.CANCEL
                ]]
            }
        }
    );

    session.step = 'waiting_ip';
    session.startTime = Date.now();
    session.messageId = msg.message_id;
    sessionManager.setUserSession(chatId, session);
}

async function handleVPSCredentials(bot, msg, sessionManager) {}
async function handleWindowsSelection(bot, query, sessionManager) {}
async function showWindowsSelection(bot, chatId, messageId) {}
async function handlePageNavigation(bot, query, sessionManager) {}
async function handleCancelInstallation(bot, query, sessionManager) {}
async function handleDedicatedOSSelection(bot, query, sessionManager) {}
async function showDedicatedOSSelection(bot, chatId, messageId, sessionManager) {}

module.exports = {
    handleInstallRDP,
    handleInstallDockerRDP,
    handleVPSCredentials,
    handleWindowsSelection,
    showWindowsSelection,
    handlePageNavigation,
    handleCancelInstallation,
    handleDedicatedOSSelection,
    showDedicatedOSSelection,
    handleInstallDedicatedRDP
};

module.exports = {
    handleInstallRDP,
    handleInstallDockerRDP,
    handleVPSCredentials,
    handleWindowsSelection,
    showWindowsSelection,
    handlePageNavigation,
    handleCancelInstallation,
    handleDedicatedOSSelection,
    showDedicatedOSSelection,
    handleInstallDedicatedRDP
};