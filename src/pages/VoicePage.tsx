import { CheckCircle2, Info, Mic, RotateCcw, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { inputClass, primaryButton, secondaryButton } from '../components/fieldStyles';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useCategories } from '../features/categories/useCategories';
import { deleteTransaction, friendlyError } from '../features/transactions/api';
import {
  listMerchantRules,
  parseTranscript,
  rememberMerchant,
  saveTransactions,
  type ParseSource,
} from '../features/voice/api';
import { ReviewCard } from '../features/voice/ReviewCard';
import {
  applyChosenDate,
  canAutoSave,
  ruleLabel,
  toReviewItems,
  validateReviewItem,
  type ReviewErrors,
  type ReviewItem,
} from '../features/voice/review';
import { speechErrorMessage, useSpeechRecognition } from '../features/voice/useSpeechRecognition';
import { useInvalidate, useLoad } from '../lib/data';
import { addDays } from '../lib/dates';
import { dateInKL, formatLongDate, formatMYR } from '../lib/locale';
import type { EntryType } from '../lib/types';

interface SavedRow {
  id: string;
  type: EntryType;
  amount: string;
  label: string;
  date: string;
}

type Phase =
  | { name: 'idle'; message?: string }
  | { name: 'processing'; transcript: string }
  | {
      name: 'review';
      transcript: string;
      source: ParseSource;
      items: ReviewItem[];
      errors: Record<string, ReviewErrors>;
      saving: boolean;
      saveError: string;
    }
  | { name: 'saved'; rows: SavedRow[]; auto: boolean; undoing?: boolean; undoError?: string };

const SOURCE_LABEL: Record<ParseSource, string> = {
  ai: 'Dianalisis oleh AI',
  rules: 'Analisis asas (AI tidak tersedia)',
  local: 'Analisis dalam peranti (pelayan tidak dapat dihubungi)',
};

const EXAMPLES = ['“Mydin 55 ringgit”', '“Jualan hari ini 1500 ringgit”', '“Semalam petrol 60, makan 15”'];

export function VoicePage() {
  const { client, session } = useAuth();
  const { account } = useAccount();
  const { categories } = useCategories();
  const invalidate = useInvalidate();
  const rules = useLoad(() => listMerchantRules(client), [client]);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [typed, setTyped] = useState('');
  const [params, setParams] = useSearchParams();
  const today = dateInKL();
  const [entryDate, setEntryDate] = useState(today);

  const speech = useSpeechRecognition((text) => void process(text));

  // Arriving from a mic button: start listening straight away (still within the tap's user activation).
  useEffect(() => {
    if (params.get('mula') !== '1') return;
    setParams({}, { replace: true });
    if (speech.supported) speech.start();
  }, []);

  async function save(items: ReviewItem[], transcript: string, source: ParseSource, auto: boolean) {
    const results = items.map((i) => ({ item: i, check: validateReviewItem(i, today) }));
    const errors: Record<string, ReviewErrors> = {};
    for (const r of results) if (!r.check.ok) errors[r.item.key] = r.check.errors;
    if (Object.keys(errors).length || !account) {
      setPhase({ name: 'review', transcript, source, items, errors, saving: false, saveError: account ? '' : 'Akaun belum sedia.' });
      return;
    }
    const values = results.map((r) => (r.check.ok ? r.check.value : null)).filter((v) => v !== null);
    setPhase({ name: 'review', transcript, source, items, errors: {}, saving: true, saveError: '' });
    try {
      const saved = await saveTransactions(client, account.id, values);
      await Promise.allSettled(
        items
          .filter((i) => i.categoryTouched && i.remember && i.categoryId && ruleLabel(i))
          .map((i) => rememberMerchant(client, session!.user.id, ruleLabel(i), i.categoryId)),
      );
      invalidate();
      const byKey = new Map(saved.map((s) => [s.item_key, s.transaction_id]));
      setPhase({
        name: 'saved',
        auto,
        rows: values.map((v) => ({
          id: byKey.get(v.idempotency_key)!,
          type: v.transaction_type,
          amount: v.amount,
          label: v.merchant || v.description || 'Transaksi',
          date: v.transaction_date,
        })),
      });
    } catch (err) {
      setPhase({ name: 'review', transcript, source, items, errors: {}, saving: false, saveError: friendlyError(err) });
    }
  }

  const busy = useRef(false);
  async function process(transcript: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      await handleTranscript(transcript);
    } finally {
      busy.current = false;
    }
  }

  async function handleTranscript(transcript: string) {
    setPhase({ name: 'processing', transcript });
    const outcome = await parseTranscript(client, transcript);
    if (outcome.transactions.length === 0) {
      setPhase({ name: 'idle', message: 'Tiada transaksi dikenal pasti. Cuba sebut kedai dan jumlah, contohnya “Mydin 55 ringgit”.' });
      return;
    }
    const dated = applyChosenDate(outcome.transactions, outcome.today ?? today, entryDate);
    const items = toReviewItems(dated, crypto.randomUUID(), categories, rules.data ?? []);
    if (canAutoSave(items, today)) await save(items, transcript, outcome.source, true);
    else setPhase({ name: 'review', transcript, source: outcome.source, items, errors: {}, saving: false, saveError: '' });
  }

  async function undo() {
    if (phase.name !== 'saved') return;
    setPhase({ ...phase, undoing: true, undoError: '' });
    try {
      for (const row of phase.rows) await deleteTransaction(client, row.id);
      invalidate();
      setPhase({ name: 'idle', message: 'Rekod dibatalkan.' });
    } catch (err) {
      setPhase({ ...phase, undoing: false, undoError: friendlyError(err) });
    }
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    void process(text);
  }

  const updateItem = (key: string, patch: Partial<ReviewItem>) =>
    phase.name === 'review' &&
    setPhase({
      ...phase,
      items: phase.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
      errors: { ...phase.errors, [key]: {} },
    });

  const removeItem = (key: string) =>
    phase.name === 'review' && setPhase({ ...phase, items: phase.items.filter((i) => i.key !== key) });

  // ── review ─────────────────────────────────────────────────────────────────
  if (phase.name === 'review') {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Semak sebelum simpan</h1>
          <p className="mt-1 text-sm text-muted">“{phase.transcript}”</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5" aria-hidden />
            {SOURCE_LABEL[phase.source]}
          </p>
        </div>

        {phase.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center text-sm text-muted">
            Semua transaksi telah dibuang.
          </p>
        ) : (
          phase.items.map((item, idx) => (
            <ReviewCard
              key={item.key}
              item={item}
              index={idx}
              errors={phase.errors[item.key] ?? {}}
              categories={categories}
              today={today}
              onChange={(patch) => updateItem(item.key, patch)}
              onRemove={() => removeItem(item.key)}
            />
          ))
        )}

        {phase.saveError && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {phase.saveError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={secondaryButton} onClick={() => setPhase({ name: 'idle' })} disabled={phase.saving}>
            Batal
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={phase.saving || phase.items.length === 0}
            onClick={() => save(phase.items, phase.transcript, phase.source, false)}
          >
            {phase.saving ? 'Menyimpan…' : `Simpan ${phase.items.length > 1 ? `semua (${phase.items.length})` : ''}`}
          </button>
        </div>
      </div>
    );
  }

  // ── saved ──────────────────────────────────────────────────────────────────
  if (phase.name === 'saved') {
    return (
      <div className="space-y-4">
        <section className="rounded-3xl border border-line bg-surface p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-accent" aria-hidden />
          <h1 className="mt-3 font-display text-xl font-semibold">
            {phase.rows.length > 1 ? `${phase.rows.length} transaksi disimpan` : 'Transaksi disimpan'}
          </h1>
          <ul className="mt-4 divide-y divide-line/70 text-left text-sm">
            {phase.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.label}</span>
                  <span className="text-xs text-muted">
                    {r.type === 'income' ? 'Pendapatan' : 'Perbelanjaan'}
                    {r.date !== today && ` · ${formatLongDate(r.date)}`}
                  </span>
                </span>
                <span className={`font-display font-semibold tabular-nums ${r.type === 'income' ? 'text-accent' : ''}`}>
                  {r.type === 'income' ? '+' : '−'}
                  {formatMYR(r.amount)}
                </span>
              </li>
            ))}
          </ul>
          {phase.auto && (
            <button
              type="button"
              onClick={undo}
              disabled={phase.undoing}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              <RotateCcw className="size-4" aria-hidden />
              {phase.undoing ? 'Membatalkan…' : 'Salah? Batalkan'}
            </button>
          )}
          {phase.undoError && <p className="mt-2 text-sm text-danger">{phase.undoError}</p>}
        </section>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/transaksi" className={`${secondaryButton} grid place-items-center`}>
            Lihat transaksi
          </Link>
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setPhase({ name: 'idle' });
              speech.start();
            }}
          >
            Rekod lagi
          </button>
        </div>
      </div>
    );
  }

  // ── idle / listening / processing ─────────────────────────────────────────
  const processing = phase.name === 'processing';
  const live = processing ? phase.transcript : speech.transcript;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Rekod dengan suara</h1>

      <DatePicker today={today} value={entryDate} onChange={setEntryDate} disabled={processing} />

      <section className="flex flex-col items-center rounded-3xl border border-line bg-surface px-6 py-8 text-center">
        {processing ? (
          <div className="grid size-28 place-items-center">
            <Spinner />
          </div>
        ) : (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={!speech.supported}
            aria-label={speech.listening ? 'Berhenti merakam' : 'Mula merakam'}
            className={`mic-brand grid size-28 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 ${
              speech.listening ? 'animate-pulse' : ''
            }`}
          >
            {speech.listening ? <Square className="size-9 fill-current" aria-hidden /> : <Mic className="size-11" aria-hidden />}
          </button>
        )}

        <p className="mt-6 font-display text-lg font-semibold" role="status" aria-live="polite">
          {processing ? 'Menganalisis…' : speech.listening ? 'Mendengar… tekan untuk berhenti' : 'Tekan dan sebut transaksi'}
        </p>
        {live ? (
          <p className="mt-3 w-full rounded-xl bg-surface-2 px-4 py-3 text-left text-base">{live}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">{EXAMPLES.join(' · ')}</p>
        )}

        {(speech.error || !speech.supported) && !speech.listening && !processing && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {speechErrorMessage(speech.supported ? speech.error! : 'unsupported')}
          </p>
        )}
        {phase.name === 'idle' && phase.message && <p className="mt-4 text-sm text-muted">{phase.message}</p>}
      </section>

      <form onSubmit={submitTyped} className="rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="typed-transcript" className="text-sm font-medium text-muted">
          Atau taip ayat
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="typed-transcript"
            className={inputClass}
            maxLength={500}
            placeholder="cth: Mydin 55, Petronas 60"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={processing}
          />
          <button type="submit" className={`${primaryButton} shrink-0`} disabled={processing || !typed.trim()}>
            Proses
          </button>
        </div>
      </form>

      <p className="flex gap-2 px-1 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Suara ditukar kepada teks oleh pelayar anda (contohnya Chrome menggunakan perkhidmatan Google). Hanya teks itu
        dihantar ke pelayan VAPRO dan dianalisis oleh AI (Anthropic) untuk mengenal pasti jumlah, kategori dan tarikh.
        Rakaman suara tidak disimpan.
      </p>
    </div>
  );
}

function DatePicker({
  today,
  value,
  onChange,
  disabled,
}: {
  today: string;
  value: string;
  onChange: (date: string) => void;
  disabled: boolean;
}) {
  const presets = [
    { label: 'Hari ini', date: today },
    { label: 'Semalam', date: addDays(today, -1) },
    { label: 'Kelmarin', date: addDays(today, -2) },
  ];
  const custom = !presets.some((p) => p.date === value);
  const chip = (active: boolean) =>
    `min-h-10 min-w-0 truncate rounded-full border px-1 text-xs font-semibold min-[360px]:text-[13px] transition ${
      active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted'
    }`;
  return (
    <section aria-label="Tarikh transaksi">
      <p className="mb-2 text-sm font-medium text-muted">
        Tarikh transaksi: <span className="font-semibold text-ink">{formatLongDate(value)}</span>
      </p>
      <div className="grid grid-cols-4 gap-1 min-[360px]:gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            aria-pressed={value === p.date}
            onClick={() => onChange(p.date)}
            className={chip(value === p.date)}
          >
            {p.label}
          </button>
        ))}
        <label className={`${chip(custom)} relative flex items-center justify-center`}>
          {custom ? shortDate(value) : 'Lain…'}
          <input
            type="date"
            max={today}
            value={value}
            disabled={disabled}
            onChange={(e) => e.target.value && e.target.value <= today && onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Pilih tarikh lain"
          />
        </label>
      </div>
    </section>
  );
}

/** "12 Okt": fits a chip; the full date is shown in the label above. */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
