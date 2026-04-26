const { get, run } = require('../config/database');

const COMMISSION_RATE = 0.10; // 10%

const awardCommission = async (bot, refereeId, purchaseAmount, productType) => {
    try {
        const referral = await get('SELECT referrer_id FROM referrals WHERE referee_id = ?', [refereeId]);

        if (referral) {
            const commissionAmount = purchaseAmount * COMMISSION_RATE;
            const referrerId = referral.referrer_id;

            // Add commission to referrer's balance
            await run('UPDATE users SET commission_balance = commission_balance + ? WHERE telegram_id = ?', [commissionAmount, referrerId]);

            // Log the commission
            await run(
                'INSERT INTO commissions (referrer_id, referee_id, purchase_amount, commission_amount, product_type) VALUES (?, ?, ?, ?, ?)',
                [referrerId, refereeId, purchaseAmount, commissionAmount, productType]
            );

            // Notify the referrer
            try {
                const refereeUser = await bot.telegram.getChat(refereeId);
                await bot.telegram.sendMessage(referrerId, 
                    `🎉 Anda mendapatkan komisi sebesar Rp ${commissionAmount.toLocaleString('id-ID')} dari pembelian ${productType} oleh ${refereeUser.first_name}!`
                );
            } catch (error) {
                console.error(`Failed to send commission notification to user ${referrerId}:`, error);
            }
        }
    } catch (error) {
        console.error('Error awarding commission:', error);
    }
};

module.exports = { awardCommission };
