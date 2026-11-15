import { reportRange, weekLabel } from './periods';

describe('reportRange', () => {
  it('runs current periods up to today', () => {
    expect(reportRange('week', '2026-11-04')).toEqual({ from: '2026-11-02', to: '2026-11-04', days: 3 });
    expect(reportRange('month', '2026-11-04')).toEqual({ from: '2026-11-01', to: '2026-11-04', days: 4 });
  });

  it('covers the whole of last month', () => {
    expect(reportRange('lastMonth', '2026-11-04')).toEqual({ from: '2026-10-01', to: '2026-10-31', days: 31 });
  });
});

describe('weekLabel', () => {
  const fmt = (iso: string) => iso.slice(5);
  it('clips the first and last week to the range', () => {
    expect(weekLabel('2026-09-28', '2026-10-01', '2026-10-31', fmt)).toBe('10-01 – 10-04');
    expect(weekLabel('2026-10-26', '2026-10-01', '2026-10-31', fmt)).toBe('10-26 – 10-31');
    expect(weekLabel('2026-11-02', '2026-11-01', '2026-11-02', fmt)).toBe('11-02');
  });
});
