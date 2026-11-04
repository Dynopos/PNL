import { createContext, useCallback, useContext, useEffect, useState, type DependencyList, type ReactNode } from 'react';

const DataVersionContext = createContext<{ version: number; invalidate: () => void }>({
  version: 0,
  invalidate: () => {},
});

/** Bumping the version makes every useLoad() refetch after a write. */
export function DataVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const invalidate = useCallback(() => setVersion((v) => v + 1), []);
  return <DataVersionContext.Provider value={{ version, invalidate }}>{children}</DataVersionContext.Provider>;
}

export function useInvalidate() {
  return useContext(DataVersionContext).invalidate;
}

export function useLoad<T>(load: () => Promise<T>, deps: DependencyList) {
  const { version } = useContext(DataVersionContext);
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error) => active && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => {
      active = false;
    };
  }, [...deps, version]);

  return state;
}
