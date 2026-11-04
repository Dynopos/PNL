import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { inputClass, labelClass, primaryButton } from '../../components/fieldStyles';
import type { Category } from '../../lib/types';
import { validateDraft, type DraftErrors, type TransactionDraft, type TransactionInput } from './validation';

export function TransactionForm({
  initial,
  categories,
  today,
  submitLabel,
  onSubmit,
  footer,
}: {
  initial: TransactionDraft;
  categories: Category[];
  today: string;
  submitLabel: string;
  onSubmit: (input: TransactionInput) => Promise<string | null>;
  footer?: ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();

  const set = (field: keyof TransactionDraft) => (e: { target: { value: string } }) => {
    setDraft((d) => ({ ...d, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const result = validateDraft(draft, today);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    setSubmitError('');
    const failure = await onSubmit(result.value);
    setBusy(false);
    if (failure) setSubmitError(failure);
  }

  const field = (name: keyof TransactionDraft) => ({
    id: `${id}-${name}`,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${id}-${name}-err` : undefined,
  });
  const err = (name: keyof TransactionDraft) =>
    errors[name] ? (
      <p id={`${id}-${name}-err`} className="mt-1.5 text-sm text-danger">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor={`${id}-amount`} className={labelClass}>
          Jumlah (RM)
        </label>
        <input
          {...field('amount')}
          className={`${inputClass} font-display text-2xl font-semibold`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={draft.amount}
          onChange={set('amount')}
        />
        {err('amount')}
      </div>

      <div>
        <label htmlFor={`${id}-merchant`} className={labelClass}>
          Kedai / tempat
        </label>
        <input
          {...field('merchant')}
          className={inputClass}
          maxLength={120}
          placeholder="cth: Mydin"
          value={draft.merchant}
          onChange={set('merchant')}
        />
        {err('merchant')}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-category_id`} className={labelClass}>
            Kategori
          </label>
          <select {...field('category_id')} className={inputClass} value={draft.category_id} onChange={set('category_id')}>
            <option value="">Tiada kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-transaction_date`} className={labelClass}>
            Tarikh
          </label>
          <input
            {...field('transaction_date')}
            type="date"
            max={today}
            className={inputClass}
            value={draft.transaction_date}
            onChange={set('transaction_date')}
          />
          {err('transaction_date')}
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-description`} className={labelClass}>
          Keterangan <span className="font-normal">(pilihan)</span>
        </label>
        <input
          {...field('description')}
          className={inputClass}
          maxLength={500}
          placeholder="cth: Barang dapur mingguan"
          value={draft.description}
          onChange={set('description')}
        />
        {err('description')}
      </div>

      {submitError && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {submitError}
        </p>
      )}

      <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
        {busy ? 'Menyimpan…' : submitLabel}
      </button>
      {footer}
    </form>
  );
}
