import { addMonths, endOfMonth } from '../../lib/dates';
import { fromSen, toSen } from '../../lib/money';
import type { Category, CategoryTotal } from '../../lib/types';
import { GL_BY_CODE, glOf, type GlCode } from './gl';

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
  /** Share of sales, 0–1; null when there are no sales. */
  ofRevenue: number | null;
}

export interface PnlSection {
  code: GlCode;
  name: string;
  lines: PnlLine[];
  total: number;
  count: number;
}

export interface Pnl {
  sales: PnlSection;
  cogs: PnlSection;
  cogsAdvance: PnlSection;
  costOfSales: number;
  grossProfit: number;
  opex: PnlSection;
  operatingProfit: number;
  salary: PnlSection;
  financing: PnlSection;
  /** Profit before the owner's drawings. */
  netProfit: number;
  margin: number | null;
  drawings: PnlSection;
  /** Net Cash Profit in the Dynopos GL: net profit after the owner's drawings. */
  netCash: number;
  revenueTotal: number;
  empty: boolean;
}

/**
 * Cash-basis profit and loss in the Dynopos GL layout: Sales − COGS = Gross Profit; − OPEX = Operating
 * Profit; − Staff Salary − Loan & Financing = Net Profit; − Owner Drawing = Net Cash Profit.
 */
export function buildPnl(income: CategoryTotal[], expense: CategoryTotal[], categories: Category[] = []): Pnl {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows = [
    ...income.map((r) => ({ r, type: 'income' as const })),
    ...expense.map((r) => ({ r, type: 'expense' as const })),
  ].map(({ r, type }) => {
    const category = (r.category_id && byId.get(r.category_id)) || (r.category_id ? { name: r.category_name, type } : undefined);
    return { r, type, code: glOf(category, type) };
  });
  const salesSen = rows.filter((x) => x.code === '4000').reduce((s, x) => s + toSen(x.r.total), 0);

  const section = (code: GlCode): PnlSection => {
    const mine = rows.filter((x) => x.code === code);
    const sen = mine.reduce((s, x) => s + toSen(x.r.total), 0);
    return {
      code,
      name: GL_BY_CODE.get(code)!.name,
      lines: mine
        .map(({ r, type }) => ({
          key: r.category_id ?? `tiada-${type}`,
          categoryId: r.category_id,
          label: r.category_name,
          amount: Number(r.total),
          count: r.tx_count,
          ofRevenue: salesSen > 0 ? toSen(r.total) / salesSen : null,
        }))
        .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label)),
      total: fromSen(sen),
      count: mine.reduce((s, x) => s + x.r.tx_count, 0),
    };
  };

  const sales = section('4000');
  const cogs = section('5000');
  const cogsAdvance = section('5010');
  const opex = section('6000');
  const salary = section('6050');
  const drawings = section('6100');
  const financing = section('6200');
  const sen = (n: number) => toSen(n);
  const costSen = sen(cogs.total) + sen(cogsAdvance.total);
  const grossSen = salesSen - costSen;
  const operatingSen = grossSen - sen(opex.total);
  const netSen = operatingSen - sen(salary.total) - sen(financing.total);
  return {
    sales,
    cogs,
    cogsAdvance,
    costOfSales: fromSen(costSen),
    grossProfit: fromSen(grossSen),
    opex,
    operatingProfit: fromSen(operatingSen),
    salary,
    financing,
    netProfit: fromSen(netSen),
    margin: salesSen > 0 ? netSen / salesSen : null,
    drawings,
    netCash: fromSen(netSen - sen(drawings.total)),
    revenueTotal: fromSen(salesSen),
    empty: rows.length === 0,
  };
}

/** Change from the previous period, as a fraction of its absolute value; null when there is nothing to compare. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
