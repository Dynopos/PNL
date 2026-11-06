import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PNL_PERIODS, periodLabel, pnlPeriod, type PnlPeriodKind } from './pnl';

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Report period kept in the URL (?tempoh=month&langkah=-1), so links and the back button keep it. */
export function usePeriodParams(today: string, fallback: PnlPeriodKind = 'month') {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tempoh');
  const kind: PnlPeriodKind = raw === 'month' || raw === 'quarter' || raw === 'year' ? raw : fallback;
  const steps = Math.min(0, Math.trunc(Number(params.get('langkah')) || 0));
  const set = (k: PnlPeriodKind, s: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tempoh', k);
        next.set('langkah', String(Math.min(0, s)));
        return next;
      },
      { replace: true },
    );
  return {
    kind,
    steps,
    period: pnlPeriod(kind, today, today, steps),
    previous: pnlPeriod(kind, today, today, steps - 1),
    setKind: (k: PnlPeriodKind) => set(k, 0),
    setSteps: (s: number) => set(kind, s),
    /** Query string carrying the period, for links to other report pages. */
    query: `tempoh=${kind}&langkah=${steps}`,
  };
}

export function PeriodPicker({ state }: { state: ReturnType<typeof usePeriodParams> }) {
  const { kind, steps, period, setKind, setSteps } = state;
  return (
    <>
      <div role="tablist" aria-label="Jenis tempoh" className="grid grid-cols-3 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
        {PNL_PERIODS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="tab"
            aria-selected={kind === k.value}
            onClick={() => setKind(k.value)}
            className={`min-h-11 rounded-lg transition ${kind === k.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Tempoh sebelumnya"
          onClick={() => setSteps(steps - 1)}
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="text-center">
          <p className="font-display text-lg font-semibold">{periodLabel(kind, period.from)}</p>
          <p className="text-xs text-muted">
            {shortDate(period.from)} – {shortDate(period.to)}
            {!period.complete && ' · belum tamat'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Tempoh seterusnya"
          disabled={steps >= 0}
          onClick={() => setSteps(steps + 1)}
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink disabled:opacity-30"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
    </>
  );
}
