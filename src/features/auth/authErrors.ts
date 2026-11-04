const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Emel atau kata laluan tidak tepat.',
  email_not_confirmed: 'Emel belum disahkan. Sila semak peti masuk anda.',
  user_already_exists: 'Emel ini sudah didaftarkan. Sila log masuk.',
  email_exists: 'Emel ini sudah didaftarkan. Sila log masuk.',
  weak_password: 'Kata laluan terlalu lemah. Gunakan sekurang-kurangnya 8 aksara.',
  over_email_send_rate_limit: 'Terlalu banyak cubaan. Cuba lagi sebentar.',
  over_request_rate_limit: 'Terlalu banyak cubaan. Cuba lagi sebentar.',
  signup_disabled: 'Pendaftaran baru ditutup buat masa ini.',
};

export function authErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return '';
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error.message?.toLowerCase().includes('fetch')) return 'Tiada sambungan internet. Semak rangkaian anda.';
  return 'Ralat tidak dijangka. Sila cuba lagi.';
}
