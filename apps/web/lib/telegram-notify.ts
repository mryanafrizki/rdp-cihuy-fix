// Sends a message to a Telegram chat via Bot API
// Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

export async function notifyTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return // silently skip if not configured

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
  } catch {
    // Fire-and-forget, don't block the request
  }
}

// Convenience helpers for common events
export function notifyTopupSuccess(email: string, amount: number) {
  notifyTelegram(`💰 <b>Top Up Success</b>\nUser: ${email}\nAmount: Rp ${Math.abs(amount).toLocaleString('id-ID')}`).catch(() => {})
}

export function notifyNewOrder(email: string, vpsIp: string, osVersion: string) {
  notifyTelegram(`🖥️ <b>New RDP Order</b>\nUser: ${email}\nVPS: ${vpsIp}\nOS: ${osVersion}`).catch(() => {})
}

export function notifyInstallComplete(email: string, vpsIp: string, status: 'completed' | 'failed') {
  const emoji = status === 'completed' ? '✅' : '❌'
  notifyTelegram(`${emoji} <b>Install ${status === 'completed' ? 'Complete' : 'Failed'}</b>\nUser: ${email}\nVPS: ${vpsIp}`).catch(() => {})
}

export function notifyNewUser(email: string, info?: { ip?: string; userAgent?: string; device?: string }) {
  const lines = [`👤 <b>New User Registered</b>`, `Email: ${email}`]
  if (info?.ip) lines.push(`IP: ${info.ip}`)
  if (info?.device) lines.push(`Device: ${info.device}`)
  if (info?.userAgent) lines.push(`UA: <code>${info.userAgent.slice(0, 200)}</code>`)
  notifyTelegram(lines.join('\n')).catch(() => {})
}

export function notifyPasswordChange(email: string) {
  notifyTelegram(`🔐 <b>Password Changed</b>\nUser: ${email}`).catch(() => {})
}

export function notifyPasswordReset(email: string) {
  notifyTelegram(`🔑 <b>Password Reset</b>\nUser: ${email}`).catch(() => {})
}

export function notifyError(route: string, error: string, details?: Record<string, string>) {
  const detailLines = details ? Object.entries(details).map(([k, v]) => `${k}: ${v}`).join('\n') : ''
  notifyTelegram(
    `⚠️ <b>Server Error</b>\n` +
    `Route: <code>${route}</code>\n` +
    `Error: <code>${error.slice(0, 500)}</code>` +
    (detailLines ? `\n${detailLines}` : '')
  ).catch(() => {})
}
