import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export interface ProgressUpdate {
  installationId: string;
  step: number;
  totalSteps: number;
  message: string;
  status: 'pending' | 'installing' | 'completed' | 'failed';
}

export async function publishProgress({
  installationId,
  step,
  totalSteps,
  message,
  status,
}: ProgressUpdate): Promise<void> {
  const updateData: Record<string, any> = {
    progress_step: step,
    progress_message: message,
    status,
  };

  if (status === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('installations')
    .update(updateData)
    .eq('id', installationId);

  if (error) {
    console.error('Failed to publish progress:', error);
    throw error;
  }
}
