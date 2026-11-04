import { validateAiOutput } from '../../../supabase/functions/_shared/aiParse.ts';

const TODAY = '2026-11-04';
const entry = (over: Record<string, unknown>) => ({
  merchant: 'Mydin',
  description: null,
  amount: 55,
  amount_options: [],
  type: 'expense',
  category: 'Barang Dapur',
  transaction_date: TODAY,
  issues: [],
  ...over,
});

describe('validateAiOutput', () => {
  it('accepts entries whose amounts were actually spoken', () => {
    const [c] = validateAiOutput({ transactions: [entry({})] }, 'Mydin lima puluh lima ringgit', TODAY);
    expect(c).toMatchObject({ merchant: 'Mydin', amount: '55.00', type: 'expense', category: 'Barang Dapur', issues: [] });
  });

  it('refuses an amount that is not in the transcript', () => {
    const [c] = validateAiOutput({ transactions: [entry({ amount: 65 })] }, 'Mydin 55 ringgit', TODAY);
    expect(c!.amount).toBeNull();
    expect(c!.issues).toContain('Jumlah tidak dapat disahkan daripada ayat anda.');
  });

  it('flags a missing amount and an unclear type', () => {
    const [c] = validateAiOutput({ transactions: [entry({ amount: null, type: null })] }, 'Mydin', TODAY);
    expect(c!.amount).toBeNull();
    expect(c!.type).toBeNull();
    expect(c!.issues).toEqual(expect.arrayContaining(['Pendapatan atau perbelanjaan?']));
  });

  it('replaces unknown or mismatched categories with Lain-lain', () => {
    const [a, b] = validateAiOutput(
      { transactions: [entry({ category: 'Groceries' }), entry({ type: 'income', category: 'Barang Dapur', amount: 55 })] },
      'Mydin 55, jualan 55',
      TODAY,
    );
    expect(a!.category).toBe('Lain-lain');
    expect(b!.category).toBe('Lain-lain');
  });

  it('rejects future and impossible dates', () => {
    const r = validateAiOutput(
      { transactions: [entry({ transaction_date: '2026-11-05' }), entry({ transaction_date: '2026-02-30' })] },
      'Mydin 55, Mydin 55',
      TODAY,
    );
    expect(r.map((c) => c.transaction_date)).toEqual([TODAY, TODAY]);
    expect(r.every((c) => c.issues.includes('Sila semak tarikh.'))).toBe(true);
  });

  it('keeps only spoken alternatives for ambiguous amounts', () => {
    const [c] = validateAiOutput(
      { transactions: [entry({ amount: null, amount_options: [15, 50, 99], issues: ['Jumlah tidak jelas'] })] },
      'Petrol lima belas atau lima puluh',
      TODAY,
    );
    expect(c!.amount_options).toEqual(['15.00', '50.00']);
  });

  it('throws on malformed output so the caller falls back to rules', () => {
    expect(() => validateAiOutput({ nope: true }, 'x', TODAY)).toThrow();
  });
});
