import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatMYR } from '../../lib/locale';
import { useTheme } from '../../lib/theme';

export interface ChartPoint {
  key: string;
  tick: string;
  label: string;
  total: number;
  count: number;
}

function compactRM(n: number) {
  if (n >= 1000) return `${Number((n / 1000).toFixed(1))}K`;
  return String(Math.round(n));
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const p = active && payload?.[0] ? (payload[0].payload as ChartPoint) : null;
  if (!p) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="text-xs text-muted">{p.label}</p>
      <p className="font-display font-semibold tabular-nums">{formatMYR(p.total)}</p>
      <p className="text-xs text-muted">{p.count} transaksi</p>
    </div>
  );
}

/** Single-series column chart: one colour, no legend (the section title names the series). */
export function SpendingChart({ data, title }: { data: ChartPoint[]; title: string }) {
  const { resolved } = useTheme();
  const colors = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    return {
      bar: css.getPropertyValue('--chart').trim() || '#059669',
      grid: css.getPropertyValue('--chart-grid').trim() || '#e8ebf0',
      muted: css.getPropertyValue('--muted').trim() || '#5b6b7f',
    };
    // Re-read the tokens whenever the theme flips.
  }, [resolved]);

  return (
    <div>
      <div className="h-52" role="img" aria-label={`${title}. Lihat jadual di bawah untuk nilai penuh.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
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
              width={44}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: colors.grid, opacity: 0.6 }} />
            <Bar dataKey="total" fill={colors.bar} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent">Lihat sebagai jadual</summary>
        <table className="mt-1 w-full text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1.5 font-medium">Tempoh</th>
              <th className="py-1.5 text-right font-medium">Transaksi</th>
              <th className="py-1.5 text-right font-medium">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {data.map((d) => (
              <tr key={d.key}>
                <td className="py-1.5">{d.label}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{d.count}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{formatMYR(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
