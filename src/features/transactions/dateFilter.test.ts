import { presetRange } from './dateFilter';

const none = { from: '', to: '' };

describe('presetRange', () => {
  it('computes ranges relative to the Malaysian today', () => {
    expect(presetRange('7d', '2026-11-04', none)).toEqual({ from: '2026-10-29', to: '2026-11-04' });
    expect(presetRange('month', '2026-11-04', none)).toEqual({ from: '2026-11-01', to: '2026-11-04' });
    expect(presetRange('lastMonth', '2026-03-31', none)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('all', '2026-11-04', none)).toEqual({});
  });

  it('passes through partial custom ranges', () => {
    expect(presetRange('custom', '2026-11-04', { from: '2026-10-01', to: '' })).toEqual({
      from: '2026-10-01',
      to: undefined,
    });
  });
});
