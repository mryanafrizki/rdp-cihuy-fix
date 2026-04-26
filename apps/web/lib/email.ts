const RESEND_API_KEY = process.env.SMTP_PASS || ''
const FROM = process.env.SMTP_FROM || 'noreply@cobain.dev'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://rdp.cobain.dev'

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${SITE_URL}/login/reset/confirm?token=${token}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Cobain.dev <${FROM}>`,
      to: [email],
      subject: 'Reset Password - Cobain.dev',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0c; color: #e4e4e7; border-radius: 12px;">
          <h2 style="color: #00f5d4; margin: 0 0 16px;">Reset Password</h2>
          <p style="color: #8a8b9e; line-height: 1.6;">Kamu menerima email ini karena ada permintaan reset password untuk akun <strong style="color: #e4e4e7;">${email}</strong>.</p>
          <a href="${resetUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 32px; background: #00f5d4; color: #0a0a0c; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
          <p style="color: #55566a; font-size: 13px;">Link ini berlaku selama 1 jam. Jika kamu tidak meminta reset password, abaikan email ini.</p>
          <hr style="border: none; border-top: 1px solid #1a1a1f; margin: 24px 0;">
          <p style="color: #55566a; font-size: 12px;">Cobain.dev — RDP Panel</p>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend API error: ${res.status} ${err}`)
  }
}

export async function sendEmailConfirmation(email: string, token: string) {
  const confirmUrl = `${SITE_URL}/auth/confirm?token=${token}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Cobain.dev <${FROM}>`,
      to: [email],
      subject: 'Confirm your email - Cobain.dev',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0a0c; color: #e4e4e7; border-radius: 12px;">
          <h2 style="color: #00f5d4; margin: 0 0 16px;">Confirm Your Email</h2>
          <p style="color: #8a8b9e; line-height: 1.6;">Confirm your email to activate your Cobain.dev account for <strong style="color: #e4e4e7;">${email}</strong>.</p>
          <a href="${confirmUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 32px; background: #00f5d4; color: #0a0a0c; text-decoration: none; border-radius: 8px; font-weight: 600;">Confirm Email</a>
          <p style="color: #55566a; font-size: 13px;">Link ini berlaku selama 24 jam. Jika kamu tidak mendaftar di Cobain.dev, abaikan email ini.</p>
          <hr style="border: none; border-top: 1px solid #1a1a1f; margin: 24px 0;">
          <p style="color: #55566a; font-size: 12px;">Cobain.dev — RDP Panel</p>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend API error: ${res.status} ${err}`)
  }
}
