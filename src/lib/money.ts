export const MAX_AMOUNT = 9_999_999_999.99;

/**
 * Parses what a user typed into a ringgit amount string with two decimals.
 * Accepts "55", "55.5", "RM 1,234.50", "12,50" (comma decimal). Returns null when not a valid positive amount.
 */
export function parseAmountInput(raw: string): string | null {
  let s = raw.trim().replace(/^rm\s*/i, '').replace(/\s/g, '');
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const normalized = `${BigInt(whole!).toString()}.${frac.padEnd(2, '0')}`;
  if (normalized === '0.00' || Number(normalized) > MAX_AMOUNT) return null;
  return normalized;
}

/** Integer sen, so client-side sums of database amounts stay exact. */
export function toSen(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export function fromSen(sen: number): number {
  return sen / 100;
}
