import { useState } from 'react';
import { RankedBars } from '../components/RankedBars';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import {
  friendlyError,
  getCashflowByPeriod,
  getCashflowSummary,
  getTopMerchants,
  getTotalsByCategory,
} from '../features/transactions/api';
import { REPORT_PERIODS, reportRange, weekLabel, type ReportPeriod } from '../features/reports/periods';
import { SpendingChart, type ChartPoint } from '../features/reports/SpendingChart';
import { useLoad } from '../lib/data';
import { addMonths, startOfMonth } from '../lib/dates';
import { dateInKL, formatMYR } from '../lib/locale';
import type { CashflowBucket, CategoryTotal } from '../lib/types';

const card = 'rounded-2xl border border-line bg-surface p-5';
const fmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const fmtDayMonth = fmt({ day: 'numeric', month: 'short' });
const fmtWeekday = fmt({ weekday: 'short' });
const fmtLongDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonthShort = fmt({ month: 'short' });
const fmtMonthLong = fmt({ month: 'long', year: 'numeric' });

const signedMYR = (n: number) => `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
const pending = () => new Promise<never>(() => {});

function toPoint(b: CashflowBucket, tick: string, label: string): ChartPoint {
  return { key: b.bucket, tick, label, income: b.income, expense: b.expense, net: b.net, count: b.tx_count };
}

function CategorySection({ title, rows, total, color }: { title: string; rows: CategoryTotal[]; total: number; color: string }) {
  return (
    <section className={card}>
      <h2 className="font-display font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Tiada rekod dalam tempoh ini.</p>
      ) : (
        <div className="mt-4">
          <RankedBars
            color={color}
            grandTotal={total}
            items={rows.map((c) => ({
              key: c.category_id ?? 'none',
              label: c.category_name,
              total: c.total,
              detail: `${c.tx_count} transaksi`,
            }))}
          />
        </div>
      )}
    </section>
  );
}

export function ReportsPage() {
  const { client } = useAuth();
  const { account, error: accountError } = useAccount();
  const accountId = account?.id;
  const today = dateInKL();
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const { from, to } = reportRange(period, today);
  const monthsFrom = addMonths(today, -5);

  const report = useLoad(async () => {
    if (!accountId) return pending();
    const [summary, daily, weekly, incomeCats, expenseCats, merchants] = await Promise.all([
      getCashflowSummary(client, accountId, from, to),
      getCashflowByPeriod(client, accountId, from, to, 'day'),
      getCashflowByPeriod(client, accountId, from, to, 'week'),
      getTotalsByCategory(client, accountId, from, to, 'income'),
      getTotalsByCategory(client, accountId, from, to, 'expense'),
      getTopMerchants(client, accountId, from, to, 5),
    ]);
    return { summary, daily, weekly, incomeCats, expenseCats, merchants };
  }, [client, accountId, from, to]);

  const monthly = useLoad(
    () => (accountId ? getCashflowByPeriod(client, accountId, monthsFrom, today, 'month') : pending()),
    [client, accountId, monthsFrom, today],
  );

  const r = report.data;
  const dailyPoints = (r?.daily ?? []).map((d) =>
    toPoint(d, period === 'week' ? fmtWeekday(d.bucket) : String(Number(d.bucket.slice(8))), fmtLongDay(d.bucket)),
  );
  const monthlyPoints = (monthly.data ?? []).map((m) =>
    toPoint(
      m,
      fmtMonthShort(m.bucket),
      m.bucket === startOfMonth(today) ? `${fmtMonthLong(m.bucket)} (setakat hari ini)` : fmtMonthLong(m.bucket),
    ),
  );
  const thisMonth = monthly.data?.at(-1);
  const lastMonth = monthly.data?.at(-2);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Laporan</h1>

      <div role="tablist" aria-label="Tempoh laporan" className="grid grid-cols-3 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
        {REPORT_PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={period === p.value}
            onClick={() => setPeriod(p.value)}
            className={`min-h-11 rounded-lg transition ${period === p.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {fmtDayMonth(from)} – {fmtDayMonth(to)}
      </p>

      {report.error || accountError ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {accountError || friendlyError(report.error)}
        </p>
      ) : !r ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
          <section className="grid grid-cols-2 gap-3" aria-label="Ringkasan tempoh">
            {[
              { label: 'Pendapatan', value: formatMYR(r.summary.income_total), tone: 'text-accent' },
              { label: 'Perbelanjaan', value: formatMYR(r.summary.expense_total), tone: 'text-danger' },
              { label: 'Aliran tunai bersih', value: signedMYR(r.summary.net_cashflow), tone: '' },
              { label: 'Transaksi', value: String(r.summary.tx_count), tone: '' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-line bg-surface p-3">
                <p className="text-xs font-medium text-muted">{s.label}</p>
                <p className={`mt-1 font-display text-lg font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </section>

          {r.summary.tx_count === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
              <p className="font-semibold">Tiada transaksi dalam tempoh ini</p>
              <p className="mt-1 text-sm text-muted">Laporan akan muncul selepas anda merekod pendapatan atau perbelanjaan.</p>
            </div>
          ) : (
            <>
              <section className={card}>
                <h2 className="font-display font-semibold">Pendapatan vs Perbelanjaan</h2>
                <div className="mt-3">
                  <SpendingChart data={dailyPoints} title="Pendapatan dan perbelanjaan harian" series={['income', 'expense']} />
                </div>
              </section>

              <section className={card}>
                <h2 className="font-display font-semibold">Aliran tunai bersih</h2>
                <p className="mt-1 text-sm text-muted">Pendapatan tolak perbelanjaan setiap hari.</p>
                <div className="mt-3">
                  <SpendingChart data={dailyPoints} title="Aliran tunai bersih harian" series={['net']} />
                </div>
              </section>

              {period !== 'week' && (
                <section className={card}>
                  <h2 className="font-display font-semibold">Ikut minggu</h2>
                  <ul className="mt-3 divide-y divide-line/70 text-sm">
                    {r.weekly.map((w) => (
                      <li key={w.bucket} className="py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span>{weekLabel(w.bucket, from, to, fmtDayMonth)}</span>
                          <span className="font-semibold tabular-nums">{signedMYR(w.net)}</span>
                        </div>
                        <p className="mt-0.5 text-xs tabular-nums text-muted">
                          Masuk {formatMYR(w.income)} · Keluar {formatMYR(w.expense)} · {w.tx_count} transaksi
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <CategorySection
                title="Pendapatan ikut kategori"
                rows={r.incomeCats}
                total={r.summary.income_total}
                color="var(--chart-income)"
              />
              <CategorySection
                title="Perbelanjaan ikut kategori"
                rows={r.expenseCats}
                total={r.summary.expense_total}
                color="var(--chart-expense)"
              />

              <section className={card}>
                <h2 className="font-display font-semibold">Kedai teratas</h2>
                {r.merchants.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">Tiada nama kedai direkodkan dalam tempoh ini.</p>
                ) : (
                  <ol className="mt-3 divide-y divide-line/70 text-sm">
                    {r.merchants.map((m, i) => (
                      <li key={m.merchant} className="flex items-center gap-3 py-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-muted">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.merchant}</span>
                          <span className="text-xs text-muted">{m.tx_count} kali</span>
                        </span>
                        <span className="font-semibold tabular-nums">{formatMYR(m.total)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      )}

      <section className={card}>
        <h2 className="font-display font-semibold">Perbandingan bulanan</h2>
        {monthly.error ? (
          <p className="mt-2 text-sm text-danger">{friendlyError(monthly.error)}</p>
        ) : !monthly.data ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              {thisMonth && lastMonth && (lastMonth.income > 0 || lastMonth.expense > 0)
                ? `Bersih bulan ini ${signedMYR(thisMonth.net)} berbanding ${signedMYR(lastMonth.net)} bulan lepas. Bulan ini belum tamat.`
                : 'Tiada data bulan lepas untuk dibandingkan.'}
            </p>
            <div className="mt-3">
              <SpendingChart data={monthlyPoints} title="Pendapatan dan perbelanjaan 6 bulan terakhir" series={['income', 'expense']} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
