import type { Category, Transaction } from '../../lib/types';
import { accountLedger, cashBook, ledgerAccounts, ledgerCsv } from './ledger';

const cats: Category[] = [
  { id: 'jualan', user_id: null, name: 'Jualan', type: 'income' },
  { id: 'gaji', user_id: null, name: 'Gaji Staff', type: 'expense' },
  { id: 'bil', user_id: null, name: 'Bil & Utiliti', type: 'expense' },
  { id: 'owner', user_id: null, name: 'Kegunaan Peribadi Pemilik', type: 'expense' },
];
let n = 0;
const tx = (type: 'income' | 'expense', amount: number, category_id: string | null, date = '2026-11-01', merchant: string | null = null): Transaction => ({
  id: `t${++n}`,
  account_id: 'a',
  category_id,
  merchant,
  description: null,
  amount,
  currency: 'MYR',
  transaction_type: type,
  transaction_date: date,
  source: 'manual',
  created_at: `2026-11-01T00:00:0${n % 10}Z`,
});

const txs = [
  tx('income', 1000.1, 'jualan', '2026-11-01', 'Kedai'),
  tx('expense', 300.05, 'owner', '2026-11-02'),
  tx('expense', 1500, 'gaji', '2026-11-02'),
  tx('expense', 0.1, null, '2026-11-03'),
  tx('income', 200, 'jualan', '2026-11-04'),
  tx('expense', 99.95, 'bil', '2026-11-05'),
];

describe('ledgerAccounts', () => {
  it('lists income, then business expenses, then drawings, with exact totals', () => {
    expect(ledgerAccounts(txs, cats).map((a) => [a.key, a.name, a.total, a.count])).toEqual([
      ['jualan', 'Jualan', 1200.1, 2],
      ['gaji', 'Gaji Staff', 1500, 1],
      ['bil', 'Bil & Utiliti', 99.95, 1],
      ['tiada-expense', 'Tiada kategori', 0.1, 1],
      ['owner', 'Kegunaan Peribadi Pemilik', 300.05, 1],
    ]);
  });
});

describe('cashBook', () => {
  it('runs a balance from the opening amount', () => {
    const b = cashBook(txs, 50.5);
    expect(b.rows.map((r) => r.balance)).toEqual([1050.6, 750.55, -749.45, -749.55, -549.55, -649.5]);
    expect(b.rows[1]!.amount).toBe(-300.05);
    expect([b.totalIn, b.totalOut, b.closing]).toEqual([1200.1, 1900.1, -649.5]);
  });
});

describe('accountLedger', () => {
  it('keeps one account with a running total', () => {
    const l = accountLedger(txs, 'jualan');
    expect(l.rows.map((r) => r.balance)).toEqual([1000.1, 1200.1]);
    expect([l.totalIn, l.totalOut, l.closing]).toEqual([1200.1, 0, 1200.1]);
    expect(accountLedger(txs, 'tiada-expense').totalOut).toBe(0.1);
  });
});

describe('ledgerCsv', () => {
  it('writes a spreadsheet-safe CSV with a header and balances', () => {
    const csv = ledgerCsv(cashBook([tx('income', 10, 'jualan', '2026-11-01', '=Kedai, "Ali"')], 0), cats);
    expect(csv.split('\r\n')).toEqual([
      'Tarikh,Keterangan,Kategori,Masuk,Keluar,Baki',
      `2026-11-01,"'=Kedai, ""Ali""",Jualan,10.00,,10.00`,
    ]);
  });
});
