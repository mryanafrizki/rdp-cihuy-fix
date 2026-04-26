const { Markup } = require('telegraf');
const UsersDB = require('../utils/usersDb');
const { editOrReply } = require('../utils/editOrReply');

async function start(ctx) {
  // Register or update user
  const usersDb = new UsersDB();
  await usersDb.registerUser(
    ctx.from.id,
    ctx.from.username || '',
    ctx.from.first_name || '',
    ctx.from.last_name || ''
  );
  const text = `🤖 <b>Welcome to DigitalOcean Control Bot</b> 🌐

Mulai kelola semua <b>Droplet</b>, akun, dan konfigurasi DigitalOcean Anda — langsung dari sini, cepat dan efisien.

<b>/start</b> — untuk memulai sesi pengelolaan bot.

🚀 Siap membantu Anda membangun dan memantau server dengan mudah!

<b>Rent:</b> <a href="https://t.me/azovest">@azovest</a> 👨‍💻
<b>Shop & RDP Installer:</b> <a href="https://t.me/azovest_bot">@azovest_bot</a> 👨‍`;

  const messageId = ctx.callbackQuery?.message?.message_id;

  return editOrReply(ctx, messageId, text, { 
    parse_mode: 'HTML',
	disable_web_page_preview: true,
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Tambah akun', 'add_account'),
        Markup.button.callback('⚙️ Kelola akun', 'manage_accounts')
      ],
      [
        Markup.button.callback('💧 Buat droplets', 'create_droplet'),
        Markup.button.callback('🛠️ Kelola droplets', 'manage_droplets')
      ]
    ])
  });
}

module.exports = { start };

