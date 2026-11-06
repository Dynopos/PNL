import { ArrowLeft, BookOpen, ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useCategories } from '../features/categories/useCategories';
import {
  accountLedger,
  CASH_BOOK,
  cashBook,
  fetchPeriodTransactions,
  ledgerAccounts,
  ledgerCsv,
  type Ledger,
  type LedgerAccount,
} from '../features/reports/ledger';
import { PeriodPicker, usePeriodParams } from '../features/reports/PeriodPicker';
import { periodLabel } from '../features/reports/pnl';
import { ReportsNav } from '../features/reports/ReportsNav';
import { friendlyError, getCashflowSummary } from '../features/transactions/api';
import { useLoad } from '../lib/data';
import { addDays } from '../lib/dates';
import { dateInKL, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';
const pending = () => new Promise<never>(() => {});
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
const dayMonth = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const PAGE = 200;
const SOURCE: Record<string, string> = { bank: 'Bank', voice: 'Suara', manual: 'Manual' };

export function LedgerPage() {
  const { client } = useAuth();
  const { account, error: accountError } = useAccount();
  const { categories } = useCategories();
  const accountId = account?.id;
  const today = dateInKL();
  const periodState = usePeriodParams(today);
  const { kind, period, query } = periodState;
  const [params] = useSearchParams();
  const selected = params.get('akaun');

  const data = useLoad(async () => {
    if (!accountId) return pending();
    const [txs, before] = await Promise.all([
      fetchPeriodTransactions(client, accountId, period.from, period.to),
      getCashflowSummary(client, accountId, '2000-01-01', addDays(period.from, -1)),
    ]);
    return { txs, opening: Number(before.net_cashflow) };
  }, [client, accountId, period.from, period.to]);

  const accounts = data.data ? ledgerAccounts(data.data.txs, categories) : [];
  const book = data.data ? cashBook(data.data.txs, data.data.opening) : null;
  const current = selected ? accounts.find((a) => a.key === selected) : undefined;
  const link = (key: string | null) => `/laporan/lejar?${key ? `akaun=${encodeURIComponent(key)}&` : ''}${query}`;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Laporan</h1>
      <ReportsNav />
      <PeriodPicker state={periodState} />

      {data.error || accountError ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {accountError || friendlyError(data.error)}
        </p>
      ) : !data.data || !book ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : selected ? (
        <AccountView
          key={`${selected}:${period.from}:${kind}`}
          title={selected === CASH_BOOK ? 'Buku Tunai' : (current?.name ?? 'Akaun')}
          subtitle={
            selected === CASH_BOOK
              ? 'Semua duit masuk dan keluar, dengan baki berjalan'
              : current
                ? current.type === 'income'
                  ? 'Akaun pendapatan'
                  : current.owner
                    ? 'Ambilan pemilik (bukan perbelanjaan bisnes)'
                    : 'Akaun perbelanjaan'
                : 'Tiada transaksi dalam tempoh ini'
          }
          ledger={selected === CASH_BOOK ? book : accountLedger(data.data.txs, selected)}
          cash={selected === CASH_BOOK}
          back={link(null)}
          fileName={`lejar-${selected === CASH_BOOK ? 'buku-tunai' : (current?.name ?? 'akaun')}-${period.from.slice(0, 7)}`}
          categories={categories}
          loading={data.loading}
        />
      ) : (
        <div className={`space-y-4 transition-opacity ${data.loading ? 'opacity-60' : ''}`}>
          <Link to={link(CASH_BOOK)} className={`${card} block transition hover:border-accent`}>
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <BookOpen className="size-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-display font-semibold">Buku Tunai</span>
                <span className="block text-xs text-muted">{data.data.txs.length} transaksi · {periodLabel(kind, period.from)}</span>
              </span>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat label="Baki awal" value={signed(book.opening)} />
              <Stat label="Baki akhir" value={signed(book.closing)} strong />
              <Stat label="Masuk" value={formatMYR(book.totalIn)} tone="text-accent" />
              <Stat label="Keluar" value={formatMYR(book.totalOut)} tone="text-danger" />
            </dl>
          </Link>

          <section className={card} aria-label="Akaun lejar">
            <h2 className="font-display font-semibold">Akaun ikut kategori</h2>
            {accounts.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Tiada transaksi dalam tempoh ini.</p>
            ) : (
              <>
                <Group title="Pendapatan" items={accounts.filter((a) => a.type === 'income')} link={link} />
                <Group title="Perbelanjaan bisnes" items={accounts.filter((a) => a.type === 'expense' && !a.owner)} link={link} />
                <Group title="Ambilan pemilik" items={accounts.filter((a) => a.owner)} link={link} />
              </>
            )}
          </section>

          <p className="text-xs text-muted">
            Baki dikira daripada rekod dalam DuitVoice (asas tunai), bukan baki sebenar dalam bank. Baki awal ialah jumlah bersih
            semua rekod sebelum tempoh ini.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = '', strong = false }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''} ${tone}`}>{value}</dd>
    </div>
  );
}

function Group({ title, items, link }: { title: string; items: LedgerAccount[]; link: (key: string) => string }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="mt-4 border-b border-line pb-1.5 text-xs font-bold uppercase tracking-wider text-muted">{title}</h3>
      <ul className="divide-y divide-line/60">
        {items.map((a) => (
          <li key={a.key}>
            <Link to={link(a.key)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.name}</span>
                <span className="text-xs text-muted">{a.count} transaksi</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatMYR(a.total)}</span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function AccountView({
  title,
  subtitle,
  ledger,
  cash,
  back,
  fileName,
  categories,
  loading,
}: {
  title: string;
  subtitle: string;
  ledger: Ledger;
  cash: boolean;
  back: string;
  fileName: string;
  categories: { id: string; name: string; type: 'income' | 'expense'; user_id: string | null }[];
  loading: boolean;
}) {
  const [shown, setShown] = useState(PAGE);

  function download() {
    const blob = new Blob([`﻿${ledgerCsv(ledger, categories)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <Link to={back} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft className="size-4" aria-hidden />
        Semua akaun
      </Link>

      <section className={card} aria-label="Ringkasan akaun">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {cash ? (
            <>
              <Stat label="Baki awal" value={signed(ledger.opening)} />
              <Stat label="Baki akhir" value={signed(ledger.closing)} strong />
              <Stat label="Masuk" value={formatMYR(ledger.totalIn)} tone="text-accent" />
              <Stat label="Keluar" value={formatMYR(ledger.totalOut)} tone="text-danger" />
            </>
          ) : (
            <>
              <Stat label="Jumlah" value={formatMYR(ledger.closing)} strong />
              <Stat label="Transaksi" value={String(ledger.rows.length)} />
            </>
          )}
        </dl>
        {ledger.rows.length > 0 && (
          <button
            type="button"
            onClick={download}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold transition hover:border-accent"
          >
            <Download className="size-4" aria-hidden />
            Muat turun CSV (Excel)
          </button>
        )}
      </section>

      {ledger.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center text-sm text-muted">
          Tiada transaksi dalam tempoh ini.
        </p>
      ) : (
        <section className={`${card} p-0`} aria-label="Catatan lejar">
          <div className="flex justify-between gap-3 border-b border-line px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted">
            <span>Tarikh · Keterangan</span>
            <span>{cash ? 'Amaun · Baki' : 'Amaun · Kumulatif'}</span>
          </div>
          <ul className="divide-y divide-line/60">
            {ledger.rows.slice(0, shown).map(({ tx, amount, balance }) => {
              const incoming = tx.transaction_type === 'income';
              return (
                <li key={tx.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{tx.merchant || tx.description || 'Transaksi'}</span>
                    <span className="text-xs text-muted">
                      {dayMonth(tx.transaction_date)} · {SOURCE[tx.source] ?? tx.source}
                      {tx.merchant && tx.description ? ` · ${tx.description}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className={`block font-semibold ${incoming ? 'text-accent' : ''}`}>
                      {cash ? signed(amount) : formatMYR(amount)}
                    </span>
                    <span className="block text-xs text-muted">{signed(balance)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {ledger.rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="w-full border-t border-line py-3 text-sm font-semibold text-accent"
            >
              Tunjuk lagi ({ledger.rows.length - shown} lagi)
            </button>
          )}
          <div className="flex justify-between gap-3 border-t-4 border-double border-line px-4 py-3 text-sm font-bold">
            <span>{cash ? 'Baki akhir' : 'Jumlah'}</span>
            <span className="tabular-nums">{signed(ledger.closing)}</span>
          </div>
        </section>
      )}
    </div>
  );
}
