import type { SupabaseClient } from '@supabase/supabase-js';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { SetupRequired } from '../components/SetupRequired';
import { AuthPage } from '../features/auth/AuthPage';
import { AuthProvider } from '../features/auth/AuthProvider';
import { RequireAuth } from '../features/auth/RequireAuth';
import { DashboardPage } from '../pages/DashboardPage';
import { ReportsPage, TransactionsPage, VoicePage } from '../pages/PlaceholderPages';
import { SettingsPage } from '../pages/SettingsPage';

export function App({ client }: { client: SupabaseClient | null }) {
  if (!client) return <SetupRequired />;
  return (
    <AuthProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/masuk" element={<AuthPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="transaksi" element={<TransactionsPage />} />
              <Route path="rekod" element={<VoicePage />} />
              <Route path="laporan" element={<ReportsPage />} />
              <Route path="tetapan" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
