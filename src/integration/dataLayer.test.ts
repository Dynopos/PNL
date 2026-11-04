// @vitest-environment node
// Runs only under supabase/tests/integration.sh (local Postgres + PostgREST).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import {
  createTransaction,
  deleteTransaction,
  friendlyError,
  getDashboardSummary,
  getDefaultAccountId,
  getSpendingByCategory,
  getSpendingByPeriod,
  getTopMerchants,
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

const tx = (over: Partial<TransactionInput>): TransactionInput => ({
  amount: '10.00',
  merchant: null,
  description: null,
  category_id: null,
  transaction_date: TODAY,
  ...over,
});

describe.skipIf(!URL)('data layer against PostgREST', () => {
  let ali: SupabaseClient;
  let bee: SupabaseClient;
  let accountId = '';
  beforeAll(() => {
    ali = clientFor(ALI);
    bee = clientFor(BEE);
  });
  let cat: Record<string, string> = {};

  it('loads the default account and system categories with Lain-lain last', async () => {
    accountId = await getDefaultAccountId(ali);
    const categories = await listCategories(ali);
    expect(categories).toHaveLength(10);
    expect(categories.at(-1)?.name).toBe('Lain-lain');
    cat = Object.fromEntries(categories.map((c) => [c.name, c.id]));
  });

  it('saves once even when the same submission is retried', async () => {
    const input = tx({ amount: '55.00', merchant: 'Mydin', category_id: cat['Barang Dapur']! });
    await createTransaction(ali, ALI, accountId, input, 'manual:retry-test-0001');
    await createTransaction(ali, ALI, accountId, input, 'manual:retry-test-0001');
    const { rows } = await listTransactions(ali, { search: 'mydin' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ merchant: 'Mydin', amount: 55, source: 'manual', currency: 'MYR' });
  });

  it('searches safely through PostgREST syntax characters and wildcards', async () => {
    await createTransaction(ali, ALI, accountId, tx({ amount: '12.50', merchant: 'Kedai Sdn. Bhd, (KL)' }), 'manual:k-0001');
    await createTransaction(
      ali, ALI, accountId,
      tx({ amount: '60.00', merchant: 'Petronas', description: 'Isi minyak', category_id: cat['Petrol & Pengangkutan']!, transaction_date: '2026-11-02' }),
      'manual:p-0001',
    );
    expect((await listTransactions(ali, { search: 'sdn. bhd, (kl)' })).rows.map((r) => r.merchant)).toEqual([
      'Kedai Sdn. Bhd, (KL)',
    ]);
    expect((await listTransactions(ali, { search: 'minyak' })).rows.map((r) => r.merchant)).toEqual(['Petronas']);
    expect((await listTransactions(ali, { search: '%' })).rows).toHaveLength(3);
    expect((await listTransactions(ali, { search: 'tiada-padanan' })).rows).toHaveLength(0);
  });

  it('filters by date range and category, including uncategorised', async () => {
    expect((await listTransactions(ali, { from: '2026-11-03', to: TODAY })).rows).toHaveLength(2);
    expect((await listTransactions(ali, { categoryId: cat['Petrol & Pengangkutan']! })).rows).toHaveLength(1);
    expect((await listTransactions(ali, { categoryId: NO_CATEGORY })).rows.map((r) => r.merchant)).toEqual([
      'Kedai Sdn. Bhd, (KL)',
    ]);
  });

  it('pages newest first and reports when more rows exist', async () => {
    for (let i = 0; i < PAGE_SIZE; i++) {
      await createTransaction(ali, ALI, accountId, tx({ amount: '1.00', description: `Kopi ${i}`, transaction_date: '2026-10-01' }), `manual:bulk-${String(i).padStart(4, '0')}`);
    }
    const first = await listTransactions(ali, {}, 0);
    const second = await listTransactions(ali, {}, 1);
    expect(first.rows).toHaveLength(PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(first.rows[0]?.transaction_date).toBe(TODAY);
    expect(second.rows).toHaveLength(3);
    expect(second.hasMore).toBe(false);
  });

  it('returns exact report totals', async () => {
    const s = await getDashboardSummary(ali, TODAY);
    expect(s).toMatchObject({ today_total: 67.5, today_count: 2, month_total: 127.5, month_count: 3, month_budget: null });

    const daily = await getSpendingByPeriod(ali, '2026-11-01', TODAY, 'day');
    expect(daily.map((d) => d.total)).toEqual([0, 60, 0, 67.5]);
    const monthly = await getSpendingByPeriod(ali, '2026-10-01', TODAY, 'month');
    expect(monthly.map((m) => m.total)).toEqual([30, 127.5]);

    const byCat = await getSpendingByCategory(ali, '2026-11-01', TODAY);
    expect(byCat.map((c) => [c.category_name, c.total])).toEqual([
      ['Petrol & Pengangkutan', 60],
      ['Barang Dapur', 55],
      ['Tiada kategori', 12.5],
    ]);
    expect((await getTopMerchants(ali, '2026-11-01', TODAY, 1)).map((m) => m.merchant)).toEqual(['Petronas']);
  });

  it('keeps users isolated through the API', async () => {
    expect((await listTransactions(bee, {})).rows).toHaveLength(0);
    expect((await getDashboardSummary(bee, TODAY)).month_total).toBe(0);

    const target = (await listTransactions(ali, { search: 'mydin' })).rows[0]!;
    const err = await deleteTransaction(bee, target.id).catch((e) => e);
    expect(friendlyError(err)).toBe('Rekod tidak dijumpai. Mungkin telah dipadam.');
    await expect(updateTransaction(bee, target.id, tx({ amount: '1.00', merchant: 'Hack' }))).rejects.toBeTruthy();
    await expect(createTransaction(bee, BEE, accountId, tx({ merchant: 'Hack' }), 'manual:hack-0001')).rejects.toBeTruthy();
    expect((await listTransactions(ali, { search: 'mydin' })).rows[0]?.amount).toBe(55);
  });

  it('lets the owner edit and delete', async () => {
    const target = (await listTransactions(ali, { search: 'mydin' })).rows[0]!;
    await updateTransaction(ali, target.id, tx({ amount: '57.30', merchant: 'Mydin Mall', category_id: cat['Barang Dapur']! }));
    expect((await listTransactions(ali, { search: 'mydin mall' })).rows[0]?.amount).toBe(57.3);
    await deleteTransaction(ali, target.id);
    expect((await listTransactions(ali, { search: 'mydin' })).rows).toHaveLength(0);
  });

  it('denies signed-out visitors', async () => {
    await expect(listTransactions(clientFor(null), {})).rejects.toMatchObject({ code: '42501' });
  });
});
