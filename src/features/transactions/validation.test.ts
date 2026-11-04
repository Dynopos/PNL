import { validateDraft, type TransactionDraft } from './validation';

const base: TransactionDraft = {
  amount: '55',
  merchant: '  Mydin   Mall ',
  description: '',
  category_id: 'cat-1',
  transaction_date: '2026-11-04',
};

describe('validateDraft', () => {
  it('normalises a valid draft', () => {
    expect(validateDraft(base, '2026-11-04')).toEqual({
      ok: true,
      value: {
        amount: '55.00',
        merchant: 'Mydin Mall',
        description: null,
        category_id: 'cat-1',
        transaction_date: '2026-11-04',
      },
    });
  });

  it('never invents a missing amount', () => {
    const r = validateDraft({ ...base, amount: '' }, '2026-11-04');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amount).toBe('Masukkan jumlah.');
  });

  it('rejects future dates, bad amounts and empty descriptions', () => {
    const r = validateDraft(
      { ...base, amount: 'lima', merchant: ' ', description: '', transaction_date: '2026-11-05' },
      '2026-11-04',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['amount', 'merchant', 'transaction_date']);
  });

  it('treats an empty category as uncategorised', () => {
    const r = validateDraft({ ...base, category_id: '' }, '2026-11-04');
    expect(r.ok && r.value.category_id).toBeNull();
  });
});
