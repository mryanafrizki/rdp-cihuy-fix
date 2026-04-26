const { get } = require('../config/database');

/**
 * Gets the currently active promotion for a given service type.
 * @param {string} serviceType - The type of service (e.g., 'docker_rdp', 'vps_regular').
 * @returns {Promise<object|null>} The promotion object if an active one is found, otherwise null.
 */
async function getActivePromo(serviceType) {
    try {
        const promo = await get(
            'SELECT * FROM promotions WHERE service_type = ? AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP',
            [serviceType]
        );
        return promo;
    } catch (error) {
        console.error(`Error getting active promo for ${serviceType}:`, error);
        return null;
    }
}

/**
 * Calculates the discounted price.
 * @param {number} originalPrice - The original price of the service.
 * @param {object} promo - The promotion object.
 * @returns {number} The discounted price.
 */
function calculateDiscountedPrice(originalPrice, promo) {
    if (!promo || !promo.discount_percentage) {
        return originalPrice;
    }
    const discount = (originalPrice * promo.discount_percentage) / 100;
    return Math.round(originalPrice - discount);
}

module.exports = {
    getActivePromo,
    calculateDiscountedPrice,
};