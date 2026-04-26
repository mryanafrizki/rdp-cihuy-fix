const fs = require('fs');
const path = require('path');
const os = require('os');
const { RDP_PORT } = require('../config/constants');

/**
 * Generate RDP connection file (.rdp)
 * Format: nama toko-id install (contoh: azovest-25122024-ABC12)
 * 
 * @param {string} shopName - Nama toko (dari env.txt atau default)
 * @param {string} installId - Install ID (format: DDMMYYYY-XXXXX)
 * @param {string} ipAddress - IP address atau hostname
 * @param {number} port - RDP port (default: RDP_PORT dari constants untuk dedicated, 3389 untuk docker)
 * @param {string} username - RDP username (default: administrator)
 * @returns {string} - Path to generated .rdp file
 */
function generateRdpFile(shopName, installId, ipAddress, port = RDP_PORT, username = 'administrator') {
  try {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'rdp_files');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate filename: nama toko-id install (lowercase, replace spaces with dashes)
    // Sanitize installId untuk menghindari karakter yang tidak valid di Windows (seperti /, \, :, *, ?, ", <, >, |)
    // PENTING: Pastikan tidak ada path separator di filename yang bisa membuat subfolder
    const sanitizedShopName = shopName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    // Sanitize installId: hapus semua karakter yang tidak valid untuk filename Windows
    // PENTING: Hapus SEMUA path separator (/, \) dan karakter kontrol
    let rawInstallId = String(installId || 'N/A');
    
    // PENTING: Hapus SEMUA backslash dan forward slash TERLEBIH DAHULU (path separator)
    // Ini harus dilakukan sebelum karakter lain untuk menghindari path separator di filename
    let sanitizedInstallId = rawInstallId
      .replace(/\\/g, '-') // Hapus backslash DULU (Windows path separator)
      .replace(/\//g, '-') // Hapus forward slash DULU (Unix path separator)
      .replace(/[<>:"|?*\x00-\x1f]/g, '-') // Hapus karakter tidak valid lainnya
      .replace(/\s+/g, '-') // Replace spaces dengan dash
      .replace(/-+/g, '-') // Replace multiple dashes dengan single dash
      .replace(/^-|-$/g, ''); // Hapus dash di awal dan akhir
    
    // Pastikan installId tidak kosong setelah sanitize
    if (!sanitizedInstallId || sanitizedInstallId.trim() === '') {
      sanitizedInstallId = 'unknown';
    }
    
    // Final check: pastikan tidak ada path separator di filename (harusnya sudah tidak ada)
    if (sanitizedInstallId.includes(path.sep) || sanitizedInstallId.includes('/') || sanitizedInstallId.includes('\\')) {
      console.warn(`[RDP FILE] Warning: installId masih mengandung path separator setelah sanitize: ${sanitizedInstallId}`);
      // Force remove semua path separator
      sanitizedInstallId = sanitizedInstallId.split(path.sep).join('-').split('/').join('-').split('\\').join('-');
    }
    
    // Pastikan fileName tidak mengandung path separator
    const fileName = `${sanitizedShopName}-${sanitizedInstallId}.rdp`;
    
    // Validasi: pastikan fileName tidak mengandung path separator
    if (fileName.includes(path.sep) || fileName.includes('/') || fileName.includes('\\')) {
      console.error(`[RDP FILE] Error: fileName masih mengandung path separator: ${fileName}`);
      throw new Error(`Invalid filename: contains path separator`);
    }
    
    // Gunakan path.join untuk memastikan path yang benar (tanpa subfolder)
    // path.join akan menormalisasi path dan memastikan tidak ada subfolder yang tidak diinginkan
    const filePath = path.join(tempDir, fileName);
    
    // Final validation: pastikan filePath tidak membuat subfolder yang tidak diinginkan
    // filePath harus langsung di tempDir, bukan di subfolder
    if (!filePath.startsWith(tempDir + path.sep) && filePath !== tempDir) {
      console.error(`[RDP FILE] Error: filePath tidak di dalam tempDir: ${filePath}`);
      throw new Error(`Invalid file path: not in temp directory`);
    }
    
    // Pastikan direktori parent ada (untuk handle case jika ada subfolder di path)
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // RDP file content format
    // Reference: https://learn.microsoft.com/en-us/windows-server/remote/remote-desktop-services/clients/rdp-files
    const rdpContent = [
      'screen mode id:i:2',
      'use multimon:i:0',
      'desktopwidth:i:1920',
      'desktopheight:i:1080',
      'session bpp:i:32',
      'winposstr:s:0,1,0,0,800,600',
      'compression:i:1',
      'keyboardhook:i:2',
      'audiocapturemode:i:0',
      'videoplaybackmode:i:1',
      'connection type:i:7',
      'networkautodetect:i:1',
      'bandwidthautodetect:i:1',
      `full address:s:${ipAddress}:${port}`,
      `username:s:${username}`,
      'enableworkspacereconnect:i:0',
      'disable wallpaper:i:0',
      'allow font smoothing:i:0',
      'allow desktop composition:i:0',
      'disable full window drag:i:1',
      'disable menu anims:i:1',
      'disable themes:i:0',
      'disable cursor setting:i:0',
      'bitmapcachepersistenable:i:1',
      'audiomode:i:0',
      'redirectprinters:i:1',
      'redirectcomports:i:0',
      'redirectsmartcards:i:1',
      'redirectclipboard:i:1',
      'redirectposdevices:i:0',
      'autoreconnection enabled:i:1',
      'authentication level:i:2',
      'prompt for credentials:i:0',
      'negotiate security layer:i:1',
      'remoteapplicationmode:i:0',
      'alternate shell:s:',
      'shell working directory:s:',
      'gatewayhostname:s:',
      'gatewayusagemethod:i:4',
      'gatewaycredentialssource:i:4',
      'gatewayprofileusagemethod:i:0',
      'promptcredentialonce:i:0',
      'gatewaybrokeringtype:i:0',
      'use redirection server name:i:0',
      'rdgiskdcproxy:i:0',
      'kdcproxyname:s:',
      'drivestoredirect:s:'
    ].join('\n');
    
    // Write RDP file
    fs.writeFileSync(filePath, rdpContent, 'utf8');
    
    console.info(`[RDP FILE] Generated RDP file: ${fileName} at ${filePath}`);
    
    return filePath;
  } catch (error) {
    console.error('[RDP FILE] Error generating RDP file:', error);
    throw error;
  }
}

/**
 * Clean up old RDP files (older than 3 days)
 */
function cleanupOldRdpFiles() {
  try {
    const tempDir = path.join(os.tmpdir(), 'rdp_files');
    if (!fs.existsSync(tempDir)) {
      return;
    }
    
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    
    files.forEach(file => {
      if (file.endsWith('.rdp')) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > threeDaysMs) {
            fs.unlinkSync(filePath);
            console.info(`[RDP FILE] Cleaned up old file: ${file} (older than 3 days)`);
          }
        } catch (e) {
          // Ignore errors
        }
      }
    });
  } catch (error) {
    console.error('[RDP FILE] Error cleaning up old files:', error);
  }
}

/**
 * Check if RDP file exists and is still valid (less than 3 days old)
 * If file doesn't exist or is too old, regenerate it
 * @param {string} shopName - Shop name
 * @param {string} installId - Install ID
 * @param {string} ipAddress - IP address
 * @param {number} port - RDP port
 * @param {string} username - RDP username
 * @returns {string} - Path to RDP file
 */
function getOrGenerateRdpFile(shopName, installId, ipAddress, port, username) {
  try {
    const tempDir = path.join(os.tmpdir(), 'rdp_files');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Sanitize installId untuk menghindari karakter yang tidak valid di Windows
    const sanitizedShopName = shopName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const sanitizedInstallId = String(installId || 'N/A').replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-');
    const fileName = `${sanitizedShopName}-${sanitizedInstallId}.rdp`;
    const filePath = path.join(tempDir, fileName);
    
    // Pastikan direktori parent ada
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Check if file exists and is still valid (less than 3 days old)
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    let shouldRegenerate = false;
    
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        const now = Date.now();
        if (now - stats.mtimeMs > threeDaysMs) {
          // File is too old, delete it
          fs.unlinkSync(filePath);
          shouldRegenerate = true;
          console.info(`[RDP FILE] File ${fileName} is older than 3 days, regenerating...`);
        }
      } catch (e) {
        // Error reading file stats, regenerate
        shouldRegenerate = true;
      }
    } else {
      // File doesn't exist, generate it
      shouldRegenerate = true;
    }
    
    if (shouldRegenerate) {
      // Generate new file
      return generateRdpFile(shopName, installId, ipAddress, port, username);
    }
    
    // File exists and is still valid, return existing path
    return filePath;
  } catch (error) {
    console.error('[RDP FILE] Error getting/generating file:', error);
    // Fallback: generate new file
    return generateRdpFile(shopName, installId, ipAddress, port, username);
  }
}

module.exports = {
  generateRdpFile,
  cleanupOldRdpFiles,
  getOrGenerateRdpFile
};

