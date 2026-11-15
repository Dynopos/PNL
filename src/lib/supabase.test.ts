import { readSupabaseConfig } from './supabase';

describe('readSupabaseConfig', () => {
  it('returns null when variables are missing or still placeholders', () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'k',
      }),
    ).toBeNull();
  });

  it('returns trimmed values when configured', () => {
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: ' https://abc.supabase.co ', VITE_SUPABASE_ANON_KEY: ' key ' }),
    ).toEqual({ url: 'https://abc.supabase.co', anonKey: 'key' });
  });
});
