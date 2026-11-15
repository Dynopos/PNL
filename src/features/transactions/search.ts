/**
 * Builds a PostgREST `or` filter matching merchant or description.
 * The term is double-quoted so commas, dots and brackets in names are safe; wildcard
 * characters are dropped so user input can't widen the match.
 */
export function buildSearchFilter(raw: string): string | null {
  const term = raw
    .replace(/[%_*\\]/g, ' ')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!term) return null;
  const pattern = `"%${term}%"`;
  return `merchant.ilike.${pattern},description.ilike.${pattern}`;
}
