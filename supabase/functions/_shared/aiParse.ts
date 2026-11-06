// Prompt, output schema and validation for the AI transcript parser. No runtime dependencies,
// so the validation rules are unit-tested alongside the rule-based parser.
import {
  amountsInTranscript,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type EntryType,
  type VoiceCandidate,
} from './voiceParser.ts';

export const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['transactions'],
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['merchant', 'description', 'amount', 'amount_options', 'type', 'category', 'transaction_date', 'issues'],
        properties: {
          merchant: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          amount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          amount_options: { type: 'array', items: { type: 'number' } },
          type: { anyOf: [{ type: 'string', enum: ['income', 'expense'] }, { type: 'null' }] },
          category: { type: 'string' },
          transaction_date: { type: 'string' },
          issues: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You turn one spoken sentence from a Malaysian small-business owner into bookkeeping entries. The sentence is a speech-to-text transcript in Malay, English or a mix, so expect missing punctuation and spoken numbers ("lima puluh lima" = 55, "dua ringgit lima puluh sen" = 2.50, "seribu lima ratus" = 1500).

Return one entry per amount the speaker gave. Several purchases or receipts in one sentence are separate entries.

For each entry:
- amount: the ringgit amount the speaker said, as a number. If no amount was said for an item, use null and add an issue. Never estimate or make up an amount. If the speaker gave alternatives ("lima belas atau lima puluh"), set amount to null, list them in amount_options, and add an issue.
- type: "income" for money received (sales, a customer paying, salary coming in, refunds received), "expense" for money spent. If the sentence does not make it clear, use null and add an issue - the user will choose. "Customer bayar" is income; "bayar parking" is an expense. Paying staff wages ("gaji staff", "bayar gaji pekerja") is an expense under "Gaji Staff"; the income category "Gaji" is only salary the owner receives. Buying stock or goods to resell, or paying a supplier, is "Kos Barang & Stok"; an advance paid to a supplier before goods arrive is "Pendahuluan Pembekal". Loan, financing or instalment repayments (SPayLater, ansuran) are "Pinjaman & Pembiayaan". The owner using business money for personal things is "Kegunaan Peribadi Pemilik".
- category: exactly one name from the list for that type. Use "Lain-lain" when nothing fits. When type is null, use "Lain-lain".
- merchant: the shop, company or person named (e.g. "Mydin", "Petronas"), otherwise null.
- description: a short Malay description of what it was, using the speaker's words, otherwise null. Do not add details the speaker did not say.
- transaction_date: YYYY-MM-DD. Today is given below; resolve relative dates ("semalam" = yesterday, "kelmarin" = two days ago, "Isnin lepas" / "last Monday" = the most recent past Monday) in that calendar. If the speaker named no date, use today. If the date is vague ("minggu lepas"), use today and add an issue.
- issues: short Malay notes about anything the user must check; empty when the entry is clear.

Only describe what was said. The user reviews uncertain entries before anything is saved.`;

export function buildUserMessage(transcript: string, today: string): string {
  return [
    `Today (Asia/Kuala_Lumpur): ${today}`,
    `Expense categories: ${EXPENSE_CATEGORIES.join(', ')}`,
    `Income categories: ${INCOME_CATEGORIES.join(', ')}`,
    '',
    'Transcript:',
    '<transcript>',
    transcript,
    '</transcript>',
  ].join('\n');
}

const toSen = (n: number) => Math.round(n * 100);
const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/**
 * Checks the model's entries against the transcript and our rules. Anything that cannot be
 * verified is cleared and flagged for review rather than saved: amounts must appear in the
 * transcript, categories must exist, dates must be real and not in the future.
 */
export function validateAiOutput(raw: unknown, transcript: string, today: string): VoiceCandidate[] {
  const list = (raw as { transactions?: unknown })?.transactions;
  if (!Array.isArray(list)) throw new Error('AI output has no transactions array');
  const spoken = amountsInTranscript(transcript);
  const oldest = new Date(`${today}T00:00:00Z`);
  oldest.setUTCDate(oldest.getUTCDate() - 366);
  const oldestIso = oldest.toISOString().slice(0, 10);

  return list.slice(0, 20).map((item: Record<string, unknown>) => {
    const issues = Array.isArray(item.issues)
      ? item.issues.filter((i): i is string => typeof i === 'string' && i.trim() !== '').map((i) => i.slice(0, 200))
      : [];

    const type: EntryType | null = item.type === 'income' || item.type === 'expense' ? item.type : null;
    if (type === null && !issues.some((i) => /pendapatan|perbelanjaan/i.test(i))) issues.push('Pendapatan atau perbelanjaan?');

    let amount: string | null = null;
    if (typeof item.amount === 'number' && Number.isFinite(item.amount)) {
      if (item.amount > 0 && item.amount < 1e10 && spoken.has(toSen(item.amount))) amount = fmt(item.amount);
      else issues.push('Jumlah tidak dapat disahkan daripada ayat anda.');
    } else if (!issues.length) {
      issues.push('Jumlah tidak disebut.');
    }
    const amount_options = Array.isArray(item.amount_options)
      ? item.amount_options.filter((n): n is number => typeof n === 'number' && spoken.has(toSen(n))).map(fmt)
      : [];

    const allowed: readonly string[] = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const category = typeof item.category === 'string' && allowed.includes(item.category) ? item.category : 'Lain-lain';

    let transaction_date = today;
    if (typeof item.transaction_date === 'string' && isIsoDate(item.transaction_date)) {
      if (item.transaction_date > today || item.transaction_date < oldestIso) issues.push('Sila semak tarikh.');
      else transaction_date = item.transaction_date;
    } else {
      issues.push('Sila semak tarikh.');
    }

    const merchant = str(item.merchant, 120);
    const description = str(item.description, 500);
    if (!merchant && !description) issues.push('Tiada keterangan.');

    return {
      merchant,
      description,
      amount,
      amount_options,
      currency: 'MYR' as const,
      category,
      type,
      transaction_date,
      issues,
      text: '',
    };
  });
}
