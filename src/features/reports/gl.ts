import type { Category, EntryType } from '../../lib/types';

/** Chart of accounts, Dynopos GL format. 1000 is the cash book; every category posts to one of the others. */
export type GlCode = '4000' | '5000' | '5010' | '6000' | '6050' | '6100' | '6200';
export const CASH_ACCOUNT = '1000';

export interface GlAccount {
  code: GlCode;
  name: string;
  english: string;
  kind: 'Hasil' | 'Belanja' | 'Ekuiti';
  /** Normal balance side: revenue is credit, the rest debit. */
  normal: 'debit' | 'credit';
}

export const GL_ACCOUNTS: GlAccount[] = [
  { code: '4000', name: 'Jualan', english: 'Sales', kind: 'Hasil', normal: 'credit' },
  { code: '5000', name: 'Kos Jualan', english: 'Cost of Goods Sold (COGS)', kind: 'Belanja', normal: 'debit' },
  { code: '5010', name: 'Kos Jualan - Pendahuluan Pembekal', english: 'COGS - Cash Advance to Supplier', kind: 'Belanja', normal: 'debit' },
  { code: '6000', name: 'Perbelanjaan Operasi', english: 'Operating Expenses (OPEX)', kind: 'Belanja', normal: 'debit' },
  { code: '6050', name: 'Gaji Staff', english: 'Staff Salary', kind: 'Belanja', normal: 'debit' },
  { code: '6100', name: 'Ambilan Pemilik', english: 'Owner Drawing', kind: 'Ekuiti', normal: 'debit' },
  { code: '6200', name: 'Pinjaman & Pembiayaan', english: 'Loan & Financing Cost', kind: 'Belanja', normal: 'debit' },
];

export const CASH_NAME = 'Tunai di Bank';
export const GL_BY_CODE = new Map(GL_ACCOUNTS.map((a) => [a.code, a]));
const CODES = new Set<string>(GL_ACCOUNTS.map((a) => a.code));

/** Same rules as the database migration, for categories read before it was applied. */
export function defaultGl(name: string, type: EntryType): GlCode {
  if (type === 'income') return '4000';
  if (name === 'Pendahuluan Pembekal') return '5010';
  if (name === 'Kos Barang & Stok' || /cogs|stok|stock|bahan|inventori/i.test(name)) return '5000';
  if (name === 'Gaji Staff') return '6050';
  if (name === 'Kegunaan Peribadi Pemilik') return '6100';
  if (name === 'Pinjaman & Pembiayaan') return '6200';
  return '6000';
}

/** The GL account a category posts to; transactions with no category go to Jualan or Perbelanjaan Operasi. */
export function glOf(category: Pick<Category, 'name' | 'type' | 'gl_account'> | undefined, type: EntryType): GlCode {
  if (!category) return type === 'income' ? '4000' : '6000';
  const code = category.gl_account;
  if (code && CODES.has(code) && (code === '4000') === (category.type === 'income')) return code as GlCode;
  return defaultGl(category.name, category.type);
}

export const glLabel = (code: string) =>
  code === CASH_ACCOUNT ? `${CASH_ACCOUNT} ${CASH_NAME}` : `${code} ${GL_BY_CODE.get(code as GlCode)?.name ?? code}`;
