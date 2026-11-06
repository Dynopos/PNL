import { ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { PeriodPicker, usePeriodParams } from '../features/reports/PeriodPicker';
import { useCategories } from '../features/categories/useCategories';
import { buildPnl, change, periodLabel, type PnlSection } from '../features/reports/pnl';
import { ReportsNav } from '../features/reports/ReportsNav';
import { friendlyError, getTotalsByCategory } from '../features/transactions/api';
import { useLoad } from '../lib/data';
import { dateInKL, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';
const pending = () => new Promise<never>(() => {});
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
const pct = (f: number) => `${(f * 100).toLocaleString('ms-MY', { maximumFractionDigits: 1 })}%`;

export function PnlPage() {
  const { client } = useAuth();
  const { account, error: accountError } = useAccount();
  const accountId = account?.id;
  const today = dateInKL();
  const periodState = usePeriodParams(today);
  const { kind, period, previous, query } = periodState;
  const ledgerLink = (code: string, key?: string) =>
    `/laporan/lejar?akaun=${code}${key ? `&kategori=${encodeURIComponent(key)}` : ''}&${query}`;
  const { categories } = useCategories();

  const report = useLoad(async () => {
    if (!accountId) return pending();
    const [inc, exp, prevInc, prevExp] = await Promise.all([
      getTotalsByCategory(client, accountId, period.from, period.to, 'income'),
      getTotalsByCategory(client, accountId, period.from, period.to, 'expense'),
      getTotalsByCategory(client, accountId, previous.from, previous.to, 'income'),
      getTotalsByCategory(client, accountId, previous.from, previous.to, 'expense'),
    ]);
    return { inc, exp, prevInc, prevExp };
  }, [client, accountId, period.from, period.to, previous.from]);

  const d = report.data;
  const p = d ? buildPnl(d.inc, d.exp, categories) : undefined;
  const prev = d ? buildPnl(d.prevInc, d.prevExp, categories) : undefined;
  const delta = p && prev && !prev.empty ? change(p.netProfit, prev.netProfit) : null;
  const profit = (p?.netProfit ?? 0) >= 0;
  const share = p?.margin !== null;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Laporan</h1>
      <ReportsNav />

      <PeriodPicker state={periodState} />

      {report.error || accountError ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {accountError || friendlyError(report.error)}
        </p>
      ) : !p || !prev ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : p.empty ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
          <p className="font-semibold">Tiada transaksi dalam {periodLabel(kind, period.from)}</p>
          <p className="mt-1 text-sm text-muted">Rekod pendapatan dan perbelanjaan, atau masukkan statement bank, untuk melihat untung rugi.</p>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
          <section className={`${card} relative overflow-hidden`} aria-label="Untung bersih">
            <span className="brand-stripe absolute inset-x-0 top-0 h-1" aria-hidden />
            <p className="text-sm font-medium text-muted">{profit ? 'Untung bersih' : 'Rugi bersih'}</p>
            <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${profit ? 'text-accent' : 'text-danger'}`}>
              {signed(p.netProfit)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {p.margin !== null ? `Margin ${pct(p.margin)} daripada jualan` : 'Tiada jualan dalam tempoh ini'}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Untung kasar</dt>
                <dd className="font-semibold tabular-nums">{signed(p.grossProfit)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Untung tunai bersih</dt>
                <dd className="font-semibold tabular-nums">{signed(p.netCash)}</dd>
              </div>
            </dl>
            {delta !== null && (
              <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${delta >= 0 ? 'text-accent' : 'text-danger'}`}>
                {delta >= 0 ? <TrendingUp className="size-4 shrink-0" aria-hidden /> : <TrendingDown className="size-4 shrink-0" aria-hidden />}
                <span>
                  {delta >= 0 ? 'Naik' : 'Turun'} {pct(Math.abs(delta))} berbanding {periodLabel(kind, previous.from)} ({signed(prev.netProfit)})
                  {!period.complete && ' · tempoh ini belum tamat'}
                </span>
              </p>
            )}
          </section>

          <section className={card} aria-label="Penyata untung rugi">
            <h2 className="font-display font-semibold">Penyata Untung Rugi</h2>
            <p className="text-xs text-muted">{account?.account_name ?? 'Bisnes'} · {periodLabel(kind, period.from)} · asas tunai</p>

            <Section s={p.sales} showShare={false} link={ledgerLink} empty="Tiada jualan" />
            <Total label="Jumlah jualan" amount={p.revenueTotal} />

            {(p.cogs.count > 0 || p.cogsAdvance.count > 0) && (
              <>
                <Section s={p.cogs} showShare={share} link={ledgerLink} />
                <Section s={p.cogsAdvance} showShare={share} link={ledgerLink} />
                <Total label="Jumlah kos jualan" amount={-p.costOfSales} />
              </>
            )}
            <Result label="UNTUNG KASAR" english="Gross Profit" amount={p.grossProfit} />

            <Section s={p.opex} showShare={share} link={ledgerLink} empty="Tiada perbelanjaan operasi" />
            <Total label="Jumlah perbelanjaan operasi" amount={-p.opex.total} />
            <Result label="UNTUNG OPERASI" english="Operating Profit" amount={p.operatingProfit} />

            <Section s={p.salary} showShare={share} link={ledgerLink} />
            <Section s={p.financing} showShare={share} link={ledgerLink} />
            <Result label={profit ? 'UNTUNG BERSIH' : 'RUGI BERSIH'} english="Net Profit" amount={p.netProfit} strong />

            <Section s={p.drawings} showShare={false} link={ledgerLink} note="Duit bisnes untuk kegunaan peribadi; bukan belanja bisnes" />
            <Result label="UNTUNG TUNAI BERSIH" english="Net Cash Profit" amount={p.netCash} />

            <p className="mt-4 text-xs text-muted">
              Asas tunai: dikira ikut tarikh duit masuk dan keluar, termasuk baris statement bank yang sudah masuk rekod. Susunan
              ikut General Ledger Dynopos: Jualan − Kos Jualan = Untung Kasar; − Perbelanjaan Operasi = Untung Operasi; − Gaji Staff −
              Pinjaman = Untung Bersih; − Ambilan Pemilik = Untung Tunai Bersih.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Section({
  s,
  showShare,
  link,
  empty,
  note,
}: {
  s: PnlSection;
  showShare: boolean;
  link: (code: string, key?: string) => string;
  empty?: string;
  note?: string;
}) {
  if (s.lines.length === 0 && !empty) return null;
  return (
    <>
      <h3 className="mt-5 flex items-baseline justify-between gap-2 border-b border-line pb-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <Link to={link(s.code)} className="hover:text-accent">
          {s.code} {s.name}
        </Link>
        {s.lines.length > 1 && <span className="tabular-nums normal-case tracking-normal">{formatMYR(s.total)}</span>}
      </h3>
      {note && <p className="pt-1 text-xs text-muted">{note}</p>}
      {s.lines.length === 0 ? (
        <p className="py-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {s.lines.map((l) => (
            <li key={l.key}>
              <Link to={link(s.code, l.key)} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{l.label}</span>
                  <span className="text-xs text-muted">
                    {l.count} transaksi
                    {showShare && l.ofRevenue !== null && ` · ${pct(l.ofRevenue)} jualan`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMYR(l.amount)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-sm font-semibold">
      <span>{label}</span>
      <span className="tabular-nums">{signed(amount)}</span>
    </div>
  );
}

function Result({ label, english, amount, strong = false }: { label: string; english: string; amount: number; strong?: boolean }) {
  const tone = amount >= 0 ? 'text-accent' : 'text-danger';
  return (
    <div className={`mt-4 flex items-baseline justify-between gap-3 py-2.5 ${strong ? 'border-y-4 border-double border-line' : 'border-y border-line bg-surface-2/60 px-2'}`}>
      <span>
        <span className="block font-display text-sm font-bold">{label}</span>
        <span className="text-xs text-muted">{english}</span>
      </span>
      <span className={`font-display font-bold tabular-nums ${strong ? 'text-lg' : ''} ${tone}`}>{signed(amount)}</span>
    </div>
  );
}
