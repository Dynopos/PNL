import { buildPnl, change, periodLabel, periodStart, pnlPeriod } from './pnl';

const row = (name: string, total: number, count = 1, id: string | null = name) => ({
  category_id: id,
  category_name: name,
  total,
  tx_count: count,
});

describe('buildPnl', () => {
  const cats = [
    { id: 'Jualan', user_id: null, name: 'Jualan', type: 'income' as const, gl_account: '4000' },
    { id: 'Kos Barang & Stok', user_id: null, name: 'Kos Barang & Stok', type: 'expense' as const, gl_account: '5000' },
    { id: 'Pendahuluan Pembekal', user_id: null, name: 'Pendahuluan Pembekal', type: 'expense' as const, gl_account: '5010' },
    { id: 'Bil & Utiliti', user_id: null, name: 'Bil & Utiliti', type: 'expense' as const, gl_account: '6000' },
    { id: 'Gaji Staff', user_id: null, name: 'Gaji Staff', type: 'expense' as const, gl_account: '6050' },
    { id: 'Kegunaan Peribadi Pemilik', user_id: null, name: 'Kegunaan Peribadi Pemilik', type: 'expense' as const, gl_account: '6100' },
    { id: 'Pinjaman & Pembiayaan', user_id: null, name: 'Pinjaman & Pembiayaan', type: 'expense' as const, gl_account: '6200' },
  ];

  it('follows the Dynopos layout down to net cash profit', () => {
    const p = buildPnl(
      [row('Jualan', 10000, 10), row('Bayaran Pelanggan', 1000.1, 2)],
      [
        row('Kos Barang & Stok', 3000), row('Pendahuluan Pembekal', 500),
        row('Bil & Utiliti', 450.3), row('Gaji Staff', 2000, 2), row('Pinjaman & Pembiayaan', 300),
        row('Kegunaan Peribadi Pemilik', 300.05, 3),
      ],
      cats,
    );
    expect(p.revenueTotal).toBe(11000.1);
    expect(p.sales.lines.map((l) => l.label)).toEqual(['Jualan', 'Bayaran Pelanggan']);
    expect(p.costOfSales).toBe(3500);
    expect(p.grossProfit).toBe(7500.1);
    expect(p.operatingProfit).toBe(7049.8);
    expect(p.netProfit).toBe(4749.8);
    expect(p.margin).toBeCloseTo(4749.8 / 11000.1);
    expect(p.drawings.total).toBe(300.05);
    expect(p.drawings.count).toBe(3);
    expect(p.netCash).toBe(4449.75);
    expect(p.opex.lines[0]!.ofRevenue).toBeCloseTo(450.3 / 11000.1);
  });

  it('places categories by name before the chart-of-accounts migration, and handles a loss', () => {
    const p = buildPnl([], [row('Lain-lain', 99.99), row('Tiada kategori', 10, 1, null), row('Gaji Staff', 5)]);
    expect(p.opex.total).toBe(109.99);
    expect(p.salary.total).toBe(5);
    expect(p.netProfit).toBe(-114.99);
    expect(p.margin).toBeNull();
    expect(p.opex.lines[1]!.key).toBe('tiada-expense');
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
