import { ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { PeriodPicker, usePeriodParams } from '../features/reports/PeriodPicker';
import { buildPnl, change, periodLabel, type PnlLine } from '../features/reports/pnl';
import { ReportsNav } from '../features/reports/ReportsNav';
import { friendlyError, getTotalsByCategory } from '../features/transactions/api';
import { useLoad } from '../lib/data';
import { dateInKL, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';
const pending = () => new Promise<never>(() => {});
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
const pct = (f: number) => `${(f * 100).toLocaleString('ms-MY', { maximumFractionDigits: 1 })}%`;

export function PnlPage() {
  const { client } = useAuth();
  const { account, error: accountError } = useAccount();
  const accountId = account?.id;
  const today = dateInKL();
  const periodState = usePeriodParams(today);
  const { kind, period, previous, query } = periodState;
  const ledgerLink = (key: string) => `/laporan/lejar?akaun=${encodeURIComponent(key)}&${query}`;

  const report = useLoad(async () => {
    if (!accountId) return pending();
    const [inc, exp, prevInc, prevExp] = await Promise.all([
      getTotalsByCategory(client, accountId, period.from, period.to, 'income'),
      getTotalsByCategory(client, accountId, period.from, period.to, 'expense'),
      getTotalsByCategory(client, accountId, previous.from, previous.to, 'income'),
      getTotalsByCategory(client, accountId, previous.from, previous.to, 'expense'),
    ]);
    return { pnl: buildPnl(inc, exp), prev: buildPnl(prevInc, prevExp) };
  }, [client, accountId, period.from, period.to, previous.from]);

  const p = report.data?.pnl;
  const prev = report.data?.prev;
  const delta = p && prev && !prev.empty ? change(p.netProfit, prev.netProfit) : null;
  const profit = (p?.netProfit ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Laporan</h1>
      <ReportsNav />

      <PeriodPicker state={periodState} />

      {report.error || accountError ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {accountError || friendlyError(report.error)}
        </p>
      ) : !p || !prev ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : p.empty ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
          <p className="font-semibold">Tiada transaksi dalam {periodLabel(kind, period.from)}</p>
          <p className="mt-1 text-sm text-muted">Rekod pendapatan dan perbelanjaan, atau masukkan statement bank, untuk melihat untung rugi.</p>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
          <section className={`${card} relative overflow-hidden`} aria-label="Untung bersih">
            <span className="brand-stripe absolute inset-x-0 top-0 h-1" aria-hidden />
            <p className="text-sm font-medium text-muted">{profit ? 'Untung bersih' : 'Rugi bersih'}</p>
            <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${profit ? 'text-accent' : 'text-danger'}`}>
              {signed(p.netProfit)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {p.margin !== null ? `Margin ${pct(p.margin)} daripada pendapatan` : 'Tiada pendapatan dalam tempoh ini'}
            </p>
            {delta !== null && (
              <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${delta >= 0 ? 'text-accent' : 'text-danger'}`}>
                {delta >= 0 ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
                {delta >= 0 ? 'Naik' : 'Turun'} {pct(Math.abs(delta))} berbanding {periodLabel(kind, previous.from)} ({signed(prev.netProfit)})
                {!period.complete && ' · tempoh ini belum tamat'}
              </p>
            )}
          </section>

          <section className={card} aria-label="Penyata untung rugi">
            <h2 className="font-display font-semibold">Penyata Untung Rugi</h2>
            <p className="text-xs text-muted">{account?.account_name ?? 'Bisnes'} · {periodLabel(kind, period.from)}</p>

            <Heading>Pendapatan</Heading>
            <Lines lines={p.revenue} empty="Tiada pendapatan" showShare={false} link={ledgerLink} />
            <Total label="Jumlah pendapatan" amount={p.revenueTotal} />

            <Heading>Perbelanjaan bisnes</Heading>
            <Lines lines={p.expenses} empty="Tiada perbelanjaan bisnes" showShare={p.margin !== null} link={ledgerLink} />
            <Total label="Jumlah perbelanjaan" amount={-p.expenseTotal} />

            <div className="mt-4 flex items-baseline justify-between gap-3 border-y-4 border-double border-line py-3">
              <span className="font-display font-bold">{profit ? 'UNTUNG BERSIH' : 'RUGI BERSIH'}</span>
              <span className={`font-display text-lg font-bold tabular-nums ${profit ? 'text-accent' : 'text-danger'}`}>
                {signed(p.netProfit)}
              </span>
            </div>

            {p.drawings > 0 && (
              <>
                <Link
                  to={p.drawingsKey ? ledgerLink(p.drawingsKey) : '#'}
                  className="mt-3 flex items-center justify-between gap-3 text-sm hover:text-accent"
                >
                  <span className="flex-1">
                    Tolak: ambilan pemilik
                    <span className="block text-xs text-muted">Kegunaan peribadi · {p.drawingsCount} transaksi</span>
                  </span>
                  <span className="tabular-nums">{signed(-p.drawings)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
                <Total label="Baki kekal dalam bisnes" amount={p.retained} />
              </>
            )}

            <p className="mt-4 text-xs text-muted">
              Asas tunai: dikira ikut tarikh duit masuk dan keluar, termasuk baris statement bank yang sudah masuk rekod.
              Kegunaan peribadi pemilik bukan perbelanjaan bisnes, jadi ia ditolak selepas untung bersih.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Heading({ children }: { children: string }) {
  return <h3 className="mt-5 border-b border-line pb-1.5 text-xs font-bold uppercase tracking-wider text-muted">{children}</h3>;
}

function Lines({
  lines,
  empty,
  showShare,
  link,
}: {
  lines: PnlLine[];
  empty: string;
  showShare: boolean;
  link: (key: string) => string;
}) {
  if (lines.length === 0) return <p className="py-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line/60">
      {lines.map((l) => (
        <li key={l.key}>
          <Link to={link(l.key)} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{l.label}</span>
            <span className="text-xs text-muted">
              {l.count} transaksi
              {showShare && l.ofRevenue !== null && ` · ${pct(l.ofRevenue)} pendapatan`}
            </span>
          </span>
          <span className="shrink-0 tabular-nums">{formatMYR(l.amount)}</span>
          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-sm font-semibold">
      <span>{label}</span>
      <span className="tabular-nums">{signed(amount)}</span>
    </div>
  );
}
