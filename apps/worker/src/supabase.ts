import { createClient } from '@supabase/supabase-js'

export function createSupabaseClient(url?: string, serviceKey?: string) {
  const supabaseUrl = url || process.env.SUPABASE_URL
  const supabaseServiceKey = serviceKey || process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY.'
    )
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}
