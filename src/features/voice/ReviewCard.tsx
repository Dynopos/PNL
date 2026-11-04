import { AlertTriangle, X } from 'lucide-react';
import { useId } from 'react';
import { inputClass, labelClass } from '../../components/fieldStyles';
import type { Category, EntryType } from '../../lib/types';
import { ruleLabel, type ReviewErrors, type ReviewItem } from './review';

const TYPES: [EntryType, string][] = [
  ['expense', 'Perbelanjaan'],
  ['income', 'Pendapatan'],
];

export function ReviewCard({
  item,
  index,
  errors,
  categories,
  today,
  onChange,
  onRemove,
}: {
  item: ReviewItem;
  index: number;
  errors: ReviewErrors;
  categories: Category[];
  today: string;
  onChange: (patch: Partial<ReviewItem>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const defaultFor = (type: EntryType) => categories.find((c) => c.type === type && c.name === 'Lain-lain')?.id ?? '';
  const income = item.type === 'income';

  return (
    <article className="rounded-2xl border border-line bg-surface p-4" aria-label={`Transaksi ${index + 1}`}>
      <div className="flex items-start justify-between gap-3">
        <div
          role="radiogroup"
          aria-label="Jenis transaksi"
          className={`grid flex-1 grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-semibold ${
            errors.type ? 'ring-2 ring-danger' : ''
          }`}
        >
          {TYPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={item.type === value}
              onClick={() =>
                item.type !== value &&
                onChange({
                  type: value,
                  categoryId: defaultFor(value),
                  issues: item.issues.filter((i) => i !== 'Pendapatan atau perbelanjaan?'),
                })
              }
              className={`min-h-10 rounded-lg transition ${
                item.type === value
                  ? value === 'income'
                    ? 'bg-accent text-on-accent'
                    : 'bg-danger text-white'
                  : 'text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Buang transaksi ${index + 1}`}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {errors.type && <p className="mt-1.5 text-sm text-danger">{errors.type}</p>}

      {item.issues.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {item.issues.map((issue) => (
            <li key={issue} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {issue}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`${id}-amount`} className={labelClass}>
            Jumlah (RM)
          </label>
          <input
            id={`${id}-amount`}
            className={`${inputClass} font-display text-xl font-semibold`}
            inputMode="decimal"
            placeholder="0.00"
            value={item.amount}
            aria-invalid={Boolean(errors.amount)}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
          {item.amountOptions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Pilihan jumlah">
              {item.amountOptions.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={item.amount === o}
                  onClick={() => onChange({ amount: o })}
                  className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${
                    item.amount === o ? 'border-accent bg-accent-soft text-accent' : 'border-line'
                  }`}
                >
                  RM{o}
                </button>
              ))}
            </div>
          )}
          {errors.amount && <p className="mt-1.5 text-sm text-danger">{errors.amount}</p>}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`${id}-date`} className={labelClass}>
            Tarikh
          </label>
          <input
            id={`${id}-date`}
            type="date"
            max={today}
            className={inputClass}
            value={item.date}
            aria-invalid={Boolean(errors.date)}
            onChange={(e) => onChange({ date: e.target.value })}
          />
          {errors.date && <p className="mt-1.5 text-sm text-danger">{errors.date}</p>}
        </div>
        <div className="col-span-2">
          <label htmlFor={`${id}-merchant`} className={labelClass}>
            {income ? 'Daripada (sumber)' : 'Kedai / tempat'}
          </label>
          <input
            id={`${id}-merchant`}
            className={inputClass}
            maxLength={120}
            value={item.merchant}
            aria-invalid={Boolean(errors.merchant)}
            onChange={(e) => onChange({ merchant: e.target.value })}
          />
          {errors.merchant && <p className="mt-1.5 text-sm text-danger">{errors.merchant}</p>}
        </div>
        <div className="col-span-2">
          <label htmlFor={`${id}-description`} className={labelClass}>
            Keterangan
          </label>
          <input
            id={`${id}-description`}
            className={inputClass}
            maxLength={500}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label htmlFor={`${id}-category`} className={labelClass}>
            Kategori
          </label>
          <select
            id={`${id}-category`}
            className={inputClass}
            disabled={!item.type}
            value={item.categoryId}
            onChange={(e) => onChange({ categoryId: e.target.value, categoryTouched: true })}
          >
            {!item.type && <option value="">Pilih jenis dahulu</option>}
            {item.type && <option value="">Tiada kategori</option>}
            {categories
              .filter((c) => c.type === item.type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          {item.ruleApplied && !item.categoryTouched && (
            <p className="mt-1.5 text-xs text-muted">Kategori daripada peraturan yang anda simpan.</p>
          )}
          {item.categoryTouched && item.categoryId && ruleLabel(item) && (
            <label className="mt-2 flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={item.remember}
                onChange={(e) => onChange({ remember: e.target.checked })}
              />
              Ingat kategori ini untuk “{ruleLabel(item)}” akan datang
            </label>
          )}
        </div>
      </div>
    </article>
  );
}
