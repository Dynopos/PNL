import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Account, AccountKind } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { ensureAccount, friendlyError } from '../transactions/api';

const STORAGE_KEY = 'vapro-account';

function readKind(): AccountKind {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'business' ? 'business' : 'personal';
  } catch {
    return 'personal';
  }
}

interface AccountContextValue {
  kind: AccountKind;
  account: Account | null;
  error: string;
  setKind: (kind: AccountKind) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** The active book: Personal or Business. Every query and new record is scoped to it. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { client, session } = useAuth();
  const userId = session?.user.id;
  const [kind, setKindState] = useState<AccountKind>(readKind);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setAccount(null);
    setError('');
    ensureAccount(client, userId, kind).then(
      (a) => active && setAccount(a),
      (e) => active && setError(friendlyError(e)),
    );
    return () => {
      active = false;
    };
  }, [client, userId, kind]);

  const setKind = useCallback((next: AccountKind) => {
    setKindState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // choice just won't persist
    }
  }, []);

  return <AccountContext.Provider value={{ kind, account, error, setKind }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}
