import { addMonths, endOfMonth } from '../../lib/dates';
import { fromSen, toSen } from '../../lib/money';
import type { CategoryTotal } from '../../lib/types';

export const OWNER_CATEGORY = 'Kegunaan Peribadi Pemilik';

export type PnlPeriodKind = 'month' | 'quarter' | 'year';

export const PNL_PERIODS: { value: PnlPeriodKind; label: string }[] = [
  { value: 'month', label: 'Bulan' },
  { value: 'quarter', label: 'Suku' },
  { value: 'year', label: 'Tahun' },
];

const MONTHS_IN: Record<PnlPeriodKind, number> = { month: 1, quarter: 3, year: 12 };

/** First day of the period containing the date. */
export function periodStart(kind: PnlPeriodKind, iso: string): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  if (kind === 'year') return `${y}-01-01`;
  if (kind === 'quarter') return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  return `${iso.slice(0, 7)}-01`;
}

/** The period `steps` periods away (negative = earlier), its full date range, and whether it has ended. */
export function pnlPeriod(kind: PnlPeriodKind, anchor: string, today: string, steps = 0) {
  const from = addMonths(periodStart(kind, anchor), steps * MONTHS_IN[kind]);
  const end = endOfMonth(addMonths(from, MONTHS_IN[kind] - 1));
  return { from, to: end, complete: end < today, future: from > today };
}

const monthName = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ms-MY', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export function periodLabel(kind: PnlPeriodKind, from: string): string {
  if (kind === 'year') return `Tahun ${from.slice(0, 4)}`;
  if (kind === 'quarter') return `S${Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1} ${from.slice(0, 4)}`;
  return monthName(from, { month: 'long', year: 'numeric' });
}

export interface PnlLine {
  key: string;
  categoryId: string | null;
  label: string;
  amount: number;
  count: number;
  /** Share of revenue, 0–1; null when there is no revenue. */
  ofRevenue: number | null;
}

export interface Pnl {
  revenue: PnlLine[];
  revenueTotal: number;
  expenses: PnlLine[];
  expenseTotal: number;
  netProfit: number;
  margin: number | null;
  drawings: number;
  drawingsCount: number;
  retained: number;
  empty: boolean;
}

/**
 * A cash-basis profit and loss statement. Owner's personal use of business money is a drawing,
 * not a business expense, so it is shown after net profit.
 */
export function buildPnl(income: CategoryTotal[], expense: CategoryTotal[]): Pnl {
  const sen = (rows: CategoryTotal[]) => rows.reduce((s, r) => s + toSen(r.total), 0);
  const owner = expense.filter((r) => r.category_name === OWNER_CATEGORY);
  const business = expense.filter((r) => r.category_name !== OWNER_CATEGORY);
  const revenueSen = sen(income);
  const expenseSen = sen(business);
  const drawingsSen = sen(owner);
  const line = (r: CategoryTotal): PnlLine => ({
    key: r.category_id ?? `none:${r.category_name}`,
    categoryId: r.category_id,
    label: r.category_name,
    amount: Number(r.total),
    count: r.tx_count,
    ofRevenue: revenueSen > 0 ? toSen(r.total) / revenueSen : null,
  });
  const byAmount = (a: PnlLine, b: PnlLine) => b.amount - a.amount || a.label.localeCompare(b.label);
  const netSen = revenueSen - expenseSen;
  return {
    revenue: income.map(line).sort(byAmount),
    revenueTotal: fromSen(revenueSen),
    expenses: business.map(line).sort(byAmount),
    expenseTotal: fromSen(expenseSen),
    netProfit: fromSen(netSen),
    margin: revenueSen > 0 ? netSen / revenueSen : null,
    drawings: fromSen(drawingsSen),
    drawingsCount: owner.reduce((s, r) => s + r.tx_count, 0),
    retained: fromSen(netSen - drawingsSen),
    empty: income.length === 0 && expense.length === 0,
  };
}

/** Change from the previous period, as a fraction of its absolute value; null when there is nothing to compare. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
