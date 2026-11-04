import { DatabaseZap } from 'lucide-react';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function SetupRequired() {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <Logo className="mx-auto h-14 w-auto" />
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
          <DatabaseZap className="size-8 text-accent" aria-hidden />
          <h1 className="mt-3 font-display text-xl font-semibold">Supabase belum disambung</h1>
          <p className="mt-2 text-sm text-muted">
            Salin <code className="rounded bg-surface-2 px-1.5 py-0.5 text-ink">.env.example</code> ke{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-ink">.env</code>, isi URL projek dan anon key
            Supabase anda, kemudian mulakan semula aplikasi.
          </p>
          <a
            href="/pnl/index.html"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-accent"
          >
            Buka alat PNL (tidak perlu akaun)
          </a>
        </div>
      </div>
    </div>
  );
}
