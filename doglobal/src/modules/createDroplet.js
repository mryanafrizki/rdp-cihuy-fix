const { createDigitalOceanClient, getProxyInfoString } = require('../utils/createDigitalOceanClient');
const { getUserProxyInfo } = require('../utils/getUserProxy');
const { checkProxyRequirement } = require('../utils/proxyRequirement');
const { showDefaultProxyConfirm } = require('../utils/defaultProxyConfirm');
const { notifyDropletCreated } = require('../utils/notifyChannel');
const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const DropletsDB = require('../utils/dropletsDb');
const localizeRegion = require('../utils/localizer');
const setRootPasswordScript = require('../utils/rootPasswordScript');
const passwordGenerator = require('../utils/passwordGenerator');
const { validateButtons } = require('../utils/buttonValidator');
const { createSession } = require('../utils/callbackSession');
const { editOrReply } = require('../utils/editOrReply');

const userSessions = new Map();

const INIT_TEXT = '<b>🚀 Buat Instance</b>\n\n';

async function createDropletSelectAccount(ctx) {
  const db = new AccountsDB(ctx.from.id);
  const accounts = await db.all();


  const messageId = ctx.callbackQuery?.message?.message_id;
  const text = accounts.length === 0 
    ? `${INIT_TEXT}⚠️ Tidak ada akun yang tersedia`
    : `${INIT_TEXT}👤 Pilih Akun`;

  if (accounts.length === 0) {
    const buttons = [
      [Markup.button.callback('➕ Tambah Akun', 'add_account')]
    ];
    
    return editOrReply(ctx, messageId, text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  const buttons = accounts.map(account => {
    const session = createSession(ctx.from.id, { accountId: account.id, step: 'select_region' });
    const callbackData = `cd:${session}`;
    return [
      Markup.button.callback(
        account.email,
        callbackData
      )
    ];
  });


  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function createDropletSelectRegion(ctx, accountId, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'create_droplet_select_region', { accountId });
  }

  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  if (!account) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    return editOrReply(ctx, messageId, '⚠️ Akun tidak ditemukan', { parse_mode: 'HTML' });
  }

  const currentText = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>\n\n🌍 Mengambil daftar Wilayah...`;

  // Use existing message if from callback, otherwise create new
  let msg;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    msg = { message_id: ctx.callbackQuery.message.message_id };
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      currentText,
      { parse_mode: 'HTML' }
    );
  } else {
    msg = await ctx.reply(currentText, { parse_mode: 'HTML' });
  }

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const regions = await client.listRegions();
    const availableRegions = regions.filter(r => r.available);

    const buttons = availableRegions.map(region => {
      const session = createSession(ctx.from.id, { accountId, region: region.slug, step: 'select_size' });
      return [
        Markup.button.callback(
          localizeRegion(region.slug),
          `cd:${session}`
        )
      ];
    });

    // Add cancel button
    buttons.push([
      Markup.button.callback('❌ Batal', 'cd_cancel')
    ]);

    const text = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>\n\n🌍 Pilih Wilayah`;

    validateButtons(buttons, 'createDropletSelectRegion');

    return editOrReply(ctx, msg.message_id, text, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
  } catch (error) {
    const errorText = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>\n\n⚠️ Kesalahan: <code>${error.message}</code>`;

    return editOrReply(ctx, msg.message_id, errorText, { parse_mode: 'HTML' });
  }
}

async function createDropletSelectSize(ctx, accountId, regionSlug, page = 0) {
  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const currentText = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>
🌍 Wilayah: <code>${localizeRegion(regionSlug)}</code>

📏 Mengambil daftar Ukuran...`;

  // Use existing message if from callback, otherwise create new
  let msg;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    msg = { message_id: ctx.callbackQuery.message.message_id };
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      currentText,
      { parse_mode: 'HTML' }
    );
  } else {
    msg = await ctx.reply(currentText, { parse_mode: 'HTML' });
  }

  if (!userSessions.has(ctx.from.id)) {
    userSessions.set(ctx.from.id, { account });
  }
  const currentSession = userSessions.get(ctx.from.id);
  userSessions.set(ctx.from.id, {
    ...currentSession,
    account,
    region: regionSlug
  });

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const sizes = await client.listSizes();
    
    // Store sizes in session for later use (for size info display)
    const currentSessionWithSizes = userSessions.get(ctx.from.id);
    userSessions.set(ctx.from.id, {
      ...currentSessionWithSizes,
      allSizes: sizes
    });
    
    
    // Filter sizes that are:
    // 1. Available globally (s.available === true)
    // 2. Available in the selected region (regions array includes regionSlug)
    // If regions array is empty, we'll include it (some sizes are available everywhere)
    const availableSizes = sizes.filter(s => {
      const isAvailable = s.available === true;
      const hasRegions = Array.isArray(s.regions) && s.regions.length > 0;
      
      if (!isAvailable) return false;
      
      // Filter out sizes with empty regions array
      if (!hasRegions) {
        return false;
      }
      
      // If size has regions listed, it must include the selected region
      return s.regions.includes(regionSlug);
    });
    
    // Check if we should filter by tier/type
    // Some accounts might only have access to Basic tier sizes
    const allSizeTypes = [...new Set(availableSizes.map(s => s.description || s.type || 'Basic'))];
    
    // Group sizes by description
    const sizesByType = {};
    availableSizes.forEach(s => {
      const type = s.description || 'Basic';
      if (!sizesByType[type]) sizesByType[type] = [];
      sizesByType[type].push(s.slug);
    });

    // Pagination settings
    const itemsPerPage = 15;
    const totalPages = Math.ceil(availableSizes.length / itemsPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const displaySizes = availableSizes.slice(startIdx, endIdx);

    const buttons = displaySizes.map(size => {
      const session = createSession(ctx.from.id, { accountId, region: regionSlug, size: size.slug, step: 'select_os' });
      // Include tier info in label if it's not Basic
      const tierInfo = size.description && size.description !== 'Basic' ? ` [${size.description}]` : '';
      // Format: size [tier] - vCPUs/GB RAM/GB Disk - $price/mo
      const label = `${size.slug}${tierInfo} - ${size.vcpus}vCPU/${size.memory}MB RAM/${size.disk}GB Disk - $${size.price_monthly}/mo`;
      // Truncate if too long
      const displayLabel = label.length > 60 ? `${size.slug}${tierInfo} - $${size.price_monthly}/mo` : label;
      return [
        Markup.button.callback(
          displayLabel,
          `cd:${session}`
        )
      ];
    });

    // Add navigation buttons
    const navButtons = [];
    if (currentPage > 0) {
      const prevSession = createSession(ctx.from.id, { accountId, region: regionSlug, step: 'select_size', page: currentPage - 1 });
      navButtons.push(Markup.button.callback('⬅️ Sebelumnya', `cd:${prevSession}`));
    }
    if (currentPage < totalPages - 1) {
      const nextSession = createSession(ctx.from.id, { accountId, region: regionSlug, step: 'select_size', page: currentPage + 1 });
      navButtons.push(Markup.button.callback('Berikutnya ➡️', `cd:${nextSession}`));
    }
    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    // Add back button
    const backSession = createSession(ctx.from.id, { accountId, step: 'select_region' });
    buttons.push([
      Markup.button.callback('🔙 Kembali ke Wilayah', `cd:${backSession}`)
    ]);

    const text = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>
🌍 Wilayah: <code>${localizeRegion(regionSlug)}</code>

📏 Pilih Ukuran
Halaman ${currentPage + 1} dari ${totalPages} (Total: ${availableSizes.length})`;

    return editOrReply(ctx, msg.message_id, text, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
  } catch (error) {
    const errorText = `${currentText}\n⚠️ Kesalahan: <code>${error.message}</code>`;

    return editOrReply(ctx, msg.message_id, errorText, { parse_mode: 'HTML' });
  }
}

async function createDropletSelectOS(ctx, accountId, regionSlug, sizeSlug, page = 0) {
  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const currentText = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>
🌍 Wilayah: <code>${localizeRegion(regionSlug)}</code>
📏 Ukuran: <code>${sizeSlug}</code>

🖼️ Mengambil daftar OS...`;

  // Use existing message if from callback, otherwise create new
  let msg;
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    msg = { message_id: ctx.callbackQuery.message.message_id };
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      currentText,
      { parse_mode: 'HTML' }
    );
  } else {
    msg = await ctx.reply(currentText, { parse_mode: 'HTML' });
  }

  const currentSession = userSessions.get(ctx.from.id) || {};
  userSessions.set(ctx.from.id, {
    ...currentSession,
    account,
    region: regionSlug,
    size: sizeSlug // Store size properly
  });

  try {
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const images = await client.getImagesDistribution();
    
    const availableImages = images.filter(img => {
      const isAvailable = img.status === 'available';
      const isPublic = img.public === true;
      const isValidDistro = ['Ubuntu', 'CentOS', 'Debian', 'Fedora', 'Rocky Linux'].includes(img.distribution);
      
      // Similar to sizes, don't strictly filter by region
      // Some images might not have regions array populated correctly
      const hasRegions = Array.isArray(img.regions) && img.regions.length > 0;
      const isInRegion = !hasRegions || img.regions.includes(regionSlug);
      
      // Show all available images - API will validate compatibility
      return isAvailable && isPublic && isValidDistro;
    });
    

    // Pagination settings
    const itemsPerPage = 12;
    const totalPages = Math.ceil(availableImages.length / itemsPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const displayImages = availableImages.slice(startIdx, endIdx);

    const buttons = displayImages.map(image => {
      // Use image SLUG for API (e.g., "ubuntu-22-04-x64"), not ID
      const session = createSession(ctx.from.id, { 
        accountId, 
        region: regionSlug, 
        size: sizeSlug, 
        image: image.slug, // Use slug for DigitalOcean API
        imageName: `${image.distribution} ${image.name}`,
        step: 'get_name' 
      });
      return [
        Markup.button.callback(
          `${image.distribution} ${image.name}`,
          `cd:${session}`
        )
      ];
    });

    // Add navigation buttons
    const navButtons = [];
    if (currentPage > 0) {
      const prevSession = createSession(ctx.from.id, { accountId, region: regionSlug, size: sizeSlug, step: 'select_os', page: currentPage - 1 });
      navButtons.push(Markup.button.callback('⬅️ Sebelumnya', `cd:${prevSession}`));
    }
    if (currentPage < totalPages - 1) {
      const nextSession = createSession(ctx.from.id, { accountId, region: regionSlug, size: sizeSlug, step: 'select_os', page: currentPage + 1 });
      navButtons.push(Markup.button.callback('Berikutnya ➡️', `cd:${nextSession}`));
    }
    if (navButtons.length > 0) {
      buttons.push(navButtons);
    }

    // Add back button
    const backSession = createSession(ctx.from.id, { accountId, region: regionSlug, step: 'select_size' });
    buttons.push([
      Markup.button.callback('🔙 Kembali ke Ukuran', `cd:${backSession}`)
    ]);

    const text = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>
🌍 Wilayah: <code>${localizeRegion(regionSlug)}</code>
📏 Ukuran: <code>${sizeSlug}</code>

🖼️ Pilih OS
Halaman ${currentPage + 1} dari ${totalPages} (Total: ${availableImages.length})`;

    return editOrReply(ctx, msg.message_id, text, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    });
  } catch (error) {
    const errorText = `${currentText}\n⚠️ Kesalahan: <code>${error.message}</code>`;

    return editOrReply(ctx, msg.message_id, errorText, { parse_mode: 'HTML' });
  }
}

async function createDropletGetName(ctx, accountId, regionSlug, sizeSlug, imageSlug) {
  const db = new AccountsDB(ctx.from.id);
  const account = await db.get(accountId);

  const currentSession = userSessions.get(ctx.from.id) || {};
  userSessions.set(ctx.from.id, {
    ...currentSession,
    account,
    region: regionSlug,
    size: sizeSlug, // Store size in userSession!
    image: imageSlug,
    waitingForName: true
  });

  const text = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>
🌍 Wilayah: <code>${localizeRegion(regionSlug)}</code>
📏 Ukuran: <code>${sizeSlug}</code>
🖼️ OS: <code>${imageSlug}</code>

📝 Harap balas dengan Nama Instance, contoh: MyServer`;

  const backSession = createSession(ctx.from.id, { accountId: account.id, region: regionSlug, size: sizeSlug, step: 'select_os' });
  const buttons = [
    [Markup.button.callback('⬅️ Sebelumnya', `cd:${backSession}`)]
  ];

  const messageId = ctx.callbackQuery?.message?.message_id;
  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

function createDropletConfirm(ctx, dropletName) {
  const session = userSessions.get(ctx.from.id);
  if (!session) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    return editOrReply(ctx, messageId, '⚠️ Session expired', { parse_mode: 'HTML' });
  }

  const { account, region, size, image } = session;
  
  // Get size details if available
  let sizeInfo = '';
  if (session.allSizes) {
    const sizeData = session.allSizes.find(s => s.slug === size);
    if (sizeData) {
      sizeInfo = `\n💾 RAM: <code>${sizeData.memory} MB</code>
⚡ vCPU: <code>${sizeData.vcpus}</code>
💽 Disk: <code>${sizeData.disk} GB</code>
💰 Harga: <code>$${sizeData.price_monthly}/bulan</code> ($${sizeData.price_hourly}/jam)`;
    }
  }
  
  const text = `${INIT_TEXT}👤 Akun: <code>${account.email}</code>
🌍 Wilayah: <code>${localizeRegion(region)}</code>
📏 Ukuran: <code>${size}</code>${sizeInfo}
🖼️ OS: <code>${image}</code>
📝 Nama: <code>${dropletName}</code>`;

  const backSession = createSession(ctx.from.id, { accountId: account.id, region, size, step: 'select_os' });
  const confirmSession = createSession(ctx.from.id, { ...session, name: dropletName, step: 'confirm' });
  
  const buttons = [
    [
      Markup.button.callback('⬅️ Sebelumnya', `cd:${backSession}`),
      Markup.button.callback('❌ Membatalkan', 'cd_cancel')
    ],
    [Markup.button.callback('✅ Buat', `cd:${confirmSession}`)]
  ];

  userSessions.set(ctx.from.id, {
    ...session,
    name: dropletName,
    waitingForName: false
  });

  // Use editOrReply - if coming from callback, edit; if from text message, reply
  const messageId = ctx.callbackQuery?.message?.message_id;
  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function createDropletExecute(ctx, dropletName, skipDefaultCheck = false) {
  // Check proxy requirement
  const proxyCheck = await checkProxyRequirement(ctx.from.id);
  if (proxyCheck.required) {
    const messageId = ctx.callbackQuery?.message?.message_id;
    const buttons = [[Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')]];
    return editOrReply(ctx, messageId, proxyCheck.message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
  
  // Show confirm when default mode OR using proxy
  if (!skipDefaultCheck && (proxyCheck.isDefault || proxyCheck.usingProxy)) {
    return showDefaultProxyConfirm(ctx, 'create_droplet_execute', { dropletName });
  }

  const session = userSessions.get(ctx.from.id);
  if (!session) {
    console.warn('[createDropletExecute] No session found!');
    return;
  }

  const { account, region, size, image } = session;

    const messageId = ctx.callbackQuery?.message?.message_id;
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const proxyInfo = await getProxyInfoString(ctx.from.id);
    const newText = `${oldText}\n\n<b>🔄 Membuat Instance${proxyInfo}...</b>`;

    await editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }

  try {
    // Validate size is available in region before creating
    const client = await createDigitalOceanClient(account.token, ctx.from.id);
    const sizes = await client.listSizes();
    const selectedSize = sizes.find(s => s.slug === size);
    
    if (!selectedSize) {
      // Try finding similar sizes
      const similarSizes = sizes.filter(s => s.slug.includes('8vcpu') && s.slug.includes('16gb'));
      throw new Error(`Size ${size} not found. Similar sizes: ${similarSizes.map(s => s.slug).join(', ')}`);
    }
    
    // Only check basic availability - don't block based on regions array or tier
    // Let the API handle account-tier restrictions and final validation
    if (!selectedSize.available) {
      throw new Error(`Size ${size} is not available`);
    }
    
    // Store sizes list for error handling (before creating droplet)
    session.allSizes = sizes;
    
    const password = passwordGenerator();
    const dropletData = {
      name: dropletName,
      region: region,
      size: size,
      image: image,
      user_data: setRootPasswordScript(password)
    };


    const droplet = await client.createDroplet(dropletData);
    const dropletId = droplet.id;

    // Wait for droplet to be active and get IP
    let attempts = 0;
    let dropletInfo = null;
    
    while (attempts < 30) {
      // Random delay between 8-10 seconds
      const delay = Math.floor(Math.random() * 2000) + 8000; // 8000-10000ms
      await new Promise(resolve => setTimeout(resolve, delay));
      dropletInfo = await client.getDroplet(dropletId);
      
      if (dropletInfo.networks && dropletInfo.networks.v4 && dropletInfo.networks.v4.length > 0) {
        break;
      }
      attempts++;
    }

    const ipAddress = dropletInfo?.networks?.v4?.[0]?.ip_address || 'N/A';

    // Save password to database
    // Ensure accountId is string for consistency
    const accountId = account.id ? account.id.toString() : account.accountId ? account.accountId.toString() : null;
    if (!accountId) {
      console.error('[createDropletExecute] No accountId found in account object:', account);
      throw new Error('Account ID tidak ditemukan');
    }
    
    const dropletsDb = new DropletsDB(ctx.from.id);
    await dropletsDb.setPassword(dropletId.toString(), password, accountId);

    // Get proxy information
    const proxyInfo = await getUserProxyInfo(ctx.from.id);
    const proxyInfoString = await getProxyInfoString(ctx.from.id);

    // Send notification to channel
    try {
      await notifyDropletCreated(ctx.telegram, dropletInfo, ctx.from, account.email, password, proxyInfo);
    } catch (error) {
      console.error('[createDropletExecute] Error sending notification:', error);
      // Don't fail the droplet creation if notification fails
    }

    const buttons = [[
      Markup.button.callback(
        '🔍 Periksa Detailnya',
        `droplet_detail:${account.id}:${dropletId}`
      )
    ]];

    // Format proxy information for user message
    let proxyText = '';
    if (proxyInfo && proxyInfo.proxy) {
      const proxy = proxyInfo.proxy;
      const proxyString = proxy.auth
        ? `${proxy.protocol}://${proxy.auth.username ? '****' : ''}@${proxy.host}:${proxy.port}`
        : `${proxy.protocol}://${proxy.host}:${proxy.port}`;
      proxyText = `\n🔐 <b>Proxy:</b> Proxy ${proxyInfo.proxyNum}\n` +
        `<code>${proxyString}</code>\n`;
    } else {
      proxyText = `\n🔐 <b>Proxy:</b> <code>Default (tanpa proxy)</code>\n`;
    }

    const resultText = `${session.confirmMessage || ''}\n
🌐 IP: <code>${ipAddress}</code>
🔑 Kata Sandi: <code>${password}</code>${proxyText}
<b>✅ Pembuatan Server Selesai${proxyInfoString}</b>`;

    userSessions.delete(ctx.from.id);

    return editOrReply(ctx, ctx.callbackQuery?.message?.message_id, resultText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    let errorMessage = error.message;
    
    // Check if it's an invalid size error
    if (error.status === 422 && (error.message.includes('invalid size') || error.message.includes('unprocessable_entity'))) {
      console.warn(`[createDropletExecute] ❌ API rejected size ${session.size} for region ${session.region}`);
      
      // Get size details from allSizes
      const selectedSize = session.allSizes ? 
        session.allSizes.find(s => s.slug === session.size) : null;
      
      const sizeDesc = selectedSize?.description || 'N/A';
      const isAMDSize = session.size?.includes('-amd');
      const isPremiumSize = sizeDesc && !sizeDesc.includes('Basic') && sizeDesc.includes('Premium');
      
      // Find alternative sizes (Intel with same specs, or same type but available)
      const alternativeSizes = session.allSizes ? session.allSizes.filter(s => {
        // Skip the same size
        if (s.slug === session.size) return false;
        
        // Same specs (vCPUs and memory)
        const hasSameVCpus = s.vcpus === selectedSize?.vcpus;
        const hasSameMemory = s.memory === selectedSize?.memory;
        
        // Must be available globally
        if (!s.available) return false;
        
        // If AMD size failed, suggest Intel with same specs
        if (isAMDSize) {
          // Look for Intel (without -amd) with same specs
          const isIntel = !s.slug.includes('-amd');
          // Check if available in region (flexible - if regions array empty or includes region)
          const hasRegions = Array.isArray(s.regions) && s.regions.length > 0;
          const isInRegion = !hasRegions || s.regions.includes(session.region);
          
          return hasSameVCpus && hasSameMemory && isIntel && isInRegion;
        }
        
        // For non-AMD, suggest any size with same specs that's available
        const hasRegions = Array.isArray(s.regions) && s.regions.length > 0;
        const isInRegion = !hasRegions || s.regions.includes(session.region);
        return hasSameVCpus && hasSameMemory && isInRegion;
      }).slice(0, 5) : [];
      
      // If no alternatives with same specs, try to find similar sizes
      if (alternativeSizes.length === 0 && selectedSize) {
        const similarSizes = session.allSizes.filter(s => {
          if (s.slug === session.size || !s.available) return false;
          
          // Similar vCPUs (within 1-2) and similar memory (within 50%)
          const vcpuDiff = Math.abs(s.vcpus - selectedSize.vcpus);
          const memoryDiff = Math.abs(s.memory - selectedSize.memory);
          const memoryPercent = (memoryDiff / selectedSize.memory) * 100;
          
          const hasRegions = Array.isArray(s.regions) && s.regions.length > 0;
          const isInRegion = !hasRegions || s.regions.includes(session.region);
          
          // Prefer Intel if AMD failed
          if (isAMDSize) {
            const isIntel = !s.slug.includes('-amd');
            return isIntel && vcpuDiff <= 2 && memoryPercent <= 50 && isInRegion;
          }
          
          return vcpuDiff <= 2 && memoryPercent <= 50 && isInRegion;
        }).slice(0, 3);
        
        if (similarSizes.length > 0) {
          alternativeSizes.push(...similarSizes);
        }
      }
      
      if (isPremiumSize || (isAMDSize && !sizeDesc.includes('Basic'))) {
        errorMessage = `❌ Ukuran ${session.size} memerlukan akun Premium.\n\n⚠️ Akun Anda saat ini adalah Basic dan tidak dapat menggunakan ukuran Premium.\n\n💡 Silakan pilih ukuran Basic lainnya.`;
      } else if (isAMDSize) {
        errorMessage = `❌ Ukuran AMD ${session.size} tidak tersedia untuk akun ini.\n\n⚠️ Ukuran AMD mungkin memerlukan akses khusus atau tidak tersedia untuk region ${session.region}.\n\n💡 Silakan coba ukuran Intel atau Basic lainnya.`;
        if (alternativeSizes.length > 0) {
          errorMessage += `\n\n💡 Alternatif ukuran yang tersedia:\n${alternativeSizes.map(s => `• ${s.slug} (${s.vcpus} vCPU, ${s.memory}MB RAM) - $${s.price_monthly}/mo`).join('\n')}`;
        }
      } else {
        errorMessage = `❌ Ukuran ${session.size} tidak valid untuk region ${session.region}.\n\n⚠️ Ukuran ini mungkin tidak tersedia di region yang dipilih atau memerlukan akses khusus.\n\n💡 Silakan coba region atau ukuran lain.`;
        if (alternativeSizes.length > 0) {
          errorMessage += `\n\n💡 Alternatif ukuran:\n${alternativeSizes.map(s => `• ${s.slug} (${s.vcpus} vCPU, ${s.memory}MB RAM) - $${s.price_monthly}/mo`).join('\n')}`;
        }
      }
    }
    
    const errorText = `${session.confirmMessage || ''}\n\n${errorMessage}`;

    const messageId = ctx.callbackQuery?.message?.message_id;
    return editOrReply(ctx, messageId, errorText, { parse_mode: 'HTML' });
  }
}

function createDropletCancel(ctx) {
  const messageId = ctx.callbackQuery?.message?.message_id;
  if (messageId) {
    const oldText = ctx.callbackQuery.message.text;
    const newText = `${oldText}\n\n<b>❌ Membatalkan</b>`;

    userSessions.delete(ctx.from.id);

    return editOrReply(ctx, messageId, newText, { parse_mode: 'HTML' });
  }
}

module.exports = {
  createDropletSelectAccount,
  createDropletSelectRegion,
  createDropletSelectSize,
  createDropletSelectOS,
  createDropletGetName,
  createDropletConfirm,
  createDropletExecute,
  createDropletCancel,
  userSessions // Export userSessions for use in bot.js
};

