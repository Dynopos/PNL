import { addMonths } from '../../lib/dates';
import { fromSen, toSen } from '../../lib/money';
import type { CategoryTotal } from '../../lib/types';
import type { GlCode } from './gl';
import type { Posting } from './ledger';

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sep', 'Okt', 'Nov', 'Dis'];
/** "Ogos 2026": Malay short month names as accountants write them. */
export const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** First days of the months from `from` through `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = `${from.slice(0, 7)}-01`; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface MonthRow {
  month: string;
  label: string;
  sales: number;
  cogs: number;
  cogsAdvance: number;
  grossProfit: number;
  opex: number;
  operatingProfit: number;
  salary: number;
  financing: number;
  netProfit: number;
  drawings: number;
  netCash: number;
  count: number;
}

const COLUMNS: Record<'sales' | 'cogs' | 'cogsAdvance' | 'opex' | 'salary' | 'drawings' | 'financing', GlCode> = {
  sales: '4000',
  cogs: '5000',
  cogsAdvance: '5010',
  opex: '6000',
  salary: '6050',
  drawings: '6100',
  financing: '6200',
};

function summarise(posts: Posting[], month: string, label: string): MonthRow {
  const sen: Record<string, number> = {};
  for (const [key, code] of Object.entries(COLUMNS)) {
    // Revenue counts money in; a refund of an expense (money in on an expense account) reduces it.
    sen[key] = posts
      .filter((p) => p.code === code)
      .reduce((s, p) => s + ((p.tx.transaction_type === 'income') === (code === '4000') ? p.sen : -p.sen), 0);
  }
  const gross = sen.sales! - sen.cogs! - sen.cogsAdvance!;
  const operating = gross - sen.opex!;
  const net = operating - sen.salary! - sen.financing!;
  return {
    month,
    label,
    sales: fromSen(sen.sales!),
    cogs: fromSen(sen.cogs!),
    cogsAdvance: fromSen(sen.cogsAdvance!),
    grossProfit: fromSen(gross),
    opex: fromSen(sen.opex!),
    operatingProfit: fromSen(operating),
    salary: fromSen(sen.salary!),
    financing: fromSen(sen.financing!),
    netProfit: fromSen(net),
    drawings: fromSen(sen.drawings!),
    netCash: fromSen(net - sen.drawings!),
    count: posts.length,
  };
}

/** Dynopos "Monthly Summary": one row per month plus a total. */
export function monthlySummary(posts: Posting[], months: string[]) {
  const rows = months.map((m) =>
    summarise(
      posts.filter((p) => p.tx.transaction_date.startsWith(m.slice(0, 7))),
      m,
      monthName(m),
    ),
  );
  return { rows, total: summarise(posts, 'total', 'JUMLAH') };
}

/** Category totals in the shape the PNL builder takes. */
export function categoryTotals(posts: Posting[]) {
  const acc = new Map<string, CategoryTotal & { sen: number; type: 'income' | 'expense' }>();
  for (const p of posts) {
    const key = `${p.tx.transaction_type}:${p.tx.category_id ?? ''}`;
    const row = acc.get(key) ?? {
      category_id: p.tx.category_id,
      category_name: p.categoryName,
      total: 0,
      tx_count: 0,
      sen: 0,
      type: p.tx.transaction_type,
    };
    row.sen += p.sen;
    row.tx_count++;
    acc.set(key, row);
  }
  const list = [...acc.values()].map(({ sen, type, ...r }) => ({ type, row: { ...r, total: fromSen(sen) } }));
  return {
    income: list.filter((x) => x.type === 'income').map((x) => x.row),
    expense: list.filter((x) => x.type === 'expense').map((x) => x.row),
  };
}

export interface StatementInput {
  id: string;
  bank: string;
  period_from: string;
  period_to: string;
  opening_balance: number | null;
  closing_balance: number | null;
}

export interface StatementLineInput {
  statement_id: string;
  amount: number;
  direction: 'in' | 'out';
  transaction_id: string | null;
  ignored: boolean;
}

export interface BankCheckRow {
  label: string;
  from: string;
  to: string;
  opening: number | null;
  totalIn: number;
  totalOut: number;
  computed: number | null;
  closing: number | null;
  /** Statement closing minus computed closing; 0 means every line was read. */
  diff: number | null;
  lines: number;
  inRecords: number;
}

/** "Semakan Baki": opening + money in − money out from the statement's lines, against its printed closing balance. */
export function bankCheck(statements: StatementInput[], lines: StatementLineInput[]): BankCheckRow[] {
  return [...statements]
    .sort((a, b) => a.period_from.localeCompare(b.period_from))
    .map((s) => {
      const mine = lines.filter((l) => l.statement_id === s.id);
      const inSen = mine.filter((l) => l.direction === 'in').reduce((t, l) => t + toSen(l.amount), 0);
      const outSen = mine.filter((l) => l.direction === 'out').reduce((t, l) => t + toSen(l.amount), 0);
      const computed = s.opening_balance === null ? null : toSen(s.opening_balance) + inSen - outSen;
      return {
        label: `${s.bank.toUpperCase()} ${monthName(s.period_from)}`,
        from: s.period_from,
        to: s.period_to,
        opening: s.opening_balance === null ? null : Number(s.opening_balance),
        totalIn: fromSen(inSen),
        totalOut: fromSen(outSen),
        computed: computed === null ? null : fromSen(computed),
        closing: s.closing_balance === null ? null : Number(s.closing_balance),
        diff: computed === null || s.closing_balance === null ? null : fromSen(toSen(s.closing_balance) - computed),
        lines: mine.length,
        inRecords: mine.filter((l) => l.transaction_id || l.ignored).length,
      };
    });
}

export interface NoteSection {
  title: string;
  items: string[];
}

const rm = (n: number) =>
  `${n < 0 ? '-' : ''}RM${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BIG_DEPOSIT_SEN = 500_000;

/** "Nota & Andaian", written from the data so the owner and accountant know what to check. */
export function buildNotes(input: {
  business: string;
  periodLabel: string;
  posts: Posting[];
  months: MonthRow[];
  checks: BankCheckRow[];
  /** The months were trimmed to start at the first record. */
  startedLate?: boolean;
}): NoteSection[] {
  const { posts, months, checks } = input;
  const bySource = (s: string) => posts.filter((p) => p.tx.source === s).length;
  const empty = months.filter((m) => m.count === 0).map((m) => m.label);
  const uncategorised = posts.filter((p) => !p.tx.category_id);
  const lainLain = posts.filter((p) => p.categoryName === 'Lain-lain');
  const bigDeposits = posts.filter((p) => p.code === '4000' && p.tx.source === 'bank' && p.sen >= BIG_DEPOSIT_SEN);
  const offChecks = checks.filter((c) => c.diff !== null && c.diff !== 0);
  const notInRecords = checks.reduce((s, c) => s + (c.lines - c.inRecords), 0);

  const notes: NoteSection[] = [
    {
      title: '1. Sumber data',
      items: [
        `${input.business} - Akaun Pengurusan ${input.periodLabel}, dijana daripada rekod DuitVoice.`,
        `${posts.length} transaksi: ${bySource('bank')} daripada statement bank, ${bySource('voice')} daripada suara, ${bySource('manual')} input manual.`,
        ...(input.startedLate && months[0] ? [`Rekod bermula ${months[0].label}; bulan sebelumnya dalam tempoh ini tiada data.`] : []),
        empty.length ? `Bulan tanpa sebarang transaksi: ${empty.join(', ')}. Pastikan statement bulan tersebut sudah dimuat naik.` : 'Setiap bulan ada transaksi.',
      ],
    },
    {
      title: '2. Dasar perakaunan',
      items: [
        'Dasar tunai (cash basis): transaksi diiktiraf pada tarikh duit masuk atau keluar.',
        'Susunan ikut General Ledger Dynopos: Jualan - Kos Jualan = Untung Kasar; - Perbelanjaan Operasi = Untung Operasi; - Gaji Staff - Pinjaman & Pembiayaan = Untung Bersih; - Ambilan Pemilik = Untung Tunai Bersih.',
        'Semua pendapatan dikira sebagai Jualan (4000). Ambilan Pemilik (6100) ialah duit bisnes untuk kegunaan peribadi, bukan belanja bisnes.',
        'Imbangan Duga menunjukkan pergerakan tempoh ini dan sentiasa seimbang (Debit = Kredit) kerana setiap transaksi direkod dua belah.',
      ],
    },
    {
      title: '3. Semakan bank',
      items: checks.length
        ? [
            `${checks.length} statement bank dalam tempoh ini.`,
            offChecks.length
              ? `Baki tidak sepadan bagi: ${offChecks.map((c) => `${c.label} (beza ${rm(c.diff!)})`).join('; ')}. Kemungkinan ada baris statement yang tidak dibaca.`
              : 'Baki awal + masuk - keluar sama dengan baki penutup statement bagi setiap statement (beza RM0.00).',
            notInRecords
              ? `${notInRecords} baris statement belum masuk rekod - buka Padanan Bank dan tekan "Masukkan semua ke rekod".`
              : 'Semua baris statement sudah masuk rekod atau diabaikan.',
          ]
        : ['Tiada statement bank dimuat naik untuk tempoh ini, jadi baki bank tidak dapat disemak.'],
    },
  ];

  const review: string[] = [];
  if (uncategorised.length) review.push(`${uncategorised.length} transaksi tanpa kategori (${rm(fromSen(uncategorised.reduce((s, p) => s + p.sen, 0)))}).`);
  if (lainLain.length) review.push(`${lainLain.length} transaksi dalam "Lain-lain" (${rm(fromSen(lainLain.reduce((s, p) => s + p.sen, 0)))}) - semak sama ada patut dalam Kos Jualan, Gaji Staff atau Ambilan Pemilik.`);
  for (const p of bigDeposits.slice(0, 5)) {
    review.push(`Deposit besar ${rm(fromSen(p.sen))} pada ${p.tx.transaction_date} (${p.tx.merchant || p.tx.description || 'tiada keterangan'}) dikira sebagai Jualan. Jika ia pembiayaan, geran atau suntikan modal, ia bukan jualan.`);
  }
  notes.push({ title: '4. Perlu disemak', items: review.length ? review : ['Tiada perkara luar biasa dikesan.'] });
  return notes;
}
