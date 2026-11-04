import { addDays, addMonths, daysInclusive, endOfMonth, isValidIsoDate, startOfMonth, startOfWeek } from './dates';

describe('date helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-11-04')).toBe('2026-11-02'); // Wednesday
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02'); // Sunday
  });

  it('finds month bounds including leap February', () => {
    expect(startOfMonth('2026-11-04')).toBe('2026-11-01');
    expect(endOfMonth('2026-11-04')).toBe('2026-11-30');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });

  it('moves by whole months from the first of the month', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-01');
    expect(addMonths('2026-11-04', -5)).toBe('2026-06-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
  });

  it('counts days inclusively', () => {
    expect(daysInclusive('2026-11-01', '2026-11-04')).toBe(4);
    expect(daysInclusive('2026-11-04', '2026-11-04')).toBe(1);
  });

  it('rejects impossible dates', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-2-3')).toBe(false);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
  });
});
