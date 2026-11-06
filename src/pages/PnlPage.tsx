import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import {
  buildPnl,
  change,
  PNL_PERIODS,
  periodLabel,
  pnlPeriod,
  type PnlLine,
  type PnlPeriodKind,
} from '../features/reports/pnl';
import { ReportsNav } from '../features/reports/ReportsNav';
import { friendlyError, getTotalsByCategory } from '../features/transactions/api';
import { useLoad } from '../lib/data';
import { dateInKL, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';
const pending = () => new Promise<never>(() => {});
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
const pct = (f: number) => `${(f * 100).toLocaleString('ms-MY', { maximumFractionDigits: 1 })}%`;
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

export function PnlPage() {
  const { client } = useAuth();
  const { account, error: accountError } = useAccount();
  const accountId = account?.id;
  const today = dateInKL();
  const [kind, setKind] = useState<PnlPeriodKind>('month');
  const [steps, setSteps] = useState(0);

  const period = pnlPeriod(kind, today, today, steps);
  const previous = pnlPeriod(kind, today, today, steps - 1);

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

      <div role="tablist" aria-label="Jenis tempoh" className="grid grid-cols-3 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
        {PNL_PERIODS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="tab"
            aria-selected={kind === k.value}
            onClick={() => {
              setKind(k.value);
              setSteps(0);
            }}
            className={`min-h-11 rounded-lg transition ${kind === k.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Tempoh sebelumnya"
          onClick={() => setSteps((s) => s - 1)}
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="text-center">
          <p className="font-display text-lg font-semibold">{periodLabel(kind, period.from)}</p>
          <p className="text-xs text-muted">
            {shortDate(period.from)} – {shortDate(period.to)}
            {!period.complete && ' · belum tamat'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Tempoh seterusnya"
          disabled={steps >= 0}
          onClick={() => setSteps((s) => s + 1)}
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink disabled:opacity-30"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

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
            <Lines lines={p.revenue} empty="Tiada pendapatan" showShare={false} />
            <Total label="Jumlah pendapatan" amount={p.revenueTotal} />

            <Heading>Perbelanjaan bisnes</Heading>
            <Lines lines={p.expenses} empty="Tiada perbelanjaan bisnes" showShare={p.margin !== null} />
            <Total label="Jumlah perbelanjaan" amount={-p.expenseTotal} />

            <div className="mt-4 flex items-baseline justify-between gap-3 border-y-4 border-double border-line py-3">
              <span className="font-display font-bold">{profit ? 'UNTUNG BERSIH' : 'RUGI BERSIH'}</span>
              <span className={`font-display text-lg font-bold tabular-nums ${profit ? 'text-accent' : 'text-danger'}`}>
                {signed(p.netProfit)}
              </span>
            </div>

            {p.drawings > 0 && (
              <>
                <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    Tolak: ambilan pemilik
                    <span className="block text-xs text-muted">Kegunaan peribadi · {p.drawingsCount} transaksi</span>
                  </span>
                  <span className="tabular-nums">{signed(-p.drawings)}</span>
                </div>
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

function Lines({ lines, empty, showShare }: { lines: PnlLine[]; empty: string; showShare: boolean }) {
  if (lines.length === 0) return <p className="py-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line/60">
      {lines.map((l) => (
        <li key={l.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate">{l.label}</span>
            <span className="text-xs text-muted">
              {l.count} transaksi
              {showShare && l.ofRevenue !== null && ` · ${pct(l.ofRevenue)} pendapatan`}
            </span>
          </span>
          <span className="shrink-0 tabular-nums">{formatMYR(l.amount)}</span>
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
