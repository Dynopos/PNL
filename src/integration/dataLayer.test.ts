// @vitest-environment node
// Runs only under supabase/tests/integration.sh (local Postgres + PostgREST).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import {
  createTransaction,
  deleteTransaction,
  ensureAccount,
  friendlyError,
  getCashflowByPeriod,
  getCashflowSummary,
  getTopMerchants,
  getTotalsByCategory,
  listCategories,
  listTransactions,
  NO_CATEGORY,
  PAGE_SIZE,
  updateTransaction,
} from '../features/transactions/api';
import type { TransactionInput } from '../features/transactions/validation';

const URL = process.env.PGRST_URL;
const SECRET = process.env.PGRST_JWT_SECRET ?? '';
const ALI = 'aaaaaaaa-0000-0000-0000-000000000001';
const BEE = 'bbbbbbbb-0000-0000-0000-000000000002';
const TODAY = '2026-11-04';

function jwt(claims: Record<string, unknown>) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

function clientFor(userId: string | null): SupabaseClient {
  const token = userId ? jwt({ sub: userId, role: 'authenticated' }) : jwt({ role: 'anon' });
  return createClient(URL!, jwt({ role: 'anon' }), {
    accessToken: async () => token,
    global: { fetch: (input, init) => fetch(String(input).replace('/rest/v1', ''), init) },
  });
}

const expense = (over: Partial<TransactionInput>): TransactionInput => ({
  transaction_type: 'expense',
  amount: '10.00',
  merchant: null,
  description: null,
  category_id: null,
  transaction_date: TODAY,
  ...over,
});
const income = (over: Partial<TransactionInput>) => expense({ transaction_type: 'income', ...over });

describe.skipIf(!URL)('data layer against PostgREST', () => {
  let ali: SupabaseClient;
  let bee: SupabaseClient;
  let personal = '';
  let business = '';
  let cat: Record<string, string> = {};

  beforeAll(() => {
    ali = clientFor(ALI);
    bee = clientFor(BEE);
  });

  it('opens Personal and Business once each and loads income + expense categories', async () => {
    personal = (await ensureAccount(ali, ALI, 'personal')).id;
    const [b1, b2] = await Promise.all([ensureAccount(ali, ALI, 'business'), ensureAccount(ali, ALI, 'business')]);
    expect(b1.id).toBe(b2.id);
    expect(b1).toMatchObject({ account_type: 'business', account_name: 'Bisnes' });
    business = b1.id;
    expect(business).not.toBe(personal);

    const categories = await listCategories(ali);
    expect(categories.filter((c) => c.type === 'expense')).toHaveLength(10);
    expect(categories.filter((c) => c.type === 'income').map((c) => c.name).sort()).toEqual([
      'Bayaran Pelanggan',
      'Gaji',
      'Jualan',
      'Lain-lain',
    ]);
    cat = Object.fromEntries(categories.map((c) => [`${c.type}:${c.name}`, c.id]));
  });

  it('saves once even when the same submission is retried', async () => {
    const input = expense({ amount: '55.00', merchant: 'Mydin', category_id: cat['expense:Barang Dapur']! });
    await createTransaction(ali, ALI, personal, input, 'manual:retry-test-0001');
    await createTransaction(ali, ALI, personal, input, 'manual:retry-test-0001');
    const { rows } = await listTransactions(ali, personal, { search: 'mydin' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ merchant: 'Mydin', amount: 55, source: 'manual', transaction_type: 'expense' });
  });

  it('records income and keeps Personal and Business apart', async () => {
    await createTransaction(ali, ALI, personal, income({ amount: '2500.00', merchant: 'Gaji masuk', category_id: cat['income:Gaji']!, transaction_date: '2026-11-01' }), 'manual:gaji-0001');
    await createTransaction(ali, ALI, business, income({ amount: '1500.00', description: 'Jualan hari ini', category_id: cat['income:Jualan']! }), 'manual:jualan-0001');
    await createTransaction(ali, ALI, business, income({ amount: '800.00', merchant: 'Customer bayar', category_id: cat['income:Bayaran Pelanggan']!, transaction_date: '2026-11-03' }), 'manual:cust-0001');
    await createTransaction(ali, ALI, business, expense({ amount: '300.00', merchant: 'Mydin', category_id: cat['expense:Barang Dapur']! }), 'manual:biz-mydin-0001');

    expect((await listTransactions(ali, personal, {})).rows.map((r) => r.merchant).sort()).toEqual(['Gaji masuk', 'Mydin']);
    expect((await listTransactions(ali, business, {})).rows).toHaveLength(3);
    expect((await listTransactions(ali, personal, { search: 'jualan' })).rows).toHaveLength(0);
  });

  it('rejects an income filed under an expense category', async () => {
    await expect(
      createTransaction(ali, ALI, personal, income({ merchant: 'x', category_id: cat['expense:Barang Dapur']! }), 'manual:bad-cat-0001'),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('searches safely and filters by date and category', async () => {
    await createTransaction(ali, ALI, personal, expense({ amount: '12.50', merchant: 'Kedai Sdn. Bhd, (KL)' }), 'manual:k-0001');
    await createTransaction(
      ali, ALI, personal,
      expense({ amount: '60.00', merchant: 'Petronas', description: 'Isi minyak', category_id: cat['expense:Petrol & Pengangkutan']!, transaction_date: '2026-11-02' }),
      'manual:p-0001',
    );
    expect((await listTransactions(ali, personal, { search: 'sdn. bhd, (kl)' })).rows.map((r) => r.merchant)).toEqual(['Kedai Sdn. Bhd, (KL)']);
    expect((await listTransactions(ali, personal, { search: 'minyak' })).rows.map((r) => r.merchant)).toEqual(['Petronas']);
    expect((await listTransactions(ali, personal, { search: '%' })).rows).toHaveLength(4);
    expect((await listTransactions(ali, personal, { from: '2026-11-03', to: TODAY })).rows).toHaveLength(2);
    expect((await listTransactions(ali, personal, { categoryId: NO_CATEGORY })).rows.map((r) => r.merchant)).toEqual(['Kedai Sdn. Bhd, (KL)']);
  });

  it('pages newest first and reports when more rows exist', async () => {
    for (let i = 0; i < PAGE_SIZE; i++) {
      await createTransaction(ali, ALI, personal, expense({ amount: '1.00', description: `Kopi ${i}`, transaction_date: '2026-10-01' }), `manual:bulk-${String(i).padStart(4, '0')}`);
    }
    const first = await listTransactions(ali, personal, {}, 0);
    const second = await listTransactions(ali, personal, {}, 1);
    expect(first.rows).toHaveLength(PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(first.rows[0]?.transaction_date).toBe(TODAY);
    expect(second.rows).toHaveLength(4);
    expect(second.hasMore).toBe(false);
  });

  it('returns exact income, expense and net cashflow per account', async () => {
    expect(await getCashflowSummary(ali, personal, '2026-11-01', TODAY)).toEqual({
      income_total: 2500, expense_total: 127.5, net_cashflow: 2372.5, income_count: 1, expense_count: 3, tx_count: 4,
    });
    expect(await getCashflowSummary(ali, business, TODAY, TODAY)).toMatchObject({
      income_total: 1500, expense_total: 300, net_cashflow: 1200, tx_count: 2,
    });

    const daily = await getCashflowByPeriod(ali, personal, '2026-11-01', TODAY, 'day');
    expect(daily.map((d) => d.net)).toEqual([2500, -60, 0, -67.5]);
    const monthly = await getCashflowByPeriod(ali, personal, '2026-10-01', TODAY, 'month');
    expect(monthly.map((m) => [m.income, m.expense])).toEqual([[0, 30], [2500, 127.5]]);

    expect((await getTotalsByCategory(ali, business, '2026-11-01', TODAY, 'income')).map((c) => [c.category_name, c.total])).toEqual([
      ['Jualan', 1500],
      ['Bayaran Pelanggan', 800],
    ]);
    expect((await getTotalsByCategory(ali, personal, '2026-11-01', TODAY, 'expense')).map((c) => c.category_name)).toEqual([
      'Petrol & Pengangkutan',
      'Barang Dapur',
      'Tiada kategori',
    ]);
    expect((await getTopMerchants(ali, personal, '2026-11-01', TODAY, 1)).map((m) => m.merchant)).toEqual(['Petronas']);
  });

  it('keeps users isolated through the API', async () => {
    const beePersonal = (await ensureAccount(bee, BEE, 'personal')).id;
    expect((await listTransactions(bee, beePersonal, {})).rows).toHaveLength(0);
    expect((await listTransactions(bee, personal, {})).rows).toHaveLength(0);
    expect((await getCashflowSummary(bee, personal, '2026-01-01', TODAY)).tx_count).toBe(0);

    const target = (await listTransactions(ali, personal, { search: 'mydin' })).rows[0]!;
    const err = await deleteTransaction(bee, target.id).catch((e) => e);
    expect(friendlyError(err)).toBe('Rekod tidak dijumpai. Mungkin telah dipadam.');
    await expect(updateTransaction(bee, target.id, expense({ amount: '1.00', merchant: 'Hack' }))).rejects.toBeTruthy();
    await expect(createTransaction(bee, BEE, personal, expense({ merchant: 'Hack' }), 'manual:hack-0001')).rejects.toBeTruthy();
  });

  it('lets the owner edit (including switching to income) and delete', async () => {
    const target = (await listTransactions(ali, personal, { search: 'mydin' })).rows[0]!;
    await updateTransaction(ali, target.id, income({ amount: '57.30', merchant: 'Mydin refund', category_id: cat['income:Lain-lain']! }));
    expect((await listTransactions(ali, personal, { search: 'mydin refund' })).rows[0]).toMatchObject({ amount: 57.3, transaction_type: 'income' });
    await deleteTransaction(ali, target.id);
    expect((await listTransactions(ali, personal, { search: 'mydin' })).rows).toHaveLength(0);
  });

  it('denies signed-out visitors', async () => {
    await expect(listTransactions(clientFor(null), personal, {})).rejects.toMatchObject({ code: '42501' });
  });
});
