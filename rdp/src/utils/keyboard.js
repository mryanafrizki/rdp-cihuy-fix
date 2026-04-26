const { BUTTONS } = require('../config/buttons');
const rdpPriceManager = require('./rdpPriceManager');

function createMainMenu(isAdmin = false, hasPendingPayment = false) {
    // Get current prices for dynamic buttons
    const prices = rdpPriceManager.getRdpPrices();
    const dockerPrice = prices.dockerRdpPrice || 1000;
    const dedicatedPrice = prices.dedicatedRdpPrice || 3000;
    
    const dockerPriceText = dockerPrice === 0 ? 'Gratis' : `Rp ${dockerPrice.toLocaleString('id-ID')}`;
    const dedicatedPriceText = dedicatedPrice === 0 ? 'Gratis' : `Rp ${dedicatedPrice.toLocaleString('id-ID')}`;
    
    // Create dynamic RDP buttons with current prices
    const DOCKER_RDP_BUTTON = { text: `🐳 Docker RDP (${dockerPriceText})`, callback_data: 'install_docker_rdp' };
    const DEDICATED_RDP_BUTTON = { text: `🖥️ Dedicated RDP (${dedicatedPriceText})`, callback_data: 'install_dedicated_rdp' };
    
    const keyboard = [
        [
            BUTTONS.INSTALL_RDP,
            BUTTONS.DEPOSIT
        ],
        [
            BUTTONS.TUTORIAL,
            BUTTONS.FAQ
        ],
        [
            BUTTONS.PROVIDERS,
            BUTTONS.GET_RDP_DATA
        ],
        [
            BUTTONS.LIST_MY_INSTALL
        ],
        [
            BUTTONS.HOME
        ]
    ];

    if (hasPendingPayment) {
        keyboard.splice(1, 0, [
            BUTTONS.CHECK_PAYMENT
        ]);
    }

    if (isAdmin) {
        keyboard.splice(1, 0, [
            BUTTONS.ADD_BALANCE,
            BUTTONS.BROADCAST
        ], [
            BUTTONS.MANAGE_DB,
            BUTTONS.ATLANTIC_ADMIN
        ]);
    }

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

module.exports = {
    createMainMenu
};


