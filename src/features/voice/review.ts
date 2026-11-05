import type { VoiceCandidate } from '../../../supabase/functions/_shared/voiceParser.ts';
import type { Category, EntryType } from '../../lib/types';
import { validateDraft } from '../transactions/validation';
import type { MerchantRule, SaveItem } from './api';

export interface ReviewItem {
  key: string;
  type: EntryType | null;
  amount: string;
  amountOptions: string[];
  merchant: string;
  description: string;
  categoryId: string;
  date: string;
  issues: string[];
  ruleApplied: boolean;
  categoryTouched: boolean;
  remember: boolean;
}

const UNCLEAR_TYPE = 'Pendapatan atau perbelanjaan?';
const TYPE_ISSUE = /diterima|dibayar|pendapatan|perbelanjaan|jenis transaksi|income|expense/i;

/** Drops notes about income-vs-expense (the AI words them its own way); the type picker covers them. */
export function withoutTypeIssues(issues: string[]): string[] {
  return issues.filter((i) => !TYPE_ISSUE.test(i));
}

/** What a remembered rule is keyed on: the merchant, or the description when no merchant was named. */
export function ruleLabel(item: Pick<ReviewItem, 'merchant' | 'description'>): string {
  return item.merchant.trim() || item.description.trim();
}

function matchRule(c: VoiceCandidate, rules: MerchantRule[]): MerchantRule | undefined {
  const haystack = `${c.merchant ?? ''} ${c.description ?? ''}`.toLowerCase();
  return rules
    .filter((r) => r.merchant_keyword && haystack.includes(r.merchant_keyword))
    .sort((a, b) => b.merchant_keyword.length - a.merchant_keyword.length)[0];
}

/** Candidates -> editable review rows. The user's own merchant rules override default categories. */
export function toReviewItems(
  candidates: VoiceCandidate[],
  submissionId: string,
  categories: Category[],
  rules: MerchantRule[],
): ReviewItem[] {
  return candidates.map((c, index) => {
    let type = c.type;
    let issues = c.type === null ? [...withoutTypeIssues(c.issues), UNCLEAR_TYPE] : [...c.issues];
    let categoryId = type
      ? (categories.find((cat) => cat.type === type && cat.name === c.category)?.id ?? '')
      : '';
    let ruleApplied = false;

    const rule = matchRule(c, rules);
    const ruleCategory = rule && categories.find((cat) => cat.id === rule.category_id);
    if (ruleCategory && (type === null || type === ruleCategory.type)) {
      if (type === null) issues = withoutTypeIssues(issues);
      type = ruleCategory.type;
      categoryId = ruleCategory.id;
      ruleApplied = true;
    }

    return {
      key: `voice:${submissionId}:${index}`,
      type,
      amount: c.amount ?? '',
      amountOptions: c.amount_options,
      merchant: c.merchant ?? '',
      description: c.description ?? '',
      categoryId,
      date: c.transaction_date,
      issues,
      ruleApplied,
      categoryTouched: false,
      remember: true,
    };
  });
}

export type ReviewErrors = Partial<Record<'type' | 'amount' | 'merchant' | 'date', string>>;

export function validateReviewItem(
  item: ReviewItem,
  today: string,
): { ok: true; value: SaveItem } | { ok: false; errors: ReviewErrors } {
  const result = validateDraft(
    {
      transaction_type: item.type ?? 'expense',
      amount: item.amount,
      merchant: item.merchant,
      description: item.description,
      category_id: item.categoryId,
      transaction_date: item.date,
    },
    today,
  );
  const errors: ReviewErrors = {};
  if (!item.type) errors.type = 'Pilih pendapatan atau perbelanjaan.';
  if (!result.ok) {
    if (result.errors.amount) errors.amount = result.errors.amount;
    if (result.errors.merchant) errors.merchant = result.errors.merchant;
    if (result.errors.transaction_date) errors.date = result.errors.transaction_date;
  }
  if (!result.ok || !item.type) return { ok: false, errors };
  const v = result.value;
  return {
    ok: true,
    value: {
      idempotency_key: item.key,
      transaction_type: item.type,
      amount: v.amount,
      merchant: v.merchant,
      description: v.description,
      category_id: v.category_id,
      transaction_date: v.transaction_date,
    },
  };
}

/** Only a single, unambiguous entry is saved without showing the review screen. */
export function canAutoSave(items: ReviewItem[], today: string): boolean {
  return items.length === 1 && items[0]!.issues.length === 0 && validateReviewItem(items[0]!, today).ok;
}
