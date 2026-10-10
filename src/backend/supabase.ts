import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    )
  }
  return client
}

export const BACKEND: 'supabase' | 'local' =
  (import.meta.env.VITE_BACKEND as 'supabase' | 'local' | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL ? 'supabase' : 'local')
