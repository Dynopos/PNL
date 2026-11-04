import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { inputClass } from '../../components/fieldStyles';
import { Logo } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import { authErrorMessage } from './authErrors';
import { useAuth } from './AuthProvider';

type Mode = 'signin' | 'signup';

export function AuthPage() {
  const { client, session } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  if (session) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/masuk' ? from : '/'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && password.length < 8) {
      setError('Kata laluan mesti sekurang-kurangnya 8 aksara.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(authErrorMessage(err));
      } else {
        const { data, error: err } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() || undefined },
            emailRedirectTo: window.location.origin,
          },
        });
        if (err) setError(authErrorMessage(err));
        else if (!data.session) setAwaitingConfirmation(true);
      }
    } catch (err) {
      setError(authErrorMessage(err as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <Logo className="mx-auto h-16 w-auto" />
        <p className="mt-4 text-center font-display text-lg font-semibold">Cakap Je, Terus Rekod.</p>
        <p className="mt-1 text-center text-sm text-muted">Rekod belanja harian dengan suara.</p>

        {awaitingConfirmation ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
            <MailCheck className="mx-auto size-10 text-accent" aria-hidden />
            <h1 className="mt-3 font-display text-xl font-semibold">Semak emel anda</h1>
            <p className="mt-2 text-sm text-muted">
              Kami telah hantar pautan pengesahan ke <strong className="text-ink">{email.trim()}</strong>. Tekan
              pautan itu, kemudian log masuk.
            </p>
            <button
              type="button"
              className="mt-5 text-sm font-semibold text-accent"
              onClick={() => {
                setAwaitingConfirmation(false);
                setMode('signin');
              }}
            >
              Kembali ke log masuk
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-sm" noValidate>
            <div role="tablist" className="grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError('');
                  }}
                  className={`min-h-11 rounded-lg transition ${
                    mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  {m === 'signin' ? 'Log masuk' : 'Daftar'}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              {mode === 'signup' && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-muted">Nama paparan</span>
                  <input
                    className={inputClass}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="cth: Ali"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-muted">Emel</span>
                <input
                  className={inputClass}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@contoh.com"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-muted">Kata laluan</span>
                <input
                  className={inputClass}
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="mt-5 min-h-12 w-full rounded-xl bg-accent font-display text-base font-semibold text-on-accent transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Sila tunggu…' : mode === 'signin' ? 'Log masuk' : 'Cipta akaun'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
