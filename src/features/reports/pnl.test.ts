import { buildPnl, change, periodLabel, periodStart, pnlPeriod } from './pnl';

const row = (name: string, total: number, count = 1, id: string | null = name) => ({
  category_id: id,
  category_name: name,
  total,
  tx_count: count,
});

describe('buildPnl', () => {
  it('treats owner personal use as drawings, after net profit', () => {
    const p = buildPnl(
      [row('Jualan', 5000, 10), row('Bayaran Pelanggan', 1000.1, 2)],
      [row('Gaji Staff', 2000, 2), row('Kegunaan Peribadi Pemilik', 300.05, 3), row('Bil & Utiliti', 450.3, 1)],
    );
    expect(p.revenueTotal).toBe(6000.1);
    expect(p.expenses.map((l) => l.label)).toEqual(['Gaji Staff', 'Bil & Utiliti']);
    expect(p.expenseTotal).toBe(2450.3);
    expect(p.netProfit).toBe(3549.8);
    expect(p.margin).toBeCloseTo(3549.8 / 6000.1);
    expect(p.drawings).toBe(300.05);
    expect(p.drawingsCount).toBe(3);
    expect(p.retained).toBe(3249.75);
    expect(p.expenses[0]!.ofRevenue).toBeCloseTo(2000 / 6000.1);
  });

  it('handles a loss and no revenue', () => {
    const p = buildPnl([], [row('Lain-lain', 99.99), row('Tiada kategori', 10, 1, null)]);
    expect(p.netProfit).toBe(-109.99);
    expect(p.margin).toBeNull();
    expect(p.expenses.every((l) => l.ofRevenue === null)).toBe(true);
    expect(p.expenses[1]!.key).toBe('none:Tiada kategori');
    expect(p.empty).toBe(false);
    expect(buildPnl([], []).empty).toBe(true);
  });
});

describe('periods', () => {
  const today = '2026-11-06';
  it('finds full month, quarter and year ranges', () => {
    expect(pnlPeriod('month', today, today)).toEqual({ from: '2026-11-01', to: '2026-11-30', complete: false, future: false });
    expect(pnlPeriod('month', today, today, -1)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', complete: true });
    expect(pnlPeriod('quarter', today, today)).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(pnlPeriod('quarter', today, today, -1)).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(pnlPeriod('year', today, today, -1)).toMatchObject({ from: '2025-01-01', to: '2025-12-31', complete: true });
    expect(pnlPeriod('month', today, today, 1).future).toBe(true);
  });

  it('labels periods in Malay', () => {
    expect(periodStart('quarter', '2026-02-14')).toBe('2026-01-01');
    expect(periodLabel('quarter', '2026-10-01')).toBe('S4 2026');
    expect(periodLabel('year', '2026-01-01')).toBe('Tahun 2026');
    expect(periodLabel('month', '2026-11-01')).toMatch(/November 2026/);
  });
});

describe('change', () => {
  it('compares against the size of the previous value', () => {
    expect(change(150, 100)).toBe(0.5);
    expect(change(-50, -100)).toBe(0.5);
    expect(change(10, 0)).toBeNull();
  });
});
