import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useAccount } from '../features/accounts/AccountProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { listStatementLineTotals, listStatementsInRange } from '../features/bank/api';
import { useCategories } from '../features/categories/useCategories';
import { fetchPeriodTransactions, postings } from '../features/reports/ledger';
import type { MonthRow } from '../features/reports/management';
import { PeriodPicker, usePeriodParams } from '../features/reports/PeriodPicker';
import { periodLabel } from '../features/reports/pnl';
import { buildReport, type Report } from '../features/reports/report';
import { ReportsNav } from '../features/reports/ReportsNav';
import { friendlyError, getCashflowSummary } from '../features/transactions/api';
import { useLoad } from '../lib/data';
import { addDays } from '../lib/dates';
import { dateInKL, formatMYR } from '../lib/locale';

const card = 'rounded-2xl border border-line bg-surface p-5';
const pending = () => new Promise<never>(() => {});
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatMYR(Math.abs(n))}`;
const plain = (n: number | null) =>
  n === null ? '—' : `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ROWS: { key: keyof MonthRow; label: string; strong?: boolean }[] = [
  { key: 'sales', label: 'Jualan' },
  { key: 'cogs', label: 'Kos Jualan' },
  { key: 'cogsAdvance', label: 'Pendahuluan Pembekal' },
  { key: 'grossProfit', label: 'Untung Kasar', strong: true },
  { key: 'opex', label: 'Perbelanjaan Operasi' },
  { key: 'operatingProfit', label: 'Untung Operasi', strong: true },
  { key: 'salary', label: 'Gaji Staff' },
  { key: 'financing', label: 'Pinjaman & Pembiayaan' },
  { key: 'netProfit', label: 'Untung Bersih', strong: true },
  { key: 'drawings', label: 'Ambilan Pemilik' },
  { key: 'netCash', label: 'Untung Tunai Bersih', strong: true },
];

export function ManagementPage() {
  const { client } = useAuth();
  const { account, error: accountError } = useAccount();
  const { categories } = useCategories();
  const accountId = account?.id;
  const today = dateInKL();
  const periodState = usePeriodParams(today, 'year');
  const { kind, period, query } = periodState;
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');

  const data = useLoad(async () => {
    if (!accountId) return pending();
    const [txs, before, statements] = await Promise.all([
      fetchPeriodTransactions(client, accountId, period.from, period.to),
      getCashflowSummary(client, accountId, '2000-01-01', addDays(period.from, -1)),
      listStatementsInRange(client, accountId, period.from, period.to),
    ]);
    const statementLines = await listStatementLineTotals(client, statements.map((s) => s.id));
    return { txs, opening: Number(before.net_cashflow), statements, statementLines };
  }, [client, accountId, period.from, period.to]);

  const label = periodLabel(kind, period.from);
  const report: Report | null = data.data
    ? buildReport({
        business: account?.account_name || 'Bisnes',
        periodLabel: label,
        from: period.from,
        to: period.to,
        today,
        opening: data.data.opening,
        posts: postings(data.data.txs, categories),
        categories,
        statements: data.data.statements,
        statementLines: data.data.statementLines,
      })
    : null;

  async function download(kind: 'excel' | 'pdf') {
    if (!report) return;
    setBusy(kind);
    setExportError('');
    try {
      if (kind === 'excel') await (await import('../features/reports/exportExcel')).downloadExcel(report);
      else (await import('../features/reports/exportPdf')).downloadPdf(report);
    } catch {
      setExportError('Fail tidak dapat dijana. Cuba lagi.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Laporan</h1>
      <ReportsNav />
      <PeriodPicker state={periodState} />

      {data.error || accountError ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {accountError || friendlyError(data.error)}
        </p>
      ) : !report ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${data.loading ? 'opacity-60' : ''}`}>
          <section className={`${card} relative overflow-hidden`} aria-label="Akaun pengurusan">
            <span className="brand-stripe absolute inset-x-0 top-0 h-1" aria-hidden />
            <h2 className="font-display text-lg font-semibold">Akaun Pengurusan</h2>
            <p className="text-sm text-muted">
              {report.business} · {label} · dasar tunai · {report.posts.length} transaksi
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Jualan" value={formatMYR(report.pnl.revenueTotal)} tone="text-accent" />
              <Stat label="Untung kasar" value={signed(report.pnl.grossProfit)} />
              <Stat label="Untung bersih" value={signed(report.pnl.netProfit)} strong />
              <Stat label="Untung tunai bersih" value={signed(report.pnl.netCash)} />
              <Stat label="Baki tunai akhir (rekod)" value={signed(report.cash.closing)} />
              <Stat label="Imbangan duga" value={report.tb.balanced ? 'Seimbang ✓' : 'Tidak seimbang'} />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy !== null || report.posts.length === 0}
                onClick={() => download('excel')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-3 font-display text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                {busy === 'excel' ? <Spinner /> : <FileSpreadsheet className="size-5" aria-hidden />}
                Excel
              </button>
              <button
                type="button"
                disabled={busy !== null || report.posts.length === 0}
                onClick={() => download('pdf')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line px-3 font-display text-sm font-semibold disabled:opacity-50"
              >
                {busy === 'pdf' ? <Spinner /> : <FileText className="size-5" aria-hidden />}
                PDF
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Excel: Nota, Carta Akaun, GL setiap akaun, Imbangan Duga, Ringkasan Bulanan, PNL, Semakan Baki. PDF: ringkasan untuk bank
              atau akauntan.
            </p>
            {exportError && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {exportError}
              </p>
            )}
          </section>

          <section className={`${card} px-0`} aria-label="Ringkasan bulanan">
            <h2 className="px-5 font-display font-semibold">Ringkasan Bulanan</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-max min-w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="sticky left-0 bg-surface px-5 py-1.5 text-left font-semibold">RM</th>
                    {report.monthly.rows.map((m) => (
                      <th key={m.month} className="px-3 py-1.5 text-right font-semibold">
                        {m.label}
                      </th>
                    ))}
                    <th className="px-5 py-1.5 text-right font-bold text-ink">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {ROWS.map((row) => (
                    <tr key={row.key} className={row.strong ? 'font-semibold' : ''}>
                      <td className="sticky left-0 whitespace-nowrap bg-surface px-5 py-1.5">{row.label}</td>
                      {report.monthly.rows.map((m) => (
                        <td key={m.month} className="px-3 py-1.5 text-right">
                          {plain(m[row.key] as number)}
                        </td>
                      ))}
                      <td className="px-5 py-1.5 text-right font-bold">{plain(report.monthly.total[row.key] as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 px-5 text-xs text-muted">
              Butiran:{' '}
              <Link to={`/laporan/pnl?${query}`} className="font-semibold text-accent">
                Untung Rugi
              </Link>{' '}
              ·{' '}
              <Link to={`/laporan/lejar?${query}`} className="font-semibold text-accent">
                Lejar Am & Imbangan Duga
              </Link>
            </p>
          </section>

          <section className={card} aria-label="Semakan baki bank">
            <h2 className="font-display font-semibold">Semakan Baki Bank</h2>
            <p className="text-xs text-muted">Baki awal + masuk − keluar, berbanding baki penutup dalam statement</p>
            {report.checks.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Tiada statement bank dalam tempoh ini.{' '}
                <Link to="/padanan" className="font-semibold text-accent">
                  Muat naik statement
                </Link>
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line/60">
                {report.checks.map((c) => (
                  <li key={c.label + c.from} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{c.label}</span>
                      {c.diff === null ? (
                        <span className="text-xs text-muted">Baki tidak tersedia</span>
                      ) : c.diff === 0 ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                          <CheckCircle2 className="size-4" aria-hidden /> Beza RM0.00
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                          <AlertTriangle className="size-4" aria-hidden /> Beza {signed(c.diff)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs tabular-nums text-muted">
                      Awal {plain(c.opening)} · Masuk {plain(c.totalIn)} · Keluar {plain(c.totalOut)} · Penutup {plain(c.closing)} ·{' '}
                      {c.inRecords}/{c.lines} baris dalam rekod
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card} aria-label="Nota dan andaian">
            <h2 className="font-display font-semibold">Nota & Andaian</h2>
            {report.notes.map((s) => (
              <div key={s.title} className="mt-3">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                  {s.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = '', strong = false }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-display tabular-nums ${strong ? 'text-lg font-bold' : 'font-semibold'} ${tone}`}>{value}</dd>
    </div>
  );
}
