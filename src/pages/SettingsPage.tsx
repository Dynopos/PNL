import { FileSpreadsheet, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { useProfile } from '../features/profile/useProfile';
import { useTheme, type ThemePreference } from '../lib/theme';

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Cerah', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Ikut peranti', icon: Monitor },
];

const card = 'rounded-2xl border border-line bg-surface p-5';

export function SettingsPage() {
  const { client, session } = useAuth();
  const { profile, loading, error, updateDisplayName } = useProfile();
  const { preference, setPreference } = useTheme();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    setName(profile?.display_name ?? '');
  }, [profile?.display_name]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setStatus((await updateDisplayName(name)) ? 'saved' : 'failed');
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Tetapan</h1>

      <form onSubmit={onSave} className={card}>
        <h2 className="font-display font-semibold">Profil</h2>
        <p className="mt-1 text-sm text-muted">{session?.user.email}</p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Nama paparan</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setStatus('idle');
            }}
            maxLength={80}
            disabled={loading}
            className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-base text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">Profil tidak dapat dimuatkan.</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || status === 'saving'}
            className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50"
          >
            {status === 'saving' ? 'Menyimpan…' : 'Simpan'}
          </button>
          <span role="status" className="text-sm">
            {status === 'saved' && <span className="text-accent">Disimpan.</span>}
            {status === 'failed' && <span className="text-danger">Gagal disimpan. Cuba lagi.</span>}
          </span>
        </div>
      </form>

      <section className={card}>
        <h2 className="font-display font-semibold">Paparan</h2>
        <div role="radiogroup" aria-label="Tema" className="mt-4 grid grid-cols-3 gap-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preference === value}
              onClick={() => setPreference(value)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition ${
                preference === value ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-display font-semibold">Alat lain</h2>
        <a href="/pnl/index.html" className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-accent">
          <FileSpreadsheet className="size-5" aria-hidden />
          Untung Rugi Bisnes (PNL)
        </a>
      </section>

      <section className={card}>
        <h2 className="font-display font-semibold">Akan datang</h2>
        <p className="mt-1 text-sm text-muted">
          Urus kategori, tetapan suara, maklumat privasi dan padam akaun (Fasa 4).
        </p>
      </section>

      <button
        type="button"
        onClick={() => client.auth.signOut()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-semibold text-danger"
      >
        <LogOut className="size-5" aria-hidden />
        Log keluar
      </button>
    </div>
  );
}
