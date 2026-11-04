import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type {
  Account,
  AccountKind,
  CashflowBucket,
  CashflowSummary,
  Category,
  CategoryTotal,
  EntryType,
  MerchantTotal,
  Transaction,
} from '../../lib/types';
import { buildSearchFilter } from './search';
import type { TransactionInput } from './validation';

const TX_COLUMNS =
  'id, account_id, category_id, merchant, description, amount, currency, transaction_type, transaction_date, source, created_at';

export const PAGE_SIZE = 30;

/** Sentinel for the "no category" filter option. */
export const NO_CATEGORY = 'none';

export interface TransactionFilters {
  search?: string;
  from?: string;
  to?: string;
  categoryId?: string;
}

function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) throw error;
  return data as T;
}

export async function listTransactions(
  client: SupabaseClient,
  accountId: string,
  filters: TransactionFilters,
  page = 0,
) {
  let q = client
    .from('transactions')
    .select(TX_COLUMNS)
    .eq('account_id', accountId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE); // one extra row tells us if more exist

  if (filters.from) q = q.gte('transaction_date', filters.from);
  if (filters.to) q = q.lte('transaction_date', filters.to);
  if (filters.categoryId === NO_CATEGORY) q = q.is('category_id', null);
  else if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
  const search = filters.search ? buildSearchFilter(filters.search) : null;
  if (search) q = q.or(search);

  const rows = unwrap(await q) as Transaction[];
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function listCategories(client: SupabaseClient): Promise<Category[]> {
  const rows = unwrap(await client.from('categories').select('id, user_id, name, type')) as Category[];
  // System defaults keep their curated order; "Lain-lain" stays last.
  return rows.sort((a, b) => {
    const rank = (c: Category) => (c.name === 'Lain-lain' ? 2 : c.user_id ? 1 : 0);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ms');
  });
}

const ACCOUNT_COLUMNS = 'id, account_name, account_type';
const ACCOUNT_NAMES: Record<AccountKind, string> = { personal: 'Peribadi', business: 'Bisnes' };

/** Returns the user's account of this kind, creating it on first use (one per kind). */
export async function ensureAccount(client: SupabaseClient, userId: string, kind: AccountKind): Promise<Account> {
  const find = async () =>
    (unwrap(await client.from('accounts').select(ACCOUNT_COLUMNS).eq('account_type', kind).limit(1)) as Account[])[0];
  const existing = await find();
  if (existing) return existing;
  const { error } = await client
    .from('accounts')
    .upsert(
      { user_id: userId, account_name: ACCOUNT_NAMES[kind], account_type: kind },
      { onConflict: 'user_id,account_type', ignoreDuplicates: true },
    );
  if (error) throw error;
  const created = await find();
  if (!created) throw new Error(`Could not open ${kind} account`);
  return created;
}

export async function createTransaction(
  client: SupabaseClient,
  userId: string,
  accountId: string,
  input: TransactionInput,
  idempotencyKey: string,
) {
  const { error } = await client.from('transactions').insert({
    ...input,
    user_id: userId,
    account_id: accountId,
    currency: 'MYR',
    source: 'manual',
    idempotency_key: idempotencyKey,
  });
  // A duplicate key means an earlier attempt with this key already saved the record.
  if (error && error.code !== '23505') throw error;
}

export async function updateTransaction(client: SupabaseClient, id: string, input: TransactionInput) {
  unwrap(await client.from('transactions').update(input).eq('id', id).select('id').single());
}

export async function deleteTransaction(client: SupabaseClient, id: string) {
  unwrap(await client.from('transactions').delete().eq('id', id).select('id').single());
}

export async function getCashflowSummary(
  client: SupabaseClient,
  accountId: string,
  from: string,
  to: string,
): Promise<CashflowSummary> {
  const rows = unwrap(
    await client.rpc('cashflow_summary', { p_account_id: accountId, p_from: from, p_to: to }),
  ) as CashflowSummary[];
  return (
    rows[0] ?? { income_total: 0, expense_total: 0, net_cashflow: 0, income_count: 0, expense_count: 0, tx_count: 0 }
  );
}

export async function getCashflowByPeriod(
  client: SupabaseClient,
  accountId: string,
  from: string,
  to: string,
  bucket: 'day' | 'week' | 'month',
): Promise<CashflowBucket[]> {
  return unwrap(
    await client.rpc('cashflow_by_period', { p_account_id: accountId, p_from: from, p_to: to, p_bucket: bucket }),
  );
}

export async function getTotalsByCategory(
  client: SupabaseClient,
  accountId: string,
  from: string,
  to: string,
  type: EntryType,
): Promise<CategoryTotal[]> {
  return unwrap(
    await client.rpc('totals_by_category', { p_account_id: accountId, p_from: from, p_to: to, p_type: type }),
  );
}

export async function getTopMerchants(
  client: SupabaseClient,
  accountId: string,
  from: string,
  to: string,
  limit = 5,
): Promise<MerchantTotal[]> {
  return unwrap(
    await client.rpc('top_merchants', { p_account_id: accountId, p_from: from, p_to: to, p_limit: limit }),
  );
}

export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  if (e?.message?.toLowerCase().includes('fetch')) return 'Tiada sambungan. Semak internet anda dan cuba lagi.';
  if (e?.code === 'PGRST116') return 'Rekod tidak dijumpai. Mungkin telah dipadam.';
  return 'Sesuatu tidak kena. Sila cuba lagi.';
}
