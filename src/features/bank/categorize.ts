import type { Category, EntryType } from '../../lib/types';

export interface CategoryRule {
  merchant_keyword: string;
  category_id: string;
}

/** Keywords seen in Malaysian bank statement descriptions, by default category name. First match wins. */
const KEYWORDS: [string, string[]][] = [
  ['Petrol & Pengangkutan', ['petron', 'shell', 'caltex', 'bhp', 'touch n go', 'tng', 'parking', 'tol ']],
  // Owner's drawings and staff pay follow the user's own Dynopos GL rules.
  ['Kegunaan Peribadi Pemilik', [
    'atm withdrawal', 'withdrawal fee', 'atm cash', 'kenduri', 'family', 'famly', ' mama ', 'aqiqah', 'tiket', 'belanja ',
    'welfare', 'duit rumah', 'loan rumah', 'tnb rumah', 'tusyen', 'yuran', 'tr to savings', 'tr to c/a',
  ]],
  ['Gaji Staff', ['gaji', 'salary', 'staff', 'pekerja', 'upah', 'elaun', 'allowance', 'wages', 'programmer']],
  ['Pinjaman & Pembiayaan', ['spaylater', 'paylater', 'pay later', 'atome', 'financing', 'pembiayaan', 'instalment', 'ansuran', 'loan']],
  ['Kos Barang & Stok', [
    'shopee', 'shopeepay', 'lazada', 'tiktok', 'ezc tech', 'mdotpos', 'highstead', 'redsoft', 'teqcom', 'on 9 trading',
    'kms autocount', 'ti computer', 'jos tech', 'winning media', 'rcs communication', 'aje solution', 'supplier', 'pembekal',
    'hardware', 'printer', 'laptop', 'stok', 'stock',
  ]],
  ['Software & Langganan', [
    'subscription', 'langganan', 'software', 'bukku', 'chatgpt', 'openai', 'claude', 'anthropic', 'google one', 'google workspace',
    'capcut', 'canva', 'adobe', 'heygen', 'storehub', 'photoroom', 'openart', 'kling', 'hosting', 'domain', 'cloudflare',
    'netlify', 'supabase', 'github',
  ]],
  ['Bil & Utiliti', ['tnb', 'tenaga', 'syabas', 'air selangor', 'indah water', 'maxis', 'celcom', 'digi', 'umobile', 'unifi', 'telekom', 'broadband', 'takaful', 'insurans']],
  ['Rumah & Sewa', ['sewa', 'rental', 'rent ']],
  ['Makanan & Minuman', ['kfc', 'mcd', 'mcdonald', 'sushi', 'restoran', 'restaurant', 'kopitiam', 'makan', 'grabfood', 'foodpanda']],
  ['Barang Dapur', ['mydin', 'aeon', 'lotus', 'giant', 'econsave', 'speedmart', 'farm fresh']],
  ['Shopping', ['mr diy', 'mr. diy']],
  ['Kesihatan', ['klinik', 'clinic', 'farmasi', 'pharmacy', 'hospital', 'guardian', 'watsons']],
  ['Pendidikan', ['sekolah', 'school', 'kursus', 'course', 'buku']],
  ['Hiburan', ['netflix', 'spotify', 'astro', 'cinema', 'gsc', 'tgv']],
];

/** Everything paid to Borhan is software and subscriptions (owner's rule). */
const BORHAN = /\bborhan\b/;

/** Car words as whole words only, so "MAMAK SAGAMAT" is not a Saga. Same list as the car-costs migration. */
const CAR = /\b(kereta|saga|bezza|bezaa|myvi|axia|proton|perodua|naza|kenderaan|roadtax|road tax|minyak|myk|servis|tayar)\b/;

/**
 * A category for a bank line: the user's own remembered rules first (longest keyword wins), then the
 * built-in keywords; money in defaults to "Bayaran Pelanggan", money out to "Lain-lain".
 */
export function guessCategory(
  description: string,
  type: EntryType,
  categories: Category[],
  rules: CategoryRule[] = [],
): string | null {
  const text = ` ${description.toLowerCase().replace(/\s+/g, ' ')} `;
  const ofType = categories.filter((c) => c.type === type);
  const byName = (name: string) => ofType.find((c) => c.name === name)?.id ?? null;

  const rule = rules
    .filter((r) => r.merchant_keyword && text.includes(r.merchant_keyword.toLowerCase()))
    .sort((a, b) => b.merchant_keyword.length - a.merchant_keyword.length)
    .find((r) => ofType.some((c) => c.id === r.category_id));
  if (rule) return rule.category_id;

  if (type === 'expense') {
    // Owner's rules, ahead of everything else: payments to Borhan are software; every car cost is transport.
    const software = byName('Software & Langganan');
    if (software && BORHAN.test(text)) return software;
    const car = byName('Petrol & Pengangkutan');
    if (car && CAR.test(text)) return car;
    for (const [name, words] of KEYWORDS) {
      const id = byName(name);
      if (id && words.some((w) => text.includes(w))) return id;
    }
    return byName('Lain-lain');
  }
  return byName('Bayaran Pelanggan') ?? byName('Lain-lain');
}

/** Runs `fn` over items a few at a time, reporting progress; stops at the first error. */
export async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  onProgress: (done: number) => void,
  concurrency = 6,
): Promise<void> {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
