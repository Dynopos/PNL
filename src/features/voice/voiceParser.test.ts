import {
  amountsInTranscript,
  isClear,
  parseWithRules,
  wordsToNumber,
} from '../../../supabase/functions/_shared/voiceParser.ts';

const TODAY = '2026-11-04'; // Wednesday

const one = (text: string) => {
  const r = parseWithRules(text, TODAY);
  expect(r).toHaveLength(1);
  return r[0]!;
};

describe('wordsToNumber (Malay & English)', () => {
  it.each([
    [['lima', 'puluh', 'lima'], 55],
    [['enam', 'puluh'], 60],
    [['lima', 'belas'], 15],
    [['sebelas'], 11],
    [['seratus', 'dua', 'puluh', 'lima'], 125],
    [['dua', 'ribu', 'lima', 'ratus'], 2500],
    [['seribu', 'lima', 'ratus'], 1500],
    [['twenty', 'five'], 25],
    [['one', 'hundred', 'fifty'], 150],
  ])('%j -> %d', (words, n) => expect(wordsToNumber(words)).toBe(n));

  it('rejects malformed runs', () => {
    expect(wordsToNumber(['dua', 'tiga'])).toBeNull();
    expect(wordsToNumber(['puluh'])).toBeNull();
  });
});

describe('spec test cases', () => {
  it('1. "Mydin 55 ringgit"', () => {
    expect(one('Mydin 55 ringgit')).toMatchObject({
      merchant: 'Mydin', amount: '55.00', category: 'Barang Dapur', type: 'expense', transaction_date: TODAY, issues: [],
    });
  });

  it('2. "Petrol Petronas enam puluh ringgit"', () => {
    expect(one('Petrol Petronas enam puluh ringgit')).toMatchObject({
      merchant: 'Petronas', amount: '60.00', category: 'Petrol & Pengangkutan', type: 'expense',
    });
  });

  it('3. "Makan nasi 12 ringgit"', () => {
    expect(one('Makan nasi 12 ringgit')).toMatchObject({
      merchant: null, description: 'Makan nasi', amount: '12.00', category: 'Makanan & Minuman', type: 'expense',
    });
  });

  it('4. "Semalam bayar parking lima ringgit" (Malaysian yesterday)', () => {
    expect(one('Semalam bayar parking lima ringgit')).toMatchObject({
      description: 'Bayar parking', amount: '5.00', category: 'Petrol & Pengangkutan', type: 'expense',
      transaction_date: '2026-11-03',
    });
  });

  it('5. "Mydin 55, Petronas 60, KFC 25" -> three transactions', () => {
    const r = parseWithRules('Mydin 55, Petronas 60, KFC 25', TODAY);
    expect(r.map((c) => [c.merchant, c.amount, c.category])).toEqual([
      ['Mydin', '55.00', 'Barang Dapur'],
      ['Petronas', '60.00', 'Petrol & Pengangkutan'],
      ['KFC', '25.00', 'Makanan & Minuman'],
    ]);
    expect(r.every(isClear)).toBe(true);
  });

  it('6. "Beli air dua ringgit lima puluh sen"', () => {
    expect(one('Beli air dua ringgit lima puluh sen')).toMatchObject({
      description: 'Beli air', amount: '2.50', category: 'Makanan & Minuman', type: 'expense',
    });
  });

  it('7. "Barang dapur seratus dua puluh lima ringgit"', () => {
    expect(one('Barang dapur seratus dua puluh lima ringgit')).toMatchObject({
      amount: '125.00', category: 'Barang Dapur', type: 'expense',
    });
  });

  it('8. "Mydin" -> missing amount is never invented', () => {
    const c = one('Mydin');
    expect(c.amount).toBeNull();
    expect(c.issues).toContain('Jumlah tidak disebut.');
    expect(isClear(c)).toBe(false);
  });

  it('9. "Petrol lima belas atau lima puluh" -> ambiguous, both options offered', () => {
    const c = one('Petrol lima belas atau lima puluh');
    expect(c.amount).toBeNull();
    expect(c.amount_options).toEqual(['15.00', '50.00']);
    expect(isClear(c)).toBe(false);
  });
});

describe('income vs expense detection', () => {
  it.each([
    ['Jualan hari ini 1500 ringgit', 'income', 'Jualan', '1500.00'],
    ['Customer bayar 800 ringgit', 'income', 'Bayaran Pelanggan', '800.00'],
    ['Gaji masuk 2500 ringgit', 'income', 'Gaji', '2500.00'],
    ['Bayar gaji pekerja 1200', 'expense', 'Gaji Staff', '1200.00'],
    ['Mydin 55 ringgit', 'expense', 'Barang Dapur', '55.00'],
    ['Dapat duit dua ribu lima ratus', 'income', 'Lain-lain', '2500.00'],
  ])('%s', (text, type, category, amount) => {
    expect(one(text)).toMatchObject({ type, category, amount });
  });

  it('asks when it cannot tell', () => {
    const c = one('Ali 50 ringgit');
    expect(c.type).toBeNull();
    expect(c.issues).toContain('Pendapatan atau perbelanjaan?');
  });

  it('handles income and expenses in one sentence', () => {
    const r = parseWithRules('Jualan 1500, beli stok 300', TODAY);
    expect(r.map((c) => [c.type, c.amount])).toEqual([
      ['income', '1500.00'],
      ['expense', '300.00'],
    ]);
  });
});

describe('other phrasing', () => {
  it('"Isi minyak enam puluh" without the word ringgit', () => {
    expect(one('Isi minyak enam puluh')).toMatchObject({ amount: '60.00', category: 'Petrol & Pengangkutan', type: 'expense' });
  });

  it('"Last Monday makan KFC RM25"', () => {
    expect(one('Last Monday makan KFC RM25')).toMatchObject({
      merchant: 'KFC', description: 'Makan', amount: '25.00', transaction_date: '2026-11-02',
    });
  });

  it('"Isnin lepas" on a Monday means a week ago', () => {
    expect(parseWithRules('Isnin lepas makan 10', '2026-11-02')[0]!.transaction_date).toBe('2026-10-26');
  });

  it('"Beli barang dekat Mydin lima puluh lima ringgit"', () => {
    expect(one('Beli barang dekat Mydin lima puluh lima ringgit')).toMatchObject({
      merchant: 'Mydin', description: 'Beli barang', amount: '55.00',
    });
  });

  it('carries a spoken date to later items in the same sentence', () => {
    const r = parseWithRules('Semalam Mydin 55, Petronas 60', TODAY);
    expect(r.map((c) => c.transaction_date)).toEqual(['2026-11-03', '2026-11-03']);
  });

  it('splits items without commas', () => {
    expect(parseWithRules('Mydin 55 Petronas 60', TODAY).map((c) => c.merchant)).toEqual(['Mydin', 'Petronas']);
  });

  it('keeps quantities out of the amount', () => {
    expect(one('Nasi lemak 2 bungkus 10 ringgit')).toMatchObject({ amount: '10.00', description: 'Nasi lemak 2 bungkus' });
  });

  it('reads RM formats, thousands separators and ringgit setengah', () => {
    expect(one('Sewa kedai RM1,500').amount).toBe('1500.00');
    expect(one('Kopi RM 4.50').amount).toBe('4.50');
    expect(one('Roti dua ringgit setengah').amount).toBe('2.50');
    expect(one('Gula-gula lima puluh sen').amount).toBe('0.50');
  });

  it('keeps brand numbers inside merchant names', () => {
    expect(one('7 Eleven 12 ringgit')).toMatchObject({ merchant: '7-Eleven', amount: '12.00' });
    expect(one('99 Speedmart 33.90')).toMatchObject({ merchant: '99 Speedmart', amount: '33.90' });
  });

  it('flags "minggu lepas" instead of guessing a date', () => {
    expect(one('Minggu lepas makan 20').issues).toContain('Sila pilih tarikh tepat (“minggu lepas”).');
  });

  it('flags an amount with no description', () => {
    expect(one('55 ringgit').issues).toContain('Tiada keterangan.');
  });
});

describe('amountsInTranscript', () => {
  it('collects every amount, including ambiguous options', () => {
    expect([...amountsInTranscript('Petrol lima belas atau lima puluh, Mydin RM55.20')].sort((a, b) => a - b)).toEqual([
      1500, 5000, 5520,
    ]);
  });
});
