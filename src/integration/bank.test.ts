// @vitest-environment node
// Runs only under supabase/tests/integration.sh (local Postgres + PostgREST).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import {
  createTransactionFromLine,
  deleteStatement,
  importStatement,
  listLines,
  listStatements,
  listUnreconciled,
  matchCandidates,
  matchLine,
  updateLine,
} from '../features/bank/api';
import { parseStatementText } from '../features/bank/statementParser';
import { createTransaction, ensureAccount, listCategories, listTransactions } from '../features/transactions/api';

const URL = process.env.PGRST_URL;
const SECRET = process.env.PGRST_JWT_SECRET ?? '';
const EVA = 'eeeeeeee-0000-0000-0000-000000000005';

function clientFor(userId: string): SupabaseClient {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const token = `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
  return createClient(URL!, token, {
    accessToken: async () => token,
    global: { fetch: (input, init) => fetch(String(input).replace('/rest/v1', ''), init) },
  });
}

const STATEMENT = `CIMB BANK BERHAD
OPENING BALANCE 1,000.00
01/10/2026 IBG CREDIT SYARIKAT ABC 800.00 1,800.00
02/10/2026 DEBIT CARD MYDIN 55.00 1,745.00
05/10/2026 SERVICE CHARGE 2.00 1,743.00
CLOSING BALANCE 1,743.00`;

describe.skipIf(!URL)('bank reconciliation through PostgREST', () => {
  let eva: SupabaseClient;
  let account = '';

  beforeAll(async () => {
    eva = clientFor(EVA);
    account = (await ensureAccount(eva, EVA, 'business')).id;
    const tx = (over: Record<string, unknown>, key: string) =>
      createTransaction(eva, EVA, account, { transaction_type: 'expense', amount: '1.00', merchant: null, description: null, category_id: null, transaction_date: '2026-10-01', ...over } as never, key);
    await tx({ transaction_type: 'income', amount: '800.00', merchant: 'Syarikat ABC', transaction_date: '2026-09-30' }, 'manual:eva-1');
    await tx({ amount: '55.00', merchant: 'Mydin', transaction_date: '2026-10-02' }, 'manual:eva-2');
    await tx({ amount: '30.00', merchant: 'Tunai pasar', transaction_date: '2026-10-03' }, 'manual:eva-3');
  });

  it('imports a parsed statement and auto-matches, with linked transactions embedded', async () => {
    const parsed = parseStatementText(STATEMENT);
    if ('error' in parsed) throw new Error(parsed.error);
    const result = await importStatement(eva, account, parsed, 'oct.pdf');
    expect(result).toMatchObject({ inserted: 3, duplicates: 0, matched: 2 });

    const [statement] = await listStatements(eva, account);
    expect(statement).toMatchObject({ bank: 'cimb', file_name: 'oct.pdf', period_from: '2026-10-01', period_to: '2026-10-05' });

    const lines = await listLines(eva, statement!.id);
    expect(lines.map((l) => [l.description, l.transaction?.merchant ?? null, l.match_type])).toEqual([
      ['IBG CREDIT SYARIKAT ABC', 'Syarikat ABC', 'auto'],
      ['DEBIT CARD MYDIN', 'Mydin', 'auto'],
      ['SERVICE CHARGE', null, null],
    ]);
    expect((await importStatement(eva, account, parsed, 'oct-again.pdf')).inserted).toBe(0);
  });

  it('lists recorded transactions missing from the bank, and turns bank-only lines into transactions', async () => {
    const [statement] = await listStatements(eva, account);
    const missing = await listUnreconciled(eva, account, statement!.period_from, statement!.period_to);
    expect(missing.map((t) => t.merchant)).toEqual(['Tunai pasar']);

    const charge = (await listLines(eva, statement!.id)).find((l) => l.description === 'SERVICE CHARGE')!;
    const bil = (await listCategories(eva)).find((c) => c.name === 'Bil & Utiliti')!;
    await createTransactionFromLine(eva, charge.id, bil.id);
    const created = (await listTransactions(eva, account, { search: 'service charge' })).rows[0]!;
    expect(created).toMatchObject({ source: 'bank', amount: 2, transaction_type: 'expense', category_id: bil.id });
  });

  it('supports manual match, unmatch and ignore', async () => {
    const [statement] = await listStatements(eva, account);
    const mydin = (await listLines(eva, statement!.id)).find((l) => l.description === 'DEBIT CARD MYDIN')!;
    await updateLine(eva, mydin.id, 'unmatch');
    const candidates = await matchCandidates(eva, account, { ...mydin, transaction_id: null });
    expect(candidates.map((c) => c.merchant)).toEqual(['Mydin']);
    await matchLine(eva, mydin.id, candidates[0]!.id);
    let line = (await listLines(eva, statement!.id)).find((l) => l.id === mydin.id)!;
    expect(line.match_type).toBe('manual');
    await updateLine(eva, mydin.id, 'ignore');
    line = (await listLines(eva, statement!.id)).find((l) => l.id === mydin.id)!;
    expect(line).toMatchObject({ ignored: true, transaction_id: null, transaction: null });
  });

  it('deletes a statement and its lines but keeps transactions', async () => {
    const [statement] = await listStatements(eva, account);
    await deleteStatement(eva, statement!.id);
    expect(await listStatements(eva, account)).toEqual([]);
    expect((await listTransactions(eva, account, {})).rows.length).toBe(4);
  });
});
