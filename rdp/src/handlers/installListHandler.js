const dbAsync = require('../config/database');
const { isAdmin } = require('../utils/userManager');
const { formatRdpData } = require('../utils/getRdpData');
const { RDP_PORT } = require('../config/constants');
const RDPMonitor = require('../utils/rdpMonitor');

/**
 * Get all user installations ordered by oldest to newest, and by status (completed first, then pending, then failed)
 * @param {number} userId - User ID
 * @returns {Array} - Array of installations
 */
async function getUserInstallations(userId) {
  try {
    // Get all installations for user, ordered by:
    // 1. Status: completed (0), pending (1)
    // 2. Created date: oldest first
    // Note: failed installations are excluded as they are auto-deleted after 5 minutes
    const installations = await dbAsync.all(
      `SELECT * FROM rdp_installations 
       WHERE user_id = ? AND status IN ('completed', 'pending')
       ORDER BY 
         CASE 
           WHEN status = 'completed' THEN 0
           WHEN status = 'pending' THEN 1
         END,
         created_at ASC`,
      [userId]
    );
    
    return installations || [];
  } catch (error) {
    console.error('[INSTALL LIST] Error getting user installations:', error);
    return [];
  }
}

/**
 * Show list of user installations with buttons (3 per row, showing only numbers)
 * @param {Object} bot - Bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 * @param {number} page - Page number (starting from 0)
 */
async function showInstallList(bot, chatId, messageId, page = 0) {
  try {
    const installations = await getUserInstallations(chatId);
    
    if (!installations || installations.length === 0) {
      await bot.editMessageText(
        '📋 *LIST MY INSTALL*\n\n' +
        '❌ Belum ada instalasi yang ditemukan.\n\n' +
        '💡 Mulai instalasi RDP dengan klik tombol "🖥️ Install RDPmu" di menu utama.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    // Pagination settings
    const itemsPerPage = 10;
    const totalPages = Math.ceil(installations.length / itemsPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIndex = currentPage * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, installations.length);
    const pageInstallations = installations.slice(startIndex, endIndex);
    
    // Build message text with list
    let messageText = '📋 *LIST MY INSTALL*\n\n';
    messageText += `📊 Total: ${installations.length} instalasi`;
    if (totalPages > 1) {
      messageText += ` | Halaman ${currentPage + 1}/${totalPages}`;
    }
    messageText += '\n\n';
    
    // Filter only completed and pending (failed will be auto-deleted after 5 minutes)
    const completed = installations.filter(i => i.status === 'completed');
    const pending = installations.filter(i => i.status === 'pending');
    
    // Show summary counts
    if (completed.length > 0 || pending.length > 0) {
      messageText += `✅ Berhasil: ${completed.length} | ⏳ Proses: ${pending.length}\n\n`;
    }
    
    // Helper function to get port based on install_type
    const getPort = (installType) => {
      return installType === 'docker' ? 3389 : RDP_PORT;
    };
    
    // Show installations for current page
    if (pageInstallations.length > 0) {
      pageInstallations.forEach((inst, idx) => {
        const globalIndex = startIndex + idx + 1;
        const installId = inst.install_id || inst.id;
        const statusIcon = inst.status === 'completed' ? '✅' : '⏳';
        const ipAddress = inst.ip_address || 'N/A';
        const port = getPort(inst.install_type || 'docker');
        const ipPortText = ipAddress !== 'N/A' ? `${ipAddress}:${port}` : '';
        messageText += `${statusIcon} ${globalIndex}. \`${installId}\` | \`${ipPortText}\`\n`;
      });
      messageText += '\n';
    }
    
    messageText += '💡 Pilih nomor untuk melihat detail instalasi.';
    
    // Build keyboard: 3 buttons per row, showing only numbers
    const keyboard = [];
    for (let i = 0; i < pageInstallations.length; i++) {
      const installation = pageInstallations[i];
      const installId = installation.install_id || installation.id;
      const globalIndex = startIndex + i + 1;
      const buttonText = String(globalIndex); // Just show the number
      
      if (i % 3 === 0) {
        // Start new row
        keyboard.push([{ text: buttonText, callback_data: `view_install_${installId}` }]);
      } else {
        // Add to last row
        keyboard[keyboard.length - 1].push({ text: buttonText, callback_data: `view_install_${installId}` });
      }
    }
    
    // Add batch test button if there are completed installations
    if (completed.length > 0) {
      keyboard.push([{ text: '🔄 Batch Test (Monitor All)', callback_data: 'batch_test_install' }]);
    }
    
    // Add delete all button if there are any installations
    if (installations.length > 0) {
      keyboard.push([{ text: '🗑️ Hapus Semua Instalasi', callback_data: 'delete_all_install' }]);
    }
    
    // Add pagination buttons if needed
    if (totalPages > 1) {
      const paginationRow = [];
      if (currentPage > 0) {
        paginationRow.push({ text: '« Sebelumnya', callback_data: `install_list_page_${currentPage - 1}` });
      }
      if (currentPage < totalPages - 1) {
        paginationRow.push({ text: 'Selanjutnya »', callback_data: `install_list_page_${currentPage + 1}` });
      }
      if (paginationRow.length > 0) {
        keyboard.push(paginationRow);
      }
    }
    
    // Add back button
    keyboard.push([{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]);
    
    await bot.editMessageText(messageText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  } catch (error) {
    console.error('[INSTALL LIST] Error showing install list:', error);
    await bot.editMessageText(
      '❌ Gagal memuat daftar instalasi. Silakan coba lagi.',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  }
}

/**
 * Show detail of a specific installation
 * @param {Object} bot - Bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 * @param {string} installId - Install ID
 */
async function showInstallDetail(bot, chatId, messageId, installId) {
  try {
    // Get installation data
    let installation = null;
    
    // Try by install_id first
    if (typeof installId === 'string' && installId.includes('-')) {
      installation = await dbAsync.get(
        `SELECT * FROM rdp_installations WHERE install_id = ? AND user_id = ?`,
        [installId, chatId]
      );
    }
    
    // If not found, try by id (integer)
    if (!installation && !isNaN(parseInt(installId, 10))) {
      installation = await dbAsync.get(
        `SELECT * FROM rdp_installations WHERE id = ? AND user_id = ?`,
        [parseInt(installId, 10), chatId]
      );
    }
    
    if (!installation) {
      await bot.editMessageText(
        '❌ Instalasi tidak ditemukan.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    // Format and show installation data
    const formatted = await formatRdpData(installation);
    
    if (!formatted) {
      await bot.editMessageText(
        '❌ Gagal memuat detail instalasi.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    // Build keyboard with delete button if status is completed
    const keyboard = [];
    
    if (installation.status === 'completed') {
      keyboard.push([{ text: '🗑️ Hapus Instalasi', callback_data: `delete_install_${installation.install_id || installation.id}` }]);
    }
    
    keyboard.push([{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }]);
    keyboard.push([{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]);
    
    // Add delete button to formatted data if available
    formatted.reply_markup = {
      inline_keyboard: keyboard
    };
    
    await bot.editMessageText(formatted.text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: formatted.parse_mode || 'Markdown',
      reply_markup: formatted.reply_markup
    });
  } catch (error) {
    console.error('[INSTALL LIST] Error showing install detail:', error);
    await bot.editMessageText(
      '❌ Gagal memuat detail instalasi. Silakan coba lagi.',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  }
}

/**
 * Delete an installation (only for completed ones)
 * @param {Object} bot - Bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 * @param {string} installId - Install ID
 */
async function deleteInstallation(bot, chatId, messageId, installId) {
  try {
    // Get installation data first
    let installation = null;
    
    // Try by install_id first
    if (typeof installId === 'string' && installId.includes('-')) {
      installation = await dbAsync.get(
        `SELECT * FROM rdp_installations WHERE install_id = ? AND user_id = ?`,
        [installId, chatId]
      );
    }
    
    // If not found, try by id (integer)
    if (!installation && !isNaN(parseInt(installId, 10))) {
      installation = await dbAsync.get(
        `SELECT * FROM rdp_installations WHERE id = ? AND user_id = ?`,
        [parseInt(installId, 10), chatId]
      );
    }
    
    if (!installation) {
      await bot.editMessageText(
        '❌ Instalasi tidak ditemukan.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    // Only allow deletion of completed installations
    if (installation.status !== 'completed') {
      await bot.editMessageText(
        '❌ Hanya instalasi yang berhasil (completed) yang bisa dihapus.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Kembali ke Detail', callback_data: `view_install_${installation.install_id || installation.id}` }],
              [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    // Delete the installation
    const installIdToDelete = installation.install_id || installation.id;
    
    if (typeof installIdToDelete === 'string' && installIdToDelete.includes('-')) {
      await dbAsync.run(
        `DELETE FROM rdp_installations WHERE install_id = ? AND user_id = ?`,
        [installIdToDelete, chatId]
      );
    } else {
      await dbAsync.run(
        `DELETE FROM rdp_installations WHERE id = ? AND user_id = ?`,
        [parseInt(installIdToDelete, 10), chatId]
      );
    }
    
    await bot.editMessageText(
      `✅ Instalasi \`${installIdToDelete}\` berhasil dihapus.`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('[INSTALL LIST] Error deleting installation:', error);
    await bot.editMessageText(
      '❌ Gagal menghapus instalasi. Silakan coba lagi.',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  }
}

/**
 * Batch test all completed installations (check connection one by one sequentially)
 * @param {Object} bot - Bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 */
async function batchTestInstallations(bot, chatId, messageId) {
  try {
    // Get all completed and failed installations for user (failed ones can be recovered if test succeeds)
    const installations = await dbAsync.all(
      `SELECT * FROM rdp_installations 
       WHERE user_id = ? AND status IN ('completed', 'failed') AND ip_address IS NOT NULL AND ip_address != 'N/A'
       ORDER BY created_at ASC`,
      [chatId]
    );
    
    if (!installations || installations.length === 0) {
      await bot.editMessageText(
        '🔄 *BATCH TEST MONITORING*\n\n' +
        '❌ Tidak ada instalasi yang bisa di-test.\n\n' +
        '💡 Pastikan ada instalasi dengan status berhasil atau gagal yang memiliki IP address.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    // Helper function to get port based on install_type
    const getPort = (installType) => {
      return installType === 'docker' ? 3389 : RDP_PORT;
    };
    
    // Format last check timestamp
    const formatDateTime = () => {
      const date = new Date();
      const formatted = date.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      return `${formatted} WIB`;
    };
    
    // Calculate estimated time (approximately 3-5 seconds per installation)
    const estimatedSecondsPerInstall = 4;
    const estimatedTotalSeconds = installations.length * estimatedSecondsPerInstall;
    const estimatedMinutes = Math.floor(estimatedTotalSeconds / 60);
    const estimatedSeconds = estimatedTotalSeconds % 60;
    const estimatedTimeText = estimatedMinutes > 0 
      ? `${estimatedMinutes}m ${estimatedSeconds}s` 
      : `${estimatedSeconds}s`;
    
    // Helper function to get WIB timestamp (same format as statistics.js)
    const getWIBTimestamp = () => {
      const now = new Date();
      // Convert to WIB (UTC+7)
      const wibOffset = 7 * 60; // 7 hours in minutes
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const wibTime = new Date(utc + (wibOffset * 60000));
      
      // Format as ISO string for SQLite (YYYY-MM-DD HH:MM:SS)
      const year = wibTime.getFullYear();
      const month = String(wibTime.getMonth() + 1).padStart(2, '0');
      const day = String(wibTime.getDate()).padStart(2, '0');
      const hours = String(wibTime.getHours()).padStart(2, '0');
      const minutes = String(wibTime.getMinutes()).padStart(2, '0');
      const seconds = String(wibTime.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    
    // Show initial message with estimate
    let messageText = '🔄 *BATCH TEST MONITORING*\n\n';
    messageText += `📊 Total: ${installations.length} instalasi\n`;
    messageText += `⏱️ Last Check Batch: ${formatDateTime()}\n\n`;
    messageText += `🔍 Memulai test koneksi (1-1 urut)...\n`;
    messageText += `⏱️ Estimasi waktu: ~${estimatedTimeText}\n\n`;
    messageText += `📈 Progress: 0/${installations.length} (0%)\n`;
    messageText += `⏳ Sedang memproses...`;
    
    await bot.editMessageText(messageText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
                  inline_keyboard: []
        }
      });
      
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    const startTime = Date.now();
    
    // Check each installation sequentially (1-1 urut)
    for (let i = 0; i < installations.length; i++) {
      const inst = installations[i];
      const installId = inst.install_id || inst.id;
      const ipAddress = inst.ip_address;
      const port = getPort(inst.install_type || 'docker');
      
      // Test RDP connection (port only, no authentication test)
      try {
        const monitor = new RDPMonitor(ipAddress, '', '', '', port);
        const testResult = await monitor.testRDPConnection();
        const currentStatus = inst.status;
        const wibTimestamp = getWIBTimestamp();
        
        if (testResult.success) {
          successCount++;
          
          // If status was 'failed', update back to 'completed' and clear failed_at
          // Keep created_at as original, so 1 month countdown continues from original creation date
          if (currentStatus === 'failed') {
            await dbAsync.run(
              `UPDATE rdp_installations 
               SET status = 'completed', failed_at = NULL
               WHERE install_id = ?`,
              [installId]
            );
          }
          
          results.push({
            installId,
            ipAddress,
            port,
            status: 'success',
            message: `✅ Konek (${testResult.responseTime}ms)${currentStatus === 'failed' ? ' [Status diperbarui ke berhasil, sisa waktu dari tanggal buat tetap berlanjut]' : ''}`
          });
        } else {
          failedCount++;
          
          // If status was 'completed', update to 'failed' and set failed_at (start 5 minute countdown from now)
          // Keep created_at as original, so if it recovers, 1 month countdown continues from original date
          if (currentStatus === 'completed') {
            await dbAsync.run(
              `UPDATE rdp_installations 
               SET status = 'failed', failed_at = ?
               WHERE install_id = ?`,
              [wibTimestamp, installId]
            );
          } else if (currentStatus === 'failed') {
            // Already failed, reset failed_at to restart 5 minute countdown from now
            await dbAsync.run(
              `UPDATE rdp_installations 
               SET failed_at = ?
               WHERE install_id = ?`,
              [wibTimestamp, installId]
            );
          }
          
          results.push({
            installId,
            ipAddress,
            port,
            status: 'failed',
            message: `❌ Tidak konek - ${testResult.message}${currentStatus === 'completed' ? ' [Akan terhapus dalam 5 menit]' : ' [Countdown 5 menit direset]'}`
          });
        }
      } catch (error) {
        failedCount++;
        const currentStatus = inst.status;
        const wibTimestamp = getWIBTimestamp();
        
        // Update to failed if was completed, or reset failed_at if already failed
        // Keep created_at as original
        if (currentStatus === 'completed') {
          await dbAsync.run(
            `UPDATE rdp_installations 
             SET status = 'failed', failed_at = ?
             WHERE install_id = ?`,
            [wibTimestamp, installId]
          );
        } else if (currentStatus === 'failed') {
          await dbAsync.run(
            `UPDATE rdp_installations 
             SET failed_at = ?
             WHERE install_id = ?`,
            [wibTimestamp, installId]
          );
        }
        
        results.push({
          installId,
          ipAddress,
          port,
          status: 'failed',
          message: `❌ Error: ${error.message}${currentStatus === 'completed' ? ' [Akan terhapus dalam 5 menit]' : ' [Countdown 5 menit direset]'}`
        });
      }
      
      // Small delay between checks to avoid overwhelming
      if (i < installations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Calculate elapsed time
    const elapsedTime = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsedTime / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const remainingSeconds = elapsedSeconds % 60;
    const elapsedTimeText = elapsedMinutes > 0 
      ? `${elapsedMinutes}m ${remainingSeconds}s` 
      : `${elapsedSeconds}s`;
    
    // Build final result message
    // Telegram limit: 4096 characters per message
    const MAX_MESSAGE_LENGTH = 4000; // Leave some buffer
    const MAX_DETAIL_ITEMS = 15; // Max items per category to show in detail
    
    let finalMessage = '🔄 *BATCH TEST MONITORING*\n\n';
    finalMessage += `📊 Total: ${installations.length} instalasi\n`;
    finalMessage += `⏱️ Last Check Batch: ${formatDateTime()}\n`;
    finalMessage += `⏱️ Waktu proses: ${elapsedTimeText}\n\n`;
    finalMessage += `📈 Hasil Test:\n`;
    finalMessage += `✅ Konek: ${successCount}\n`;
    finalMessage += `❌ Tidak Konek: ${failedCount}\n\n`;
    
    // Show results (grouped by status)
    const successResults = results.filter(r => r.status === 'success');
    const failedResults = results.filter(r => r.status === 'failed');
    
    // Helper function to truncate message if too long
    const addDetailSection = (title, items, maxItems) => {
      let section = `${title}\n`;
      const itemsToShow = items.slice(0, maxItems);
      const remainingCount = items.length - maxItems;
      let addedCount = 0;
      
      for (let idx = 0; idx < itemsToShow.length; idx++) {
        const r = itemsToShow[idx];
        const line = `${idx + 1}. \`${r.installId}\` | ${r.ipAddress}:${r.port} - ${r.message}\n`;
        // Check if adding this line would exceed limit
        if ((finalMessage + section + line).length > MAX_MESSAGE_LENGTH) {
          break; // Stop adding more
        }
        section += line;
        addedCount++;
      }
      
      if (remainingCount > 0 && addedCount > 0) {
        const remainingText = `... dan ${remainingCount} lainnya (total ${items.length})\n`;
        // Check if we can add remaining text
        if ((finalMessage + section + remainingText).length <= MAX_MESSAGE_LENGTH) {
          section += remainingText;
        }
      }
      section += '\n';
      
      finalMessage += section;
      return addedCount > 0;
    };
    
    // Add detail sections (prioritize failed results)
    if (failedResults.length > 0) {
      finalMessage += `📋 Detail:\n\n`;
      if (!addDetailSection(`❌ *Tidak Konek (${failedResults.length}):*`, failedResults, MAX_DETAIL_ITEMS)) {
        // If failed to add, just show summary
        finalMessage += `❌ *Tidak Konek (${failedResults.length}):* Terlalu banyak untuk ditampilkan detail.\n\n`;
      }
      finalMessage += `⚠️ Instalasi yang gagal akan otomatis terhapus setelah 5 menit jika tidak berhasil kembali.\n\n`;
    }
    
    if (successResults.length > 0) {
      // Check if we have space for success results
      const currentLength = finalMessage.length;
      const successHeader = `✅ *Konek (${successResults.length}):*\n`;
      const estimatedLength = currentLength + successHeader.length + (successResults.length * 80); // ~80 chars per item
      
      if (estimatedLength < MAX_MESSAGE_LENGTH) {
        if (!addDetailSection(`✅ *Konek (${successResults.length}):*`, successResults, MAX_DETAIL_ITEMS)) {
          finalMessage += `✅ *Konek (${successResults.length}):* Terlalu banyak untuk ditampilkan detail.\n\n`;
        }
      } else {
        // Too long, just show summary
        finalMessage += `✅ *Konek (${successResults.length}):* Semua berhasil.\n\n`;
      }
    }
    
    finalMessage += `💡 Test selesai. Gunakan tombol di bawah untuk navigasi.`;
    
    // Truncate if still too long (safety check)
    if (finalMessage.length > MAX_MESSAGE_LENGTH) {
      finalMessage = finalMessage.substring(0, MAX_MESSAGE_LENGTH - 50) + '\n\n... (pesan dipotong karena terlalu panjang)';
    }
    
    // Send final result
    await bot.editMessageText(finalMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Test Lagi', callback_data: 'batch_test_install' }],
          [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
          [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
        ]
      }
    });
  } catch (error) {
    console.error('[INSTALL LIST] Error batch testing installations:', error);
    await bot.editMessageText(
      '❌ Gagal melakukan batch test. Silakan coba lagi.\n\n' +
      `Error: ${error.message}`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  }
}

/**
 * Delete all installations for a user
 * @param {Object} bot - Bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 */
async function deleteAllInstallations(bot, chatId, messageId) {
  try {
    // Get all installations for user
    const installations = await getUserInstallations(chatId);
    
    if (!installations || installations.length === 0) {
      await bot.editMessageText(
        '❌ Tidak ada instalasi yang bisa dihapus.',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    // Delete all installations for this user
    const result = await dbAsync.run(
      `DELETE FROM rdp_installations WHERE user_id = ?`,
      [chatId]
    );
    
    const deletedCount = result.changes || 0;
    
    await bot.editMessageText(
      `✅ Berhasil menghapus ${deletedCount} instalasi.\n\n` +
      `📋 Semua instalasi Anda telah dihapus.`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('[INSTALL LIST] Error deleting all installations:', error);
    await bot.editMessageText(
      '❌ Gagal menghapus semua instalasi. Silakan coba lagi.',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali ke List', callback_data: 'list_my_install' }],
            [{ text: '🏠 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
  }
}

module.exports = {
  getUserInstallations,
  showInstallList,
  showInstallDetail,
  deleteInstallation,
  batchTestInstallations,
  deleteAllInstallations
};
