import type { SupabaseClient } from '@supabase/supabase-js';
import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { SetupRequired } from '../components/SetupRequired';
import { Spinner } from '../components/Spinner';
import { AccountProvider } from '../features/accounts/AccountProvider';
import { AuthPage } from '../features/auth/AuthPage';
import { AuthProvider } from '../features/auth/AuthProvider';
import { RequireAuth } from '../features/auth/RequireAuth';
import { TransactionSheetProvider } from '../features/transactions/TransactionSheet';
import { DataVersionProvider } from '../lib/data';
import { DashboardPage } from '../pages/DashboardPage';
import { VoicePage } from '../pages/VoicePage';
import { SettingsPage } from '../pages/SettingsPage';
import { TransactionsPage } from '../pages/TransactionsPage';

const ReportsPage = lazy(() => import('../pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ReconciliationPage = lazy(() =>
  import('../pages/ReconciliationPage').then((m) => ({ default: m.ReconciliationPage })),
);

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function SignedInProviders() {
  return (
    <DataVersionProvider>
      <AccountProvider>
        <TransactionSheetProvider>
          <Outlet />
        </TransactionSheetProvider>
      </AccountProvider>
    </DataVersionProvider>
  );
}

export function App({ client }: { client: SupabaseClient | null }) {
  if (!client) return <SetupRequired />;
  return (
    <AuthProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/masuk" element={<AuthPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<SignedInProviders />}>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="transaksi" element={<TransactionsPage />} />
                <Route path="rekod" element={<VoicePage />} />
                <Route
                  path="laporan"
                  element={
                    <Lazy>
                      <ReportsPage />
                    </Lazy>
                  }
                />
                <Route
                  path="padanan"
                  element={
                    <Lazy>
                      <ReconciliationPage />
                    </Lazy>
                  }
                />
                <Route path="tetapan" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
