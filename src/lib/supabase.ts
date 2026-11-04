import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function readSupabaseConfig(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || url.includes('your-project-ref')) return null;
  return { url, anonKey };
}

const config = readSupabaseConfig(import.meta.env);

/** Null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. */
export const supabase: SupabaseClient | null = config
  ? createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
