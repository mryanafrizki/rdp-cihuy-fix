const { Markup } = require('telegraf');
const AccountsDB = require('../utils/db');
const { createSession } = require('../utils/callbackSession');
const { editOrReply } = require('../utils/editOrReply');

const PER_PAGE = 10;

async function manageDroplets(ctx, page = 0) {
  const db = new AccountsDB(ctx.from.id);
  const allAccounts = await db.all();

  const totalAccounts = allAccounts.length;
  const totalPages = Math.ceil(totalAccounts / PER_PAGE) || 1;
  const currentPage = Math.min(page, totalPages - 1);

  const startIdx = currentPage * PER_PAGE;
  const endIdx = Math.min(startIdx + PER_PAGE, totalAccounts);
  const accounts = allAccounts.slice(startIdx, endIdx);

  let text = '<b>Manajer VPS</b>\n\n';
  text += `📊 Total: <b>${totalAccounts}</b> akun\n\n`;
  const messageId = ctx.callbackQuery?.message?.message_id;

  if (totalAccounts === 0) {
    const buttons = [
      [Markup.button.callback('➕ Tambah Akun', 'add_account')]
    ];
    
    return editOrReply(ctx, messageId, `${text}⚠️ Tidak ada akun yang tersedia`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  const buttons = [];

  // Display accounts (2 buttons per row)
  for (let i = 0; i < accounts.length; i += 2) {
    const row = [];
    const account1 = accounts[i];
    const account2 = accounts[i + 1];

    const session1 = createSession(ctx.from.id, { accountId: account1.id });
    row.push(Markup.button.callback(
      `📧 ${account1.email.length > 20 ? account1.email.substring(0, 20) + '...' : account1.email}`,
      `ld:${session1}`
    ));

    if (account2) {
      const session2 = createSession(ctx.from.id, { accountId: account2.id });
      row.push(Markup.button.callback(
        `📧 ${account2.email.length > 20 ? account2.email.substring(0, 20) + '...' : account2.email}`,
        `ld:${session2}`
      ));
    }

    buttons.push(row);
  }

  // Navigation buttons
  const navButtons = [];
  if (currentPage > 0) {
    const prevSession = createSession(ctx.from.id, { page: currentPage - 1, action: 'manage_droplets' });
    navButtons.push(Markup.button.callback('⬅️ Sebelumnya', `manage_droplets:page:${prevSession}`));
  }
  if (currentPage < totalPages - 1) {
    const nextSession = createSession(ctx.from.id, { page: currentPage + 1, action: 'manage_droplets' });
    navButtons.push(Markup.button.callback('Berikutnya ➡️', `manage_droplets:page:${nextSession}`));
  }
  if (navButtons.length > 0) {
    buttons.push(navButtons);
  }

  buttons.push([Markup.button.callback('🔙 Kembali ke Menu Utama', 'start')]);

  return editOrReply(ctx, messageId, `${text}🔢 Pilih akun yang ingin dikelola`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

module.exports = { manageDroplets };
