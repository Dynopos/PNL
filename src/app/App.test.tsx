import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../lib/theme';
import { App } from './App';

function fakeClient(session: unknown = null) {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  } as unknown as SupabaseClient;
}

function renderApp(client: SupabaseClient | null) {
  return render(
    <ThemeProvider>
      <App client={client} />
    </ThemeProvider>,
  );
}

describe('App', () => {
  beforeEach(() => window.history.pushState({}, '', '/'));

  it('explains setup when Supabase is not configured', () => {
    renderApp(null);
    expect(screen.getByRole('heading', { name: /supabase belum disambung/i })).toBeInTheDocument();
  });

  it('sends signed-out visitors to the sign-in form', async () => {
    window.history.pushState({}, '', '/transaksi');
    renderApp(fakeClient());
    expect(await screen.findByLabelText('Emel')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Log masuk' })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.pathname).toBe('/masuk');
  });
});
