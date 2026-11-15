import type { SupabaseClient } from '@supabase/supabase-js';
import { fromSen, toSen } from '../../lib/money';
import type { Category, Transaction } from '../../lib/types';
import { CASH_ACCOUNT, CASH_NAME, GL_ACCOUNTS, GL_BY_CODE, glLabel, glOf, type GlCode } from './gl';

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

export interface Posting {
  tx: Transaction;
  code: GlCode;
  categoryName: string;
  sen: number;
}

/** Each transaction with the GL account its category posts to. */
export function postings(txs: Transaction[], categories: Category[]): Posting[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return txs.map((tx) => {
    const category = tx.category_id ? byId.get(tx.category_id) : undefined;
    return {
      tx,
      code: glOf(category, tx.transaction_type),
      categoryName: category?.name ?? 'Tiada kategori',
      sen: toSen(tx.amount),
    };
  });
}

export interface CategoryBreakdown {
  key: string;
  name: string;
  total: number;
  count: number;
}

export interface GlSummary {
  code: GlCode;
  name: string;
  total: number;
  count: number;
  categories: CategoryBreakdown[];
}

/** Totals per GL account used in the period, in chart-of-accounts order, with the categories behind them. */
export function glSummaries(posts: Posting[]): GlSummary[] {
  return GL_ACCOUNTS.flatMap((acct) => {
    const mine = posts.filter((p) => p.code === acct.code);
    if (mine.length === 0) return [];
    const cats = new Map<string, CategoryBreakdown & { sen: number }>();
    for (const p of mine) {
      const key = p.tx.category_id ?? `tiada-${p.tx.transaction_type}`;
      const c = cats.get(key) ?? { key, name: p.categoryName, total: 0, count: 0, sen: 0 };
      c.sen += p.sen;
      c.count++;
      cats.set(key, c);
    }
    return [
      {
        code: acct.code,
        name: acct.name,
        total: fromSen(mine.reduce((s, p) => s + p.sen, 0)),
        count: mine.length,
        categories: [...cats.values()]
          .map(({ sen, ...c }) => ({ ...c, total: fromSen(sen) }))
          .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ms')),
      },
    ];
  });
}

export interface LedgerRow {
  tx: Transaction;
  category: string;
  /** The other side of the double entry, e.g. "4000 Jualan" in the cash book. */
  contra: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Ledger {
  code: string;
  title: string;
  rows: LedgerRow[];
  opening: number;
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

/** 1000 Tunai di Bank: debit = money in, credit = money out, balance from the opening amount. */
export function cashLedger(posts: Posting[], opening: number): Ledger {
  let bal = toSen(opening);
  let dr = 0;
  let cr = 0;
  const rows = posts.map((p) => {
    const incoming = p.tx.transaction_type === 'income';
    if (incoming) {
      dr += p.sen;
      bal += p.sen;
    } else {
      cr += p.sen;
      bal -= p.sen;
    }
    return {
      tx: p.tx,
      category: p.categoryName,
      contra: glLabel(p.code),
      debit: incoming ? fromSen(p.sen) : 0,
      credit: incoming ? 0 : fromSen(p.sen),
      balance: fromSen(bal),
    };
  });
  return {
    code: CASH_ACCOUNT,
    title: `${CASH_ACCOUNT} ${CASH_NAME}`,
    rows,
    opening,
    totalDebit: fromSen(dr),
    totalCredit: fromSen(cr),
    closing: fromSen(bal),
  };
}

/** One GL account (optionally one category within it), on its normal side, with a running balance. */
export function accountLedger(posts: Posting[], code: GlCode, categoryKey?: string | null): Ledger {
  const acct = GL_BY_CODE.get(code)!;
  let run = 0;
  const rows = posts
    .filter((p) => p.code === code && (!categoryKey || (p.tx.category_id ?? `tiada-${p.tx.transaction_type}`) === categoryKey))
    .map((p) => {
      // A refund-style entry on the opposite side reduces the balance.
      const onNormal = (p.tx.transaction_type === 'income') === (acct.normal === 'credit');
      run += onNormal ? p.sen : -p.sen;
      const debitSide = (acct.normal === 'debit') === onNormal;
      return {
        tx: p.tx,
        category: p.categoryName,
        contra: `${CASH_ACCOUNT} ${CASH_NAME}`,
        debit: debitSide ? fromSen(p.sen) : 0,
        credit: debitSide ? 0 : fromSen(p.sen),
        balance: fromSen(run),
      };
    });
  const sum = (k: 'debit' | 'credit') => fromSen(rows.reduce((s, r) => s + toSen(r[k]), 0));
  return {
    code,
    title: `${code} ${acct.name}`,
    rows,
    opening: 0,
    totalDebit: sum('debit'),
    totalCredit: sum('credit'),
    closing: fromSen(run),
  };
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

/** Movements for the period, Dynopos style: cash shows money in (Dr) and out (Cr); Dr total = Cr total. */
export function trialBalance(posts: Posting[]) {
  const inSen = posts.filter((p) => p.tx.transaction_type === 'income').reduce((s, p) => s + p.sen, 0);
  const outSen = posts.filter((p) => p.tx.transaction_type === 'expense').reduce((s, p) => s + p.sen, 0);
  const rows: TrialBalanceRow[] = [{ code: CASH_ACCOUNT, name: CASH_NAME, debit: fromSen(inSen), credit: fromSen(outSen) }];
  for (const acct of GL_ACCOUNTS) {
    const mine = posts.filter((p) => p.code === acct.code);
    const crSen = mine.filter((p) => p.tx.transaction_type === 'income').reduce((s, p) => s + p.sen, 0);
    const drSen = mine.filter((p) => p.tx.transaction_type === 'expense').reduce((s, p) => s + p.sen, 0);
    rows.push({ code: acct.code, name: acct.name, debit: fromSen(drSen), credit: fromSen(crSen) });
  }
  const debit = rows.reduce((s, r) => s + toSen(r.debit), 0);
  const credit = rows.reduce((s, r) => s + toSen(r.credit), 0);
  return { rows, debit: fromSen(debit), credit: fromSen(credit), balanced: debit === credit };
}

function csvCell(value: string): string {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const describeTx = (tx: Pick<Transaction, 'merchant' | 'description'>) =>
  [tx.merchant, tx.description].filter(Boolean).join(' - ') || 'Transaksi';

/** The ledger as CSV for Excel/Sheets, in the GL column layout. */
export function ledgerCsv(ledger: Ledger): string {
  const money = (n: number) => (n ? n.toFixed(2) : '');
  const lines = ['Tarikh,Keterangan,Akaun Kontra,Kategori,Debit (RM),Kredit (RM),Baki (RM)'];
  for (const r of ledger.rows) {
    lines.push(
      [r.tx.transaction_date, csvCell(describeTx(r.tx)), csvCell(r.contra), csvCell(r.category), money(r.debit), money(r.credit), r.balance.toFixed(2)].join(','),
    );
  }
  return lines.join('\r\n');
}
