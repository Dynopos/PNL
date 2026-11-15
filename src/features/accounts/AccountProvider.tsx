import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Account } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { ensureAccount, friendlyError } from '../transactions/api';

interface AccountContextValue {
  account: Account | null;
  error: string;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** The user's single Business book; every query and new record is scoped to it. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { client, session } = useAuth();
  const userId = session?.user.id;
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    let active = true;
    ensureAccount(client, userId, 'business').then(
      (a) => active && setAccount(a),
      (e) => active && setError(friendlyError(e)),
    );
    return () => {
      active = false;
    };
  }, [client, userId]);

  return <AccountContext.Provider value={{ account, error }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}
