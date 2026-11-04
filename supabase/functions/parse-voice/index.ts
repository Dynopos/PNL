// Parses a voice transcript into candidate transactions. Nothing is saved here: the app shows
// the result for review and saves through the save_transactions RPC.
//
// Deploy:  supabase functions deploy parse-voice
// Secret:  supabase secrets set ANTHROPIC_API_KEY=...   (without it, the rule-based parser is used)
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { AI_SCHEMA, buildUserMessage, SYSTEM_PROMPT, validateAiOutput } from '../_shared/aiParse.ts';
import { MAX_TRANSCRIPT_LENGTH, parseWithRules, type VoiceCandidate } from '../_shared/voiceParser.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function todayInKL(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const client = apiKey ? new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 }) : null;

async function parseWithAi(transcript: string, today: string): Promise<VoiceCandidate[]> {
  const response = await client!.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(transcript, today) }],
  });
  if (response.stop_reason !== 'end_turn') throw new Error(`stop_reason ${response.stop_reason}`);
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('no text block');
  return validateAiOutput(JSON.parse(text.text), transcript, today);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let transcript: unknown;
  try {
    ({ transcript } = await req.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (typeof transcript !== 'string' || !transcript.trim()) return json({ error: 'empty_transcript' }, 400);
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) return json({ error: 'transcript_too_long' }, 413);

  const text = transcript.trim();
  const today = todayInKL();

  if (client) {
    try {
      const transactions = await parseWithAi(text, today);
      if (transactions.length > 0) return json({ transactions, source: 'ai', today });
    } catch (err) {
      // Never surface provider details to the client; the rule-based parser takes over.
      console.error('parse-voice: AI parse failed', err instanceof Error ? err.message : 'unknown');
    }
  }
  return json({ transactions: parseWithRules(text, today), source: 'rules', today });
});
