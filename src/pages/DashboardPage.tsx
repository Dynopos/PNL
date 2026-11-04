import { CalendarDays, ChevronRight, FileSpreadsheet, Mic } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProfile } from '../features/profile/useProfile';
import { dateInKL, formatLongDate } from '../lib/locale';

export function DashboardPage() {
  const { profile } = useProfile();
  const today = formatLongDate(dateInKL());

  return (
    <div className="space-y-5">
      <section>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="size-4" aria-hidden />
          {today}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Hai{profile?.display_name ? `, ${profile.display_name}` : ''} 👋
        </h1>
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="Ringkasan belanja">
        {['Belanja hari ini', 'Belanja bulan ini'].map((label) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-muted/60">—</p>
            <p className="mt-1 text-[11px] text-muted">Tersedia dalam Fasa 2</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col items-center rounded-3xl border border-line bg-surface px-6 py-8 text-center">
        <Link
          to="/rekod"
          aria-label="Tekan untuk rekod belanja"
          className="grid size-28 place-items-center rounded-full bg-accent text-on-accent shadow-[0_0_0_12px_var(--accent-soft),0_18px_40px_-12px_var(--accent)] transition active:scale-95"
        >
          <Mic className="size-11" aria-hidden />
        </Link>
        <p className="mt-6 font-display text-lg font-semibold">Tekan untuk rekod belanja</p>
        <p className="mt-1 text-sm text-muted">“Mydin lima puluh lima ringgit”</p>
      </section>

      <a
        href="/pnl/index.html"
        className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-accent"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <FileSpreadsheet className="size-5" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block font-display font-semibold">Untung Rugi Bisnes (PNL)</span>
          <span className="block text-sm text-muted">Jana laporan PNL daripada statement bank</span>
        </span>
        <ChevronRight className="size-5 text-muted" aria-hidden />
      </a>
    </div>
  );
}
