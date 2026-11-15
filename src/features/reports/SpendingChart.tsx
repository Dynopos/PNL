import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatMYR } from '../../lib/locale';
import { useTheme } from '../../lib/theme';

export type SeriesKey = 'income' | 'expense' | 'net';

export interface ChartPoint {
  key: string;
  tick: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

const SERIES_LABEL: Record<SeriesKey, string> = { income: 'Pendapatan', expense: 'Perbelanjaan', net: 'Bersih' };

function compactRM(n: number) {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  return a >= 1000 ? `${sign}${Number((a / 1000).toFixed(1))}K` : `${sign}${Math.round(a)}`;
}

function signedMYR(n: number) {
  return `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
}

function useChartColors() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
      income: read('--chart-income', '#2563eb'),
      expense: read('--chart-expense', '#dc2626'),
      grid: read('--chart-grid', '#e6e8ec'),
      muted: read('--muted', '#5a6170'),
    };
    // Re-read the tokens whenever the theme flips.
  }, [resolved]);
}

/**
 * Column chart for one or two series (income/expense, side by side) or a signed net series
 * coloured by sign. Two series always get a legend; every chart has a table view.
 */
export function SpendingChart({ data, title, series }: { data: ChartPoint[]; title: string; series: SeriesKey[] }) {
  const colors = useChartColors();
  const signed = series.length === 1 && series[0] === 'net';

  const tooltip = ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const p = active && payload?.[0] ? (payload[0].payload as ChartPoint) : null;
    if (!p) return null;
    return (
      <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
        <p className="text-xs text-muted">{p.label}</p>
        {series.map((s) => (
          <p key={s} className="flex items-center gap-2 tabular-nums">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: s === 'net' ? (p.net < 0 ? colors.expense : colors.income) : colors[s] }}
              aria-hidden
            />
            <span className="text-muted">{SERIES_LABEL[s]}</span>
            <span className="ml-auto font-display font-semibold">{signedMYR(p[s])}</span>
          </p>
        ))}
        <p className="text-xs text-muted">{p.count} transaksi</p>
      </div>
    );
  };

  const legend = signed
    ? [
        { label: 'Lebihan', color: colors.income },
        { label: 'Defisit', color: colors.expense },
      ]
    : series.length > 1
      ? series.map((s) => ({ label: SERIES_LABEL[s], color: colors[s as 'income' | 'expense'] }))
      : [];

  return (
    <div>
      {legend.length > 0 && (
        <ul className="mb-2 flex gap-4 text-xs text-muted" aria-hidden>
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div className="h-52" role="img" aria-label={`${title}. Lihat jadual di bawah untuk nilai penuh.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={colors.grid} strokeWidth={1} />
            <XAxis
              dataKey="tick"
              tickLine={false}
              axisLine={{ stroke: colors.grid }}
              tick={{ fill: colors.muted, fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: colors.muted, fontSize: 11 }}
              tickFormatter={compactRM}
              allowDecimals={false}
              width={48}
            />
            {signed && <ReferenceLine y={0} stroke={colors.muted} strokeWidth={1} />}
            <Tooltip content={tooltip} cursor={{ fill: colors.grid, opacity: 0.6 }} />
            {series.map((s) =>
              s === 'net' ? (
                <Bar key={s} dataKey="net" radius={[4, 4, 4, 4]} maxBarSize={24} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.net < 0 ? colors.expense : colors.income} />
                  ))}
                </Bar>
              ) : (
                <Bar key={s} dataKey={s} fill={colors[s]} radius={[4, 4, 0, 0]} maxBarSize={series.length > 1 ? 14 : 24} isAnimationActive={false} />
              ),
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent">Lihat sebagai jadual</summary>
        <table className="mt-1 w-full text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1.5 font-medium">Tempoh</th>
              {series.map((s) => (
                <th key={s} className="py-1.5 text-right font-medium">
                  {SERIES_LABEL[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {data.map((d) => (
              <tr key={d.key}>
                <td className="py-1.5">{d.label}</td>
                {series.map((s) => (
                  <td key={s} className="py-1.5 text-right font-medium tabular-nums">
                    {signedMYR(d[s])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
