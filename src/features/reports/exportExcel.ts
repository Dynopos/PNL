import writeXlsxFile, { type Cell, type Row, type Sheet, type SheetData } from 'write-excel-file/browser';
import type { Ledger } from './ledger';
import { reportFileName, describeTx, type Report } from './report';

const MONEY = '#,##0.00;[Red]-#,##0.00';
const HEAD = { fontWeight: 'bold', backgroundColor: '#1E3A8A', textColor: '#FFFFFF' } as const;
const BOLD = { fontWeight: 'bold' } as const;
const TITLE = { fontWeight: 'bold', fontSize: 14 } as const;

const money = (v: number | null | undefined, extra: object = {}): Cell =>
  v === null || v === undefined ? null : { value: v, type: Number, format: MONEY, ...extra };
const text = (v: string, extra: object = {}): Cell => ({ value: v, type: String, ...extra });
const head = (labels: string[]): Row => labels.map((l) => text(l, HEAD));
const blank: Row = [null];
// Sheet names: max 31 characters, none of : \ / ? * [ ]
const sheetName = (s: string) => s.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);

function ledgerSheet(l: Ledger, r: Report, cash: boolean): Sheet<Blob> {
  const data: SheetData = [
    [text(`GENERAL LEDGER - ${l.title.toUpperCase()}`, TITLE)],
    [text(cash ? 'Debit = duit masuk; Kredit = duit keluar. Baki dikira daripada rekod.' : `${r.business} · ${r.periodLabel}`)],
    head(['Tarikh', 'Butiran', 'Akaun Kontra', 'Kategori', 'Debit (RM)', 'Kredit (RM)', cash ? 'Baki (RM)' : 'Baki Berjalan (RM)', 'Bulan']),
  ];
  if (cash) data.push([text(r.from), text('BAKI AWAL', BOLD), null, null, null, null, money(l.opening, BOLD), null]);
  for (const row of l.rows) {
    data.push([
      text(row.tx.transaction_date),
      text(describeTx(row.tx)),
      text(row.contra),
      text(row.category),
      money(row.debit || null),
      money(row.credit || null),
      money(row.balance),
      text(row.tx.transaction_date.slice(0, 7)),
    ]);
  }
  data.push([null, text('JUMLAH', BOLD), null, null, money(l.totalDebit, BOLD), money(l.totalCredit, BOLD), money(l.closing, BOLD), null]);
  return {
    data,
    sheet: sheetName(`GL - ${l.title}`),
    columns: [{ width: 11 }, { width: 50 }, { width: 26 }, { width: 24 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 9 }],
    stickyRowsCount: 3,
  };
}

/** The management accounts workbook, laid out like the Dynopos General Ledger file. */
export async function downloadExcel(r: Report) {
  const notes: SheetData = [
    [text(`${r.business.toUpperCase()} - AKAUN PENGURUSAN`, TITLE)],
    [text(`${r.periodLabel} (${r.from} hingga ${r.to}) · Dasar Tunai · dijana ${r.today}`)],
    blank,
  ];
  for (const s of r.notes) {
    notes.push([text(s.title, BOLD)]);
    for (const item of s.items) notes.push([text(item, { wrap: true })]);
    notes.push(blank);
  }

  const chart: SheetData = [
    [text(`${r.business.toUpperCase()} - CARTA AKAUN`, TITLE)],
    head(['Kod Akaun', 'Nama Akaun', 'English', 'Jenis', 'Baki Normal', 'Kategori DuitVoice']),
    ...r.chart.map((a) => [text(a.code), text(a.name), text(a.english), text(a.kind), text(a.normal), text(a.categories, { wrap: true })]),
  ];

  const tb: SheetData = [
    [text(`${r.business.toUpperCase()} - IMBANGAN DUGA`, TITLE)],
    [text(`Pergerakan ${r.periodLabel}`)],
    head(['Kod', 'Nama Akaun', 'Debit (RM)', 'Kredit (RM)']),
    ...r.tb.rows.map((row) => [text(row.code), text(row.name), money(row.debit), money(row.credit)]),
    [null, text('JUMLAH', BOLD), money(r.tb.debit, BOLD), money(r.tb.credit, BOLD)],
    [null, text('SEMAKAN (Debit - Kredit, mesti 0)'), money(Math.round((r.tb.debit - r.tb.credit) * 100) / 100), null],
  ];

  const cols = ['Bulan', 'Jualan', 'Kos Jualan', 'Kos Jualan - Pendahuluan', 'Untung Kasar', 'Perbelanjaan Operasi', 'Untung Operasi', 'Gaji Staff', 'Pinjaman & Pembiayaan', 'Untung Bersih', 'Ambilan Pemilik', 'Untung Tunai Bersih'];
  const monthRow = (m: Report['monthly']['total'], style: object = {}): Row => [
    text(m.label, style),
    ...[m.sales, m.cogs, m.cogsAdvance, m.grossProfit, m.opex, m.operatingProfit, m.salary, m.financing, m.netProfit, m.drawings, m.netCash].map((v) => money(v, style)),
  ];
  const monthly: SheetData = [
    [text(`${r.business.toUpperCase()} - RINGKASAN BULANAN`, TITLE)],
    [text(r.periodLabel)],
    head(cols),
    ...r.monthly.rows.map((m) => monthRow(m)),
    monthRow(r.monthly.total, BOLD),
  ];

  const p = r.pnl;
  const line = (label: string, v: number | null, style: object = {}): Row => [text(label, style), money(v, style)];
  const pnl: SheetData = [
    [text(r.business.toUpperCase(), TITLE)],
    [text(`Penyata Untung Rugi ${r.periodLabel}`)],
    [text('Dasar Tunai')],
    blank,
  ];
  const section = (title: string, s: typeof p.sales) => {
    if (s.lines.length === 0) return;
    pnl.push([text(`${s.code}  ${title}`, BOLD)]);
    for (const l of s.lines) pnl.push(line(`    ${l.label}`, l.amount));
  };
  section('JUALAN', p.sales);
  pnl.push(line('JUMLAH JUALAN', p.revenueTotal, BOLD));
  section('KOS JUALAN', p.cogs);
  section('KOS JUALAN - PENDAHULUAN PEMBEKAL', p.cogsAdvance);
  pnl.push(line('JUMLAH KOS JUALAN', p.costOfSales, BOLD), line('UNTUNG KASAR', p.grossProfit, BOLD), blank);
  section('PERBELANJAAN OPERASI', p.opex);
  pnl.push(line('JUMLAH PERBELANJAAN OPERASI', p.opex.total, BOLD), line('UNTUNG OPERASI', p.operatingProfit, BOLD), blank);
  section('GAJI STAFF', p.salary);
  section('PINJAMAN & PEMBIAYAAN', p.financing);
  pnl.push(line('UNTUNG BERSIH', p.netProfit, BOLD), blank);
  section('AMBILAN PEMILIK', p.drawings);
  pnl.push(line('UNTUNG TUNAI BERSIH', p.netCash, BOLD));

  const check: SheetData = [
    [text('SEMAKAN BAKI BANK vs PENYATA', TITLE)],
    head(['Statement', 'Dari', 'Hingga', 'Baki Awal', 'Jumlah Masuk', 'Jumlah Keluar', 'Baki Kira', 'Baki Penyata', 'Beza', 'Baris', 'Dalam Rekod']),
    ...r.checks.map((c) => [
      text(c.label), text(c.from), text(c.to), money(c.opening), money(c.totalIn), money(c.totalOut), money(c.computed), money(c.closing), money(c.diff),
      { value: c.lines, type: Number }, { value: c.inRecords, type: Number },
    ] as Row),
  ];
  if (r.checks.length === 0) check.push([text('Tiada statement bank dalam tempoh ini.')]);
  else check.push(blank, [text('Beza sifar bermakna setiap baris statement telah dibaca.')]);

  const sheets: Sheet<Blob>[] = [
    { data: notes, sheet: 'Nota & Andaian', columns: [{ width: 120 }] },
    { data: chart, sheet: 'Carta Akaun', columns: [{ width: 10 }, { width: 32 }, { width: 32 }, { width: 10 }, { width: 12 }, { width: 70 }] },
    ledgerSheet(r.cash, r, true),
    ...r.ledgers.map((l) => ledgerSheet(l, r, false)),
    { data: tb, sheet: 'Imbangan Duga', columns: [{ width: 8 }, { width: 34 }, { width: 16 }, { width: 16 }] },
    { data: monthly, sheet: 'Ringkasan Bulanan', columns: [{ width: 12 }, ...cols.slice(1).map(() => ({ width: 15 }))], stickyRowsCount: 3 },
    { data: pnl, sheet: sheetName(`PNL ${r.periodLabel}`), columns: [{ width: 48 }, { width: 16 }] },
    { data: check, sheet: 'Semakan Baki', columns: [{ width: 18 }, { width: 11 }, { width: 11 }, ...Array.from({ length: 6 }, () => ({ width: 14 })), { width: 8 }, { width: 11 }] },
  ];
  await writeXlsxFile(sheets).toFile(reportFileName(r, 'xlsx'));
}
