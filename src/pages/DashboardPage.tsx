import { CalendarDays, ChevronRight, FileSpreadsheet, Mic, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RankedBars } from '../components/RankedBars';
import { Spinner } from '../components/Spinner';
import { useState } from 'react';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useCategories } from '../features/categories/useCategories';
import { useProfile } from '../features/profile/useProfile';
import { friendlyError, getCashflowSummary, getTotalsByCategory, listTransactions } from '../features/transactions/api';
import { TransactionRow } from '../features/transactions/TransactionRow';
import { useTransactionSheet } from '../features/transactions/TransactionSheet';
import { useLoad } from '../lib/data';
import { startOfMonth, startOfWeek } from '../lib/dates';
import { dateInKL, formatLongDate, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';

const OWNER_USE = 'Kegunaan Peribadi Pemilik';

type DashboardPeriod = 'day' | 'week' | 'month';
const DASHBOARD_PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: 'day', label: 'Hari ini' },
  { value: 'week', label: 'Minggu ini' },
  { value: 'month', label: 'Bulan ini' },
];

export function DashboardPage() {
  const { client } = useAuth();
  const { profile } = useProfile();
  const { byId } = useCategories();
  const { openCreate, openEdit } = useTransactionSheet();
  const { account, error: accountError } = useAccount();
  const accountId = account?.id;
  const today = dateInKL();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const from = period === 'day' ? today : period === 'week' ? startOfWeek(today) : startOfMonth(today);
  const periodLabel = DASHBOARD_PERIODS.find((p) => p.value === period)!.label.toLowerCase();

  const pending = () => new Promise<never>(() => {});
  const summary = useLoad(
    () => (accountId ? getCashflowSummary(client, accountId, from, today) : pending()),
    [client, accountId, from, today],
  );
  const recent = useLoad(() => (accountId ? listTransactions(client, accountId, {}, 0) : pending()), [client, accountId]);
  const byCategory = useLoad(
    () => (accountId ? getTotalsByCategory(client, accountId, from, today, 'expense') : pending()),
    [client, accountId, from, today],
  );

  const s = accountId ? summary.data : null;
  const ownerUse = byCategory.data?.find((c) => c.category_name === OWNER_USE)?.total ?? 0;

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

      <section
        className={`${card} relative overflow-hidden`}
        aria-label="Ringkasan pendapatan dan perbelanjaan"
        aria-busy={summary.loading}
      >
        <span className="brand-stripe absolute inset-x-0 top-0 h-1" aria-hidden />
        <div role="tablist" aria-label="Tempoh" className="grid grid-cols-3 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
          {DASHBOARD_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={`min-h-10 rounded-lg transition ${period === p.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {summary.error || accountError ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {accountError || friendlyError(summary.error)}
          </p>
        ) : !s ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            <div>
              <p className="text-xs font-medium text-muted">Jumlah Pendapatan</p>
              <p className="mt-1 font-display text-xl font-semibold tabular-nums text-accent">{formatMYR(s.income_total)}</p>
              <p className="text-xs text-muted">Wang diterima</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Jumlah Perbelanjaan</p>
              <p className="mt-1 font-display text-xl font-semibold tabular-nums text-danger">{formatMYR(s.expense_total)}</p>
              <p className="text-xs text-muted">
                {ownerUse > 0 ? `Termasuk ${formatMYR(ownerUse)} kegunaan peribadi` : 'Wang dibelanjakan'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Aliran Tunai Bersih</p>
              <p className="chrome-text mt-1 font-display text-2xl font-bold tracking-tight tabular-nums">
                {s.net_cashflow < 0 ? '−' : ''}
                {formatMYR(Math.abs(s.net_cashflow))}
              </p>
              <p className="text-xs text-muted">{s.net_cashflow < 0 ? 'Defisit' : 'Pendapatan − perbelanjaan'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Jumlah Transaksi</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{s.tx_count}</p>
              <p className="text-xs text-muted">
                {s.income_count} masuk · {s.expense_count} keluar
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col items-center rounded-3xl border border-line bg-surface px-6 py-7 text-center">
        <Link
          to="/rekod"
          aria-label="Tekan untuk rekod transaksi dengan suara"
          className="mic-brand grid size-24 place-items-center rounded-full transition active:scale-95"
        >
          <Mic className="size-10" aria-hidden />
        </Link>
        <p className="mt-5 font-display text-lg font-semibold">Tekan untuk rekod transaksi</p>
        <p className="mt-1 text-sm text-muted">“Mydin 55 ringgit” · “Jualan hari ini 1500 ringgit”</p>
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
          <p className="py-4 text-sm text-muted">Belum ada transaksi. Rekod transaksi pertama anda di atas.</p>
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
            <h2 className="font-display font-semibold">Perbelanjaan ikut kategori · {periodLabel}</h2>
            <Link to="/laporan" className="flex min-h-11 items-center text-sm font-semibold text-accent">
              Laporan
            </Link>
          </div>
          <div className="mt-3">
            <RankedBars
              color="var(--chart-expense)"
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
