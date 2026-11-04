import { TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { RankedBars } from '../components/RankedBars';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../features/auth/AuthProvider';
import {
  friendlyError,
  getSpendingByCategory,
  getSpendingByPeriod,
  getTopMerchants,
} from '../features/transactions/api';
import { REPORT_PERIODS, reportRange, weekLabel, type ReportPeriod } from '../features/reports/periods';
import { SpendingChart, type ChartPoint } from '../features/reports/SpendingChart';
import { useLoad } from '../lib/data';
import { addMonths, startOfMonth } from '../lib/dates';
import { dateInKL, formatMYR } from '../lib/locale';
import { fromSen, toSen } from '../lib/money';

const card = 'rounded-2xl border border-line bg-surface p-5';
const fmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const fmtDayMonth = fmt({ day: 'numeric', month: 'short' });
const fmtWeekday = fmt({ weekday: 'short' });
const fmtLongDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonthShort = fmt({ month: 'short' });
const fmtMonthLong = fmt({ month: 'long', year: 'numeric' });

export function ReportsPage() {
  const { client } = useAuth();
  const today = dateInKL();
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const { from, to, days } = reportRange(period, today);
  const monthsFrom = addMonths(today, -5);

  const report = useLoad(async () => {
    const [daily, weekly, categories, merchants] = await Promise.all([
      getSpendingByPeriod(client, from, to, 'day'),
      getSpendingByPeriod(client, from, to, 'week'),
      getSpendingByCategory(client, from, to),
      getTopMerchants(client, from, to, 5),
    ]);
    return { daily, weekly, categories, merchants };
  }, [client, from, to]);

  const monthly = useLoad(() => getSpendingByPeriod(client, monthsFrom, today, 'month'), [client, monthsFrom, today]);

  const r = report.data;
  const totalSen = r ? r.daily.reduce((s, d) => s + toSen(d.total), 0) : 0;
  const count = r ? r.daily.reduce((s, d) => s + d.tx_count, 0) : 0;
  const total = fromSen(totalSen);

  const dailyPoints: ChartPoint[] = (r?.daily ?? []).map((d) => ({
    key: d.bucket,
    tick: period === 'week' ? fmtWeekday(d.bucket) : String(Number(d.bucket.slice(8))),
    label: fmtLongDay(d.bucket),
    total: d.total,
    count: d.tx_count,
  }));

  const monthlyPoints: ChartPoint[] = (monthly.data ?? []).map((m) => ({
    key: m.bucket,
    tick: fmtMonthShort(m.bucket),
    label: m.bucket === startOfMonth(today) ?`${fmtMonthLong(m.bucket)} (setakat hari ini)` : fmtMonthLong(m.bucket),
    total: m.total,
    count: m.tx_count,
  }));
  const thisMonth = monthly.data?.at(-1)?.total ?? 0;
  const lastMonth = monthly.data?.at(-2)?.total ?? 0;
  const change = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

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

      {report.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {friendlyError(report.error)}
        </p>
      ) : !r ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
          <section className="grid grid-cols-3 gap-3" aria-label="Ringkasan tempoh">
            {[
              { label: 'Jumlah', value: formatMYR(total) },
              { label: 'Transaksi', value: String(count) },
              { label: 'Purata sehari', value: formatMYR(fromSen(Math.round(totalSen / days))) },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-line bg-surface p-3">
                <p className="text-xs font-medium text-muted">{s.label}</p>
                <p className="mt-1 font-display text-base font-semibold tabular-nums sm:text-lg">{s.value}</p>
              </div>
            ))}
          </section>

          {count === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
              <p className="font-semibold">Tiada belanja dalam tempoh ini</p>
              <p className="mt-1 text-sm text-muted">Laporan akan muncul selepas anda merekod transaksi.</p>
            </div>
          ) : (
            <>
              <section className={card}>
                <h2 className="font-display font-semibold">Belanja harian</h2>
                <div className="mt-4">
                  <SpendingChart data={dailyPoints} title="Belanja harian" />
                </div>
              </section>

              {period !== 'week' && (
                <section className={card}>
                  <h2 className="font-display font-semibold">Belanja mingguan</h2>
                  <ul className="mt-3 divide-y divide-line/70 text-sm">
                    {r.weekly.map((w) => (
                      <li key={w.bucket} className="flex items-center justify-between gap-3 py-2.5">
                        <span>{weekLabel(w.bucket, from, to, fmtDayMonth)}</span>
                        <span className="tabular-nums">
                          <span className="mr-2 text-xs text-muted">{w.tx_count} transaksi</span>
                          <span className="font-semibold">{formatMYR(w.total)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className={card}>
                <h2 className="font-display font-semibold">Ikut kategori</h2>
                <div className="mt-4">
                  <RankedBars
                    grandTotal={total}
                    items={r.categories.map((c) => ({
                      key: c.category_id ?? 'none',
                      label: c.category_name,
                      total: c.total,
                      detail: `${c.tx_count} transaksi`,
                    }))}
                  />
                </div>
              </section>

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
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
              {change === null ? (
                'Tiada data bulan lepas untuk dibandingkan.'
              ) : (
                <>
                  {change > 0 ? (
                    <TrendingUp className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  ) : (
                    <TrendingDown className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  )}
                  <span>
                    Bulan ini {formatMYR(thisMonth)} — {Math.abs(change).toFixed(0)}% {change > 0 ? 'lebih' : 'kurang'}{' '}
                    daripada bulan lepas ({formatMYR(lastMonth)}). Bulan ini belum tamat.
                  </span>
                </>
              )}
            </p>
            <div className="mt-4">
              <SpendingChart data={monthlyPoints} title="Belanja 6 bulan terakhir" />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
