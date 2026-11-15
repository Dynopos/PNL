import { isValidIsoDate } from '../../lib/dates';
import { parseAmountInput } from '../../lib/money';
import type { EntryType } from '../../lib/types';

export interface TransactionDraft {
  transaction_type: EntryType;
  amount: string;
  merchant: string;
  description: string;
  category_id: string;
  transaction_date: string;
}

export interface TransactionInput {
  transaction_type: EntryType;
  amount: string;
  merchant: string | null;
  description: string | null;
  category_id: string | null;
  transaction_date: string;
}

export type DraftErrors = Partial<Record<keyof TransactionDraft, string>>;

export function validateDraft(
  draft: TransactionDraft,
  today: string,
): { ok: true; value: TransactionInput } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const amount = parseAmountInput(draft.amount);
  const merchant = draft.merchant.trim().replace(/\s+/g, ' ');
  const description = draft.description.trim();

  if (!draft.amount.trim()) errors.amount = 'Masukkan jumlah.';
  else if (!amount) errors.amount = 'Jumlah tidak sah. Contoh: 55 atau 12.50';

  if (!isValidIsoDate(draft.transaction_date)) errors.transaction_date = 'Tarikh tidak sah.';
  else if (draft.transaction_date > today) errors.transaction_date = 'Tarikh tidak boleh melebihi hari ini.';
  else if (draft.transaction_date < '2000-01-01') errors.transaction_date = 'Tarikh terlalu lama.';

  const who = draft.transaction_type === 'income' ? 'sumber' : 'kedai';
  if (!merchant && !description) errors.merchant = `Isi nama ${who} atau keterangan.`;
  if (merchant.length > 120) errors.merchant = `Nama ${who} terlalu panjang (maks 120 aksara).`;
  if (description.length > 500) errors.description = 'Keterangan terlalu panjang (maks 500 aksara).';

  if (Object.keys(errors).length > 0 || !amount) return { ok: false, errors };
  return {
    ok: true,
    value: {
      transaction_type: draft.transaction_type,
      amount,
      merchant: merchant || null,
      description: description || null,
      category_id: draft.category_id || null,
      transaction_date: draft.transaction_date,
    },
  };
}
