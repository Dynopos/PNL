import { parseStatementText } from './statementParser';

const CIMB = `CIMB BANK BERHAD
Statement of Account
Date Description Withdrawal Deposits Balance
OPENING BALANCE 1,000.00
01/11/2026 IBG CREDIT 500.00 1,500.00
SYARIKAT ABC SDN BHD 123456789012
02/11/2026 DEBIT CARD PURCHASE 55.00 1,445.00
MYDIN MALL 02/11/26
03/11/2026 INSTANT TRANSFER 1,200.00 245.00
04/11/2026 SERVICE NOTE ONLY
05/11/2026 DUITNOW QR 2,345.60 2,590.60
CLOSING BALANCE 2,590.60`;

const MAYBANK = `Maybank Islamic
BEGINNING BALANCE 300.00
10/10/2026 FPX PAYMENT TNB 120.50- 179.50
11/10/2026 TRANSFER FR A/C 1,000.00+ 1,179.50
ENDING BALANCE : 1,179.50`;

describe('parseStatementText', () => {
  it('reads CIMB lines with dates, direction from the balance and joined descriptions', () => {
    const r = parseStatementText(CIMB);
    if ('error' in r) throw new Error(r.error);
    expect(r).toMatchObject({ bank: 'cimb', opening: '1000.00', closing: '2590.60', periodFrom: '2026-11-01', periodTo: '2026-11-05' });
    expect(r.lines).toEqual([
      { date: '2026-11-01', description: 'IBG CREDIT SYARIKAT ABC SDN BHD', amount: '500.00', direction: 'in', balance: '1500.00' },
      { date: '2026-11-02', description: 'DEBIT CARD PURCHASE MYDIN MALL', amount: '55.00', direction: 'out', balance: '1445.00' },
      { date: '2026-11-03', description: 'INSTANT TRANSFER', amount: '1200.00', direction: 'out', balance: '245.00' },
      { date: '2026-11-05', description: 'DUITNOW QR', amount: '2345.60', direction: 'in', balance: '2590.60' },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('reads Maybank lines with +/- suffixed amounts', () => {
    const r = parseStatementText(MAYBANK);
    if ('error' in r) throw new Error(r.error);
    expect(r.bank).toBe('maybank');
    expect(r.lines.map((l) => [l.date, l.direction, l.amount])).toEqual([
      ['2026-10-10', 'out', '120.50'],
      ['2026-10-11', 'in', '1000.00'],
    ]);
  });

  it('warns when the amount column disagrees with the balance, and trusts the balance', () => {
    const r = parseStatementText(CIMB.replace('55.00 1,445.00', '65.00 1,445.00'));
    if ('error' in r) throw new Error(r.error);
    expect(r.lines[1]!.amount).toBe('55.00');
    expect(r.warnings[0]).toMatch(/02\/11\/2026/);
  });

  it('rejects unsupported banks and empty statements', () => {
    expect(parseStatementText('Public Bank statement')).toEqual({ error: expect.stringMatching(/CIMB dan Maybank/) });
    expect('error' in parseStatementText('CIMB\nOPENING BALANCE 10.00\nCLOSING BALANCE 10.00')).toBe(true);
  });
});
