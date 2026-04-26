'use server'

import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { checkEmailLimit } from '@/lib/rate-limit'
import { sendEmailConfirmation } from '@/lib/email'
import { redirect } from 'next/navigation'

export async function register(prevState: { error: string } | null | undefined, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!email || !password || !confirmPassword) {
    return { error: 'All fields are required' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { error: 'Please enter a valid email address' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  const { allowed } = checkEmailLimit(email)
  if (!allowed) return { error: 'Too many attempts. Please try again later.' }

  // Check if user already exists
  const [existing] = await db
    .select({ id: schema.users.id, emailConfirmed: schema.users.emailConfirmed })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  if (existing) {
    // If not confirmed, resend confirmation email
    if (!existing.emailConfirmed) {
      try {
        const confirmToken = crypto.randomUUID()
        await db.insert(schema.emailConfirmTokens).values({
          userId: existing.id,
          token: confirmToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        await sendEmailConfirmation(email, confirmToken)
      } catch {
        // Non-fatal
      }
      redirect('/login?registered=true')
    }
    return { error: 'An account with this email already exists' }
  }

  // Hash password and insert user
  const passwordHash = await hashPassword(password)
  const [newUser] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      role: 'user',
      emailConfirmed: false,
    })
    .returning({ id: schema.users.id })

  // Generate confirm token and send confirmation email
  if (newUser) {
    try {
      const confirmToken = crypto.randomUUID()
      await db.insert(schema.emailConfirmTokens).values({
        userId: newUser.id,
        token: confirmToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      await sendEmailConfirmation(email, confirmToken)
    } catch {
      // Non-fatal
    }
  }

  redirect('/login?registered=true')
}
