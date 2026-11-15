import { fromSen, parseAmountInput, toSen } from './money';

describe('parseAmountInput', () => {
  it.each([
    ['55', '55.00'],
    ['55.5', '55.50'],
    ['RM 12.30', '12.30'],
    ['rm1,234.50', '1234.50'],
    ['12,50', '12.50'],
    [' 007 ', '7.00'],
    ['0.01', '0.01'],
  ])('accepts %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(['', '0', '0.00', '-5', 'abc', '1.234', '12.', '1,23,4', '99999999999', '5e3'])('rejects %s', (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe('sen arithmetic', () => {
  it('sums decimal amounts exactly', () => {
    const total = [0.1, 0.2, 55.05].reduce((s, a) => s + toSen(a), 0);
    expect(fromSen(total)).toBe(55.35);
  });
});
