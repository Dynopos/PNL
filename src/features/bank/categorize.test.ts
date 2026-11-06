import type { Category } from '../../lib/types';
import { guessCategory, runInBatches } from './categorize';

const cats: Category[] = [
  { id: 'lain-x', user_id: null, name: 'Lain-lain', type: 'expense' },
  { id: 'petrol', user_id: null, name: 'Petrol & Pengangkutan', type: 'expense' },
  { id: 'bil', user_id: null, name: 'Bil & Utiliti', type: 'expense' },
  { id: 'owner', user_id: null, name: 'Kegunaan Peribadi Pemilik', type: 'expense' },
  { id: 'cogs', user_id: 'u1', name: 'Kos Bahan (COGS)', type: 'expense' },
  { id: 'bayaran', user_id: null, name: 'Bayaran Pelanggan', type: 'income' },
  { id: 'lain-i', user_id: null, name: 'Lain-lain', type: 'income' },
];

describe('guessCategory', () => {
  it('uses bank keywords for money out, and Lain-lain when nothing fits', () => {
    expect(guessCategory('DUITNOW TO ACCOUNT PETRONAS SG BULOH', 'expense', cats)).toBe('petrol');
    expect(guessCategory('JOMPAY TNB 12345', 'expense', cats)).toBe('bil');
    expect(guessCategory('FPX TNB RUMAH', 'expense', cats)).toBe('owner');
    expect(guessCategory('DUITNOW TO ACCOUNT Gaji staff 4183 AIMAN', 'expense', cats)).toBe('lain-x');
    expect(guessCategory('SERVICE CHARGE', 'expense', cats)).toBe('lain-x');
  });

  it('puts money in under Bayaran Pelanggan', () => {
    expect(guessCategory('I-FUNDS TR FROM CA SYED GROUP LIMAPOS RENEW', 'income', cats)).toBe('bayaran');
  });

  it('prefers the user\'s remembered rules, and only of the right type', () => {
    const rules = [
      { merchant_keyword: 'redsoft', category_id: 'cogs' },
      { merchant_keyword: 'syed group', category_id: 'cogs' },
    ];
    expect(guessCategory('DUITNOW TO REDSOFT SDN BHD', 'expense', cats, rules)).toBe('cogs');
    expect(guessCategory('I-FUNDS TR FROM SYED GROUP', 'income', cats, rules)).toBe('bayaran');
  });
});

describe('runInBatches', () => {
  it('processes every item with limited concurrency', async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    const progress: number[] = [];
    await runInBatches(
      Array.from({ length: 20 }, (_, i) => i),
      async (i) => {
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, 1));
        seen.push(i);
        running--;
      },
      (d) => progress.push(d),
      4,
    );
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(peak).toBe(4);
    expect(progress.at(-1)).toBe(20);
  });

  it('rejects when one item fails', async () => {
    await expect(runInBatches([1, 2, 3], async (i) => { if (i === 2) throw new Error('x'); }, () => {})).rejects.toThrow('x');
  });
});
