import { addDays, addMonths, endOfMonth, startOfMonth } from '../../lib/dates';

export type DatePreset = 'all' | '7d' | 'month' | 'lastMonth' | 'custom';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: '7d', label: '7 hari' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'lastMonth', label: 'Bulan lepas' },
  { value: 'custom', label: 'Pilih tarikh' },
];

export function presetRange(
  preset: DatePreset,
  today: string,
  custom: { from: string; to: string },
): { from?: string; to?: string } {
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: startOfMonth(today), to: today };
    case 'lastMonth': {
      const start = addMonths(today, -1);
      return { from: start, to: endOfMonth(start) };
    }
    case 'custom':
      return { from: custom.from || undefined, to: custom.to || undefined };
    default:
      return {};
  }
}
