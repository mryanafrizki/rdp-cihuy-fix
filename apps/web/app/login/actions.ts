'use server'

import { signIn } from '@/lib/auth-config'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { logActivity } from '@/lib/activity-logger'
import { getServerActionInfo } from '@/lib/request-info'
import { AuthError } from 'next-auth'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

export async function login(prevState: { error: string } | null | undefined, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { error: 'Please enter a valid email address' }
  }

  // Get user for session tracking and logging BEFORE signIn
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, emailConfirmed: schema.users.emailConfirmed })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  // Check email confirmation
  if (user && !user.emailConfirmed) {
    return { error: 'Please confirm your email first. Check your inbox.' }
  }

  try {
    // Register session before signIn
    if (user) {
      try {
        const sessionId = crypto.randomUUID()
        await db
          .insert(schema.userSessions)
          .values({
            userId: user.id,
            sessionId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.userSessions.userId,
            set: {
              sessionId,
              updatedAt: new Date(),
            },
          })
      } catch {
        // Session tracking failed, proceed
      }
    }

    // Log login (fire-and-forget, before redirect)
    if (user) {
      getServerActionInfo().then((info) => {
        logActivity({
          action: 'login',
          userId: user.id,
          email: user.email || email,
          ...info,
        })
      }).catch(() => {})
    }

    // Auth.js signIn — let it handle redirect (throws NEXT_REDIRECT)
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    })
  } catch (error) {
    // NEXT_REDIRECT is thrown by signIn on success — must rethrow
    if (isRedirectError(error)) {
      throw error
    }
    if (error instanceof AuthError) {
      return { error: 'Invalid email or password' }
    }
    throw error
  }
}
