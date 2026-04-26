import { db, schema } from './db';
import { eq } from 'drizzle-orm';

export async function publishProgress(
  installationId: string,
  step: number,
  message: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
): Promise<void> {
  console.log(`[PROGRESS] Publishing: id=${installationId.substring(0,8)}... step=${step} status=${status}`);

  try {
    const updateData: Partial<typeof schema.installations.$inferInsert> = {
      progressStep: step,
      progressMessage: message,
      status,
      updatedAt: new Date(),
    };

    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    const result = await db
      .update(schema.installations)
      .set(updateData)
      .where(eq(schema.installations.id, installationId))
      .returning({ id: schema.installations.id, status: schema.installations.status });

    if (result.length === 0) {
      console.error(`[PROGRESS] Update returned no rows for id=${installationId}`);
    } else {
      console.log(`[PROGRESS] DB update OK: ${JSON.stringify(result)}`);
    }
  } catch (e: any) {
    console.error(`[PROGRESS] Exception: ${e.message}`);
    console.error(e.stack);
  }
}
