// Reads CIMB and Maybank statement text (already extracted from the PDF) into dated lines.
// Direction comes from the running balance, so a misread amount column can't flip money in/out.

export type BankId = 'cimb' | 'maybank';

export interface StatementLine {
  date: string;
  description: string;
  amount: string;
  direction: 'in' | 'out';
  balance: string;
}

export interface ParsedStatement {
  bank: BankId;
  bankName: string;
  opening: string;
  closing: string;
  periodFrom: string;
  periodTo: string;
  lines: StatementLine[];
  warnings: string[];
}

const BANKS: { id: BankId; name: string; detect: (t: string) => boolean; start: (t: string) => number; end: (t: string) => number }[] = [
  {
    id: 'cimb',
    name: 'CIMB',
    detect: (t) => /CIMB/i.test(t) && t.includes('OPENING BALANCE'),
    start: (t) => t.indexOf('OPENING BALANCE'),
    end: (t) => {
      const i = t.indexOf('CLOSING BALANCE');
      return i < 0 ? t.length : i;
    },
  },
  {
    id: 'maybank',
    name: 'Maybank',
    detect: (t) => /Maybank/i.test(t) && t.includes('BEGINNING BALANCE'),
    start: (t) => t.indexOf('BEGINNING BALANCE'),
    end: (t) => {
      const m = /ENDING BALANCE\s*:/.exec(t);
      return m ? m.index : t.length;
    },
  },
];

const NUM = /\d{1,3}(?:,\d{3})*\.\d{2}/;
const NUM_ALL = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
const DATE_LINE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.*)$/;

const toSen = (s: string) => Math.round(Number(s.replace(/,/g, '')) * 100);
const fromSen = (n: number) => (n / 100).toFixed(2);

function cleanDescription(d: string): string {
  const x = d
    .replace(/\b\d{6,}\b/g, '')
    .replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (x || '(tiada keterangan)').slice(0, 500);
}

function isoDate(dd: string, mm: string, yyyy: string): string | null {
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) ? iso : null;
}

export function parseStatementText(full: string): ParsedStatement | { error: string } {
  const bank = BANKS.find((b) => b.detect(full));
  if (!bank) return { error: 'Bank belum disokong. Buat masa ini hanya CIMB dan Maybank.' };
  const start = bank.start(full);
  if (start < 0) return { error: `Tak jumpa baki pembukaan ${bank.name}.` };

  const lines = full.slice(start, bank.end(full)).split('\n');
  const opening = NUM.exec(lines[0] ?? '');
  if (!opening) return { error: 'Tak jumpa baki pembukaan.' };

  let prev = toSen(opening[0]);
  const out: StatementLine[] = [];
  const warnings: string[] = [];
  let i = 1;
  while (i < lines.length) {
    const m = DATE_LINE.exec((lines[i] ?? '').trim());
    if (!m) {
      i++;
      continue;
    }
    const [, dd, mm, yyyy, rest] = m;
    const nums = rest!.match(NUM_ALL);
    let next = i + 1;
    const desc = [rest!.slice(0, Math.max(rest!.search(NUM), 0) || rest!.length).trim()];
    while (next < lines.length && !DATE_LINE.test((lines[next] ?? '').trim())) {
      const t = (lines[next] ?? '').trim();
      if (t) desc.push(t);
      next++;
    }
    i = next;
    // A dated row without amount and balance isn't a transaction; never guess numbers.
    if (!nums || nums.length < 2) continue;

    const date = isoDate(dd!, mm!, yyyy!);
    const amount = toSen(nums[nums.length - 2]!);
    const balance = toSen(nums[nums.length - 1]!);
    const delta = balance - prev;
    prev = balance;
    if (!date || delta === 0) {
      warnings.push(`Baris ${dd}/${mm}/${yyyy} dilangkau (tarikh atau baki tidak sah).`);
      continue;
    }
    if (Math.abs(delta) !== amount) {
      warnings.push(`Baris ${dd}/${mm}/${yyyy}: jumlah ${fromSen(amount)} tidak sepadan dengan perubahan baki ${fromSen(Math.abs(delta))}.`);
    }
    out.push({
      date,
      description: cleanDescription(desc.filter(Boolean).join(' ')),
      amount: fromSen(Math.abs(delta)),
      direction: delta > 0 ? 'in' : 'out',
      balance: fromSen(balance),
    });
  }

  if (out.length === 0) return { error: 'Tiada transaksi dapat dibaca. Semak format statement.' };
  const dates = out.map((l) => l.date).sort();
  return {
    bank: bank.id,
    bankName: bank.name,
    opening: fromSen(toSen(opening[0])),
    closing: out[out.length - 1]!.balance,
    periodFrom: dates[0]!,
    periodTo: dates[dates.length - 1]!,
    lines: out,
    warnings,
  };
}
