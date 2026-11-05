import type { SupabaseClient } from '@supabase/supabase-js';
import { parseWithRules, type VoiceCandidate } from '../../../supabase/functions/_shared/voiceParser.ts';
import { dateInKL } from '../../lib/locale';
import type { EntryType } from '../../lib/types';

export type ParseSource = 'ai' | 'rules' | 'local';

/** Edge Function slug; dashboard-created functions may get a generated name. */
const PARSE_FUNCTION = import.meta.env.VITE_PARSE_VOICE_FUNCTION?.trim() || 'parse-voice';

export interface ParseOutcome {
  transactions: VoiceCandidate[];
  source: ParseSource;
  /** The calendar day the parser treated as today (dates it filled in, rather than heard). */
  today?: string;
}

/** Server parse (AI with rule fallback); if the function is unreachable, parse on the device. */
export async function parseTranscript(client: SupabaseClient, transcript: string): Promise<ParseOutcome> {
  try {
    const { data, error } = await client.functions.invoke(PARSE_FUNCTION, { body: { transcript } });
    if (error || !Array.isArray(data?.transactions)) throw error ?? new Error('Unexpected response');
    return {
      transactions: data.transactions as VoiceCandidate[],
      source: data.source === 'ai' ? 'ai' : 'rules',
      today: typeof data.today === 'string' ? data.today : undefined,
    };
  } catch {
    const today = dateInKL();
    return { transactions: parseWithRules(transcript, today), source: 'local', today };
  }
}

export interface SaveItem {
  idempotency_key: string;
  transaction_type: EntryType;
  amount: string;
  merchant: string | null;
  description: string | null;
  category_id: string | null;
  transaction_date: string;
}

export async function saveTransactions(client: SupabaseClient, accountId: string, items: SaveItem[]) {
  const { data, error } = await client.rpc('save_transactions', {
    p_account_id: accountId,
    p_items: items,
    p_source: 'voice',
  });
  if (error) throw error;
  return data as { item_key: string; transaction_id: string; inserted: boolean }[];
}

export interface MerchantRule {
  merchant_keyword: string;
  category_id: string;
}

export async function listMerchantRules(client: SupabaseClient): Promise<MerchantRule[]> {
  const { data, error } = await client.from('merchant_rules').select('merchant_keyword, category_id');
  if (error) throw error;
  return data as MerchantRule[];
}

export function merchantKeyword(merchant: string): string {
  return merchant.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

export async function rememberMerchant(client: SupabaseClient, userId: string, merchant: string, categoryId: string) {
  const { error } = await client
    .from('merchant_rules')
    .upsert(
      { user_id: userId, merchant_keyword: merchantKeyword(merchant), category_id: categoryId },
      { onConflict: 'user_id,merchant_keyword' },
    );
  if (error) throw error;
}
