import { Mic } from 'lucide-react';
import { formatMYR } from '../../lib/locale';
import type { Category, Transaction } from '../../lib/types';
import { categoryIcon } from '../categories/categoryIcon';

export function TransactionRow({
  tx,
  category,
  onSelect,
}: {
  tx: Transaction;
  category: Category | undefined;
  onSelect: (tx: Transaction) => void;
}) {
  const Icon = categoryIcon(category?.name);
  const title = tx.merchant || tx.description || 'Tanpa nama';
  const subtitle = [category?.name ?? 'Tiada kategori', tx.merchant && tx.description].filter(Boolean).join(' · ');
  const income = tx.transaction_type === 'income';

  return (
    <button
      type="button"
      onClick={() => onSelect(tx)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-surface-2"
      aria-label={`${title}, ${formatMYR(tx.amount)}. Tekan untuk edit.`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="truncate">{title}</span>
          {tx.source === 'voice' && <Mic className="size-3.5 shrink-0 text-muted" aria-label="Dirakam dengan suara" />}
        </span>
        <span className="block truncate text-sm text-muted">{subtitle}</span>
      </span>
      <span className={`shrink-0 font-display font-semibold tabular-nums ${income ? 'text-accent' : ''}`}>
        {income ? '+' : ''}
        {formatMYR(tx.amount)}
      </span>
    </button>
  );
}
