import type { Category, Transaction } from '../../lib/types';
import { postings } from './ledger';
import { bankCheck, buildNotes, categoryTotals, monthlySummary, monthName, monthsBetween } from './management';
import { buildPnl } from './pnl';

const cats: Category[] = [
  { id: 'jualan', user_id: null, name: 'Jualan', type: 'income', gl_account: '4000' },
  { id: 'stok', user_id: null, name: 'Kos Barang & Stok', type: 'expense', gl_account: '5000' },
  { id: 'bil', user_id: null, name: 'Bil & Utiliti', type: 'expense', gl_account: '6000' },
  { id: 'lain', user_id: null, name: 'Lain-lain', type: 'expense', gl_account: '6000' },
  { id: 'gaji', user_id: null, name: 'Gaji Staff', type: 'expense', gl_account: '6050' },
  { id: 'owner', user_id: null, name: 'Kegunaan Peribadi Pemilik', type: 'expense', gl_account: '6100' },
  { id: 'loan', user_id: null, name: 'Pinjaman & Pembiayaan', type: 'expense', gl_account: '6200' },
];
let n = 0;
const tx = (type: 'income' | 'expense', amount: number, category_id: string | null, date: string, source: Transaction['source'] = 'bank'): Transaction => ({
  id: `t${++n}`, account_id: 'a', category_id, merchant: null, description: `d${n}`, amount, currency: 'MYR',
  transaction_type: type, transaction_date: date, source, created_at: '2026-01-01T00:00:00Z',
});

const posts = postings(
  [
    tx('income', 9000, 'jualan', '2026-09-03'),
    tx('expense', 2000, 'stok', '2026-09-04'),
    tx('expense', 500.5, 'bil', '2026-09-10', 'voice'),
    tx('expense', 1500, 'gaji', '2026-09-28'),
    tx('expense', 300, 'loan', '2026-09-28'),
    tx('expense', 400, 'owner', '2026-09-29'),
    tx('income', 6000, 'jualan', '2026-11-02', 'manual'),
    tx('expense', 0.5, 'lain', '2026-11-03'),
    tx('expense', 10, null, '2026-11-03'),
  ],
  cats,
);

describe('monthlySummary', () => {
  it('follows the Dynopos columns per month and in total', () => {
    const months = monthsBetween('2026-09-01', '2026-11-30');
    expect(months).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    const { rows, total } = monthlySummary(posts, months);
    expect(rows[0]).toMatchObject({
      sales: 9000, cogs: 2000, grossProfit: 7000, opex: 500.5, operatingProfit: 6499.5,
      salary: 1500, financing: 300, netProfit: 4699.5, drawings: 400, netCash: 4299.5, count: 6,
    });
    expect(rows[1]!.count).toBe(0);
    expect(total).toMatchObject({ sales: 15000, opex: 511, netProfit: 10689, netCash: 10289 });
  });

  it('agrees with the PNL statement', () => {
    const { income, expense } = categoryTotals(posts);
    const pnl = buildPnl(income, expense, cats);
    const { total } = monthlySummary(posts, monthsBetween('2026-09-01', '2026-11-30'));
    expect([pnl.grossProfit, pnl.netProfit, pnl.netCash]).toEqual([total.grossProfit, total.netProfit, total.netCash]);
  });
});

describe('bankCheck', () => {
  it('rebuilds the closing balance from the statement lines', () => {
    const rows = bankCheck(
      [
        { id: 's2', bank: 'cimb', period_from: '2026-10-01', period_to: '2026-10-31', opening_balance: 1000, closing_balance: 1500.1 },
        { id: 's1', bank: 'cimb', period_from: '2026-09-01', period_to: '2026-09-30', opening_balance: null, closing_balance: 1000 },
      ],
      [
        { statement_id: 's2', amount: 800.1, direction: 'in', transaction_id: 'x', ignored: false },
        { statement_id: 's2', amount: 300, direction: 'out', transaction_id: null, ignored: false },
      ],
    );
    expect(rows.map((r) => r.label)).toEqual(['CIMB Sep 2026', 'CIMB Okt 2026']);
    expect(monthName('2026-08-01')).toBe('Ogos 2026');
    expect(rows[0]!.diff).toBeNull();
    expect(rows[1]).toMatchObject({ computed: 1500.1, diff: 0, lines: 2, inRecords: 1 });
  });
});

describe('buildNotes', () => {
  it('flags empty months, uncategorised and Lain-lain entries, big deposits and unread lines', () => {
    const { rows } = monthlySummary(posts, monthsBetween('2026-09-01', '2026-11-30'));
    const notes = buildNotes({
      business: 'Bisnes', periodLabel: 'S3 2026', posts, months: rows,
      checks: [{ label: 'CIMB Okt 2026', from: '', to: '', opening: 0, totalIn: 0, totalOut: 0, computed: 0, closing: 5, diff: 5, lines: 3, inRecords: 1 }],
    });
    const text = notes.flatMap((s) => s.items).join('\n');
    expect(text).toContain('9 transaksi: 7 daripada statement bank, 1 daripada suara, 1 input manual.');
    expect(text).toMatch(/Bulan tanpa sebarang transaksi: Okt 2026/);
    expect(text).toContain('beza RM5.00');
    expect(buildNotes({ business: 'B', periodLabel: 'P', posts, months: rows, checks: [{ label: 'X', from: '', to: '', opening: 0, totalIn: 0, totalOut: 0, computed: 0, closing: 0, diff: -50, lines: 0, inRecords: 0 }] }).flatMap((s) => s.items).join()).toContain('beza -RM50.00');
    expect(text).toContain('2 baris statement belum masuk rekod');
    expect(text).toContain('1 transaksi tanpa kategori (RM10.00)');
    expect(text).toContain('"Lain-lain" (RM0.50)');
    expect(text).toContain('Deposit besar RM9,000.00 pada 2026-09-03');
  });
});

describe('buildReport', () => {
  it('starts the months at the first record and notes it', async () => {
    const { buildReport } = await import('./report');
    const r = buildReport({
      business: 'Bisnes', periodLabel: 'Tahun 2026', from: '2026-01-01', to: '2026-12-31', today: '2026-11-06',
      opening: 0, posts, categories: cats, statements: [], statementLines: [],
    });
    expect(r.months).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    const text = r.notes.flatMap((s) => s.items).join('\n');
    expect(text).toContain('Rekod bermula Sep 2026');
    expect(text).toContain('Bulan tanpa sebarang transaksi: Okt 2026');
    expect(r.tb.balanced).toBe(true);
    expect(r.chart.find((a) => a.code === '6050')!.categories).toBe('Gaji Staff');
  });
});
