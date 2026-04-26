const { WINDOWS_VERSIONS, DEDICATED_OS_VERSIONS } = require('../../config/constants');
const { exec } = require('child_process');
const { installRDP } = require('../../utils/rdpInstaller');
const { installDedicatedRDP } = require('../../utils/dedicatedRdpInstaller');
const safeMessageEditor = require('../../utils/safeMessageEdit');

// --- Localized Utility Functions ---

async function checkBalance(db, userId, amount, adminId) {
    if (userId.toString() === adminId) {
        return true; // Admin has unlimited balance
    }
    const user = await db.get('SELECT balance FROM users WHERE telegram_id = ?', [userId]);
    return user && user.balance >= amount;
}

async function deductBalance(db, userId, amount, adminId) {
    if (userId.toString() === adminId) {
        return true; // Admin is not charged
    }
    const user = await db.get('SELECT balance FROM users WHERE telegram_id = ?', [userId]);
    if (user && user.balance >= amount) {
        await db.run('UPDATE users SET balance = balance - ? WHERE telegram_id = ?', [amount, userId]);
        return true;
    }
    return false;
}

// --- RDP Installation Handlers (Adapted for Rented Bots) ---

async function handleInstallRDP(bot, chatId, messageId, prices) {
    const message = `🖥️ *Pilih Jenis Instalasi RDP:*\n\n` + 
        `🐳 *Docker RDP* - Rp ${prices.docker.toLocaleString('id-ID')}\n` + 
        `• Cepat (10-15 mnt), berbagai Windows.\n\n` + 
        `🖥️ *Dedicated RDP* - Rp ${prices.dedicated.toLocaleString('id-ID')}\n` + 
        `• Performa Penuh (30-45 mnt), Windows diinstal langsung.`;

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🐳 Docker RDP', callback_data: 'install_docker_rdp' }],
                [{ text: '🖥️ Dedicated RDP', callback_data: 'install_dedicated_rdp' }],
                [{ text: '🔙 Kembali', callback_data: 'start_menu' }]
            ]
        }
    });
}

async function handleInstallDockerRDP(bot, chatId, messageId, sessionManager, db, prices, adminId) {
    const isRenterAdmin = chatId.toString() === adminId;
    if (!isRenterAdmin && !await checkBalance(db, chatId, prices.docker)) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, `❌ Saldo tidak cukup.`, { reply_markup: { inline_keyboard: [[{ text: '💰 Deposit', callback_data: 'deposit' }]]}});
    }

    const session = { installType: 'docker', step: 'waiting_ip', messageId };
    sessionManager[chatId] = session;

    const priceString = isRenterAdmin ? 'Gratis (Admin)' : `Rp ${prices.docker.toLocaleString('id-ID')}`;
    const message = `🐳 *Instalasi Docker RDP*\n\n` + 
        `💰 Harga: ${priceString}\n` + 
        `⚠️ *PENTING:* VPS Wajib Fresh Install Ubuntu 22.04.\n\n` + 
        `🌐 Silakan masukkan *IP Address* VPS Anda:`;

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'cancel_installation' }]] }
    });
}

async function handleInstallDedicatedRDP(bot, chatId, messageId, sessionManager, db, prices, adminId) {
    const isRenterAdmin = chatId.toString() === adminId;
    if (!isRenterAdmin && !await checkBalance(db, chatId, prices.dedicated)) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, `❌ Saldo tidak cukup.`, { reply_markup: { inline_keyboard: [[{ text: '💰 Deposit', callback_data: 'deposit' }]]}});
    }

    const session = { installType: 'dedicated', step: 'waiting_ip', messageId };
    sessionManager[chatId] = session;

    const priceString = isRenterAdmin ? 'Gratis (Admin)' : `Rp ${prices.dedicated.toLocaleString('id-ID')}`;
    const message = `🖥️ *Instalasi Dedicated RDP*\n\n` + 
        `💰 Harga: ${priceString}\n` + 
        `⚠️ *PENTING:* VPS Wajib Fresh Install Ubuntu (18.04+) atau Debian (10+).\n\n` + 
        `🌐 Silakan masukkan *IP Address* VPS Anda:`;

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'cancel_installation' }]] }
    });
}

async function handleCredentialsInput(bot, msg, sessionManager, db, prices, adminId) {
    const chatId = msg.chat.id;
    const session = sessionManager[chatId];
    if (!session) return;

    bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    if (session.step === 'waiting_ip') {
        session.ip = msg.text.trim();
        session.step = 'waiting_password';
        await safeMessageEditor.editMessage(bot, chatId, session.messageId, '🔑 Masukkan *Password Root* VPS Anda:', { parse_mode: 'Markdown' });
    } else if (session.step === 'waiting_password') {
        session.password = msg.text.trim();
        session.step = 'selecting_os';
        await showOSSelection(bot, chatId, session.messageId, session.installType);
    } else if (session.step === 'waiting_rdp_password') {
        session.rdpPassword = msg.text.trim();
        await processInstallation(bot, chatId, session, db, prices, adminId);
    }
}

async function showOSSelection(bot, chatId, messageId, installType) {
    const versions = installType === 'docker' ? WINDOWS_VERSIONS : DEDICATED_OS_VERSIONS;
    const keyboard = versions.map(os => ([{
        text: os.name,
        callback_data: `select_os_${installType}_${os.id || os.version}`
    }]));
    keyboard.push([{ text: '❌ Batal', callback_data: 'cancel_installation' }]);

    await safeMessageEditor.editMessage(bot, chatId, messageId, '💿 Silakan pilih versi Windows:', {
        reply_markup: { inline_keyboard: keyboard }
    });
}

async function handleOSSelection(bot, query, sessionManager) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const session = sessionManager[chatId];
    if (!session) return;

    const [, , installType, osId] = query.data.split('_');
    const versions = installType === 'docker' ? WINDOWS_VERSIONS : DEDICATED_OS_VERSIONS;
    const selectedOS = versions.find(os => (os.id || os.version) == osId);

    if (!selectedOS) {
        return bot.answerCallbackQuery(query.id, { text: 'Pilihan OS tidak valid.', show_alert: true });
    }

    session.selectedOS = selectedOS;
    session.step = 'waiting_rdp_password';

    const message = `Anda memilih: *${selectedOS.name}*.\n\n` + 
        'Sekarang, masukkan password baru untuk RDP Anda (minimal 8 karakter, berisi huruf dan angka).';

    await safeMessageEditor.editMessage(bot, chatId, messageId, message, { parse_mode: 'Markdown' });
}

async function processInstallation(bot, chatId, session, db, prices, adminId) {
    const { installType, ip, password, rdpPassword, selectedOS, messageId } = session;
    const price = installType === 'docker' ? prices.docker : prices.dedicated;

    if (!await deductBalance(db, chatId, price, adminId)) {
        return safeMessageEditor.editMessage(bot, chatId, messageId, '❌ Saldo Anda tidak mencukupi untuk menyelesaikan instalasi.');
    }

    await safeMessageEditor.editMessage(bot, chatId, messageId, '🚀 Memulai instalasi... Ini akan memakan waktu. Anda akan menerima notifikasi setelah selesai.');

    const installFunction = installType === 'docker' ? installRDP : installDedicatedRDP;
    const options = installType === 'docker' 
        ? { windowsId: selectedOS.id, password: rdpPassword, isArm: false, supportsKvm: true, cpu: 2, ram: 4, storage: 40 } // Specs are illustrative
        : { osVersion: selectedOS.version, password: rdpPassword };

    try {
        const result = await installFunction(ip, 'root', password, options);
        const port = installType === 'docker' ? 3389 : 8765;

        const successMessage = `✅ *Instalasi Selesai*\n\n` + 
            `*OS:* ${selectedOS.name}\n` + 
            `*IP:* \n\
${ip}:${port}\n` + 
            `*User:* \n\
administrator\n` + 
            `*Password:* \n\
${rdpPassword}`;

        await safeMessageEditor.editMessage(bot, chatId, messageId, successMessage, { parse_mode: 'Markdown' });

        await db.run(
            'INSERT INTO rdp_installations (user_id, ip_address, os_type, type, status, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
            [chatId, ip, selectedOS.name, installType, 'completed', new Date().toISOString()]
        );

    } catch (error) {
        console.error(`[Rented Bot] Installation failed for ${ip}:`, error);
        await safeMessageEditor.editMessage(bot, chatId, messageId, `❌ Instalasi gagal: ${error.message}`);
        // Refund user if installation fails and they are not admin
        if (chatId.toString() !== adminId) {
            await db.run('UPDATE users SET balance = balance + ? WHERE telegram_id = ?', [price, chatId]);
        }
    }
}

async function handleCancelInstallation(bot, chatId, messageId, sessionManager) {
    delete sessionManager[chatId];
    await safeMessageEditor.editMessage(bot, chatId, messageId, 'Instalasi dibatalkan.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu', callback_data: 'start_menu' }]] }
    });
}

module.exports = {
    handleInstallRDP,
    handleInstallDockerRDP,
    handleInstallDedicatedRDP,
    handleCredentialsInput,
    handleOSSelection,
    handleCancelInstallation
};