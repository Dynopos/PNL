import { CalendarDays, ChevronRight, FileSpreadsheet, Mic, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RankedBars } from '../components/RankedBars';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../features/auth/AuthProvider';
import { useCategories } from '../features/categories/useCategories';
import { useProfile } from '../features/profile/useProfile';
import { friendlyError, getDashboardSummary, getSpendingByCategory, listTransactions } from '../features/transactions/api';
import { TransactionRow } from '../features/transactions/TransactionRow';
import { useTransactionSheet } from '../features/transactions/TransactionSheet';
import { useLoad } from '../lib/data';
import { startOfMonth } from '../lib/dates';
import { dateInKL, formatLongDate, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';

export function DashboardPage() {
  const { client } = useAuth();
  const { profile } = useProfile();
  const { byId } = useCategories();
  const { openCreate, openEdit } = useTransactionSheet();
  const today = dateInKL();

  const summary = useLoad(() => getDashboardSummary(client, today), [client, today]);
  const recent = useLoad(() => listTransactions(client, {}, 0), [client]);
  const byCategory = useLoad(() => getSpendingByCategory(client, startOfMonth(today), today), [client, today]);

  const s = summary.data;
  const budget = s?.month_budget ?? null;
  const remaining = budget !== null && s ? budget - s.month_total : null;
  const usedPct = budget && s ? Math.min((s.month_total / budget) * 100, 100) : 0;
  const monthName = new Intl.DateTimeFormat('ms-MY', { month: 'long' }).format(new Date(`${today}T00:00:00`));

  return (
    <div className="space-y-5">
      <section>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="size-4" aria-hidden />
          {formatLongDate(today)}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Hai{profile?.display_name ? `, ${profile.display_name}` : ''} 👋
        </h1>
      </section>

      <section className={card} aria-label="Ringkasan belanja" aria-busy={summary.loading}>
        {summary.error ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyError(summary.error)}
          </p>
        ) : !s ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-muted">Belanja hari ini</p>
            <p className="mt-1 font-display text-4xl font-bold tracking-tight tabular-nums">{formatMYR(s.today_total)}</p>
            <p className="mt-1 text-sm text-muted">{s.today_count} transaksi</p>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div>
                <p className="text-xs font-medium text-muted">Bulan {monthName}</p>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatMYR(s.month_total)}</p>
                <p className="text-xs text-muted">{s.month_count} transaksi</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Baki bajet</p>
                {remaining === null ? (
                  <p className="mt-1 text-sm text-muted">Belum ditetapkan</p>
                ) : (
                  <>
                    <p
                      className={`mt-1 font-display text-xl font-semibold tabular-nums ${remaining < 0 ? 'text-danger' : ''}`}
                    >
                      {remaining < 0 ? '−' : ''}
                      {formatMYR(Math.abs(remaining))}
                    </p>
                    <p className="text-xs text-muted">
                      {remaining < 0 ? 'Melebihi bajet' : `daripada ${formatMYR(budget!)}`}
                    </p>
                  </>
                )}
              </div>
            </div>
            {budget !== null && (
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
                role="meter"
                aria-label="Bajet digunakan"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(usedPct)}
              >
                <div
                  className={`h-full rounded-full ${remaining !== null && remaining < 0 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col items-center rounded-3xl border border-line bg-surface px-6 py-7 text-center">
        <Link
          to="/rekod"
          aria-label="Tekan untuk rekod belanja dengan suara"
          className="grid size-24 place-items-center rounded-full bg-accent text-on-accent shadow-[0_0_0_12px_var(--accent-soft),0_18px_40px_-12px_var(--accent)] transition active:scale-95"
        >
          <Mic className="size-10" aria-hidden />
        </Link>
        <p className="mt-5 font-display text-lg font-semibold">Tekan untuk rekod belanja</p>
        <p className="mt-1 text-sm text-muted">“Mydin lima puluh lima ringgit”</p>
        <button
          type="button"
          onClick={openCreate}
          className="mt-4 flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          <PenLine className="size-4" aria-hidden />
          Atau taip secara manual
        </button>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold">Transaksi terkini</h2>
          <Link to="/transaksi" className="flex min-h-11 items-center text-sm font-semibold text-accent">
            Lihat semua
          </Link>
        </div>
        {recent.error ? (
          <p className="mt-2 text-sm text-danger">{friendlyError(recent.error)}</p>
        ) : !recent.data ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : recent.data.rows.length === 0 ? (
          <p className="py-4 text-sm text-muted">Belum ada transaksi. Rekod belanja pertama anda di atas.</p>
        ) : (
          <ul className="-mx-2 mt-1 divide-y divide-line/70">
            {recent.data.rows.slice(0, 5).map((tx) => (
              <li key={tx.id}>
                <TransactionRow tx={tx} category={tx.category_id ? byId.get(tx.category_id) : undefined} onSelect={openEdit} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {byCategory.data && byCategory.data.length > 0 && (
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">Ikut kategori · {monthName}</h2>
            <Link to="/laporan" className="flex min-h-11 items-center text-sm font-semibold text-accent">
              Laporan
            </Link>
          </div>
          <div className="mt-3">
            <RankedBars
              grandTotal={byCategory.data.reduce((sum, c) => sum + c.total, 0)}
              items={byCategory.data.slice(0, 5).map((c) => ({
                key: c.category_id ?? 'none',
                label: c.category_name,
                total: c.total,
              }))}
            />
          </div>
        </section>
      )}

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
