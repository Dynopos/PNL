import { dateInKL, formatLongDate, formatMYR } from './locale';

describe('formatMYR', () => {
  it('formats ringgit with two decimals', () => {
    expect(formatMYR(55)).toMatch(/RM\s?55\.00/);
    expect(formatMYR('1234.5')).toMatch(/RM\s?1,234\.50/);
  });
});

describe('dateInKL', () => {
  it('uses Malaysia time, not UTC, near midnight', () => {
    // 2026-11-04 17:30 UTC is already 2026-11-05 01:30 in Kuala Lumpur.
    expect(dateInKL(new Date('2026-11-04T17:30:00Z'))).toBe('2026-11-05');
    expect(dateInKL(new Date('2026-11-04T15:59:00Z'))).toBe('2026-11-04');
  });
});

describe('formatLongDate', () => {
  it('renders a Malay long date without shifting the day', () => {
    expect(formatLongDate('2026-11-04')).toBe('4 November 2026');
  });
});
