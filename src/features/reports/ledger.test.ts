import type { Category, Transaction } from '../../lib/types';
import { accountLedger, cashLedger, glSummaries, ledgerCsv, postings, trialBalance } from './ledger';

const cats: Category[] = [
  { id: 'jualan', user_id: null, name: 'Jualan', type: 'income', gl_account: '4000' },
  { id: 'gaji', user_id: null, name: 'Gaji Staff', type: 'expense', gl_account: '6050' },
  { id: 'bil', user_id: null, name: 'Bil & Utiliti', type: 'expense', gl_account: '6000' },
  { id: 'stok', user_id: null, name: 'Kos Barang & Stok', type: 'expense', gl_account: '5000' },
  { id: 'owner', user_id: null, name: 'Kegunaan Peribadi Pemilik', type: 'expense' }, // before the migration: by name
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
  tx('expense', 400, 'stok', '2026-11-05'),
];
const posts = postings(txs, cats);

describe('glSummaries', () => {
  it('groups categories under their GL accounts in chart order', () => {
    expect(glSummaries(posts).map((a) => [a.code, a.total, a.count])).toEqual([
      ['4000', 1200.1, 2],
      ['5000', 400, 1],
      ['6000', 100.05, 2],
      ['6050', 1500, 1],
      ['6100', 300.05, 1],
    ]);
    expect(glSummaries(posts).find((a) => a.code === '6000')!.categories.map((c) => c.name)).toEqual(['Bil & Utiliti', 'Tiada kategori']);
  });
});

describe('cashLedger', () => {
  it('debits money in, credits money out, with contra accounts and a running balance', () => {
    const l = cashLedger(posts, 50.5);
    expect(l.rows.map((r) => r.balance)).toEqual([1050.6, 750.55, -749.45, -749.55, -549.55, -649.5, -1049.5]);
    expect(l.rows[0]).toMatchObject({ debit: 1000.1, credit: 0, contra: '4000 Jualan' });
    expect(l.rows[1]).toMatchObject({ debit: 0, credit: 300.05, contra: '6100 Ambilan Pemilik' });
    expect([l.totalDebit, l.totalCredit, l.closing]).toEqual([1200.1, 2300.1, -1049.5]);
  });
});

describe('accountLedger', () => {
  it('keeps revenue on the credit side and expenses on the debit side', () => {
    const sales = accountLedger(posts, '4000');
    expect(sales.rows.map((r) => [r.credit, r.balance])).toEqual([[1000.1, 1000.1], [200, 1200.1]]);
    expect(sales.rows[0]!.contra).toBe('1000 Tunai di Bank');
    const opex = accountLedger(posts, '6000');
    expect([opex.totalDebit, opex.totalCredit, opex.closing]).toEqual([100.05, 0, 100.05]);
    expect(accountLedger(posts, '6000', 'bil').rows).toHaveLength(1);
  });
});

describe('trialBalance', () => {
  it('balances: debits equal credits', () => {
    const tb = trialBalance(posts);
    expect(tb.balanced).toBe(true);
    expect([tb.debit, tb.credit]).toEqual([3500.2, 3500.2]);
    expect(tb.rows[0]).toEqual({ code: '1000', name: 'Tunai di Bank', debit: 1200.1, credit: 2300.1 });
  });
});

describe('ledgerCsv', () => {
  it('writes a spreadsheet-safe CSV in the GL layout', () => {
    const csv = ledgerCsv(cashLedger(postings([tx('income', 10, 'jualan', '2026-11-01', '=Kedai, "Ali"')], cats), 0));
    expect(csv.split('\r\n')).toEqual([
      'Tarikh,Keterangan,Akaun Kontra,Kategori,Debit (RM),Kredit (RM),Baki (RM)',
      `2026-11-01,"'=Kedai, ""Ali""",4000 Jualan,Jualan,10.00,,10.00`,
    ]);
  });
});
