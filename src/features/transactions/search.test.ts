import { buildSearchFilter } from './search';

describe('buildSearchFilter', () => {
  it('quotes the term for both columns', () => {
    expect(buildSearchFilter('mydin')).toBe('merchant.ilike."%mydin%",description.ilike."%mydin%"');
  });

  it('keeps PostgREST syntax characters inside quotes and strips wildcards/quotes', () => {
    expect(buildSearchFilter('Sdn. Bhd, (KL)')).toBe(
      'merchant.ilike."%Sdn. Bhd, (KL)%",description.ilike."%Sdn. Bhd, (KL)%"',
    );
    expect(buildSearchFilter('a%b_c*"d\\')).toBe('merchant.ilike."%a b c d%",description.ilike."%a b c d%"');
  });

  it('returns null for blank input', () => {
    expect(buildSearchFilter('  %%  ')).toBeNull();
  });
});
