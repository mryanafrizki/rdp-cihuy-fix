const { get, run } = require('../config/database');

const DOCKER_RDP_PRICE_KEY = 'docker_rdp_price';
const DEDICATED_RDP_PRICE_KEY = 'dedicated_rdp_price';

const DEFAULT_DOCKER_PRICE = 1000;
const DEFAULT_DEDICATED_PRICE = 3000;

async function getPrice(key, defaultValue) {
    const row = await get('SELECT value FROM admin_settings WHERE key = ?', [key]);
    if (row) {
        return parseInt(row.value, 10);
    }
    // If not in DB, set it to default
    await run('INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)', [key, defaultValue.toString()]);
    return defaultValue;
}

async function setPrice(key, value) {
    await run('UPDATE admin_settings SET value = ? WHERE key = ?', [value.toString(), key]);
}

async function getDockerRdpPrice() {
    return getPrice(DOCKER_RDP_PRICE_KEY, DEFAULT_DOCKER_PRICE);
}

async function getDedicatedRdpPrice() {
    return getPrice(DEDICATED_RDP_PRICE_KEY, DEFAULT_DEDICATED_PRICE);
}

async function setDockerRdpPrice(price) {
    return setPrice(DOCKER_RDP_PRICE_KEY, price);
}

async function setDedicatedRdpPrice(price) {
    return setPrice(DEDICATED_RDP_PRICE_KEY, price);
}

module.exports = {
    getDockerRdpPrice,
    getDedicatedRdpPrice,
    setDockerRdpPrice,
    setDedicatedRdpPrice
};
