// @vitest-environment node
// Runs only under supabase/tests/integration.sh (local Postgres + PostgREST).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { parseWithRules } from '../../supabase/functions/_shared/voiceParser.ts';
import { ensureAccount, listCategories, listTransactions } from '../features/transactions/api';
import { listMerchantRules, rememberMerchant, saveTransactions } from '../features/voice/api';
import { toReviewItems, validateReviewItem } from '../features/voice/review';
import { dateInKL } from '../lib/locale';

const URL = process.env.PGRST_URL;
const SECRET = process.env.PGRST_JWT_SECRET ?? '';
const CARA = 'cccccccc-0000-0000-0000-000000000003';
const DAN = 'dddddddd-0000-0000-0000-000000000004';

function clientFor(userId: string): SupabaseClient {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const token = `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
  return createClient(URL!, token, {
    accessToken: async () => token,
    global: { fetch: (input, init) => fetch(String(input).replace('/rest/v1', ''), init) },
  });
}

describe.skipIf(!URL)('voice save through PostgREST', () => {
  let cara: SupabaseClient;
  let dan: SupabaseClient;
  let account = '';

  beforeAll(async () => {
    cara = clientFor(CARA);
    dan = clientFor(DAN);
    account = (await ensureAccount(cara, CARA, 'business')).id;
  });

  it('parses, reviews and saves a multi-item command once, even if submitted twice', async () => {
    const today = dateInKL();
    const categories = await listCategories(cara);
    const items = toReviewItems(parseWithRules('Jualan hari ini 1500 ringgit, Mydin 55', today), 'sub-int-1', categories, []);
    const values = items.map((i) => {
      const r = validateReviewItem(i, today);
      if (!r.ok) throw new Error(JSON.stringify(r.errors));
      return r.value;
    });

    const first = await saveTransactions(cara, account, values);
    const again = await saveTransactions(cara, account, values);
    expect(first.map((r) => r.inserted)).toEqual([true, true]);
    expect(again.map((r) => r.inserted)).toEqual([false, false]);
    expect(again.map((r) => r.transaction_id)).toEqual(first.map((r) => r.transaction_id));

    const { rows } = await listTransactions(cara, account, {});
    expect(rows.map((r) => [r.transaction_type, r.amount, r.source]).sort()).toEqual([
      ['expense', 55, 'voice'],
      ['income', 1500, 'voice'],
    ]);
  });

  it('remembers a merchant mapping and applies it to the next command', async () => {
    const categories = await listCategories(cara);
    const jualan = categories.find((c) => c.name === 'Jualan')!;
    await rememberMerchant(cara, CARA, '  Kedai Pak Ali ', jualan.id);
    await rememberMerchant(cara, CARA, 'kedai pak ali', jualan.id); // upsert, not duplicate
    const rules = await listMerchantRules(cara);
    expect(rules).toEqual([{ merchant_keyword: 'kedai pak ali', category_id: jualan.id }]);

    const [item] = toReviewItems(parseWithRules('Dari kedai Pak Ali 300', dateInKL()), 's', categories, rules);
    expect(item).toMatchObject({ type: 'income', categoryId: jualan.id, ruleApplied: true });
  });

  it('refuses to save into another user\'s account and keeps rules private', async () => {
    await ensureAccount(dan, DAN, 'business');
    await expect(
      saveTransactions(dan, account, [
        { idempotency_key: 'voice:dan:0', transaction_type: 'expense', amount: '1.00', merchant: 'x', description: null, category_id: null, transaction_date: dateInKL() },
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await listMerchantRules(dan)).toEqual([]);
  });
});
