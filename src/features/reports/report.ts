import type { Category } from '../../lib/types';
import { CASH_ACCOUNT, CASH_NAME, GL_ACCOUNTS, glOf } from './gl';
import { accountLedger, cashLedger, describeTx, glSummaries, trialBalance, type Ledger, type Posting } from './ledger';
import { bankCheck, buildNotes, categoryTotals, monthlySummary, monthsBetween, type StatementInput, type StatementLineInput } from './management';
import { buildPnl } from './pnl';

/** Everything the management account page, Excel and PDF show, built once from the period's data. */
export function buildReport(input: {
  business: string;
  periodLabel: string;
  from: string;
  to: string;
  today: string;
  opening: number;
  posts: Posting[];
  categories: Category[];
  statements: StatementInput[];
  statementLines: StatementLineInput[];
}) {
  const { posts, categories } = input;
  // Start at the first month with records, so a business that began mid-year has no run of empty months.
  const first = posts.reduce<string | null>((m, p) => (m === null || p.tx.transaction_date < m ? p.tx.transaction_date : m), null);
  const start = first && first > input.from ? `${first.slice(0, 7)}-01` : input.from;
  const months = monthsBetween(start, input.to < input.today ? input.to : input.today);
  const monthly = monthlySummary(posts, months);
  const { income, expense } = categoryTotals(posts);
  const pnl = buildPnl(income, expense, categories);
  const cash = cashLedger(posts, input.opening);
  const ledgers: Ledger[] = glSummaries(posts).map((s) => accountLedger(posts, s.code));
  const tb = trialBalance(posts);
  const checks = bankCheck(input.statements, input.statementLines);
  const notes = buildNotes({
    business: input.business,
    periodLabel: input.periodLabel,
    posts,
    months: monthly.rows,
    checks,
    startedLate: start > input.from,
  });
  const chart = [
    { code: CASH_ACCOUNT, name: CASH_NAME, english: 'Cash at Bank', kind: 'Aset', normal: 'Debit', categories: '' },
    ...GL_ACCOUNTS.map((a) => ({
      code: a.code,
      name: a.name,
      english: a.english,
      kind: a.kind,
      normal: a.normal === 'debit' ? 'Debit' : 'Kredit',
      categories: categories
        .filter((c) => glOf(c, c.type) === a.code)
        .map((c) => c.name)
        .join(', '),
    })),
  ];
  return { ...input, months, monthly, pnl, cash, ledgers, tb, checks, notes, chart };
}

export type Report = ReturnType<typeof buildReport>;

export const reportFileName = (r: Pick<Report, 'business' | 'from' | 'to'>, ext: string) =>
  `Akaun-Pengurusan-${r.business}-${r.from}-${r.to}`.replace(/[^\p{L}\p{N}-]+/gu, '-') + `.${ext}`;

export { describeTx };
