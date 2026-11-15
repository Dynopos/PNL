import { authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('maps known Supabase error codes to Malay', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('Emel atau kata laluan tidak tepat.');
  });

  it('detects network failures', () => {
    expect(authErrorMessage({ message: 'Failed to fetch' })).toMatch(/internet/);
  });

  it('never leaks raw server messages', () => {
    expect(authErrorMessage({ code: 'something_new', message: 'db exploded at row 7' })).toBe(
      'Ralat tidak dijangka. Sila cuba lagi.',
    );
    expect(authErrorMessage(null)).toBe('');
  });
});
