import { addDays, addMonths, daysInclusive, endOfMonth, startOfMonth, startOfWeek } from '../../lib/dates';

export type ReportPeriod = 'week' | 'month' | 'lastMonth';

export const REPORT_PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'week', label: 'Minggu ini' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'lastMonth', label: 'Bulan lepas' },
];

/** Date range for a report; current periods stop at today so averages aren't diluted by future days. */
export function reportRange(period: ReportPeriod, today: string) {
  let from: string;
  let to: string;
  if (period === 'week') {
    from = startOfWeek(today);
    to = today;
  } else if (period === 'month') {
    from = startOfMonth(today);
    to = today;
  } else {
    from = addMonths(today, -1);
    to = endOfMonth(from);
  }
  return { from, to, days: daysInclusive(from, to) };
}

/** Clips a Monday-start week bucket to the report range. */
export function weekLabel(bucket: string, from: string, to: string, fmt: (iso: string) => string) {
  const start = bucket < from ? from : bucket;
  const endOfBucket = addDays(bucket, 6);
  const end = endOfBucket > to ? to : endOfBucket;
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}
