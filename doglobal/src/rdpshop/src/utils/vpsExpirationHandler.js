const { scheduleJob } = require('node-schedule');
const VPSProductManager = require('../config/vpsProducts');
const digitalOcean = require('../config/digitalOcean');
const { isAdmin } = require('./userManager');

class VPSExpirationHandler {
    constructor(bot) {
        this.bot = bot;
    }

    start() {
        // Run every day at midnight
        scheduleJob('0 0 * * *', () => {
            this.checkExpirations();
        });
    }

    async checkExpirations() {
        try {
            const orders = await VPSProductManager.getAllActiveOrders();
            const now = new Date();

            for (const order of orders) {
                const expiresAt = new Date(order.expires_at);
                const sevenDaysBefore = new Date(expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000);

                if (now >= expiresAt) {
                    await this.deleteExpiredVPS(order);
                } else if (now >= sevenDaysBefore) {
                    await this.sendRenewalNotification(order);
                }
            }
        } catch (error) {
            console.error('Error checking VPS expirations:', error);
        }
    }

    async sendRenewalNotification(order) {
        try {
            const message = `⚠️ VPS Anda akan segera berakhir!\n\n` +
                `📦 **${order.product_name}**\n` +
                `🌐 IP Address: ${order.ip_address}\n` +
                `📅 Akan berakhir pada: ${new Date(order.expires_at).toLocaleDateString('id-ID')}\n\n` +
                `Silakan perpanjang untuk menghindari penghapusan.`;

            await this.bot.sendMessage(order.user_id, message, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `Perpanjang (Rp ${order.price.toLocaleString()})`, callback_data: `renew_vps_${order.id}` }
                        ]
                    ]
                }
            });
        } catch (error) {
            console.error(`Error sending renewal notification for order ${order.id}:`, error);
        }
    }

    async deleteExpiredVPS(order) {
        try {
            const adminToken = await VPSProductManager.getDOToken(order.admin_id);
            if (adminToken) {
                digitalOcean.setToken(order.admin_id, adminToken);
                await digitalOcean.deleteDroplet(order.admin_id, order.droplet_id);
            }
            await VPSProductManager.updateOrder(order.id, { status: 'terminated' });

            const message = `❌ VPS Anda telah dihapus karena telah berakhir.\n\n` +
                `📦 **${order.product_name}**\n` +
                `🌐 IP Address: ${order.ip_address}`;

            await this.bot.sendMessage(order.user_id, message);
        } catch (error) {
            console.error(`Error deleting expired VPS for order ${order.id}:`, error);
        }
    }
}

module.exports = VPSExpirationHandler;
