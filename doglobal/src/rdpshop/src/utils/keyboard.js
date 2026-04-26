const { BUTTONS } = require('../config/buttons');

function createMainMenu(isAdmin = false, hasPendingPayment = false, adminUrl = 'https://t.me/masventot', isRentedBot = false, hasPaymentApiKey = true) {
    let keyboard;

    if (isRentedBot) {
        keyboard = [
            [
                BUTTONS.INSTALL_RDP
            ],
            [
                BUTTONS.TUTORIAL,
                BUTTONS.FAQ
            ],
            [
                BUTTONS.PROVIDERS,
                { text: 'Hubungi Admin', url: adminUrl }
            ]
        ];
        if (hasPaymentApiKey) {
            keyboard[0].push(BUTTONS.DEPOSIT);
        }
    } else {
        keyboard = [
            [
                BUTTONS.INSTALL_RDP,
                BUTTONS.VPS_MENU,
                BUTTONS.RENT_BOT
            ],
            [
                BUTTONS.DEPOSIT,
                BUTTONS.REFERRAL
            ],
            [
                BUTTONS.TUTORIAL,
                BUTTONS.FAQ
            ],
            [
                BUTTONS.PROVIDERS,
                { text: 'Hubungi Admin', url: adminUrl }
            ]
        ];
    }

    if (hasPendingPayment) {
        keyboard.splice(1, 0, [
            BUTTONS.CHECK_PAYMENT
        ]);
    }

    if (isAdmin) {
        keyboard.splice(1, 0, [BUTTONS.ADMIN_MENU]);
    }

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

function createAdminMenu() {
    const keyboard = [
        [
            BUTTONS.ADD_BALANCE,
            BUTTONS.BROADCAST
        ],
        [
            BUTTONS.ADMIN_ADD_RENTED_BOT_BALANCE
        ],
        [
            BUTTONS.USER_MANAGEMENT,
            BUTTONS.DO_MANAGEMENT,
            BUTTONS.ATLANTIC_MENU
        ],
        [
            BUTTONS.MANAGE_DB,
            BUTTONS.SET_PRICES
        ],
        [
            BUTTONS.MANAGE_RENTED_BOTS,
            BUTTONS.PROMO
        ],
        [
            BUTTONS.BACK
        ]
    ];

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

function createVpsMenu() {
    const keyboard = [
        [
            BUTTONS.VPS_REGULAR,
            BUTTONS.VPS_RDP
        ],
        [
            BUTTONS.MY_VPS_ORDERS
        ],
        [
            BUTTONS.BACK_TO_MENU
        ]
    ];

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

function createRentedBotAdminMenu() {
    const keyboard = [
        [
            BUTTONS.BROADCAST,
            BUTTONS.USER_MANAGEMENT
        ],
        [
            BUTTONS.BACK
        ]
    ];

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

function createRentedBotMainMenu(adminUrl = 'https://t.me/masventot') {
    const keyboard = [
        [
            BUTTONS.INSTALL_RDP
        ],
        [
            BUTTONS.TUTORIAL,
            BUTTONS.FAQ
        ],
        [
            { text: 'Hubungi Owner', url: adminUrl }
        ]
    ];

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}


module.exports = {
    createMainMenu,
    createAdminMenu,
    createVpsMenu,
    createRentedBotAdminMenu,
    createRentedBotMainMenu
};