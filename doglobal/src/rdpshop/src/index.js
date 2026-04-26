require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { scheduleJob } = require('node-schedule');
const { handleInstallRDP, handleInstallDockerRDP, handleVPSCredentials, handleWindowsSelection, showWindowsSelection, handlePageNavigation, handleCancelInstallation, handleDedicatedOSSelection, showDedicatedOSSelection } = require('./handlers/rdpHandler');
const { handleInstallDedicatedRDP, handleDedicatedVPSCredentials } = require('./handlers/dedicatedRdpHandler');
const { handleDeposit, handleDepositAmount, handlePendingPayment } = require('./handlers/depositHandler');
const { handleAddBalance, processAddBalance, handleBroadcast, processBroadcast, handleSetPrices, handleSetDockerRdpPrice, handleSetDedicatedRdpPrice, processNewPrice, handleAdminManageRentedBots, handleSuspendRentedBot, handleAdminAddRentedBotBalance, handleAdminSelectRentedBot, processAdminAddRentedBotBalance, handlePromoMenu, handleCreatePromo, handleViewPromos, handleDeletePromo, handleEditPromo, processPromoServiceType, processPromoDiscount, processPromoDuration, processDeletePromo, processEditPromo, handleEditPromoDiscount, processEditPromoDiscount, handleEditPromoServiceType, processEditPromoServiceType, handleEditPromoStartDate, processEditPromoStartDate, handleEditPromoEndDate, processEditPromoEndDate, handleAtlanticMenu, handleAtlanticCheckBalance } = require('./handlers/adminHandler');
const UserManagementHandler = require('./handlers/userManagementHandler');
const DigitalOceanHandler = require('./handlers/digitalOceanHandler');
const VPSHandler = require('./handlers/vpsHandler');
const { handleFAQ } = require('./handlers/faqHandler');
const { handleTutorial } = require('./handlers/tutorialHandler');
const { handleProviders } = require('./handlers/providerHandler');
const { getUser, isAdmin, getBalance, getTotalUsers } = require('./utils/userManager');
const { maintenance, run, get, all } = require('./config/database');
const VPSProductManager = require('./config/vpsProducts');
const digitalOcean = require('./config/digitalOcean');
const { createMainMenu, createAdminMenu } = require('./utils/keyboard');
const PaymentTracker = require('./utils/paymentTracker');
const DatabaseBackup = require('./utils/dbBackup');
const { getUptime } = require('./utils/uptime');
const safeMessageEditor = require('./utils/safeMessageEdit');
const SessionManager = require('./utils/sessionManager');
const ErrorHandler = require('./utils/errorHandler');
const VPSExpirationHandler = require('./utils/vpsExpirationHandler');
const { handleWithdrawalRequest } = require('./handlers/withdrawalHandler');
const { setupReferralCommands, handleReferralMenu, showReferralMenu, handleAddBankAccount, handleWithdrawCommission, handleMyReferrals, handleApproveWithdrawal, handleRejectWithdrawal } = require('./handlers/referralHandler');
const rentBotHandler = require('./handlers/rentBotHandler');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is required');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const sessionManager = new SessionManager();
const errorHandler = new ErrorHandler(bot, sessionManager);
const vpsExpirationHandler = new VPSExpirationHandler(bot);

vpsExpirationHandler.start();

setupReferralCommands(bot, sessionManager);

const dbBackup = new DatabaseBackup(bot);

console.log('🤖 RDP Installation Bot started successfully!');
console.log(`📅 Started at: ${new Date().toLocaleString('id-ID')}`);

// Setup global error handlers
ErrorHandler.setupGlobalErrorHandlers();

scheduleJob('0 */6 * * *', () => {
    PaymentTracker.cleanupExpiredPayments();
    console.log('🧹 Cleaned up expired payments');
});

scheduleJob('0 */1 * * *', async () => { // Run every hour
    console.log('🧹 Checking for expired rented bots...');
    const expiredBots = await all('SELECT * FROM rented_bots WHERE status = \'active\' AND end_date <= CURRENT_TIMESTAMP');

    for (const botData of expiredBots) {
        console.log(`Bot ${botData.id} (${botData.bot_name}) has expired.`);
        await run('UPDATE rented_bots SET status = \'expired\' WHERE id = ?', [botData.id]);

        if (botData.process_id) {
            try {
                process.kill(botData.process_id, 'SIGTERM');
                console.log(`Stopped expired bot process with PID: ${botData.process_id}`);
                await run('UPDATE rented_bots SET process_id = NULL WHERE id = ?', [botData.id]); // Clear PID
            } catch (error) {
                console.error(`Error stopping expired bot PID ${botData.process_id}:`, error);
            }
        }
    }
});

dbBackup.scheduleBackup();

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

const getWelcomeMessage = async (chatId, firstName) => {
    const balance = await getBalance(chatId);
    const isUserAdmin = isAdmin(chatId);

    const stats = await maintenance.getStats();
    const totalVps = await VPSProductManager.getTotalVPSOrders();
    const totalVpsRdp = await VPSProductManager.getTotalVPSRDPOrders();
    const token = await VPSProductManager.getDOToken(process.env.ADMIN_ID);
    let totalDroplets = 0;
    if (token) {
        digitalOcean.setToken(process.env.ADMIN_ID, token);
        const droplets = await digitalOcean.getDroplets(process.env.ADMIN_ID);
        totalDroplets = droplets.length;
    }

    const welcomeMessage = `🎉 *Selamat datang di AtlasCloudBot!*\n\n` +
        `👋 Halo ${firstName || 'User'}!\n\n` +
        `💰 *Saldo:* ${typeof balance === 'string' ? balance : `Rp ${balance.toLocaleString()}`}\n\n` +
        `📊 *Statistik Bot:*
` +
        `• Total Pengguna: ${stats.users}
` +
        `• Total Deposit: Rp ${stats.totalDeposits.toLocaleString()}
` +
        `• Total Stock VPS: ${totalDroplets}
` +
        `• Total VPS Terjual: ${totalVps}
` +
        `• Total RDP Terjual: ${totalVpsRdp}
` +
        `• Total Docker RDP Terinstall: ${stats.totalDockerRDPs}
` +
        `• Total Dedicated RDP Terinstall: ${stats.totalDedicatedRDPs}

` +
        `🚀 *Layanan Tersedia:*
` +
        `• Jasa Install RDP Docker
` +
        `• Jasa Install RDP Dedicated
` +
        `• VPS
` +
        `• RDP

` +
        `⏰ Uptime: ${getUptime()}`;

    const pendingPayment = await PaymentTracker.getPendingPayment(chatId);
    const keyboard = createMainMenu(isUserAdmin, !!pendingPayment, `https://t.me/${process.env.MAIN_ADMIN_USERNAME || 'masventot'}`);

    return { welcomeMessage, keyboard };
}

bot.onText(/^\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const refCode = match[1];

    try {
        await getUser(chatId);

        if (refCode) {
            const referrer = await get('SELECT telegram_id FROM users WHERE referral_code = ?', [refCode]);
            if (referrer && referrer.telegram_id !== chatId) {
                const existingReferral = await get('SELECT * FROM referrals WHERE referee_id = ?', [chatId]);
                if (!existingReferral) {
                    await run('INSERT INTO referrals (referrer_id, referee_id) VALUES (?, ?)', [referrer.telegram_id, chatId]);
                    try {
                        await bot.sendMessage(referrer.telegram_id, `🎉 Selamat! Pengguna baru, ${msg.from.first_name}, telah bergabung menggunakan link referral Anda.`);
                    } catch (error) {
                        console.error('Failed to send referral notification to referrer:', error);
                    }
                }
            }
        }

        const { welcomeMessage, keyboard } = await getWelcomeMessage(chatId, msg.from.first_name);
        await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', ...keyboard });

    } catch (error) {
        errorHandler.handleMessageError(error, msg);
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const user = query.from;

    try {
        if (data === 'back_to_menu') {
            sessionManager.clearAllSessions(chatId);
            const { welcomeMessage, keyboard } = await getWelcomeMessage(chatId, user.first_name);
            await safeMessageEditor.editMessage(bot, chatId, messageId, welcomeMessage, keyboard);
        }
                else if (data === 'admin_menu') {
            if (isAdmin(chatId)) {
                const adminMenuMessage = '👑 *Admin Menu*\n\nSilakan pilih salah satu opsi di bawah ini:';
                await safeMessageEditor.editMessage(bot, chatId, messageId, adminMenuMessage, { ...createAdminMenu() });
            }
        }
        else if (data === 'atlantic_menu') { if (isAdmin(chatId)) { await handleAtlanticMenu(bot, chatId, messageId); } }
        else if (data === 'atlantic_check_balance') { if (isAdmin(chatId)) { await handleAtlanticCheckBalance(bot, chatId, messageId); } }
        else if (data === 'promo_menu') { if (isAdmin(chatId)) { await handlePromoMenu(bot, chatId, messageId); } }
        else if (data === 'create_promo') { if (isAdmin(chatId)) { await handleCreatePromo(bot, chatId, messageId, sessionManager); } }
        else if (data === 'view_promos') { if (isAdmin(chatId)) { await handleViewPromos(bot, chatId, messageId); } }
        else if (data === 'delete_promo') { if (isAdmin(chatId)) { await handleDeletePromo(bot, query.message.chat.id, query.message.message_id, sessionManager); } }
        else if (data === 'edit_promo') { if (isAdmin(chatId)) { await handleEditPromo(bot, query.message.chat.id, query.message.message_id, sessionManager); } }
        else if (data === 'edit_promo_field_service_type') { if (isAdmin(chatId)) { await handleEditPromoServiceType(bot, query, sessionManager); } }
        else if (data.startsWith('promo_service_')) { if (isAdmin(chatId)) { await processPromoServiceType(bot, query, sessionManager); } }
        else if (data === 'edit_promo_field_discount') { if (isAdmin(chatId)) { await handleEditPromoDiscount(bot, query, sessionManager); } }
        else if (data === 'edit_promo_field_start_date') { if (isAdmin(chatId)) { await handleEditPromoStartDate(bot, query, sessionManager); } }
        else if (data === 'edit_promo_field_end_date') { if (isAdmin(chatId)) { await handleEditPromoEndDate(bot, query, sessionManager); } }
        else if (data === 'edit_promo_field_service_type') { if (isAdmin(chatId)) { await handleEditPromoServiceType(bot, query, sessionManager); } }
        else if (data === 'do_management') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleDOManagement(bot, chatId, messageId); } }
        else if (data === 'user_management') { if (isAdmin(chatId)) { await UserManagementHandler.handleUserManagement(bot, chatId, messageId); } }
        else if (data === 'install_rdp') { await handleInstallRDP(bot, chatId, messageId, sessionManager); }
        else if (data === 'vps_menu') { await VPSHandler.handleVPSMenu(bot, chatId, messageId); }
        else if (data === 'referral_menu') { await handleReferralMenu(bot, query); }
        else if (data === 'add_bank_account') { await handleAddBankAccount(bot, query); }
        else if (data === 'withdraw_commission') { await handleWithdrawCommission(bot, query); }
        else if (data === 'my_referrals') { await handleMyReferrals(bot, query); }
        else if (data === 'faq') { await handleFAQ(bot, query.message.chat.id, query.message.message_id); }
        else if (data === 'tutorial') { await handleTutorial(bot, query); }
        else if (data === 'providers') { await handleProviders(bot, query.message.chat.id, query.message.message_id); }
        // ... other handlers
        else if (data === 'deposit') { await handleDeposit(bot, chatId, messageId, sessionManager); }
        else if (data === 'check_pending_payment') { await handlePendingPayment(bot, chatId, messageId); }
        else if (data === 'add_balance') { if (isAdmin(chatId)) { await handleAddBalance(bot, chatId, messageId, sessionManager); } }
        else if (data === 'broadcast') { if (isAdmin(chatId)) { await handleBroadcast(bot, chatId, messageId, sessionManager); } }
        else if (data === 'set_prices') { if (isAdmin(chatId)) { await handleSetPrices(bot, chatId, messageId); } }
        else if (data === 'set_docker_rdp_price') { if (isAdmin(chatId)) { await handleSetDockerRdpPrice(bot, chatId, messageId, sessionManager); } }
        else if (data === 'set_dedicated_rdp_price') { if (isAdmin(chatId)) { await handleSetDedicatedRdpPrice(bot, chatId, messageId, sessionManager); } }
        else if (data === 'manage_db') { if (isAdmin(chatId)) { await dbBackup.handleManageDatabase(chatId, messageId); } }
        else if (data === 'backup_now') { if (isAdmin(chatId)) { await dbBackup.sendBackupToAdmin(chatId, messageId); } }
        
        // Rented Bot Management (Admin)
        else if (data === 'admin_manage_rented_bots') { if (isAdmin(chatId)) { await handleAdminManageRentedBots(bot, query); } }
        else if (data.startsWith('suspend_rented_bot_')) { if (isAdmin(chatId)) { await handleSuspendRentedBot(bot, query); } }
        else if (data === 'admin_add_rented_bot_balance') { if (isAdmin(chatId)) { await handleAdminAddRentedBotBalance(bot, query, sessionManager); } }
        else if (data.startsWith('admin_select_rented_bot_')) { if (isAdmin(chatId)) { await handleAdminSelectRentedBot(bot, query, sessionManager); } }

        // Bot Rental Flow (User)
        else if (data === 'rent_bot_menu') { await rentBotHandler.handleRentBotMenu(bot, query); }
        else if (data.startsWith('rent_bot_duration_')) { await rentBotHandler.handleSelectDuration(bot, query, sessionManager); }
        else if (data === 'confirm_rent_payment') { await rentBotHandler.handleConfirmRentPayment(bot, query, sessionManager); }
        else if (data === 'skip_payment_api_key') { await rentBotHandler.handleSkipPaymentApiKey(bot, query, sessionManager); }
        else if (data === 'cancel_rent_bot') { await rentBotHandler.handleCancelRentBot(bot, query, sessionManager); }
        else if (data === 'manage_rented_bots') { await rentBotHandler.handleManageRentedBots(bot, query); }
        else if (data.startsWith('view_rented_bot_details_')) { await rentBotHandler.handleViewRentedBotDetails(bot, query); }
        else if (data.startsWith('renew_rented_bot_')) { await rentBotHandler.handleRenewRentedBot(bot, query, sessionManager); }
        else if (data.startsWith('confirm_renew_payment_')) { await rentBotHandler.handleConfirmRenewPayment(bot, query, sessionManager); }
        else if (data.startsWith('stop_rented_bot_')) { await rentBotHandler.handleStopRentedBot(bot, query); }
        else if (data.startsWith('start_rented_bot_')) { await rentBotHandler.handleStartRentedBot(bot, query); }
        else if (data.startsWith('delete_rented_bot_')) { await rentBotHandler.handleDeleteRentedBot(bot, query); }
        else if (data.startsWith('confirm_delete_rented_bot_')) { await rentBotHandler.handleConfirmDeleteRentedBot(bot, query); }

        // Digital Ocean Handlers
        else if (data === 'set_do_token') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleSetDOToken(bot, chatId, messageId, sessionManager); } }
        else if (data === 'view_droplets') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleViewDroplets(bot, chatId, messageId); } }
        else if (data === 'manage_vps_products') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleManageVPSProducts(bot, chatId, messageId); } }
        else if (data === 'view_regions') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleViewRegions(bot, chatId, messageId); } }
        else if (data === 'view_sizes') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleViewSizes(bot, chatId, messageId); } }
        else if (data === 'add_vps_product') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleAddVPSProduct(bot, chatId, messageId); } }
        else if (data.startsWith('add_vps_product_page_')) { if (isAdmin(chatId)) { const page = parseInt(data.split('_')[4]); await DigitalOceanHandler.handleAddVPSProduct(bot, chatId, messageId, page); } }
        else if (data === 'delete_vps_product') { if (isAdmin(chatId)) { await DigitalOceanHandler.handleDeleteVPSProduct(bot, chatId, messageId); } }
        else if (data.startsWith('confirm_delete_product_')) { if (isAdmin(chatId)) { await DigitalOceanHandler.handleConfirmDeleteProduct(bot, query); } }
        else if (data.startsWith('delete_product_')) { if (isAdmin(chatId)) { await DigitalOceanHandler.processDeleteProduct(bot, query); } }
        else if (data.startsWith('select_size_')) { if (isAdmin(chatId)) { await DigitalOceanHandler.handleSelectSize(bot, query, sessionManager); } }
        else if (data.startsWith('delete_droplet_direct_')) { if (isAdmin(chatId)) { await DigitalOceanHandler.handleDeleteDropletDirect(bot, query); } }
        else if (data.startsWith('confirm_delete_droplet_direct_')) { if (isAdmin(chatId)) { await DigitalOceanHandler.handleConfirmDeleteDropletDirect(bot, query); } }

        // User Management Handlers
        else if (data === 'view_all_users') { if (isAdmin(chatId)) { await UserManagementHandler.handleViewAllUsers(bot, chatId, messageId); } }
        else if (data.startsWith('users_page_')) { if (isAdmin(chatId)) { const page = parseInt(data.split('_')[2]); await UserManagementHandler.handleViewAllUsers(bot, chatId, messageId, page); } }
        else if (data === 'search_user') { if (isAdmin(chatId)) { await UserManagementHandler.handleSearchUser(bot, chatId, messageId, sessionManager); } }
        else if (data === 'user_statistics') { if (isAdmin(chatId)) { await UserManagementHandler.handleUserStatistics(bot, chatId, messageId); } }
        else if (data.startsWith('manage_user_balance_')) { if (isAdmin(chatId)) { await UserManagementHandler.handleManageUserBalance(bot, query, sessionManager); } }
        else if (data.startsWith('delete_user_')) { if (isAdmin(chatId)) { await UserManagementHandler.handleDeleteUser(bot, query); } }
        else if (data.startsWith('confirm_delete_user_')) { if (isAdmin(chatId)) { await UserManagementHandler.confirmDeleteUser(bot, query); } }

        // RDP Handlers
        else if (data === 'install_docker_rdp') { await handleInstallDockerRDP(bot, chatId, messageId, sessionManager); }
        else if (data === 'install_dedicated_rdp') { await handleInstallDedicatedRDP(bot, chatId, messageId, sessionManager); }
        else if (data === 'continue_no_kvm') { await showWindowsSelection(bot, chatId, messageId); }
        else if (data === 'show_windows_selection') { await showWindowsSelection(bot, chatId, messageId); }
        else if (data.startsWith('windows_')) { await handleWindowsSelection(bot, query, sessionManager); }
        else if (data.startsWith('page_image_')) { await VPSHandler.handleImagePage(bot, query, sessionManager); }
        else if (data.startsWith('page_')) { await handlePageNavigation(bot, query, sessionManager); }
        else if (data === 'cancel_installation') { await handleCancelInstallation(bot, query, sessionManager); }
        else if (data === 'show_dedicated_os_selection') { await showDedicatedOSSelection(bot, chatId, messageId, sessionManager); }
        else if (data.startsWith('dedicated_os_')) { await handleDedicatedOSSelection(bot, query, sessionManager); }

        // VPS Handlers
        else if (data === 'vps_regular') { await VPSHandler.handleVPSRegular(bot, chatId, messageId); }
        else if (data === 'vps_rdp') { await VPSHandler.handleVPSRDP(bot, chatId, messageId); }
        else if (data.startsWith('my_vps_orders')) { const page = parseInt(data.split('_')[3]) || 0; await VPSHandler.handleMyVPSOrders(bot, chatId, messageId, page); }
        else if (data.startsWith('select_vps_regular_')) { await VPSHandler.handleSelectVPSRegular(bot, query, sessionManager); }
        else if (data.startsWith('select_vps_rdp_')) { await VPSHandler.handleSelectVPSRDP(bot, query, sessionManager); }
        else if (data.startsWith('select_region_')) { await VPSHandler.handleSelectRegion(bot, query, sessionManager); }
        else if (data.startsWith('select_image_')) { await VPSHandler.handleSelectImage(bot, query, sessionManager); }
        else if (data.startsWith('page_image_')) { await VPSHandler.handleImagePage(bot, query, sessionManager); }
        else if (data.startsWith('vps_windows_')) { await VPSHandler.handleWindowsSelection(bot, query, sessionManager); }
        else if (data.startsWith('reboot_droplet_')) { await VPSHandler.handleRebootDroplet(bot, query); }
        else if (data.startsWith('delete_droplet_')) { await VPSHandler.handleDeleteDroplet(bot, query); }
        else if (data.startsWith('confirm_delete_droplet_')) { await VPSHandler.handleConfirmDeleteDroplet(bot, query); }

        // Fallback answer
        else {
            await bot.answerCallbackQuery(query.id);
        }

    } catch (error) {
        errorHandler.handleCallbackError(error, query);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text || msg.text.startsWith('/')) return;

    try {
        const adminSession = sessionManager.getAdminSession(chatId);
        if (adminSession && isAdmin(chatId)) {
            if (adminSession.action === 'add_balance') { return processAddBalance(bot, msg, sessionManager); }
            if (adminSession.action === 'broadcast') { return processBroadcast(bot, msg, sessionManager); }
            if (adminSession.action === 'set_price') { return processNewPrice(bot, msg, sessionManager); }
            if (adminSession.action === 'add_rented_bot_balance') { return processAdminAddRentedBotBalance(bot, msg, sessionManager); }
            if (adminSession.action === 'set_do_token') { return DigitalOceanHandler.processDOToken(bot, msg, sessionManager); }
            if (adminSession.action === 'set_vps_price') { return DigitalOceanHandler.processVPSPrice(bot, msg, sessionManager); }
            if (adminSession.action === 'search_user') { return UserManagementHandler.processSearchUser(bot, msg, sessionManager); }
            if (adminSession.action === 'manage_user_balance') { return UserManagementHandler.processManageUserBalance(bot, msg, sessionManager); }
            if (adminSession.action === 'create_promo_discount') { return processPromoDiscount(bot, msg, sessionManager); }
            if (adminSession.action === 'create_promo_duration') { return processPromoDuration(bot, msg, sessionManager); }
            if (adminSession.action === 'process_edit_promo_start_date') { return processEditPromoStartDate(bot, msg, sessionManager); }
            if (adminSession.action === 'process_edit_promo_end_date') { return processEditPromoEndDate(bot, msg, sessionManager); }
            if (adminSession.action === 'delete_promo') { return processDeletePromo(bot, msg, sessionManager); }
    if (adminSession.action === 'edit_promo') { return processEditPromo(bot, msg, sessionManager); }
    if (adminSession.action === 'process_edit_promo_discount') { return processEditPromoDiscount(bot, msg, sessionManager); }
        }

        const userSession = sessionManager.getUserSession(chatId);
        if (userSession && userSession.awaiting) {
            switch (userSession.awaiting) {
                case 'bot_token_input': return rentBotHandler.handleBotTokenInput(bot, msg, sessionManager);
                case 'bot_name_input': return rentBotHandler.handleBotNameInput(bot, msg, sessionManager);
                case 'admin_telegram_id_input': return rentBotHandler.handleAdminTelegramIdInput(bot, msg, sessionManager);
                case 'owner_username_input': return rentBotHandler.handleOwnerUsernameInput(bot, msg, sessionManager);
                case 'payment_api_key_input': return rentBotHandler.handlePaymentApiKeyInput(bot, msg, sessionManager);
            }
        }
        
        const session = sessionManager.getUserSession(chatId);
        if (session && session.step) {
            switch (session.step) {
                case 'waiting_ip':
                case 'waiting_password':
                case 'waiting_rdp_password':
                    return handleVPSCredentials(bot, msg, sessionManager);
                case 'rdp_password':
                    return VPSHandler.handleRDPPassword(bot, msg, sessionManager);
                case 'waiting_amount':
                    return handleDepositAmount(bot, msg, session);
            }
        }

    } catch (error) {
        errorHandler.handleMessageError(error, msg);
    }
});

process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down bot gracefully...');
    await bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down...');
    await bot.stopPolling();
    process.exit(0);
});

module.exports = { bot, sessionManager };
