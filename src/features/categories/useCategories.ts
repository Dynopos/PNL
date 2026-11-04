import { useMemo } from 'react';
import { useLoad } from '../../lib/data';
import type { Category } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { listCategories } from '../transactions/api';

export function useCategories() {
  const { client } = useAuth();
  const { data, error, loading } = useLoad(() => listCategories(client), [client]);
  const categories = useMemo(() => data ?? [], [data]);
  const byId = useMemo(() => new Map<string, Category>(categories.map((c) => [c.id, c])), [categories]);
  return { categories, byId, error, loading };
}
