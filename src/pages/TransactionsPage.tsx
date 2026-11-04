import { Plus, Search, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { inputClass } from '../components/fieldStyles';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../features/auth/AuthProvider';
import { useCategories } from '../features/categories/useCategories';
import { friendlyError, listTransactions, NO_CATEGORY } from '../features/transactions/api';
import { DATE_PRESETS, presetRange, type DatePreset } from '../features/transactions/dateFilter';
import { TransactionRow } from '../features/transactions/TransactionRow';
import { useTransactionSheet } from '../features/transactions/TransactionSheet';
import { useLoad } from '../lib/data';
import { dateInKL, formatLongDate, formatMYR } from '../lib/locale';
import { fromSen, toSen } from '../lib/money';
import type { Transaction } from '../lib/types';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function TransactionsPage() {
  const { client } = useAuth();
  const { categories, byId } = useCategories();
  const { openCreate, openEdit } = useTransactionSheet();
  const today = dateInKL();

  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [categoryId, setCategoryId] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const range = presetRange(preset, today, custom);
  const filters = { search: debouncedSearch, ...range, categoryId };
  const filterKey = JSON.stringify(filters);
  const [paging, setPaging] = useState({ key: filterKey, pages: 1 });
  const pages = paging.key === filterKey ? paging.pages : 1;
  const setPages = (fn: (p: number) => number) => setPaging({ key: filterKey, pages: fn(pages) });

  const { data, error, loading } = useLoad(async () => {
    const results = await Promise.all(Array.from({ length: pages }, (_, i) => listTransactions(client, filters, i)));
    return { rows: results.flatMap((r) => r.rows), hasMore: results[results.length - 1]?.hasMore ?? false };
  }, [client, filterKey, pages]);

  const groups = useMemo(() => {
    const map = new Map<string, { rows: Transaction[]; sen: number }>();
    for (const tx of data?.rows ?? []) {
      const g = map.get(tx.transaction_date) ?? { rows: [], sen: 0 };
      g.rows.push(tx);
      if (tx.transaction_type === 'expense') g.sen += toSen(tx.amount);
      map.set(tx.transaction_date, g);
    }
    return [...map.entries()];
  }, [data]);

  const filtering = Boolean(debouncedSearch.trim() || range.from || range.to || categoryId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Transaksi</h1>
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
        >
          <Plus className="size-4" aria-hidden />
          Tambah
        </button>
      </div>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Cari transaksi</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            className={`${inputClass} pl-12`}
            placeholder="Cari kedai atau keterangan"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Tempoh">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
                preset === p.value ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1 block text-xs font-medium text-muted">Dari</span>
              <input
                type="date"
                className={inputClass}
                max={custom.to || today}
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-muted">Hingga</span>
              <input
                type="date"
                className={inputClass}
                min={custom.from || undefined}
                max={today}
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className="sr-only">Kategori</span>
          <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NO_CATEGORY}>Tiada kategori</option>
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {friendlyError(error)}
        </p>
      ) : !data && loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
          <SearchX className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-3 font-semibold">{filtering ? 'Tiada transaksi sepadan' : 'Belum ada transaksi'}</p>
          <p className="mt-1 text-sm text-muted">
            {filtering ? 'Cuba ubah carian atau penapis.' : 'Tekan “Tambah” atau butang mikrofon untuk mula merekod.'}
          </p>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {groups.map(([date, g]) => (
            <section key={date} className="rounded-2xl border border-line bg-surface px-2 py-1">
              <h2 className="flex items-center justify-between px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{date === today ? 'Hari ini' : formatLongDate(date)}</span>
                <span className="tabular-nums">{formatMYR(fromSen(g.sen))}</span>
              </h2>
              <ul className="divide-y divide-line/70">
                {g.rows.map((tx) => (
                  <li key={tx.id}>
                    <TransactionRow tx={tx} category={tx.category_id ? byId.get(tx.category_id) : undefined} onSelect={openEdit} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {data?.hasMore && (
            <button
              type="button"
              disabled={loading}
              onClick={() => setPages((p) => p + 1)}
              className="min-h-12 w-full rounded-xl border border-line bg-surface font-semibold text-accent disabled:opacity-50"
            >
              {loading ? 'Memuatkan…' : 'Muat lagi'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
