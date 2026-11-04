import { CheckCircle2, Trash2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { secondaryButton } from '../../components/fieldStyles';
import { Sheet } from '../../components/Sheet';
import { useInvalidate } from '../../lib/data';
import { dateInKL, formatLongDate, formatMYR } from '../../lib/locale';
import type { EntryType, Transaction } from '../../lib/types';
import { useAccount } from '../accounts/AccountProvider';
import { useAuth } from '../auth/AuthProvider';
import { useCategories } from '../categories/useCategories';
import { createTransaction, deleteTransaction, friendlyError, updateTransaction } from './api';
import { TransactionForm } from './TransactionForm';
import type { TransactionDraft, TransactionInput } from './validation';

type State =
  | { mode: 'closed' }
  | { mode: 'create'; key: string; idempotencyKey: string }
  | { mode: 'edit'; key: string; tx: Transaction }
  | { mode: 'delete'; key: string; tx: Transaction };

const SheetContext = createContext<{ openCreate: () => void; openEdit: (tx: Transaction) => void } | null>(null);

export function useTransactionSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useTransactionSheet must be used inside TransactionSheetProvider');
  return ctx;
}

function draftFrom(tx: Transaction | null, today: string, defaultCategoryId: string): TransactionDraft {
  if (!tx) {
    return {
      transaction_type: 'expense',
      amount: '',
      merchant: '',
      description: '',
      category_id: defaultCategoryId,
      transaction_date: today,
    };
  }
  return {
    transaction_type: tx.transaction_type,
    amount: Number(tx.amount).toFixed(2),
    merchant: tx.merchant ?? '',
    description: tx.description ?? '',
    category_id: tx.category_id ?? '',
    transaction_date: tx.transaction_date,
  };
}

export function TransactionSheetProvider({ children }: { children: ReactNode }) {
  const { client, session } = useAuth();
  const invalidate = useInvalidate();
  const { categories } = useCategories();
  const { account } = useAccount();
  const [state, setState] = useState<State>({ mode: 'closed' });
  const [toast, setToast] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const today = dateInKL();
  const defaultCategoryFor = (type: EntryType) =>
    categories.find((c) => c.name === 'Lain-lain' && c.type === type)?.id ?? '';

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const close = useCallback(() => {
    setState({ mode: 'closed' });
    setDeleteError('');
  }, []);

  const openCreate = useCallback(
    () => setState({ mode: 'create', key: crypto.randomUUID(), idempotencyKey: `manual:${crypto.randomUUID()}` }),
    [],
  );
  const openEdit = useCallback((tx: Transaction) => setState({ mode: 'edit', key: tx.id, tx }), []);

  async function save(input: TransactionInput): Promise<string | null> {
    try {
      if (state.mode === 'create') {
        if (!account) return 'Akaun belum sedia. Cuba lagi sebentar.';
        await createTransaction(client, session!.user.id, account.id, input, state.idempotencyKey);
        setToast(`${input.transaction_type === 'income' ? 'Pendapatan' : 'Perbelanjaan'} disimpan · ${formatMYR(input.amount)}`);
      } else if (state.mode === 'edit') {
        await updateTransaction(client, state.tx.id, input);
        setToast('Perubahan disimpan');
      }
      close();
      invalidate();
      return null;
    } catch (err) {
      return friendlyError(err);
    }
  }

  async function confirmDelete() {
    if (state.mode !== 'delete') return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteTransaction(client, state.tx.id);
      close();
      invalidate();
      setToast('Transaksi dipadam');
    } catch (err) {
      setDeleteError(friendlyError(err));
    } finally {
      setDeleting(false);
    }
  }

  const title = state.mode === 'create' ? 'Tambah transaksi' : state.mode === 'edit' ? 'Edit transaksi' : 'Padam transaksi?';

  return (
    <SheetContext.Provider value={{ openCreate, openEdit }}>
      {children}

      <Sheet open={state.mode !== 'closed'} title={title} onClose={close}>
        {(state.mode === 'create' || state.mode === 'edit') && (
          <TransactionForm
            key={state.key}
            initial={draftFrom(state.mode === 'edit' ? state.tx : null, today, defaultCategoryFor('expense'))}
            categories={categories}
            defaultCategoryFor={defaultCategoryFor}
            today={today}
            submitLabel={state.mode === 'create' ? 'Simpan' : 'Simpan perubahan'}
            onSubmit={save}
            footer={
              state.mode === 'edit' && (
                <button
                  type="button"
                  onClick={() => setState({ mode: 'delete', key: state.tx.id, tx: state.tx })}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold text-danger hover:bg-danger-soft"
                >
                  <Trash2 className="size-4" aria-hidden />
                  Padam transaksi
                </button>
              )
            }
          />
        )}

        {state.mode === 'delete' && (
          <div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="font-semibold">{state.tx.merchant || state.tx.description}</p>
              <p className="mt-1 text-sm text-muted">
                {formatMYR(state.tx.amount)} · {formatLongDate(state.tx.transaction_date)}
              </p>
            </div>
            <p className="mt-4 text-sm text-muted">Rekod ini akan dipadam secara kekal dan tidak boleh dikembalikan.</p>
            {deleteError && (
              <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
                {deleteError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setState({ mode: 'edit', key: state.tx.id, tx: state.tx })}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="min-h-12 rounded-xl bg-danger font-semibold text-white disabled:opacity-50"
              >
                {deleting ? 'Memadam…' : 'Ya, padam'}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-4"
      >
        {toast && (
          <span className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-bg shadow-lg">
            <CheckCircle2 className="size-4" aria-hidden />
            {toast}
          </span>
        )}
      </div>
    </SheetContext.Provider>
  );
}
