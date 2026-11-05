import { parseWithRules } from '../../../supabase/functions/_shared/voiceParser.ts';
import type { Category } from '../../lib/types';
import { canAutoSave, toReviewItems, validateReviewItem } from './review';

const TODAY = '2026-11-04';
const categories: Category[] = [
  { id: 'c-dapur', user_id: null, name: 'Barang Dapur', type: 'expense' },
  { id: 'c-petrol', user_id: null, name: 'Petrol & Pengangkutan', type: 'expense' },
  { id: 'c-lain-x', user_id: null, name: 'Lain-lain', type: 'expense' },
  { id: 'c-jualan', user_id: null, name: 'Jualan', type: 'income' },
  { id: 'c-cogs', user_id: 'u1', name: 'Kos Bahan (COGS)', type: 'expense' },
];
const items = (text: string, rules = []) => toReviewItems(parseWithRules(text, TODAY), 'sub-1', categories, rules);

describe('toReviewItems', () => {
  it('maps default category names to ids and gives stable idempotency keys', () => {
    const r = items('Mydin 55, Jualan 1500');
    expect(r.map((i) => [i.key, i.type, i.categoryId, i.amount])).toEqual([
      ['voice:sub-1:0', 'expense', 'c-dapur', '55.00'],
      ['voice:sub-1:1', 'income', 'c-jualan', '1500.00'],
    ]);
  });

  it('applies the user\'s merchant rule, and it settles an unclear type', () => {
    const [i] = toReviewItems(parseWithRules('Redsoft 450', TODAY), 'sub-1', categories, [
      { merchant_keyword: 'redsoft', category_id: 'c-cogs' },
    ]);
    expect(i).toMatchObject({ type: 'expense', categoryId: 'c-cogs', ruleApplied: true, issues: [] });
  });

  it('shows one income-or-expense question even when the AI wrote its own', () => {
    const [i] = toReviewItems(
      [
        {
          merchant: null, description: 'Welfare', amount: '50.00', amount_options: [], currency: 'MYR', category: 'Lain-lain',
          type: null, transaction_date: TODAY, text: '',
          issues: ['Tidak jelas sama ada wang welfare ini diterima atau dibayar.', "Maksud 'welfare' tidak jelas.", 'Pendapatan atau perbelanjaan?'],
        },
      ],
      'sub-1', categories, [],
    );
    expect(i!.issues).toEqual(["Maksud 'welfare' tidak jelas.", 'Pendapatan atau perbelanjaan?']);
  });

  it('leaves the category empty until the user picks a type', () => {
    const [i] = items('Ali 50 ringgit');
    expect(i!.type).toBeNull();
    expect(i!.categoryId).toBe('');
  });
});

describe('validateReviewItem and auto-save', () => {
  it('builds a save item for a clear entry', () => {
    const [i] = items('Mydin 55 ringgit');
    expect(validateReviewItem(i!, TODAY)).toEqual({
      ok: true,
      value: {
        idempotency_key: 'voice:sub-1:0',
        transaction_type: 'expense',
        amount: '55.00',
        merchant: 'Mydin',
        description: null,
        category_id: 'c-dapur',
        transaction_date: TODAY,
      },
    });
    expect(canAutoSave([i!], TODAY)).toBe(true);
  });

  it('never auto-saves missing amounts, ambiguity, unclear type or several entries', () => {
    expect(canAutoSave(items('Mydin'), TODAY)).toBe(false);
    expect(canAutoSave(items('Petrol lima belas atau lima puluh'), TODAY)).toBe(false);
    expect(canAutoSave(items('Ali 50 ringgit'), TODAY)).toBe(false);
    expect(canAutoSave(items('Mydin 55, Petronas 60'), TODAY)).toBe(false);
  });

  it('requires a type and an amount', () => {
    const [i] = items('Ali');
    const r = validateReviewItem(i!, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['amount', 'type']);
  });
});
