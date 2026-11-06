import { AlertTriangle, CheckCircle2, FileUp, Link2, Link2Off, ListPlus, Plus, Trash2, Undo2, X } from 'lucide-react';
import { useMemo, useState, type ChangeEvent } from 'react';
import { inputClass, primaryButton, secondaryButton } from '../components/fieldStyles';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import {
  createTransactionFromLine,
  deleteStatement,
  importStatement,
  listLines,
  listStatements,
  listUnreconciled,
  matchCandidates,
  matchLine,
  MATCH_WINDOW_DAYS,
  updateLine,
  type BankLine,
} from '../features/bank/api';
import { guessCategory, runInBatches } from '../features/bank/categorize';
import { parseStatementText, type ParsedStatement } from '../features/bank/statementParser';
import { useCategories } from '../features/categories/useCategories';
import { friendlyError } from '../features/transactions/api';
import { listMerchantRules } from '../features/voice/api';
import { useInvalidate, useLoad } from '../lib/data';
import { formatLongDate, formatMYR } from '../lib/locale';
import { fromSen, toSen } from '../lib/money';
import type { Transaction } from '../lib/types';

type Tab = 'review' | 'unmatched' | 'matched' | 'missing' | 'ignored';

const TABS: { value: Tab; label: string }[] = [
  { value: 'review', label: 'Perlu semak' },
  { value: 'unmatched', label: 'Belum padan' },
  { value: 'matched', label: 'Dipadankan' },
  { value: 'missing', label: 'Tiada dalam bank' },
  { value: 'ignored', label: 'Diabaikan' },
];

const card = 'rounded-2xl border border-line bg-surface p-4';
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function Money({ amount, incoming }: { amount: number | string; incoming: boolean }) {
  return (
    <span className={`font-display font-semibold tabular-nums ${incoming ? 'text-accent' : ''}`}>
      {incoming ? '+' : '−'}
      {formatMYR(amount)}
    </span>
  );
}

function txLabel(t: { merchant: string | null; description: string | null }) {
  return t.merchant || t.description || 'Transaksi';
}

export function ReconciliationPage() {
  const { client } = useAuth();
  const { account } = useAccount();
  const { categories } = useCategories();
  const invalidate = useInvalidate();
  const accountId = account?.id;
  const pending = () => new Promise<never>(() => {});

  const [upload, setUpload] = useState<
    | { state: 'idle' }
    | { state: 'reading' }
    | { state: 'preview'; parsed: ParsedStatement; fileName: string }
    | { state: 'saving' }
    | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const rules = useLoad(() => listMerchantRules(client).catch(() => []), [client]);

  const statements = useLoad(() => (accountId ? listStatements(client, accountId) : pending()), [client, accountId]);
  const statement = statements.data?.find((s) => s.id === selected) ?? statements.data?.[0] ?? null;
  const lines = useLoad(() => (statement ? listLines(client, statement.id) : Promise.resolve([])), [client, statement?.id]);
  const missing = useLoad(
    () => (statement && accountId ? listUnreconciled(client, accountId, statement.period_from, statement.period_to) : Promise.resolve([])),
    [client, accountId, statement?.id],
  );

  const groups = useMemo(() => {
    const all = lines.data ?? [];
    return {
      review: all.filter((l) => l.transaction_id && l.needs_review),
      unmatched: all.filter((l) => !l.transaction_id && !l.ignored),
      counted: all.filter((l) => !l.ignored),
      matched: all.filter((l) => l.transaction_id && !l.needs_review),
      ignored: all.filter((l) => l.ignored),
    };
  }, [lines.data]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setUpload({ state: 'error', message: 'Fail terlalu besar (maks 15MB).' });
      return;
    }
    setUpload({ state: 'reading' });
    setNotice('');
    try {
      const { extractPdfText } = await import('../features/bank/pdfText');
      const parsed = parseStatementText(await extractPdfText(file));
      if ('error' in parsed) setUpload({ state: 'error', message: parsed.error });
      else setUpload({ state: 'preview', parsed, fileName: file.name });
    } catch {
      setUpload({ state: 'error', message: 'PDF tidak dapat dibaca. Pastikan ia statement asal daripada bank (bukan gambar imbasan).' });
    }
  }

  async function saveStatement() {
    if (upload.state !== 'preview' || !accountId) return;
    const { parsed, fileName } = upload;
    setUpload({ state: 'saving' });
    try {
      const r = await importStatement(client, accountId, parsed, fileName);
      setUpload({ state: 'idle' });
      setNotice(
        r.inserted === 0
          ? `Statement ini sudah dimuat naik sebelum ini (${r.duplicates} baris sama). Tiada yang ditambah.`
          : `${r.inserted} baris disimpan${r.duplicates ? `, ${r.duplicates} sudah ada` : ''}. ${r.matched} dipadankan secara automatik.`,
      );
      if (r.statement_id) {
        setSelected(r.statement_id);
        const fresh = await listLines(client, r.statement_id);
        const added = await addAll(fresh.filter((l) => !l.transaction_id && !l.ignored));
        if (added > 0) {
          setNotice(
            `${r.inserted} baris disimpan${r.duplicates ? `, ${r.duplicates} sudah ada` : ''}. ` +
              `${r.matched} sama dengan rekod sedia ada, ${added} dimasukkan ke rekod.`,
          );
        }
      }
      setTab('review');
      invalidate();
    } catch (err) {
      setUpload({ state: 'error', message: friendlyError(err) });
    }
  }

  /** Adds bank lines as income/expense records with a guessed category. Lines already linked are skipped by the server. */
  async function addAll(targets: BankLine[]): Promise<number> {
    if (targets.length === 0) return 0;
    setActionError('');
    setBulk({ done: 0, total: targets.length });
    try {
      await runInBatches(
        targets,
        (l) =>
          createTransactionFromLine(
            client,
            l.id,
            guessCategory(l.description, l.direction === 'in' ? 'income' : 'expense', categories, rules.data ?? []),
          ),
        (done) => setBulk({ done, total: targets.length }),
      );
      return targets.length;
    } catch (err) {
      setActionError(`${friendlyError(err)} Tekan butang sekali lagi untuk sambung.`);
      return 0;
    } finally {
      setBulk(null);
      invalidate();
    }
  }

  async function act(lineId: string, fn: () => Promise<unknown>) {
    setBusyLine(lineId);
    setActionError('');
    try {
      await fn();
      invalidate();
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setBusyLine(null);
    }
  }

  const counts: Record<Tab, number> = {
    review: groups.review.length,
    unmatched: groups.unmatched.length,
    matched: groups.matched.length,
    missing: missing.data?.length ?? 0,
    ignored: groups.ignored.length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Padanan Bank</h1>
        <p className="mt-1 text-sm text-muted">
          Muat naik statement, semua baris terus masuk rekod dan dijumlahkan. Baris yang sama dengan rekod sedia ada (jumlah sama,
          tarikh dalam {MATCH_WINDOW_DAYS} hari) dipadankan, jadi tidak dikira dua kali.
        </p>
      </div>

      <section className={card}>
        {upload.state === 'preview' ? (
          <div>
            <p className="font-display font-semibold">
              {upload.parsed.bankName} · {formatLongDate(upload.parsed.periodFrom)} – {formatLongDate(upload.parsed.periodTo)}
            </p>
            <p className="mt-1 text-sm text-muted">{upload.fileName}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Baris</p>
                <p className="font-semibold">{upload.parsed.lines.length}</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Masuk</p>
                <p className="font-semibold tabular-nums text-accent">
                  {formatMYR(fromSen(upload.parsed.lines.filter((l) => l.direction === 'in').reduce((s, l) => s + toSen(l.amount), 0)))}
                </p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Keluar</p>
                <p className="font-semibold tabular-nums">
                  {formatMYR(fromSen(upload.parsed.lines.filter((l) => l.direction === 'out').reduce((s, l) => s + toSen(l.amount), 0)))}
                </p>
              </div>
            </div>
            {upload.parsed.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                {upload.parsed.warnings.slice(0, 5).map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              Baris statement akan disimpan dalam akaun anda supaya status padanan kekal. Hanya anda boleh melihatnya.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" className={secondaryButton} onClick={() => setUpload({ state: 'idle' })}>
                Batal
              </button>
              <button type="button" className={primaryButton} onClick={saveStatement}>
                Simpan & masukkan ke rekod
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-accent">
            {upload.state === 'reading' || upload.state === 'saving' ? (
              <Spinner />
            ) : (
              <FileUp className="size-8 text-accent" aria-hidden />
            )}
            <span className="font-semibold">
              {upload.state === 'reading'
                ? 'Membaca PDF…'
                : upload.state === 'saving'
                  ? bulk
                    ? `Memasukkan ke rekod… ${bulk.done}/${bulk.total}`
                    : 'Menyimpan & memadankan…'
                  : 'Muat naik statement bank (PDF)'}
            </span>
            <span className="text-xs text-muted">CIMB · Maybank · fail PDF asal daripada bank</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={onFile}
              disabled={upload.state === 'reading' || upload.state === 'saving'}
            />
          </label>
        )}
        {upload.state === 'error' && (
          <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {upload.message}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 flex gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            {notice}
          </p>
        )}
      </section>

      {statements.error ? (
        <p role="alert" className="text-sm text-danger">
          {friendlyError(statements.error)}
        </p>
      ) : !statements.data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : statements.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center text-sm text-muted">
          Belum ada statement. Muat naik statement bank untuk mula memadankan.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Statement</span>
              <select className={inputClass} value={statement?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
                {statements.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.bank.toUpperCase()} · {shortDate(s.period_from)} – {shortDate(s.period_to)}
                  </option>
                ))}
              </select>
            </label>
            {statement && (
              <DeleteStatementButton
                onDelete={() =>
                  act(statement.id, async () => {
                    await deleteStatement(client, statement.id);
                    setSelected(null);
                  })
                }
              />
            )}
          </div>

          {lines.data && <StatementTotals lines={groups.counted} />}

          {groups.unmatched.length > 0 && upload.state !== 'saving' && (
            <section className={`${card} border-accent/40`}>
              <p className="font-display font-semibold">
                {groups.unmatched.length} baris belum masuk rekod
              </p>
              <p className="mt-1 text-sm text-muted">
                Masukkan semua sekali gus. Kategori diteka daripada keterangan bank; boleh ditukar kemudian di Transaksi.
              </p>
              <button
                type="button"
                disabled={bulk !== null}
                className={`${primaryButton} mt-3 inline-flex w-full items-center justify-center gap-2`}
                onClick={() => addAll(groups.unmatched)}
              >
                {bulk ? (
                  <>
                    <Spinner />
                    Memasukkan… {bulk.done}/{bulk.total}
                  </>
                ) : (
                  <>
                    <ListPlus className="size-5" aria-hidden />
                    Masukkan semua ke rekod
                  </>
                )}
              </button>
            </section>
          )}

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Status padanan">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
                  tab === t.value ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted'
                }`}
              >
                {t.label}
                <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums text-ink">{counts[t.value]}</span>
              </button>
            ))}
          </div>

          {actionError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
              {actionError}
            </p>
          )}

          {lines.error || missing.error ? (
            <p role="alert" className="text-sm text-danger">
              {friendlyError(lines.error ?? missing.error)}
            </p>
          ) : !lines.data ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : tab === 'missing' ? (
            <MissingList items={missing.data ?? []} />
          ) : groups[tab].length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center text-sm text-muted">
              {tab === 'review' ? 'Tiada padanan yang perlu disemak.' : 'Tiada baris di sini.'}
            </p>
          ) : (
            <ul className="space-y-3" aria-busy={lines.loading}>
              {groups[tab].map((line) => (
                <li key={line.id}>
                  <LineCard
                    line={line}
                    busy={busyLine === line.id}
                    categories={categories}
                    loadCandidates={() => matchCandidates(client, accountId!, line)}
                    onAction={(action) => act(line.id, () => updateLine(client, line.id, action))}
                    onMatch={(txId) => act(line.id, () => matchLine(client, line.id, txId))}
                    onCreate={(categoryId) => act(line.id, () => createTransactionFromLine(client, line.id, categoryId || null))}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function StatementTotals({ lines }: { lines: BankLine[] }) {
  const sum = (dir: 'in' | 'out') => lines.filter((l) => l.direction === dir).reduce((s, l) => s + toSen(l.amount), 0);
  const inSen = sum('in');
  const outSen = sum('out');
  const recorded = lines.filter((l) => l.transaction_id).length;
  return (
    <section className={card} aria-label="Jumlah statement">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted">Masuk</p>
          <p className="font-display font-semibold tabular-nums text-accent">{formatMYR(fromSen(inSen))}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Keluar</p>
          <p className="font-display font-semibold tabular-nums text-danger">{formatMYR(fromSen(outSen))}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Bersih</p>
          <p className="font-display font-semibold tabular-nums">{formatMYR(fromSen(inSen - outSen))}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        {recorded} daripada {lines.length} baris sudah dalam rekod (tidak termasuk yang diabaikan).
      </p>
    </section>
  );
}

function DeleteStatementButton({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        aria-label="Padam statement"
        onClick={() => setConfirming(true)}
        className="grid size-12 shrink-0 place-items-center rounded-xl border border-line text-muted hover:text-danger"
      >
        <Trash2 className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={onDelete} className="min-h-12 rounded-xl bg-danger px-3 text-sm font-semibold text-white">
        Padam statement
      </button>
      <button type="button" aria-label="Batal" onClick={() => setConfirming(false)} className="grid size-12 place-items-center text-muted">
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
}

function MissingList({ items }: { items: Transaction[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center text-sm text-muted">
        Semua rekod dalam tempoh statement ada dalam bank.
      </p>
    );
  }
  return (
    <div className={card}>
      <p className="text-sm text-muted">
        Rekod anda dalam tempoh statement yang tiada dalam bank. Biasanya transaksi tunai, atau belum masuk bank.
      </p>
      <ul className="mt-2 divide-y divide-line/70">
        {items.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{txLabel(t)}</span>
              <span className="text-xs text-muted">{formatLongDate(t.transaction_date)}</span>
            </span>
            <Money amount={t.amount} incoming={t.transaction_type === 'income'} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineCard({
  line,
  busy,
  categories,
  loadCandidates,
  onAction,
  onMatch,
  onCreate,
}: {
  line: BankLine;
  busy: boolean;
  categories: { id: string; name: string; type: string }[];
  loadCandidates: () => Promise<Transaction[]>;
  onAction: (action: 'unmatch' | 'confirm' | 'ignore' | 'unignore') => void;
  onMatch: (transactionId: string) => void;
  onCreate: (categoryId: string) => void;
}) {
  const incoming = line.direction === 'in';
  const type = incoming ? 'income' : 'expense';
  const [mode, setMode] = useState<'none' | 'create' | 'match'>('none');
  const [categoryId, setCategoryId] = useState(
    () => categories.find((c) => c.type === type && c.name === 'Lain-lain')?.id ?? '',
  );
  const [candidates, setCandidates] = useState<Transaction[] | null>(null);
  const tx = line.transaction;

  async function openMatch() {
    setMode('match');
    setCandidates(null);
    setCandidates(await loadCandidates().catch(() => []));
  }

  const smallBtn =
    'inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold transition hover:border-accent disabled:opacity-50';

  return (
    <article className={`${card} ${busy ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Bank · {formatLongDate(line.line_date)}</p>
          <p className="mt-0.5 break-words font-medium">{line.description}</p>
        </div>
        <Money amount={line.amount} incoming={incoming} />
      </div>

      {tx && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Link2 className="size-3.5" aria-hidden />
              Rekod · {formatLongDate(tx.transaction_date)} · {line.match_type === 'auto' ? 'auto' : 'manual'}
            </p>
            <p className="mt-0.5 truncate font-medium">{txLabel(tx)}</p>
          </div>
          <Money amount={tx.amount} incoming={tx.transaction_type === 'income'} />
        </div>
      )}

      {line.needs_review && (
        <p className="mt-2 flex gap-1.5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Ada lebih dari satu rekod yang mungkin, atau tarikh jauh berbeza. Sila sahkan.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {tx ? (
          <>
            {line.needs_review && (
              <button type="button" disabled={busy} className={`${smallBtn} text-accent`} onClick={() => onAction('confirm')}>
                <CheckCircle2 className="size-4" aria-hidden />
                Sahkan
              </button>
            )}
            <button type="button" disabled={busy} className={smallBtn} onClick={() => onAction('unmatch')}>
              <Link2Off className="size-4" aria-hidden />
              Nyahpadan
            </button>
          </>
        ) : line.ignored ? (
          <button type="button" disabled={busy} className={smallBtn} onClick={() => onAction('unignore')}>
            <Undo2 className="size-4" aria-hidden />
            Batal abai
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} className={`${smallBtn} text-accent`} onClick={() => setMode(mode === 'create' ? 'none' : 'create')}>
              <Plus className="size-4" aria-hidden />
              Tambah sebagai transaksi
            </button>
            <button type="button" disabled={busy} className={smallBtn} onClick={() => (mode === 'match' ? setMode('none') : openMatch())}>
              <Link2 className="size-4" aria-hidden />
              Padankan
            </button>
            <button type="button" disabled={busy} className={`${smallBtn} text-muted`} onClick={() => onAction('ignore')}>
              Abaikan
            </button>
          </>
        )}
      </div>

      {mode === 'create' && !tx && (
        <div className="mt-3 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Kategori</span>
            <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Tiada kategori</option>
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" disabled={busy} className={`${primaryButton} shrink-0`} onClick={() => onCreate(categoryId)}>
            Simpan
          </button>
        </div>
      )}

      {mode === 'match' && !tx && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3">
          {candidates === null ? (
            <div className="flex justify-center py-3">
              <Spinner />
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted">
              Tiada rekod {incoming ? 'pendapatan' : 'perbelanjaan'} {formatMYR(line.amount)} yang belum dipadankan.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {candidates.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onMatch(c.id)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{txLabel(c)}</span>
                      <span className="text-xs text-muted">{formatLongDate(c.transaction_date)}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-accent">Pilih</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
