import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';
import { reportFileName, type Report } from './report';

// The built-in PDF font only covers Latin-1, so amounts use a plain hyphen for minus.
const num = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BLUE: [number, number, number] = [30, 58, 138];
const RED: [number, number, number] = [200, 16, 46];

/** Management accounts PDF: cover summary, PNL, monthly summary, trial balance, bank check and notes. */
export function downloadPdf(r: Report) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = () => doc.internal.pageSize.getWidth();
  let y = 0;

  const header = (title: string, sub?: string) => {
    doc.setFillColor(...RED);
    doc.rect(0, 0, pageW() / 2, 2, 'F');
    doc.setFillColor(...BLUE);
    doc.rect(pageW() / 2, 0, pageW() / 2, 2, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(20);
    doc.text(title, 14, 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100);
    doc.text(sub ?? `${r.business} · ${r.periodLabel} (${r.from} hingga ${r.to}) · Dasar Tunai`, 14, 22);
    y = 28;
  };
  const after = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const table = (head: string[], body: RowInput[], opts: Partial<Parameters<typeof autoTable>[1]> = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: BLUE, textColor: 255 },
      margin: { left: 14, right: 14 },
      ...opts,
    });
    y = after();
  };
  const bold = (content: string) => ({ content, styles: { fontStyle: 'bold' as const } });
  const boldNum = (v: number) => ({ content: num(v), styles: { fontStyle: 'bold' as const, halign: 'right' as const } });

  // 1. Summary + PNL
  header(`AKAUN PENGURUSAN - ${r.business.toUpperCase()}`);
  const p = r.pnl;
  table(
    ['Ringkasan', 'RM'],
    [
      ['Jualan', num(p.revenueTotal)],
      ['Untung Kasar', num(p.grossProfit)],
      ['Untung Bersih', num(p.netProfit)],
      ['Untung Tunai Bersih (selepas ambilan pemilik)', num(p.netCash)],
      [`Baki tunai akhir (rekod) - ${r.to < r.today ? r.to : r.today}`, num(r.cash.closing)],
    ],
    { columnStyles: { 1: { halign: 'right' } }, tableWidth: 120 },
  );

  const body: RowInput[] = [];
  const section = (title: string, s: typeof p.sales) => {
    if (s.lines.length === 0) return;
    body.push([bold(`${s.code}  ${title}`), '']);
    for (const l of s.lines) body.push([`    ${l.label}`, num(l.amount)]);
  };
  const total = (label: string, v: number) => body.push([bold(label), boldNum(v)]);
  section('JUALAN', p.sales);
  total('JUMLAH JUALAN', p.revenueTotal);
  section('KOS JUALAN', p.cogs);
  section('KOS JUALAN - PENDAHULUAN PEMBEKAL', p.cogsAdvance);
  total('JUMLAH KOS JUALAN', p.costOfSales);
  total('UNTUNG KASAR (Gross Profit)', p.grossProfit);
  section('PERBELANJAAN OPERASI', p.opex);
  total('JUMLAH PERBELANJAAN OPERASI', p.opex.total);
  total('UNTUNG OPERASI (Operating Profit)', p.operatingProfit);
  section('GAJI STAFF', p.salary);
  section('PINJAMAN & PEMBIAYAAN', p.financing);
  total('UNTUNG BERSIH (Net Profit)', p.netProfit);
  section('AMBILAN PEMILIK', p.drawings);
  total('UNTUNG TUNAI BERSIH (Net Cash Profit)', p.netCash);
  table(['Penyata Untung Rugi', 'RM'], body, { theme: 'plain', columnStyles: { 1: { halign: 'right', cellWidth: 40 } } });

  // 2. Monthly summary (landscape: eleven columns)
  doc.addPage('a4', 'landscape');
  header('RINGKASAN BULANAN');
  const m = (row: Report['monthly']['total']) => [
    row.label, ...[row.sales, row.cogs + row.cogsAdvance, row.grossProfit, row.opex, row.operatingProfit, row.salary, row.financing, row.netProfit, row.drawings, row.netCash].map(num),
  ];
  table(
    ['Bulan', 'Jualan', 'Kos Jualan', 'Untung Kasar', 'OPEX', 'Untung Operasi', 'Gaji Staff', 'Pinjaman', 'Untung Bersih', 'Ambilan Pemilik', 'Untung Tunai Bersih'],
    [...r.monthly.rows.map(m), m(r.monthly.total).map((c) => bold(c))],
    { columnStyles: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { halign: 'right' }])) },
  );

  // 3. Trial balance + bank check
  doc.addPage('a4', 'portrait');
  header('IMBANGAN DUGA');
  table(
    ['Kod', 'Nama Akaun', 'Debit (RM)', 'Kredit (RM)'],
    [
      ...r.tb.rows.map((row) => [row.code, row.name, num(row.debit), num(row.credit)]),
      ['', bold('JUMLAH'), boldNum(r.tb.debit), boldNum(r.tb.credit)],
    ],
    { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } } },
  );
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20);
  doc.text('SEMAKAN BAKI BANK vs PENYATA', 14, y);
  y += 4;
  if (r.checks.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(9).text('Tiada statement bank dalam tempoh ini.', 14, y + 4);
    y += 12;
  } else {
    table(
      ['Statement', 'Baki Awal', 'Masuk', 'Keluar', 'Baki Kira', 'Baki Penyata', 'Beza'],
      r.checks.map((c) => [c.label, num(c.opening), num(c.totalIn), num(c.totalOut), num(c.computed), num(c.closing), num(c.diff)]),
      { columnStyles: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, { halign: 'right' }])) },
    );
  }

  // 4. Notes
  table(
    ['Nota & Andaian'],
    r.notes.flatMap((s) => [[bold(s.title)], ...s.items.map((i) => [`- ${i}`])]),
    { theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.2 } },
  );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(140);
    doc.text(`VAPRO DuitVoice · dijana ${r.today} · muka ${i}/${pages}`, 14, doc.internal.pageSize.getHeight() - 6);
  }
  doc.save(reportFileName(r, 'pdf'));
}
