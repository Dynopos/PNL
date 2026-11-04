import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Transaction } from '../../lib/types';
import type { ParsedStatement } from './statementParser';

export const MATCH_WINDOW_DAYS = 7;

export interface BankStatement {
  id: string;
  bank: 'cimb' | 'maybank';
  file_name: string | null;
  period_from: string;
  period_to: string;
  created_at: string;
}

export interface LinkedTransaction {
  id: string;
  merchant: string | null;
  description: string | null;
  amount: number;
  transaction_date: string;
  transaction_type: 'income' | 'expense';
}

export interface BankLine {
  id: string;
  statement_id: string;
  line_date: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  transaction_id: string | null;
  match_type: 'auto' | 'manual' | null;
  needs_review: boolean;
  ignored: boolean;
  transaction: LinkedTransaction | null;
}

function unwrap<T>({ data, error }: { data: T | null; error: PostgrestError | null }): T {
  if (error) throw error;
  return data as T;
}

export async function importStatement(
  client: SupabaseClient,
  accountId: string,
  parsed: ParsedStatement,
  fileName: string,
) {
  const rows = unwrap(
    await client.rpc('import_bank_statement', {
      p_account_id: accountId,
      p_bank: parsed.bank,
      p_file_name: fileName,
      p_opening: parsed.opening,
      p_closing: parsed.closing,
      p_lines: parsed.lines,
      p_window_days: MATCH_WINDOW_DAYS,
    }),
  ) as { statement_id: string | null; inserted: number; duplicates: number; matched: number }[];
  return rows[0]!;
}

export async function listStatements(client: SupabaseClient, accountId: string): Promise<BankStatement[]> {
  return unwrap(
    await client
      .from('bank_statements')
      .select('id, bank, file_name, period_from, period_to, created_at')
      .eq('account_id', accountId)
      .order('period_to', { ascending: false })
      .order('created_at', { ascending: false }),
  );
}

export async function listLines(client: SupabaseClient, statementId: string): Promise<BankLine[]> {
  return unwrap(
    await client
      .from('bank_lines')
      .select(
        'id, statement_id, line_date, description, amount, direction, transaction_id, match_type, needs_review, ignored, transaction:transactions(id, merchant, description, amount, transaction_date, transaction_type)',
      )
      .eq('statement_id', statementId)
      .order('line_date')
      .order('created_at'),
  ) as unknown as BankLine[]; // many-to-one embed: PostgREST returns an object, not an array
}

const TX_COLUMNS = 'id, account_id, category_id, merchant, description, amount, currency, transaction_type, transaction_date, source, created_at';

/** Recorded transactions in the period that no bank line points to (cash, or not yet in the bank). */
export async function listUnreconciled(client: SupabaseClient, accountId: string, from: string, to: string) {
  const txs = unwrap(
    await client
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('account_id', accountId)
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date'),
  ) as Transaction[];
  if (txs.length === 0) return [];
  const linked = unwrap(
    await client.from('bank_lines').select('transaction_id').in('transaction_id', txs.map((t) => t.id)),
  ) as { transaction_id: string }[];
  const used = new Set(linked.map((l) => l.transaction_id));
  return txs.filter((t) => !used.has(t.id));
}

/** Unlinked transactions of the same kind and amount, nearest dates first, for a manual match. */
export async function matchCandidates(client: SupabaseClient, accountId: string, line: BankLine) {
  const txs = unwrap(
    await client
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('account_id', accountId)
      .eq('amount', line.amount)
      .eq('transaction_type', line.direction === 'in' ? 'income' : 'expense')
      .limit(50),
  ) as Transaction[];
  if (txs.length === 0) return [];
  const linked = unwrap(
    await client.from('bank_lines').select('transaction_id').in('transaction_id', txs.map((t) => t.id)),
  ) as { transaction_id: string }[];
  const used = new Set(linked.map((l) => l.transaction_id));
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
  return txs
    .filter((t) => !used.has(t.id))
    .sort((a, b) => Math.abs(day(a.transaction_date) - day(line.line_date)) - Math.abs(day(b.transaction_date) - day(line.line_date)));
}

export async function matchLine(client: SupabaseClient, lineId: string, transactionId: string) {
  unwrap(await client.rpc('match_bank_line', { p_line_id: lineId, p_transaction_id: transactionId }));
}

export async function updateLine(client: SupabaseClient, lineId: string, action: 'unmatch' | 'confirm' | 'ignore' | 'unignore') {
  unwrap(await client.rpc('update_bank_line', { p_line_id: lineId, p_action: action }));
}

export async function createTransactionFromLine(client: SupabaseClient, lineId: string, categoryId: string | null) {
  return unwrap(
    await client.rpc('create_transaction_from_bank_line', { p_line_id: lineId, p_category_id: categoryId }),
  ) as string;
}

export async function deleteStatement(client: SupabaseClient, statementId: string) {
  unwrap(await client.from('bank_statements').delete().eq('id', statementId).select('id').single());
}

export async function reconcile(client: SupabaseClient, accountId: string) {
  return unwrap(
    await client.rpc('reconcile_account', { p_account_id: accountId, p_window_days: MATCH_WINDOW_DAYS }),
  ) as number;
}
