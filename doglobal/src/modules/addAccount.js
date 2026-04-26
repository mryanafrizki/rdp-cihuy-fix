const { Markup } = require('telegraf');
const { createDigitalOceanClient } = require('../utils/createDigitalOceanClient');
const AccountsDB = require('../utils/db');
const UsersDB = require('../utils/usersDb');
const { start } = require('./start');

function addAccount(ctx) {
  const text = `🔑 <b>Tambahkan Akun DigitalOcean</b>

Masukkan Token DigitalOcean <a href="https://cloud.digitalocean.com/account/api/tokens">Ambil Disini</a> perhatikan dalam copy paste

Contoh:
<code>do_v1_xxxx</code>

/cancel untuk membatalkan`;

  return ctx.reply(text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]
    ])
  });
}

async function addAccountHandler(ctx) {
  // Validate input
  if (!ctx.message.text || ctx.message.text.trim().length === 0) {
    return ctx.reply('❌ Token tidak boleh kosong!');
  }

  const msg = await ctx.reply('🔄 Menambahkan akun...');

  const lines = ctx.message.text.split('\n');
  const addedAccounts = [];
  const failedAccounts = [];

  const db = new AccountsDB(ctx.from.id);
  const usersDb = new UsersDB();

  // Register or update user
  await usersDb.registerUser(
    ctx.from.id,
    ctx.from.username || '',
    ctx.from.first_name || '',
    ctx.from.last_name || ''
  );

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue; // Skip empty lines

    const [token, ...remarkParts] = trimmedLine.split(':');
    const remarks = remarkParts.join(':');
    const trimmedToken = token.trim();

    // Validate token format
    if (!trimmedToken || trimmedToken.length < 10) {
      failedAccounts.push({
        line: trimmedLine,
        error: 'Token terlalu pendek atau tidak valid'
      });
      continue;
    }

    try {
      // For adding account, use token directly without proxy
      // Proxy will be used for all subsequent API calls
      const DigitalOceanClient = require('../utils/digitaloceanClient');
      const client = new DigitalOceanClient(trimmedToken);
      const accountInfo = await client.getAccount();
      const email = accountInfo.email;

      if (!email) {
        throw new Error('Email tidak ditemukan dari akun');
      }

      // Check limit (max 30 accounts per user)
      const existingAccounts = await db.all();
      if (existingAccounts.length >= 30) {
        failedAccounts.push({
          line: trimmedLine,
          error: 'Maksimal 30 akun per user'
        });
        continue;
      }

      await db.add(email, trimmedToken, remarks);
      addedAccounts.push(email);
    } catch (error) {
      console.error('Failed to add account:', error.message);
      failedAccounts.push({
        line: trimmedLine,
        error: error.message || 'Unknown error'
      });
    }
  }

  let resultText = `<b>📊 Total ${lines.length} akun</b>\n\n`;

  if (addedAccounts.length > 0) {
    resultText += `✅ Berhasil menambahkan ${addedAccounts.length} akun:\n`;
    addedAccounts.forEach(email => {
      resultText += `<code>${email}</code>\n`;
    });
    resultText += '\n';
  }

  if (failedAccounts.length > 0) {
    resultText += `❌ Gagal menambahkan ${failedAccounts.length} akun:\n`;
    failedAccounts.forEach((item, idx) => {
      if (typeof item === 'string') {
        resultText += `<code>${item}</code>\n`;
      } else {
        const tokenPreview = item.line.length > 20 ? item.line.substring(0, 20) + '...' : item.line;
        const errorMsg = item.error.includes('401') || item.error.includes('Unauthorized') 
          ? 'Token tidak valid' 
          : item.error;
        resultText += `<code>${tokenPreview}</code> - ${errorMsg}\n`;
      }
    });
  }

  const buttons = [
    [Markup.button.callback('🔙 Kembali ke Manajer Akun', 'manage_accounts')]
  ];

  return ctx.telegram.editMessageText(
    ctx.chat.id,
    msg.message_id,
    null,
    resultText,
    { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
    }
  );
}

module.exports = { addAccount, addAccountHandler };

