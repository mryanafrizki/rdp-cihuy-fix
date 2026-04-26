const { Markup } = require('telegraf');
const ProxyDB = require('../utils/proxyDb');
const { validateProxy, parseProxy } = require('../utils/proxyValidator');
const { testProxy } = require('../utils/testProxy');
const { editOrReply } = require('../utils/editOrReply');
const { createSession } = require('../utils/callbackSession');

const PER_PAGE = 10;

async function manageProxy(ctx, page = 0) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const allProxies = await proxyDb.getAll();
  const selectedProxy = await proxyDb.getSelected();
  const messageId = ctx.callbackQuery?.message?.message_id;

  const totalProxies = allProxies.length;
  const totalPages = Math.ceil(totalProxies / PER_PAGE) || 1;
  const currentPage = Math.min(page, totalPages - 1);

  const startIdx = currentPage * PER_PAGE;
  const endIdx = Math.min(startIdx + PER_PAGE, totalProxies);
  const proxies = allProxies.slice(startIdx, endIdx);

  let text = `🔐 <b>Pengaturan Proxy</b>\n\n`;
  text += `📊 Total: <b>${totalProxies}/30</b> proxy\n`;

  const buttons = [];

  if (selectedProxy) {
    const proxyString = selectedProxy.auth
      ? `${selectedProxy.protocol}://${selectedProxy.auth.username ? '****' : ''}@${selectedProxy.host}:${selectedProxy.port}`
      : `${selectedProxy.protocol}://${selectedProxy.host}:${selectedProxy.port}`;
    text += `✅ <b>Proxy Aktif:</b> Proxy ${allProxies.findIndex(p => p.id === selectedProxy.id) + 1}\n`;
    text += `<code>${proxyString}</code>\n\n`;
    // Add disable button when proxy is active
    buttons.push([Markup.button.callback('🚫 Nonaktifkan Proxy (Default)', 'proxy:disable')]);
  } else {
    text += `❌ <b>Proxy Tidak Dipilih</b>\n`;
    text += `Menggunakan koneksi server langsung (default)\n\n`;
  }

  if (totalProxies === 0) {
    text += `⚠️ Tidak ada proxy yang dikonfigurasi\n\n`;
    buttons.push([Markup.button.callback('➕ Tambah Proxy', 'proxy:add')]);
  } else {
    text += `<b>📋 Daftar Proxy:</b>\n`;
    text += `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n`;

    // Display proxies (2 buttons per row)
    for (let i = 0; i < proxies.length; i += 2) {
      const row = [];
      const proxy1 = proxies[i];
      const proxy2 = proxies[i + 1];

      const proxy1Num = startIdx + i + 1;
      const proxy1String = proxy1.auth
        ? `${proxy1.protocol}://${proxy1.auth.username ? '****' : ''}@${proxy1.host}:${proxy1.port}`
        : `${proxy1.protocol}://${proxy1.host}:${proxy1.port}`;
      const proxy1Label = selectedProxy && selectedProxy.id === proxy1.id
        ? `✅ Proxy ${proxy1Num}`
        : `🔲 Proxy ${proxy1Num}`;
      const proxy1Text = proxy1Label.length > 20 ? `Proxy ${proxy1Num}` : proxy1Label;
      
      // Add proxy text to message
      text += `${proxy1Label}: <code>${proxy1String}</code>\n`;
      
      row.push(Markup.button.callback(proxy1Text, `proxy:select:${proxy1.id}`));

      if (proxy2) {
        const proxy2Num = startIdx + i + 2;
        const proxy2String = proxy2.auth
          ? `${proxy2.protocol}://${proxy2.auth.username ? '****' : ''}@${proxy2.host}:${proxy2.port}`
          : `${proxy2.protocol}://${proxy2.host}:${proxy2.port}`;
        const proxy2Label = selectedProxy && selectedProxy.id === proxy2.id
          ? `✅ Proxy ${proxy2Num}`
          : `🔲 Proxy ${proxy2Num}`;
        const proxy2Text = proxy2Label.length > 20 ? `Proxy ${proxy2Num}` : proxy2Label;
        
        // Add proxy text to message
        text += `${proxy2Label}: <code>${proxy2String}</code>\n`;
        
        row.push(Markup.button.callback(proxy2Text, `proxy:select:${proxy2.id}`));
      }

      text += '\n'; // Add spacing between proxy pairs
      buttons.push(row);
    }

    // Navigation buttons
    const navButtons = [];
    if (currentPage > 0) {
      const prevSession = createSession(ctx.from.id, { page: currentPage - 1, action: 'manage_proxy' });
      navButtons.push(Markup.button.callback('⬅️ Sebelumnya', `proxy:page:${prevSession}`));
    }
    if (currentPage < totalPages - 1) {
      const nextSession = createSession(ctx.from.id, { page: currentPage + 1, action: 'manage_proxy' });
      navButtons.push(Markup.button.callback('Berikutnya ➡️', `proxy:page:${nextSession}`));
    }
    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    // Action buttons
    if (totalProxies < 30) {
      buttons.push([Markup.button.callback('➕ Tambah Proxy', 'proxy:add')]);
    }
    if (totalProxies > 0) {
      buttons.push([
        Markup.button.callback('🧪 Test Batch', 'proxy:test_batch'),
        Markup.button.callback('🔧 Kelola', 'proxy:manage_list')
      ]);
    }
  }

  buttons.push([Markup.button.callback('🔙 Kembali', 'manage_accounts')]);

  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function manageProxyList(ctx, proxyId, page = 0) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const proxy = await proxyDb.get(proxyId);
  const messageId = ctx.callbackQuery?.message?.message_id;

  if (!proxy) {
    await ctx.answerCbQuery('❌ Proxy tidak ditemukan', { show_alert: true });
    return manageProxy(ctx, page);
  }

  const allProxiesForManageList = await proxyDb.getAll();
  const proxyNum = allProxiesForManageList.findIndex(p => p.id === proxyId) + 1;
  const proxyString = proxy.auth
    ? `${proxy.protocol}://${proxy.auth.username ? '****' : ''}@${proxy.host}:${proxy.port}`
    : `${proxy.protocol}://${proxy.host}:${proxy.port}`;

  // Add timestamp to prevent "message is not modified" error
  const timestamp = new Date().toLocaleTimeString('id-ID');
  let text = `🔧 <b>Kelola Proxy ${proxyNum}</b>\n\n`;
  text += `Proxy: <code>${proxyString}</code>\n`;
  text += `🌐 Protokol: ${proxy.protocol}\n`;
  text += `🖥️ Host: ${proxy.host}\n`;
  text += `🔌 Port: ${proxy.port}\n`;
  if (proxy.auth) {
    text += `👤 Auth: ${proxy.auth.username ? 'Ya' : 'Tidak'}\n`;
  }
  text += `\n<i>Dibuka: ${timestamp}</i>`;

  // Navigation buttons for multiple proxies
  const navButtons = [];
  const currentIndex = allProxiesForManageList.findIndex(p => p.id === proxyId);
  
  if (currentIndex > 0) {
    const prevProxy = allProxiesForManageList[currentIndex - 1];
    navButtons.push(Markup.button.callback('⬅️ Sebelumnya', `proxy:manage_list:${prevProxy.id}`));
  }
  if (currentIndex < allProxiesForManageList.length - 1) {
    const nextProxy = allProxiesForManageList[currentIndex + 1];
    navButtons.push(Markup.button.callback('Berikutnya ➡️', `proxy:manage_list:${nextProxy.id}`));
  }

  const buttons = [
    [
      Markup.button.callback('🧪 Test', `proxy:test_single:${proxyId}`),
      Markup.button.callback('🗑️ Hapus', `proxy:remove:${proxyId}`)
    ]
  ];

  if (navButtons.length > 0) {
    buttons.push(navButtons);
  }

  buttons.push([Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]);

  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function addProxy(ctx) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const totalProxies = await proxyDb.count();
  
  if (totalProxies >= 30) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]];
    return editOrReply(ctx, messageId, `❌ <b>Limit Tercapai</b>\n\nMaksimal 30 proxy per user.`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  const messageId = ctx.callbackQuery?.message?.message_id;
  
  let text = `➕ <b>Tambah Proxy</b>\n\n`;
  text += `Sisa slot: <b>${30 - totalProxies}/30</b>\n\n`;
  text += `Masukkan proxy dalam format:\n`;
  text += `<code>http://user:pass@host:port</code>\n`;
  text += `<code>https://host:port</code>\n`;
  text += `<code>socks5://user:pass@host:port</code>\n\n`;
  text += `Contoh:\n`;
  text += `<code>http://username:password@proxy.example.com:8080</code>\n\n`;
  text += `Kirim pesan dengan proxy, atau ketik <code>/cancel</code> untuk membatalkan.`;

  const buttons = [[Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]];

  await editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...Markup.inlineKeyboard(buttons)
  });
}

async function addProxyHandler(ctx, proxyString) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const messageId = ctx.message?.message_id;

  try {
    // Check limit
    const totalProxies = await proxyDb.count();
    if (totalProxies >= 30) {
      return ctx.reply(`❌ <b>Limit Tercapai</b>\n\nMaksimal 30 proxy per user.`, {
        parse_mode: 'HTML'
      });
    }

    // Validate proxy format
    const validation = await validateProxy(proxyString);
    
    if (!validation.valid) {
      return ctx.reply(`❌ <b>Validasi Proxy Gagal</b>\n\n${validation.error}\n\nSilakan coba lagi.`, {
        parse_mode: 'HTML'
      });
    }

    // Send testing message
    const testingMsg = await ctx.reply(`🧪 <b>Menguji Proxy...</b>\n\n⏳ Sedang mengecek koneksi ke proxy server...`, {
      parse_mode: 'HTML'
    });

    // Test proxy connection before adding
    const testResult = await testProxy(validation.proxy, 10000); // 10 second timeout

    if (!testResult.alive) {
      // Delete testing message
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, testingMsg.message_id);
      } catch (e) {
        // Ignore delete error
      }

      let errorText = `❌ <b>Proxy Gagal Ditambahkan</b>\n\n`;
      errorText += `Proxy tidak dapat terhubung (DIE).\n\n`;
      if (testResult.error) {
        errorText += `Error: <code>${testResult.error}</code>\n\n`;
      }
      errorText += `Silakan cek kembali proxy Anda dan coba lagi.`;

      return ctx.reply(errorText, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]
        ])
      });
    }

    // Proxy is alive, add to database
    const newProxy = await proxyDb.add(validation.proxy);
    const proxyNum = await proxyDb.count();

    const proxyDisplay = newProxy.auth
      ? `${newProxy.protocol}://${newProxy.auth.username ? '****' : ''}@${newProxy.host}:${newProxy.port}`
      : `${newProxy.protocol}://${newProxy.host}:${newProxy.port}`;

    let text = `✅ <b>Proxy Berhasil Ditambahkan</b>\n\n`;
    text += `<b>Proxy ${proxyNum}:</b> <code>${proxyDisplay}</code>\n`;
    if (testResult.responseTime) {
      text += `⏱️ Response Time: <code>${testResult.responseTime}ms</code>\n`;
    }
    text += `\n💡 Gunakan tombol "Pilih Proxy" untuk mengaktifkan proxy ini.`;

    // Delete testing message
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, testingMsg.message_id);
    } catch (e) {
      // Ignore delete error
    }

    return ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]
      ])
    });
  } catch (error) {
    console.error('[addProxyHandler] Error:', error);
    return ctx.reply(`❌ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

async function selectProxy(ctx, proxyId) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const messageId = ctx.callbackQuery?.message?.message_id;

  try {
    const proxy = await proxyDb.setSelected(proxyId);
    const allProxies = await proxyDb.getAll();
    const proxyNum = allProxies.findIndex(p => p.id === proxyId) + 1;

    // Enable useProxy when proxy is selected
    await proxyDb.setUseProxy(true);

    await ctx.answerCbQuery(`✅ Proxy ${proxyNum} dipilih dan diaktifkan`);

    return manageProxy(ctx);
  } catch (error) {
    console.error('[selectProxy] Error:', error);
    await ctx.answerCbQuery('❌ Gagal memilih proxy', { show_alert: true });
    return manageProxy(ctx);
  }
}

async function disableProxy(ctx) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const messageId = ctx.callbackQuery?.message?.message_id;

  try {
    // Disable proxy and clear selection
    await proxyDb.setSelected(null);
    await proxyDb.setUseProxy(false);

    await ctx.answerCbQuery('✅ Proxy dinonaktifkan, kembali ke default (tanpa proxy)');

    return manageProxy(ctx);
  } catch (error) {
    console.error('[disableProxy] Error:', error);
    await ctx.answerCbQuery('❌ Gagal menonaktifkan proxy', { show_alert: true });
    return manageProxy(ctx);
  }
}

async function testProxyBatch(ctx) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const allProxies = await proxyDb.getAll();
  const messageId = ctx.callbackQuery?.message?.message_id;

  if (allProxies.length === 0) {
    await ctx.answerCbQuery('❌ Tidak ada proxy untuk di-test', { show_alert: true });
    return manageProxy(ctx);
  }

  let text = `🧪 <b>Testing Batch Proxy...</b>\n\n`;
  text += `Total: <b>${allProxies.length}</b> proxy\n`;
  text += `⏳ Sedang menguji semua proxy...`;

  await editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML'
  });

  try {
    const results = [];
    let aliveCount = 0;
    let deadCount = 0;

    for (let i = 0; i < allProxies.length; i++) {
      const proxy = allProxies[i];
      const proxyNum = i + 1;
      const result = await testProxy(proxy, 5000);
      
      results.push({
        proxy,
        proxyNum,
        ...result
      });

      if (result.alive) {
        aliveCount++;
      } else {
        deadCount++;
      }
    }

    text = `🧪 <b>Hasil Test Batch Proxy</b>\n\n`;
    text += `📊 Total: <b>${allProxies.length}</b> proxy\n`;
    text += `✅ Alive: <b>${aliveCount}</b>\n`;
    text += `❌ Die: <b>${deadCount}</b>\n\n`;
    text += `<b>📋 Detail:</b>\n`;
    text += `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n`;

    results.forEach(result => {
      const proxyString = result.proxy.auth
        ? `${result.proxy.protocol}://${result.proxy.auth.username ? '****' : ''}@${result.proxy.host}:${result.proxy.port}`
        : `${result.proxy.protocol}://${result.proxy.host}:${result.proxy.port}`;
      
      const status = result.alive ? '✅' : '❌';
      text += `${status} <b>Proxy ${result.proxyNum}:</b>\n`;
      text += `<code>${proxyString}</code>\n`;
      if (result.responseTime) {
        text += `⏱️ <code>${result.responseTime}ms</code>\n`;
      }
      if (result.error) {
        text += `❌ <code>${result.error}</code>\n`;
      }
      text += '\n';
    });

    await ctx.answerCbQuery(`✅ Test selesai: ${aliveCount} alive, ${deadCount} die`);

    const buttons = [
      [Markup.button.callback('🔄 Test Lagi', 'proxy:test_batch')],
      [Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]
    ];

    return editOrReply(ctx, messageId, text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('[testProxyBatch] Error:', error);
    await ctx.answerCbQuery('❌ Gagal test batch');
    
    let errorText = `❌ <b>Error Testing Batch Proxy</b>\n\n`;
    errorText += `❌ Error: <code>${error.message}</code>`;

    return editOrReply(ctx, messageId, errorText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]
      ])
    });
  }
}

async function testProxySingle(ctx, proxyId) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const proxy = await proxyDb.get(proxyId);
  const messageId = ctx.callbackQuery?.message?.message_id;

  if (!proxy) {
    await ctx.answerCbQuery('❌ Proxy tidak ditemukan', { show_alert: true });
    return manageProxy(ctx);
  }

  const allProxiesForTest = await proxyDb.getAll();
  const proxyNum = allProxiesForTest.findIndex(p => p.id === proxyId) + 1;

  let text = `🧪 <b>Testing Proxy ${proxyNum}...</b>\n\n`;
  text += `Proxy: <code>${proxy.protocol}://${proxy.host}:${proxy.port}</code>\n`;
  text += `⏳ Sedang menguji koneksi...`;

  await editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML'
  });

  try {
    const result = await testProxy(proxy, 5000);

    if (result.alive) {
      text = `✅ <b>Proxy ${proxyNum} ALIVE</b>\n\n`;
      text += `Proxy: <code>${proxy.protocol}://${proxy.host}:${proxy.port}</code>\n`;
      text += `📊 Response Time: <code>${result.responseTime}ms</code>\n`;
      text += `\n✅ Koneksi ke proxy server berhasil!`;

      await ctx.answerCbQuery('✅ Proxy alive');
    } else {
      text = `❌ <b>Proxy ${proxyNum} DIE</b>\n\n`;
      text += `Proxy: <code>${proxy.protocol}://${proxy.host}:${proxy.port}</code>\n`;
      text += `📊 Response Time: <code>${result.responseTime || 'N/A'}ms</code>\n`;
      if (result.error) {
        text += `❌ Error: <code>${result.error}</code>\n`;
      }
      text += `\n❌ Proxy tidak dapat dihubungi atau tidak berfungsi.`;

      await ctx.answerCbQuery('❌ Proxy die', { show_alert: true });
    }

    const buttons = [
      [Markup.button.callback('🔄 Test Lagi', `proxy:test_single:${proxyId}`)],
      [Markup.button.callback('🔙 Kembali', `proxy:manage_list:${proxyId}`)]
    ];

    return editOrReply(ctx, messageId, text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('[testProxySingle] Error:', error);
    await ctx.answerCbQuery('❌ Gagal test proxy');
    
    let errorText = `❌ <b>Error Testing Proxy</b>\n\n`;
    errorText += `Proxy: <code>${proxy.protocol}://${proxy.host}:${proxy.port}</code>\n`;
    errorText += `❌ Error: <code>${error.message}</code>`;

    return editOrReply(ctx, messageId, errorText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Kembali', `proxy:manage_list:${proxyId}`)]
      ])
    });
  }
}

async function removeProxy(ctx, proxyId) {
  const proxyDb = new ProxyDB(ctx.from.id);
  const messageId = ctx.callbackQuery?.message?.message_id;

  try {
    const proxy = await proxyDb.get(proxyId);
    if (!proxy) {
      await ctx.answerCbQuery('❌ Proxy tidak ditemukan', { show_alert: true });
      return manageProxy(ctx);
    }

    const allProxiesBefore = await proxyDb.getAll();
    const proxyNum = allProxiesBefore.length;
    
    await proxyDb.remove(proxyId);
    
    const selectedProxyAfter = await proxyDb.getSelected();

    let text = `✅ <b>Proxy ${proxyNum} Berhasil Dihapus</b>\n\n`;
    text += `Bot akan menggunakan ${selectedProxyAfter ? 'proxy yang dipilih' : 'koneksi server langsung (default)'} untuk semua request API.`;

    await ctx.answerCbQuery('✅ Proxy dihapus');

    return editOrReply(ctx, messageId, text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Kembali ke Pengaturan', 'proxy:manage')]
      ])
    });
  } catch (error) {
    console.error('[removeProxy] Error:', error);
    await ctx.answerCbQuery('❌ Gagal menghapus proxy');
    return editOrReply(ctx, messageId, `❌ Kesalahan: <code>${error.message}</code>`, {
      parse_mode: 'HTML'
    });
  }
}

module.exports = {
  manageProxy,
  manageProxyList,
  addProxy,
  addProxyHandler,
  selectProxy,
  disableProxy,
  removeProxy,
  testProxyConnection: testProxySingle,
  testProxyBatch
};
