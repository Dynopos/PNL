// Rule-based parser for spoken Malay / English / mixed expense and income commands.
// Pure TypeScript with no runtime dependencies: used by the parse-voice Edge Function
// (as its fallback and to verify AI output) and by the app when the function is unreachable.

export type EntryType = 'income' | 'expense';

export interface VoiceCandidate {
  merchant: string | null;
  description: string | null;
  /** Two-decimal string, or null when the amount is missing or ambiguous. Never invented. */
  amount: string | null;
  /** Alternatives when the speaker gave more than one possible amount ("lima belas atau lima puluh"). */
  amount_options: string[];
  currency: 'MYR';
  category: string;
  /** null = could not tell income from expense; the user must choose. */
  type: EntryType | null;
  transaction_date: string;
  issues: string[];
  text: string;
}

export const EXPENSE_CATEGORIES = [
  'Makanan & Minuman',
  'Barang Dapur',
  'Petrol & Pengangkutan',
  'Bil & Utiliti',
  'Rumah & Sewa',
  'Kesihatan',
  'Pendidikan',
  'Hiburan',
  'Shopping',
  'Gaji Staff',
  'Kegunaan Peribadi Pemilik',
  'Lain-lain',
] as const;

export const INCOME_CATEGORIES = ['Jualan', 'Bayaran Pelanggan', 'Gaji', 'Lain-lain'] as const;

export const MAX_TRANSCRIPT_LENGTH = 500;

// ── numbers ──────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  kosong: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, lapan: 8, sembilan: 9,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS_EN: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const FIXED: Record<string, number> = { sepuluh: 10, sebelas: 11, seratus: 100 };
const NUMBER_WORDS = new Set([
  ...Object.keys(UNITS), ...Object.keys(TENS_EN), ...Object.keys(FIXED),
  'belas', 'puluh', 'ratus', 'ribu', 'seribu', 'juta', 'sejuta', 'hundred', 'thousand',
]);

/** Parses a run of number words; returns null if the run is not a well-formed number. */
export function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let small = 0;
  let last: number | null = null;
  for (const w of words) {
    if (w in UNITS) {
      if (last !== null) return null;
      last = UNITS[w]!;
    } else if (w in TENS_EN) {
      if (last !== null) return null;
      small += TENS_EN[w]!;
    } else if (w in FIXED) {
      if (last !== null) return null;
      small += FIXED[w]!;
    } else if (w === 'belas') {
      if (last === null) return null;
      small += 10 + last;
      last = null;
    } else if (w === 'puluh') {
      if (last === null) return null;
      small += last * 10;
      last = null;
    } else if (w === 'ratus' || w === 'hundred') {
      if (last === null && w === 'ratus') return null;
      small += (last ?? 1) * 100;
      last = null;
    } else if (w === 'ribu' || w === 'thousand' || w === 'seribu') {
      const group = w === 'seribu' ? 1 : small + (last ?? 0);
      if (group === 0) return null;
      total += group * 1000;
      small = 0;
      last = null;
    } else if (w === 'juta' || w === 'sejuta') {
      const group = w === 'sejuta' ? 1 : small + (last ?? 0);
      if (group === 0) return null;
      total += group * 1_000_000;
      small = 0;
      last = null;
    } else {
      return null;
    }
  }
  return total + small + (last ?? 0);
}

function toAmount(sen: number): string {
  return (sen / 100).toFixed(2);
}

// ── tokens ───────────────────────────────────────────────────────────────────

type Token =
  | { kind: 'word'; text: string }
  | { kind: 'sep' }
  | { kind: 'amount'; sen: number[]; raw: string };

const PROTECTED: [RegExp, string][] = [
  [/\b(?:7\s*-?\s*eleven|seven\s+eleven)\b/g, '7-eleven'],
  [/\b99\s*speed\s*mart\b/g, '99-speedmart'],
];

const QUANTITY_UNITS = new Set([
  'bungkus', 'biji', 'kotak', 'pack', 'paket', 'liter', 'litre', 'kg', 'gram', 'keping', 'botol', 'cawan',
  'gelas', 'orang', 'kali', 'helai', 'pasang', 'tin', 'ekor', 'unit', 'pcs', 'batang',
]);

function normalize(text: string): string {
  let s = ` ${text.toLowerCase()} `;
  for (const [re, rep] of PROTECTED) s = s.replace(re, rep);
  s = s
    .replace(/[“”"']/g, '')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2') // 1,500 -> 1500
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2') // 12,50 -> 12.50
    .replace(/\brm\s*(\d)/g, 'rm $1')
    .replace(/(\d)\s*(ringgit|rm)\b/g, '$1 $2')
    .replace(/(\d+(?:\.\d+)?)k\b/g, (_, n: string) => String(Math.round(Number(n) * 1000)))
    .replace(/[,;!?\n]+/g, ' , ')
    .replace(/\.(?!\d)/g, ' , ');
  return s.replace(/\s+/g, ' ').trim();
}

function isDigitWord(w: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(w);
}

/** Groups number words and digits into amount tokens ("dua ringgit lima puluh sen" -> 250 sen). */
function tokenize(text: string): Token[] {
  const words = normalize(text).split(' ').filter(Boolean);
  const out: Token[] = [];
  let i = 0;

  const readNumber = (): { value: number; end: number } | null => {
    if (i >= words.length) return null;
    if (isDigitWord(words[i]!)) {
      let value = Number(words[i]);
      let end = i + 1;
      if (words[end] === 'ribu' || words[end] === 'thousand') {
        value *= 1000;
        end += 1;
      }
      return { value, end };
    }
    let end = i;
    while (end < words.length && NUMBER_WORDS.has(words[end]!)) end++;
    // Longest prefix that forms a valid number.
    for (let stop = end; stop > i; stop--) {
      const v = wordsToNumber(words.slice(i, stop));
      if (v !== null) return { value: v, end: stop };
    }
    return null;
  };

  const readAmountSen = (): { sen: number; end: number; raw: string } | null => {
    const start = i;
    let currency = false;
    if (words[i] === 'rm') {
      currency = true;
      i++;
    }
    const first = readNumber();
    if (!first) {
      i = start;
      return null;
    }
    i = first.end;
    if (!currency && QUANTITY_UNITS.has(words[i] ?? '')) {
      i = start;
      return null;
    }
    let sen = Math.round(first.value * 100);
    if (words[i] === 'sen' || words[i] === 'cents') {
      i++;
      return { sen: Math.round(first.value), end: i, raw: words.slice(start, i).join(' ') };
    }
    if (words[i] === 'ringgit' || words[i] === 'rm') {
      i++;
      if (words[i] === 'setengah') {
        sen += 50;
        i++;
      } else {
        const save = i;
        const cents = readNumber();
        if (cents && (words[cents.end] === 'sen' || words[cents.end] === 'cents') && cents.value < 100) {
          sen += Math.round(cents.value);
          i = cents.end + 1;
        } else {
          i = save;
        }
      }
    }
    return { sen, end: i, raw: words.slice(start, i).join(' ') };
  };

  while (i < words.length) {
    const w = words[i]!;
    if (w === ',') {
      out.push({ kind: 'sep' });
      i++;
      continue;
    }
    const amount = readAmountSen();
    if (amount) {
      // "X atau Y" -> one ambiguous amount.
      const prev = out[out.length - 1];
      const beforePrev = out[out.length - 2];
      if (prev?.kind === 'word' && ['atau', 'or', 'ke'].includes(prev.text) && beforePrev?.kind === 'amount') {
        out.pop();
        beforePrev.sen.push(amount.sen);
        beforePrev.raw += ` ${prev.text} ${amount.raw}`;
      } else {
        out.push({ kind: 'amount', sen: [amount.sen], raw: amount.raw });
      }
      continue;
    }
    out.push({ kind: 'word', text: w });
    i++;
  }
  return out;
}

/** Every amount (in sen) that can be read from the transcript; AI output is checked against it. */
export function amountsInTranscript(text: string): Set<number> {
  const set = new Set<number>();
  for (const t of tokenize(text)) if (t.kind === 'amount') t.sen.forEach((s) => set.add(s));
  return set;
}

// ── dates ────────────────────────────────────────────────────────────────────

const DAYS: Record<string, number> = {
  ahad: 0, isnin: 1, selasa: 2, rabu: 3, khamis: 4, jumaat: 5, jumat: 5, sabtu: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

interface DateHit {
  date: string | null;
  issue?: string;
  consumed: number[];
}

/** Finds a relative date phrase in a segment's words. */
function findDate(words: string[], today: string): DateHit | null {
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const next = words[i + 1];
    const prev = words[i - 1];
    if (w === 'semalam' || w === 'smlm' || w === 'yesterday') return { date: shiftDays(today, -1), consumed: [i] };
    if (w === 'kelmarin') return { date: shiftDays(today, -2), consumed: [i] };
    if (w === 'today' || w === 'harini') return { date: today, consumed: [i] };
    if (w === 'hari' && (next === 'ini' || next === 'ni')) return { date: today, consumed: [i, i + 1] };
    if (w === 'tadi') return { date: today, consumed: prev === 'pagi' || prev === 'petang' || prev === 'malam' ? [i - 1, i] : [i] };
    if (w === 'minggu' && (next === 'lepas' || next === 'lalu')) {
      return { date: null, issue: 'Sila pilih tarikh tepat (“minggu lepas”).', consumed: [i, i + 1] };
    }
    if (w in DAYS) {
      const target = DAYS[w]!;
      const last = prev === 'last';
      const ago = next === 'lepas' || next === 'lalu';
      const consumed = [i];
      if (last) consumed.push(i - 1);
      if (ago) consumed.push(i + 1);
      if (prev === 'hari') consumed.push(i - 1);
      let diff = (weekday(today) - target + 7) % 7;
      if (diff === 0 && (last || ago)) diff = 7;
      return { date: shiftDays(today, -diff), consumed };
    }
  }
  return null;
}

// ── classification ───────────────────────────────────────────────────────────

const MERCHANTS: { re: RegExp; name: string; category: string }[] = [
  { re: /\bmydin\b/, name: 'Mydin', category: 'Barang Dapur' },
  { re: /\b(lotus'?s?|tesco)\b/, name: "Lotus's", category: 'Barang Dapur' },
  { re: /\baeon\b/, name: 'AEON', category: 'Barang Dapur' },
  { re: /\bgiant\b/, name: 'Giant', category: 'Barang Dapur' },
  { re: /\b99-speedmart\b|\bspeedmart\b/, name: '99 Speedmart', category: 'Barang Dapur' },
  { re: /\beconsave\b/, name: 'Econsave', category: 'Barang Dapur' },
  { re: /\bjaya grocer\b/, name: 'Jaya Grocer', category: 'Barang Dapur' },
  { re: /\bnsk\b/, name: 'NSK', category: 'Barang Dapur' },
  { re: /\b7-eleven\b/, name: '7-Eleven', category: 'Makanan & Minuman' },
  { re: /\bfamily ?mart\b/, name: 'FamilyMart', category: 'Makanan & Minuman' },
  { re: /\bpetronas\b/, name: 'Petronas', category: 'Petrol & Pengangkutan' },
  { re: /\bshell\b/, name: 'Shell', category: 'Petrol & Pengangkutan' },
  { re: /\bpetron\b/, name: 'Petron', category: 'Petrol & Pengangkutan' },
  { re: /\bcaltex\b/, name: 'Caltex', category: 'Petrol & Pengangkutan' },
  { re: /\bbhp(etrol)?\b/, name: 'BHPetrol', category: 'Petrol & Pengangkutan' },
  { re: /\bgrab\b/, name: 'Grab', category: 'Petrol & Pengangkutan' },
  { re: /\btouch ?n ?go\b|\btng\b/, name: "Touch 'n Go", category: 'Petrol & Pengangkutan' },
  { re: /\bkfc\b/, name: 'KFC', category: 'Makanan & Minuman' },
  { re: /\b(mcd|mcdonald'?s?)\b/, name: "McDonald's", category: 'Makanan & Minuman' },
  { re: /\bstarbucks\b/, name: 'Starbucks', category: 'Makanan & Minuman' },
  { re: /\btealive\b/, name: 'Tealive', category: 'Makanan & Minuman' },
  { re: /\bzus\b/, name: 'ZUS Coffee', category: 'Makanan & Minuman' },
  { re: /\bmarrybrown\b/, name: 'Marrybrown', category: 'Makanan & Minuman' },
  { re: /\bsubway\b/, name: 'Subway', category: 'Makanan & Minuman' },
  { re: /\bpizza hut\b/, name: 'Pizza Hut', category: 'Makanan & Minuman' },
  { re: /\bdomino'?s?\b/, name: "Domino's", category: 'Makanan & Minuman' },
  { re: /\bsecret recipe\b/, name: 'Secret Recipe', category: 'Makanan & Minuman' },
  { re: /\btnb\b/, name: 'TNB', category: 'Bil & Utiliti' },
  { re: /\bair selangor\b|\bsyabas\b/, name: 'Air Selangor', category: 'Bil & Utiliti' },
  { re: /\bindah water\b/, name: 'Indah Water', category: 'Bil & Utiliti' },
  { re: /\bunifi\b/, name: 'Unifi', category: 'Bil & Utiliti' },
  { re: /\bmaxis\b/, name: 'Maxis', category: 'Bil & Utiliti' },
  { re: /\bcelcom\b|\bdigi\b/, name: 'CelcomDigi', category: 'Bil & Utiliti' },
  { re: /\bu ?mobile\b/, name: 'U Mobile', category: 'Bil & Utiliti' },
  { re: /\bastro\b/, name: 'Astro', category: 'Bil & Utiliti' },
  { re: /\bwatsons\b/, name: 'Watsons', category: 'Kesihatan' },
  { re: /\bguardian\b/, name: 'Guardian', category: 'Kesihatan' },
  { re: /\bnetflix\b/, name: 'Netflix', category: 'Hiburan' },
  { re: /\bspotify\b/, name: 'Spotify', category: 'Hiburan' },
  { re: /\bgsc\b/, name: 'GSC', category: 'Hiburan' },
  { re: /\btgv\b/, name: 'TGV', category: 'Hiburan' },
  { re: /\bshopee\b/, name: 'Shopee', category: 'Shopping' },
  { re: /\blazada\b/, name: 'Lazada', category: 'Shopping' },
  { re: /\buniqlo\b/, name: 'Uniqlo', category: 'Shopping' },
];

const EXPENSE_KEYWORDS: [RegExp, string][] = [
  [/\b(gaji staff|gaji pekerja|staff|pekerja|upah|elaun|wages)\b/, 'Gaji Staff'],
  [/\b(bil|elektrik|letrik|internet|wifi|telefon|phone bill)\b/, 'Bil & Utiliti'],
  [/\b(petrol|minyak|diesel|parking|parkir|tol|toll|tambang|teksi|bas|lrt|mrt|ktm)\b/, 'Petrol & Pengangkutan'],
  [/\b(barang dapur|groceri|grocery|sayur|ikan|ayam|daging|beras|pasar|telur)\b/, 'Barang Dapur'],
  [/\b(makan|minum|nasi|kopi|teh|roti|air|sarapan|breakfast|lunch|dinner|mamak|restoran|kedai makan|tengah hari)\b/, 'Makanan & Minuman'],
  [/\b(sewa|rent|rumah|kedai sewa)\b/, 'Rumah & Sewa'],
  [/\b(klinik|clinic|ubat|farmasi|pharmacy|hospital|doktor|doctor)\b/, 'Kesihatan'],
  [/\b(yuran|sekolah|tuisyen|tuition|kelas|buku)\b/, 'Pendidikan'],
  [/\b(wayang|cinema|movie|game|langganan)\b/, 'Hiburan'],
  [/\b(baju|kasut|seluar|beg|shopping)\b/, 'Shopping'],
];

const INCOME_KEYWORDS: [RegExp, string][] = [
  [/\b(jualan|jual|sales|sale)\b/, 'Jualan'],
  [/\b(customer|pelanggan|client|klien|kastomer|pembeli|buyer)\b/, 'Bayaran Pelanggan'],
  [/\b(gaji|salary)\b/, 'Gaji'],
];

const INCOME_CUE = /\b(jualan|jual|sales|terima|received|dapat|masuk|komisen|commission|refund|dividen|untung)\b/;
const PAYER_THEN_PAY = /\b(customer|pelanggan|client|klien|kastomer|pembeli|buyer|orang|kawan|dia)\s+(bayar|transfer|pay|paid)\b/;
const EXPENSE_CUE =
  /\b(beli|membeli|belanja|isi|bayar|pay|paid|topup|top up|reload|servis|service|repair|baiki|makan|minum|parking|parkir|tol|toll|bil|sewa|yuran)\b/;

function classify(text: string, merchantCategory: string | null): EntryType | null {
  const payer = PAYER_THEN_PAY.test(text);
  const withoutPayer = text.replace(PAYER_THEN_PAY, ' ');
  const income = payer || INCOME_CUE.test(text);
  const expense =
    EXPENSE_CUE.test(withoutPayer) ||
    merchantCategory !== null ||
    EXPENSE_KEYWORDS.some(([re]) => re.test(withoutPayer));
  if (income && !expense) return 'income';
  if (expense && !income) return 'expense';
  return null;
}

function categoryFor(type: EntryType | null, text: string, merchantCategory: string | null): string {
  if (type === 'income') return INCOME_KEYWORDS.find(([re]) => re.test(text))?.[1] ?? 'Lain-lain';
  if (merchantCategory) return merchantCategory;
  return EXPENSE_KEYWORDS.find(([re]) => re.test(text))?.[1] ?? 'Lain-lain';
}

// ── segments ─────────────────────────────────────────────────────────────────

const FILLER = new Set([
  'saya', 'aku', 'i', 'je', 'jer', 'lah', 'dah', 'sudah', 'untuk', 'utk', 'dan', 'and', 'pastu', 'lepas', 'tu',
  'kemudian', 'then', 'ringgit', 'rm', 'sen', 'sebanyak', 'harga', 'total', 'jumlah', 'tolong', 'rekod', 'catat',
  'masukkan', 'also', 'juga', ',',
]);
const PREPOSITIONS = new Set(['dekat', 'kat', 'di', 'at', 'from', 'dari', 'daripada']);

function titleCase(words: string[]): string {
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function sentence(words: string[]): string | null {
  const s = words.join(' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

interface Segment {
  words: string[];
  amount: Extract<Token, { kind: 'amount' }> | null;
}

function segment(tokens: Token[]): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = { words: [], amount: null };
  const flush = () => {
    if (current.amount || current.words.some((w) => !FILLER.has(w))) segments.push(current);
    current = { words: [], amount: null };
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === 'sep') {
      if (current.amount) flush();
      continue;
    }
    if (t.kind === 'amount') {
      if (current.amount) flush();
      current.amount = t;
      continue;
    }
    if (current.amount) {
      // Words after an amount belong to the next amount when one follows before a separator.
      let j = i;
      while (j < tokens.length && tokens[j]!.kind === 'word') j++;
      if (tokens[j]?.kind === 'amount') flush();
    }
    current.words.push(t.text);
  }
  flush();
  return segments;
}

export function parseWithRules(transcript: string, today: string): VoiceCandidate[] {
  const text = transcript.slice(0, MAX_TRANSCRIPT_LENGTH);
  const segments = segment(tokenize(text));
  let carriedDate: DateHit | null = null;

  return segments.map((seg) => {
    const issues: string[] = [];
    let words = [...seg.words];

    const hit = findDate(words, today);
    if (hit) {
      carriedDate = hit;
      words = words.filter((_, idx) => !hit.consumed.includes(idx));
    }
    const dateHit = hit ?? carriedDate;
    if (dateHit?.issue) issues.push(dateHit.issue);

    const joined = words.join(' ');
    const known = MERCHANTS.find((m) => m.re.test(joined));
    let merchant: string | null = known?.name ?? null;
    let rest = words;
    if (known) {
      rest = words.filter((w) => !known.re.test(w));
      // Drop a dangling preposition left in front of a removed brand ("dekat Mydin").
      rest = rest.filter((w, idx) => !(PREPOSITIONS.has(w) && idx === rest.length - 1));
    } else {
      const p = words.findIndex((w) => PREPOSITIONS.has(w));
      if (p >= 0 && p < words.length - 1) {
        const tail = words.slice(p + 1).filter((w) => !FILLER.has(w)).slice(0, 4);
        if (tail.length) merchant = titleCase(tail);
        rest = words.slice(0, p);
      }
    }
    const description = sentence(rest.filter((w) => !FILLER.has(w)).map((w) => (w === '7-eleven' ? '7-Eleven' : w)));

    const type = classify(joined, known?.category ?? null);
    const category = categoryFor(type, joined, known?.category ?? null);

    let amount: string | null = null;
    const options: string[] = [];
    if (!seg.amount) {
      issues.push('Jumlah tidak disebut.');
    } else if (seg.amount.sen.length > 1) {
      options.push(...seg.amount.sen.map(toAmount));
      issues.push(`Jumlah tidak jelas: ${options.map((o) => `RM${o}`).join(' atau ')}?`);
    } else if (seg.amount.sen[0]! <= 0) {
      issues.push('Jumlah mesti lebih daripada RM0.');
    } else {
      amount = toAmount(seg.amount.sen[0]!);
    }
    if (type === null) issues.push('Pendapatan atau perbelanjaan?');
    if (!merchant && !description) issues.push('Tiada keterangan.');

    return {
      merchant,
      description,
      amount,
      amount_options: options,
      currency: 'MYR',
      category,
      type,
      transaction_date: dateHit?.date ?? today,
      issues,
      text: [...seg.words, seg.amount?.raw ?? ''].join(' ').trim(),
    };
  });
}

/** A candidate is safe to auto-save only when nothing about it needs a human decision. */
export function isClear(c: VoiceCandidate): boolean {
  return c.amount !== null && c.type !== null && c.issues.length === 0;
}
