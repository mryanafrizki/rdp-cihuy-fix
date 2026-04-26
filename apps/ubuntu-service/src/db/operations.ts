import { eq, and, sql } from 'drizzle-orm'
import { db } from './index'
import { users, transactions } from './schema'

/**
 * Atomic balance addition — increments user credit_balance.
 * Uses SELECT FOR UPDATE to prevent race conditions.
 */
export async function addBalance(userId: string, amount: number): Promise<boolean> {
  return await db.transaction(async (tx) => {
    // Lock the user row
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')

    if (!user) return false

    await tx
      .update(users)
      .set({
        creditBalance: sql`credit_balance + ${amount}`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))

    return true
  })
}

/**
 * Atomic balance deduction — decrements only if sufficient funds.
 * Uses SELECT FOR UPDATE to prevent double-spend race conditions.
 */
export async function deductBalance(userId: string, amount: number): Promise<boolean> {
  return await db.transaction(async (tx) => {
    // Lock the user row and check balance
    const [user] = await tx
      .select({ creditBalance: users.creditBalance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')

    if (!user) return false

    const currentBalance = Number(user.creditBalance ?? 0)
    if (currentBalance < amount) return false

    await tx
      .update(users)
      .set({
        creditBalance: sql`credit_balance - ${amount}`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))

    return true
  })
}

/**
 * Atomic payment completion — marks transaction as completed (only if pending)
 * and adds credit to user balance in a single transaction.
 * Prevents double-credit race conditions.
 */
export async function completePayment(
  transactionId: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    // Atomically mark transaction completed only if currently pending
    const updated = await tx
      .update(transactions)
      .set({
        status: 'completed',
        updatedAt: sql`now()`,
      })
      .where(and(eq(transactions.id, transactionId), eq(transactions.status, 'pending')))
      .returning({ id: transactions.id })

    if (updated.length === 0) return false

    // Add credit to user
    await tx
      .update(users)
      .set({
        creditBalance: sql`credit_balance + ${amount}`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))

    return true
  })
}
