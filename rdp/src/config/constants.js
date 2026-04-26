const { WINDOWS_VERSIONS } = require('./windows');
const { VPS_CONFIGS, getInstallationCost, getDedicatedInstallationCost } = require('./vps');
const rdpPriceManager = require('../utils/rdpPriceManager');

// RDP Port Configuration (dapat dikonfigurasi via environment variable)
// Default: 22 (dapat diubah via RDP_PORT di env.txt)
const RDP_PORT = parseInt(process.env.RDP_PORT) || 22;

// Get current prices dynamically
const INSTALLATION_COST = getInstallationCost();
const DEDICATED_INSTALLATION_COST = getDedicatedInstallationCost();

/**
 * DEDICATED_OS_VERSIONS_TEMPLATE - List OS untuk RDP Dedicated
 * 
 * CARA MENAMBAHKAN OS BARU:
 * 1. Tambahkan object baru di array ini dengan format:
 *    { id: <nomor_berikutnya>, name: '<Nama OS>', version: '<kode_version>', priceMultiplier: 1.0 }
 * 
 * 2. Format version:
 *    - Standard: 'win_XX' (contoh: 'win_22', 'win_19')
 *    - Lite: 'win_XX_lite' (contoh: 'win_2022_lite')
 *    - UEFI: 'win_XX_uefi' (contoh: 'win_2022_uefi')
 *    - Special: 'win_10atlas', 'win_10ghost'
 * 
 * 3. Pastikan ID unik dan berurutan
 * 4. Semua OS = 1 kuota (priceMultiplier selalu 1.0)
 * 
 * Contoh menambahkan OS baru:
 * { id: 22, name: 'Windows Server 2026', version: 'win_2026', priceMultiplier: 1.0 }
 */
const DEDICATED_OS_VERSIONS_TEMPLATE = [
    // Windows 11
{ id: 1, name: 'Windows 11 ReviOS (new)', version: 'win_11revi_h25', priceMultiplier: 1.0 },
{ id: 2, name: 'Windows 11 AtlasOS H25 (new)', version: 'win_11atlas_h25', priceMultiplier: 1.0 },
{ id: 3, name: 'Windows 11 AtlasOS H22', version: 'win_11atlas_h22', priceMultiplier: 1.0 },
// { id: 4, name: 'Windows 11 Ghost', version: 'win_11ghost', priceMultiplier: 1.0 },
{ id: 4, name: 'Windows 11 Pro', version: 'win_11_pro', priceMultiplier: 1.0 },

// Windows 10
{ id: 5, name: 'Windows 10 AtlasOS', version: 'win_10atlas', priceMultiplier: 1.0 },
{ id: 6, name: 'Windows 10 Ghost', version: 'win_10ghost', priceMultiplier: 1.0 },
{ id: 7, name: 'Windows 10 Enterprise', version: 'win_10_ent', priceMultiplier: 1.0 },

// Windows Server
{ id: 8,  name: 'Windows Server 2025', version: 'win_2025', priceMultiplier: 1.0 },
{ id: 9, name: 'Windows Server 2022', version: 'win_22', priceMultiplier: 1.0 },
{ id: 10, name: 'Windows Server 2019', version: 'win_19', priceMultiplier: 1.0 },
{ id: 11, name: 'Windows Server 2016', version: 'win_2016', priceMultiplier: 1.0 },
{ id: 12, name: 'Windows Server 2012 R2', version: 'win_2012R2', priceMultiplier: 1.0 },
{ id: 13, name: 'Windows Server 2008', version: 'win_2008', priceMultiplier: 1.0 },

// Windows 7
{ id: 14, name: 'Windows 7', version: 'win_7', priceMultiplier: 1.0 },

// Windows Server Lite
{ id: 15, name: 'Windows Server 2022 Lite', version: 'win_2022_lite', priceMultiplier: 1.0 },
{ id: 16, name: 'Windows Server 2016 Lite', version: 'win_2016_lite', priceMultiplier: 1.0 },
{ id: 17, name: 'Windows Server 2012 R2 Lite', version: 'win_2012R2_lite', priceMultiplier: 1.0 },

// Windows 7 Lite
{ id: 18, name: 'Windows 7 SP1 Lite', version: 'win_7_sp1_lite', priceMultiplier: 1.0 },

// Windows Server UEFI
{ id: 19, name: 'Windows Server 2022 UEFI', version: 'win_2022_uefi', priceMultiplier: 1.0 },
{ id: 20, name: 'Windows Server 2019 UEFI', version: 'win_2019_uefi', priceMultiplier: 1.0 },
{ id: 21, name: 'Windows Server 2016 UEFI', version: 'win_2016_uefi', priceMultiplier: 1.0 },
{ id: 22, name: 'Windows Server 2012 R2 UEFI', version: 'win_2012R2_uefi', priceMultiplier: 1.0 },

// Windows 10/11 UEFI
{ id: 23, name: 'Windows 11 UEFI', version: 'win_11_uefi', priceMultiplier: 1.0 },
{ id: 24, name: 'Windows 10 UEFI', version: 'win_10_uefi', priceMultiplier: 1.0 },

];

/**
 * Get DEDICATED_OS_VERSIONS with quota-based pricing
 * Semua OS versions = 1 kuota (fixed)
 * Price dihitung berdasarkan pricePerQuota dari rdpPrice.json
 */
function getDedicatedOSVersions() {
    const prices = rdpPriceManager.getRdpPrices();
    const pricePerQuota = prices.pricePerQuota || 3000;
    
    // Semua OS versions = 1 kuota, harga = pricePerQuota
    return DEDICATED_OS_VERSIONS_TEMPLATE.map(os => ({
        id: os.id,
        name: os.name,
        version: os.version,
        price: pricePerQuota, // Semua jadi 1 kuota = pricePerQuota
        quota: 1 // Semua dedicated = 1 kuota
    }));
}

// Jangan export constant DEDICATED_OS_VERSIONS (akan dihapus, gunakan function getDedicatedOSVersions() saja)
// const DEDICATED_OS_VERSIONS = getDedicatedOSVersions(); // REMOVED - menyebabkan circular dependency

module.exports = {
    WINDOWS_VERSIONS,
    VPS_CONFIGS,
    INSTALLATION_COST,
    DEDICATED_INSTALLATION_COST,
    RDP_PORT, // Export RDP port constant
    // DEDICATED_OS_VERSIONS, // REMOVED - gunakan getDedicatedOSVersions() saja
    getDedicatedOSVersions // Export function untuk get fresh prices
};