import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

export interface Profile {
  id: string;
  display_name: string | null;
  preferred_language: 'ms' | 'en';
}

export function useProfile() {
  const { client, session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    client
      .from('profiles')
      .select('id, display_name, preferred_language')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!active) return;
        setProfile((data as Profile | null) ?? null);
        setError(Boolean(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, userId]);

  const updateDisplayName = useCallback(
    async (name: string) => {
      if (!userId) return false;
      const display_name = name.trim().slice(0, 80) || null;
      const { data, error: err } = await client
        .from('profiles')
        .update({ display_name })
        .eq('id', userId)
        .select('id, display_name, preferred_language')
        .single();
      if (err) return false;
      setProfile(data as Profile);
      return true;
    },
    [client, userId],
  );

  return { profile, loading, error, updateDisplayName };
}
