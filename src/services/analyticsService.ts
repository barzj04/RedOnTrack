/**
 * Analytics service: chart data, date ranges and trend figures.
 * Weekly/monthly counts are a fixed sample dataset (no live data source yet).
 */

import type { AccidentStat, DateRange } from '../domain';
import { DAY_SHORT, TIME_SLOTS } from './incidentService';

type Period = 'weekly' | 'monthly';
type Dimension = 'day' | 'time';

// Index 0 = current week, 1 = last week, ...
const WEEKLY_SAMPLE = [
  { day: [2, 1, 5, 3, 6, 8, 4], time: [3, 4, 6, 7, 5, 4] },
  { day: [3, 2, 4, 1, 9, 5, 2], time: [2, 3, 7, 5, 6, 3] },
  { day: [1, 5, 2, 7, 4, 3, 6], time: [1, 5, 4, 6, 8, 4] },
  { day: [4, 3, 8, 2, 5, 7, 1], time: [4, 2, 5, 6, 9, 4] },
];

const MONTHLY_SAMPLE = {
  day: [12, 8, 22, 14, 28, 32, 10],
  time: [11, 15, 22, 24, 34, 20],
};

export const MAX_WEEK_OFFSET = WEEKLY_SAMPLE.length - 1;

function toStats(labels: string[], values: number[]): AccidentStat[] {
  return labels.map((label, i) => ({ label, value: values[i] ?? 0 }));
}

export function getStats(period: Period, dimension: Dimension, weekOffset = 0): AccidentStat[] {
  const source = period === 'weekly' ? WEEKLY_SAMPLE[Math.min(Math.max(weekOffset, 0), MAX_WEEK_OFFSET)] : MONTHLY_SAMPLE;
  return dimension === 'day' ? toStats(DAY_SHORT, source.day) : toStats(TIME_SLOTS, source.time);
}

export const totalOf = (stats: AccidentStat[]) => stats.reduce((sum, s) => sum + s.value, 0);

export const maxOf = (stats: AccidentStat[]) => Math.max(1, ...stats.map((s) => s.value));

/** Peak 4-hour slot for the period, formatted "16:00 - 20:00". */
export function peakTimeSlot(period: Period, weekOffset = 0): string {
  const stats = getStats(period, 'time', weekOffset);
  const peak = stats.reduce((a, b) => (b.value > a.value ? b : a));
  const [s, e] = peak.label.split('-');
  return `${s}:00 - ${e === '24' ? '00' : e}:00`;
}

/** Week-over-week (or month-over-month) change in total cases. */
export function trend(period: Period, weekOffset = 0): { percentage: string; isUp: boolean } {
  if (period === 'monthly') return { percentage: '-4%', isUp: false };
  if (weekOffset >= MAX_WEEK_OFFSET) return { percentage: 'n/a', isUp: false };
  const current = totalOf(getStats('weekly', 'day', weekOffset));
  const previous = totalOf(getStats('weekly', 'day', weekOffset + 1));
  const change = previous === 0 ? 0 : Math.round(((current - previous) / previous) * 100);
  return { percentage: `${change > 0 ? '+' : ''}${change}%`, isUp: change > 0 };
}

/** Monday-to-Sunday range for the week `weekOffset` weeks before the current one. */
export function weekRange(weekOffset: number, now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday - weekOffset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function formatRange({ start, end }: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('en-GB', opts)} - ${end.toLocaleDateString('en-GB', opts)} ${end.getFullYear()}`;
}
