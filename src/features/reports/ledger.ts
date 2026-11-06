import type { SupabaseClient } from '@supabase/supabase-js';
import { fromSen, toSen } from '../../lib/money';
import type { Category, EntryType, Transaction } from '../../lib/types';
import { OWNER_CATEGORY } from './pnl';

export const CASH_BOOK = 'tunai';

const TX_COLUMNS = 'id, account_id, category_id, merchant, description, amount, currency, transaction_type, transaction_date, source, created_at';
const BATCH = 1000;

/** Every transaction in the range, oldest first (fetched in batches past the API's row limit). */
export async function fetchPeriodTransactions(client: SupabaseClient, accountId: string, from: string, to: string) {
  const all: Transaction[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await client
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('account_id', accountId)
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date')
      .order('created_at')
      .order('id')
      .range(page * BATCH, page * BATCH + BATCH - 1);
    if (error) throw error;
    all.push(...(data as Transaction[]));
    if (data.length < BATCH) return all;
  }
}

/** Ledger account key for a transaction: its category, or "no category" of its type. */
export function accountKey(t: Pick<Transaction, 'category_id' | 'transaction_type'>): string {
  return t.category_id ?? `tiada-${t.transaction_type}`;
}

export interface LedgerAccount {
  key: string;
  name: string;
  type: EntryType;
  owner: boolean;
  total: number;
  count: number;
}

/** One account per category used in the period: income first, then business expenses, then owner's drawings. */
export function ledgerAccounts(txs: Transaction[], categories: Category[]): LedgerAccount[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const acc = new Map<string, LedgerAccount & { sen: number }>();
  for (const t of txs) {
    const key = accountKey(t);
    let a = acc.get(key);
    if (!a) {
      const name = (t.category_id && byId.get(t.category_id)?.name) || 'Tiada kategori';
      a = { key, name, type: t.transaction_type, owner: name === OWNER_CATEGORY, total: 0, count: 0, sen: 0 };
      acc.set(key, a);
    }
    a.sen += toSen(t.amount);
    a.count++;
  }
  const rank = (a: LedgerAccount) => (a.type === 'income' ? 0 : a.owner ? 2 : 1);
  return [...acc.values()]
    .map(({ sen, ...a }) => ({ ...a, total: fromSen(sen) }))
    .sort((a, b) => rank(a) - rank(b) || b.total - a.total || a.name.localeCompare(b.name, 'ms'));
}

export interface LedgerRow {
  tx: Transaction;
  /** Money in (+) or out (−) for the cash book; the entry's amount for a category account. */
  amount: number;
  balance: number;
}

export interface Ledger {
  rows: LedgerRow[];
  opening: number;
  totalIn: number;
  totalOut: number;
  closing: number;
}

/** All money in and out with a running balance, starting from the net of everything before the period. */
export function cashBook(txs: Transaction[], opening: number): Ledger {
  let bal = toSen(opening);
  let inSen = 0;
  let outSen = 0;
  const rows = txs.map((tx) => {
    const sen = toSen(tx.amount) * (tx.transaction_type === 'income' ? 1 : -1);
    if (sen > 0) inSen += sen;
    else outSen -= sen;
    bal += sen;
    return { tx, amount: fromSen(sen), balance: fromSen(bal) };
  });
  return { rows, opening, totalIn: fromSen(inSen), totalOut: fromSen(outSen), closing: fromSen(bal) };
}

/** One category's entries with a running total for the period. */
export function accountLedger(txs: Transaction[], key: string): Ledger {
  let run = 0;
  const rows = txs
    .filter((t) => accountKey(t) === key)
    .map((tx) => {
      run += toSen(tx.amount);
      return { tx, amount: Number(tx.amount), balance: fromSen(run) };
    });
  const total = fromSen(run);
  const income = rows[0]?.tx.transaction_type === 'income';
  return { rows, opening: 0, totalIn: income ? total : 0, totalOut: income ? 0 : total, closing: total };
}

function csvCell(value: string): string {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The ledger as CSV for Excel/Sheets: date, description, category, in, out, balance. */
export function ledgerCsv(ledger: Ledger, categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const money = (n: number) => n.toFixed(2);
  const lines = ['Tarikh,Keterangan,Kategori,Masuk,Keluar,Baki'];
  for (const { tx, balance } of ledger.rows) {
    const label = [tx.merchant, tx.description].filter(Boolean).join(' - ') || 'Transaksi';
    const income = tx.transaction_type === 'income';
    lines.push(
      [
        tx.transaction_date,
        csvCell(label),
        csvCell((tx.category_id && names.get(tx.category_id)) || 'Tiada kategori'),
        income ? money(Number(tx.amount)) : '',
        income ? '' : money(Number(tx.amount)),
        money(balance),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}
