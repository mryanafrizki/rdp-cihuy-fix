// Standardized button texts and callback data
const BUTTONS = {
    // Navigation buttons
    BACK_TO_MENU: { text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' },
    BACK_TO_WINDOWS: { text: '« Kembali', callback_data: 'back_to_windows' },
    BACK_TO_DEDICATED_OS: { text: '« Kembali', callback_data: 'back_to_dedicated_os' },
    BACK: { text: '« Kembali', callback_data: 'back_to_menu' },
    
    // Action buttons
    CANCEL: { text: '❌ Batal', callback_data: 'cancel_installation' },
    CANCEL_PAYMENT: { text: '❌ Batalkan', callback_data: 'cancel_payment' },
    CONTINUE: { text: '✅ Lanjutkan', callback_data: 'continue_no_kvm' },
    TRY_AGAIN: { text: '🔄 Coba Lagi', callback_data: 'try_again' },
    TRY_AGAIN_VPS_REGULAR: { text: '🔄 Coba Lagi', callback_data: 'vps_regular' },
    TRY_AGAIN_VPS_RDP: { text: '🔄 Coba Lagi', callback_data: 'vps_rdp' },
    
    // Service buttons
    DEPOSIT: { text: '💰 Deposit', callback_data: 'deposit' },
    TUTORIAL: { text: '📚 Tutorial', callback_data: 'tutorial' },
    FAQ: { text: '❓ FAQ', callback_data: 'faq' },
    PROVIDERS: { text: '🏢 Provider', callback_data: 'providers' },
    
    // RDP buttons
    INSTALL_RDP: { text: '🖥️ Install RDPmu', callback_data: 'install_rdp' },
    DOCKER_RDP: { text: '🐳 Docker RDP (Rp 1.000)', callback_data: 'install_docker_rdp' },
    DEDICATED_RDP: { text: '🖥️ Dedicated RDP (Rp 3.000)', callback_data: 'install_dedicated_rdp' },
    
    // Admin buttons
    ADMIN_MENU: { text: '👑 Menu Admin', callback_data: 'admin_menu' },
    ADD_BALANCE: { text: '💳 Tambah Saldo', callback_data: 'add_balance' },
    BROADCAST: { text: '📢 Broadcast', callback_data: 'broadcast' },
    MANAGE_DB: { text: '📊 Database', callback_data: 'manage_db' },
    ADMIN_MANAGE_RENTED_BOTS: { text: '🤖 Kelola Bot Sewa (Admin)', callback_data: 'admin_manage_rented_bots' },
    BACK_TO_ADMIN_MANAGE_RENTED_BOTS: { text: '🔙 Kembali', callback_data: 'admin_manage_rented_bots' },
    MANAGE_RENTED_BOTS: { text: '🤖 Kelola Bot Sewa', callback_data: 'manage_rented_bots' },
    BACK_TO_MANAGE_RENTED_BOTS: { text: '🔙 Kembali', callback_data: 'manage_rented_bots' },
    CANCEL_TO_MANAGE_RENTED_BOTS: { text: 'Batal', callback_data: 'manage_rented_bots' },
    SET_PRICES: { text: '💰 Atur Harga', callback_data: 'set_prices' },
    SET_DOCKER_RDP_PRICE: { text: '🐳 Docker RDP', callback_data: 'set_docker_rdp_price' },
    SET_DEDICATED_RDP_PRICE: { text: '🖥️ Dedicated RDP', callback_data: 'set_dedicated_rdp_price' },
    ADMIN_ADD_RENTED_BOT_BALANCE: { text: '💳 Saldo Bot Sewaan', callback_data: 'admin_add_rented_bot_balance' },
    PROMO: { text: '🎉 Promo', callback_data: 'promo_menu' },
    
    // VPS buttons
    VPS_MENU: { text: '🖥️ VPS Services', callback_data: 'vps_menu' },
    VPS_REGULAR: { text: '🖥️ VPS Biasa', callback_data: 'vps_regular' },
    VPS_RDP: { text: '🪟 VPS + RDP', callback_data: 'vps_rdp' },
    MY_VPS_ORDERS: { text: '📋 Pesanan Saya', callback_data: 'my_vps_orders' },
    ORDER_VPS: { text: '🖥️ Pesan VPS', callback_data: 'vps_menu' },
    REFRESH_MY_ORDERS: { text: '🔄 Refresh', callback_data: 'my_vps_orders' },
    BACK_TO_VPS_MENU: { text: '« Kembali', callback_data: 'vps_menu' },
    BACK_TO_VPS_REGULAR: { text: '« Kembali', callback_data: 'vps_regular' },
    BACK_TO_VPS_RDP: { text: '« Kembali', callback_data: 'vps_rdp' },
    
    // Admin management buttons
    USER_MANAGEMENT: { text: '👥 Kelola User', callback_data: 'user_management' },
    BACK_TO_USER_MANAGEMENT: { text: '« Kembali', callback_data: 'user_management' },
    CANCEL_TO_USER_MANAGEMENT: { text: '❌ Batal', callback_data: 'user_management' },
    SEARCH_USER: { text: '🔍 Cari User', callback_data: 'search_user' },
    BACK_TO_SEARCH_USER: { text: '« Kembali', callback_data: 'search_user' },
    DO_MANAGEMENT: { text: '🌊 Digital Ocean', callback_data: 'do_management' },
    ATLANTIC_MENU: { text: '💳 Atlantic H2H', callback_data: 'atlantic_menu' },
    
    // Copy buttons
    COPY_RDP: { text: '📋 Copy Detail RDP', callback_data: 'copy_rdp' },
    COPY_SERVER: { text: '📋 Copy Server', callback_data: 'copy_server' },
    COPY_PASSWORD: { text: '📋 Copy Password', callback_data: 'copy_pass' },
    COPY_HOSTNAME: { text: '📋 Copy Hostname', callback_data: 'copy_hostname' },
    
    // Guide buttons
    RDP_GUIDE: { text: '📖 Panduan Koneksi', callback_data: 'rdp_connection_guide' },
    TEST_RDP: { text: '🔍 Test RDP Manual', callback_data: 'test_rdp' },
    CHECK_RDP: { text: '🔍 Cek Status RDP', callback_data: 'check_rdp' },
    
    // Payment buttons
    CHECK_PAYMENT: { text: '📋 Tagihan Pembayaran Kamu', callback_data: 'check_pending_payment' },
    BACKUP_NOW: { text: '💾 Backup Sekarang', callback_data: 'backup_now' },

    // Referral buttons
    REFERRAL: { text: '🤝 Referral', callback_data: 'referral_menu' },
    ADD_EDIT_BANK_ACCOUNT: { text: '➕ Tambah/Ubah Rekening', callback_data: 'add_bank_account' },
    WITHDRAW_COMMISSION: { text: '💸 Tarik Komisi', callback_data: 'withdraw_commission' },
    MY_REFERRALS: { text: '👥 Cek Referral Saya', callback_data: 'my_referrals' },
    CONFIRM_WITHDRAWAL: { text: '✅ Konfirmasi Penarikan', callback_data: 'confirm_withdrawal' },
    CANCEL_WITHDRAWAL: { text: '❌ Batalkan Penarikan', callback_data: 'cancel_withdrawal' },

    // New button for bot rental
    RENT_BOT: { text: '🤖 Sewa Bot', callback_data: 'rent_bot_menu' },
    WIN_10_ATLAS: { text: 'Windows 10 Atlas', callback_data: 'install_win_10_atlas' }
};

// Helper functions to create button arrays
const createButtonRow = (...buttons) => [buttons];
const createButtonGrid = (buttons) => buttons.map(row => row.map(btn => BUTTONS[btn]));

// Common button combinations
const BUTTON_COMBINATIONS = {
    BACK_ONLY: [BUTTONS.BACK_TO_MENU],
    CANCEL_ONLY: [BUTTONS.CANCEL],
    BACK_AND_CANCEL: [BUTTONS.BACK, BUTTONS.CANCEL],
    DEPOSIT_AND_BACK: [BUTTONS.DEPOSIT, BUTTONS.BACK_TO_MENU],
    TRY_AGAIN_AND_BACK: [BUTTONS.TRY_AGAIN, BUTTONS.BACK_TO_MENU],
    COPY_BUTTONS: [BUTTONS.COPY_RDP, BUTTONS.RDP_GUIDE, BUTTONS.BACK_TO_MENU],
    RDP_ACTIONS: [BUTTONS.COPY_SERVER, BUTTONS.COPY_PASSWORD, BUTTONS.COPY_HOSTNAME]
};

module.exports = {
    BUTTONS,
    createButtonRow,
    createButtonGrid,
    BUTTON_COMBINATIONS
};