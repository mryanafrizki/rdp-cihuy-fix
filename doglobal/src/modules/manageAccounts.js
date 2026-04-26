const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const { editOrReply } = require('../utils/editOrReply');
const { createSession } = require('../utils/callbackSession');

const PER_PAGE = 10;
const MAX_ACCOUNTS = 30;

async function manageAccounts(ctx, page = 0) {
  const db = new AccountsDB(ctx.from.id);
  const allAccounts = await db.all();

  const totalAccounts = allAccounts.length;
  const totalPages = Math.ceil(totalAccounts / PER_PAGE) || 1;
  const currentPage = Math.min(page, totalPages - 1);

  const startIdx = currentPage * PER_PAGE;
  const endIdx = Math.min(startIdx + PER_PAGE, totalAccounts);
  const accounts = allAccounts.slice(startIdx, endIdx);


  let text = '<b>Manajer Akun</b>\n\n';
  text += `📊 Total: <b>${totalAccounts}/${MAX_ACCOUNTS}</b> akun\n\n`;
  
  const buttons = [];
  const messageId = ctx.callbackQuery?.message?.message_id;

  if (totalAccounts === 0) {
    text += '⚠️ Tidak ada akun yang tersedia';
    buttons.push([Markup.button.callback('➕ Tambahkan Akun Baru', 'add_account')]);
    
    return editOrReply(ctx, messageId, text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  buttons.push([
    Markup.button.callback('🛠️ Uji Batch Akun', 'batch_test_accounts'),
    Markup.button.callback('🔐 Pengaturan Proxy', 'proxy:manage')
  ]);

  // Display accounts (2 buttons per row)
  for (let i = 0; i < accounts.length; i += 2) {
    const row = [];
    const account1 = accounts[i];
    const account2 = accounts[i + 1];

    row.push(Markup.button.callback(
      `📧 ${account1.email.length > 20 ? account1.email.substring(0, 20) + '...' : account1.email}`,
      `account_detail:${account1.id}`
    ));

    if (account2) {
      row.push(Markup.button.callback(
        `📧 ${account2.email.length > 20 ? account2.email.substring(0, 20) + '...' : account2.email}`,
        `account_detail:${account2.id}`
      ));
    }

    buttons.push(row);
  }

  // Navigation buttons
  const navButtons = [];
  if (currentPage > 0) {
    const prevSession = createSession(ctx.from.id, { page: currentPage - 1, action: 'manage_accounts' });
    navButtons.push(Markup.button.callback('⬅️ Sebelumnya', `manage_accounts:page:${prevSession}`));
  }
  if (currentPage < totalPages - 1) {
    const nextSession = createSession(ctx.from.id, { page: currentPage + 1, action: 'manage_accounts' });
    navButtons.push(Markup.button.callback('Berikutnya ➡️', `manage_accounts:page:${nextSession}`));
  }
  if (navButtons.length > 0) {
    buttons.push(navButtons);
  }

  if (totalAccounts < MAX_ACCOUNTS) {
    buttons.push([Markup.button.callback('➕ Tambahkan Akun Baru', 'add_account')]);
  }

  buttons.push([Markup.button.callback('🔙 Kembali ke Menu Utama', 'start')]);


  return editOrReply(ctx, messageId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

module.exports = { manageAccounts };
