import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Download, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useCategories } from '../features/categories/useCategories';
import { CASH_ACCOUNT, CASH_NAME, GL_BY_CODE, type GlCode } from '../features/reports/gl';
import {
  accountLedger,
  cashLedger,
  describeTx,
  fetchPeriodTransactions,
  glSummaries,
  ledgerCsv,
  postings,
  trialBalance,
  type Ledger,
} from '../features/reports/ledger';
import { PeriodPicker, usePeriodParams } from '../features/reports/PeriodPicker';
import { periodLabel } from '../features/reports/pnl';
import { ReportsNav } from '../features/reports/ReportsNav';
import { friendlyError, getCashflowSummary } from '../features/transactions/api';
import { useLoad } from '../lib/data';
import { addDays } from '../lib/dates';
import { dateInKL, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';
const pending = () => new Promise<never>(() => {});
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
const plain = (n: number) => (n ? n.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const dayMonth = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const PAGE = 200;
const SOURCE: Record<string, string> = { bank: 'Bank', voice: 'Suara', manual: 'Manual' };

export function LedgerPage() {
  const { client } = useAuth();
  const { account, error: accountError } = useAccount();
  const { categories } = useCategories();
  const accountId = account?.id;
  const today = dateInKL();
  const periodState = usePeriodParams(today);
  const { kind, period, query } = periodState;
  const [params] = useSearchParams();
  const selected = params.get('akaun');
  const categoryKey = params.get('kategori');

  const data = useLoad(async () => {
    if (!accountId) return pending();
    const [txs, before] = await Promise.all([
      fetchPeriodTransactions(client, accountId, period.from, period.to),
      getCashflowSummary(client, accountId, '2000-01-01', addDays(period.from, -1)),
    ]);
    return { txs, opening: Number(before.net_cashflow) };
  }, [client, accountId, period.from, period.to]);

  const posts = data.data ? postings(data.data.txs, categories) : [];
  const summaries = glSummaries(posts);
  const cash = data.data ? cashLedger(posts, data.data.opening) : null;
  const link = (code: string | null, key?: string | null) =>
    `/laporan/lejar?${code ? `akaun=${code}&` : ''}${key ? `kategori=${encodeURIComponent(key)}&` : ''}${query}`;
  const glCode = selected && selected !== CASH_ACCOUNT && GL_BY_CODE.has(selected as GlCode) ? (selected as GlCode) : null;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Laporan</h1>
      <ReportsNav />
      <PeriodPicker state={periodState} />

      {data.error || accountError ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {accountError || friendlyError(data.error)}
        </p>
      ) : !data.data || !cash ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : selected === CASH_ACCOUNT || glCode ? (
        <AccountView
          key={`${selected}:${categoryKey}:${period.from}:${kind}`}
          ledger={glCode ? accountLedger(posts, glCode, categoryKey) : cash}
          cash={!glCode}
          categories={glCode ? (summaries.find((s) => s.code === glCode)?.categories ?? []) : []}
          categoryKey={categoryKey}
          link={(key) => link(selected, key)}
          back={link(null)}
          fileName={`gl-${selected}${categoryKey ? '-kategori' : ''}-${period.from.slice(0, 7)}`}
          loading={data.loading}
        />
      ) : (
        <Index
          cash={cash}
          summaries={summaries}
          posts={posts}
          link={link}
          label={periodLabel(kind, period.from)}
          loading={data.loading}
        />
      )}
    </div>
  );
}

function Index({
  cash,
  summaries,
  posts,
  link,
  label,
  loading,
}: {
  cash: Ledger;
  summaries: ReturnType<typeof glSummaries>;
  posts: ReturnType<typeof postings>;
  link: (code: string | null, key?: string | null) => string;
  label: string;
  loading: boolean;
}) {
  const tb = trialBalance(posts);
  return (
    <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <Link to={link(CASH_ACCOUNT)} className={`${card} block transition hover:border-accent`}>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <BookOpen className="size-5" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block font-display font-semibold">
              {CASH_ACCOUNT} {CASH_NAME}
            </span>
            <span className="block text-xs text-muted">
              {cash.rows.length} transaksi · {label}
            </span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Stat label="Baki awal" value={signed(cash.opening)} />
          <Stat label="Baki akhir" value={signed(cash.closing)} strong />
          <Stat label="Debit (masuk)" value={formatMYR(cash.totalDebit)} tone="text-accent" />
          <Stat label="Kredit (keluar)" value={formatMYR(cash.totalCredit)} tone="text-danger" />
        </dl>
      </Link>

      <section className={card} aria-label="Carta akaun">
        <h2 className="font-display font-semibold">Akaun lejar</h2>
        {summaries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Tiada transaksi dalam tempoh ini.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/60">
            {summaries.map((a) => (
              <li key={a.code}>
                <Link to={link(a.code)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                  <span className="w-11 shrink-0 font-mono text-xs text-muted">{a.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {a.count} transaksi · {a.categories.map((c) => c.name).join(', ')}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatMYR(a.total)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-label="Imbangan duga">
        <h2 className="font-display font-semibold">Imbangan Duga</h2>
        <p className="text-xs text-muted">Trial Balance · pergerakan {label}</p>
        <table className="mt-3 w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-1.5 font-semibold">Akaun</th>
              <th className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold">Debit</th>
              <th className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold">Kredit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {tb.rows
              .filter((r) => r.debit || r.credit)
              .map((r) => (
                <tr key={r.code}>
                  <td className="py-1.5 pr-2">
                    <span className="font-mono text-xs text-muted">{r.code}</span> {r.name}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right">{plain(r.debit)}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right">{plain(r.credit)}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="border-t-4 border-double border-line font-bold">
              <td className="py-2">Jumlah</td>
              <td className="whitespace-nowrap py-2 pl-3 text-right">{plain(tb.debit)}</td>
              <td className="whitespace-nowrap py-2 pl-3 text-right">{plain(tb.credit)}</td>
            </tr>
          </tfoot>
        </table>
        {tb.balanced && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent">
            <CheckCircle2 className="size-4" aria-hidden />
            Seimbang: Debit = Kredit
          </p>
        )}
      </section>

      <p className="text-xs text-muted">
        Baki dikira daripada rekod dalam DuitVoice (asas tunai), bukan baki sebenar dalam bank. Baki awal ialah jumlah bersih semua
        rekod sebelum tempoh ini.
      </p>
    </div>
  );
}

function Stat({ label, value, tone = '', strong = false }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''} ${tone}`}>{value}</dd>
    </div>
  );
}

function AccountView({
  ledger,
  cash,
  categories,
  categoryKey,
  link,
  back,
  fileName,
  loading,
}: {
  ledger: Ledger;
  cash: boolean;
  categories: { key: string; name: string; total: number; count: number }[];
  categoryKey: string | null;
  link: (key: string | null) => string;
  back: string;
  fileName: string;
  loading: boolean;
}) {
  const [shown, setShown] = useState(PAGE);
  const acct = GL_BY_CODE.get(ledger.code as GlCode);
  const chosen = categories.find((c) => c.key === categoryKey);

  function download() {
    const blob = new Blob([`﻿${ledgerCsv(ledger)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <Link to={back} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent">
        <ArrowLeft className="size-4" aria-hidden />
        Semua akaun
      </Link>

      <section className={card} aria-label="Ringkasan akaun">
        <h2 className="font-display text-lg font-semibold">{ledger.title}</h2>
        <p className="text-sm text-muted">
          {cash ? 'Debit = duit masuk, Kredit = duit keluar' : acct ? `${acct.english} · baki normal ${acct.normal === 'debit' ? 'Debit' : 'Kredit'}` : ''}
        </p>
        {categories.length > 1 && (
          <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" aria-label="Tapis kategori">
            {chosen ? (
              <Link
                to={link(null)}
                className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-accent bg-accent-soft px-3 text-xs font-semibold text-accent"
              >
                {chosen.name}
                <X className="size-3.5" aria-label="Buang tapisan" />
              </Link>
            ) : (
              categories.map((c) => (
                <Link
                  key={c.key}
                  to={link(c.key)}
                  className="flex min-h-9 shrink-0 items-center rounded-full border border-line px-3 text-xs font-semibold text-muted"
                >
                  {c.name}
                </Link>
              ))
            )}
          </div>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {cash ? (
            <>
              <Stat label="Baki awal" value={signed(ledger.opening)} />
              <Stat label="Baki akhir" value={signed(ledger.closing)} strong />
              <Stat label="Debit (masuk)" value={formatMYR(ledger.totalDebit)} tone="text-accent" />
              <Stat label="Kredit (keluar)" value={formatMYR(ledger.totalCredit)} tone="text-danger" />
            </>
          ) : (
            <>
              <Stat label={chosen ? `Jumlah ${chosen.name}` : 'Baki akaun'} value={formatMYR(ledger.closing)} strong />
              <Stat label="Transaksi" value={String(ledger.rows.length)} />
            </>
          )}
        </dl>
        {ledger.rows.length > 0 && (
          <button
            type="button"
            onClick={download}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold transition hover:border-accent"
          >
            <Download className="size-4" aria-hidden />
            Muat turun CSV
          </button>
        )}
      </section>

      {ledger.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center text-sm text-muted">
          Tiada transaksi dalam tempoh ini.
        </p>
      ) : (
        <section className={`${card} p-0`} aria-label="Catatan lejar">
          <div className="flex justify-between gap-3 border-b border-line px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted">
            <span>Tarikh · Butiran</span>
            <span>Dr / Kr · Baki</span>
          </div>
          <ul className="divide-y divide-line/60">
            {ledger.rows.slice(0, shown).map((r) => (
              <li key={r.tx.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{describeTx(r.tx)}</span>
                  <span className="block truncate text-xs text-muted">
                    {dayMonth(r.tx.transaction_date)} · {cash ? r.contra : r.category} · {SOURCE[r.tx.source] ?? r.tx.source}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={`block font-semibold ${r.debit && cash ? 'text-accent' : ''}`}>
                    {r.debit ? `Dr ${plain(r.debit)}` : `Kr ${plain(r.credit)}`}
                  </span>
                  <span className="block text-xs text-muted">{signed(r.balance)}</span>
                </span>
              </li>
            ))}
          </ul>
          {ledger.rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="w-full border-t border-line py-3 text-sm font-semibold text-accent"
            >
              Tunjuk lagi ({ledger.rows.length - shown} lagi)
            </button>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-4 border-double border-line px-4 py-3 text-sm font-bold tabular-nums">
            <span>Jumlah</span>
            <span className="ml-auto flex flex-wrap justify-end gap-x-4">
              <span className="whitespace-nowrap">Dr {plain(ledger.totalDebit)}</span>
              <span className="whitespace-nowrap">Kr {plain(ledger.totalCredit)}</span>
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
