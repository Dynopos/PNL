import { formatMYR } from '../lib/locale';

export interface RankedItem {
  key: string;
  label: string;
  total: number;
  detail?: string;
}

/** Single-series horizontal bars, already sorted largest first. Identity comes from the text label. */
export function RankedBars({ items, grandTotal }: { items: RankedItem[]; grandTotal: number }) {
  const max = Math.max(...items.map((i) => i.total), 0);
  return (
    <ul className="space-y-3.5">
      {items.map((item) => {
        const share = grandTotal > 0 ? Math.round((item.total / grandTotal) * 100) : 0;
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{formatMYR(item.total)}</span>
                <span className="ml-1.5 text-muted">{share}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2">
              <div
                className="h-full rounded-r-[4px] bg-[var(--chart)]"
                style={{ width: `${max > 0 ? Math.max((item.total / max) * 100, 1.5) : 0}%` }}
              />
            </div>
            {item.detail && <p className="mt-1 text-xs text-muted">{item.detail}</p>}
          </li>
        );
      })}
    </ul>
  );
}
