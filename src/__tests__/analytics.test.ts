import { describe, expect, it } from 'vitest';
import { getStats, maxOf, peakTimeSlot, totalOf, trend, weekRange } from '../services/analyticsService';

describe('analytics', () => {
  it('returns 7 day bars and 6 time bars', () => {
    expect(getStats('weekly', 'day')).toHaveLength(7);
    expect(getStats('weekly', 'time')).toHaveLength(6);
  });

  it('keeps day and time totals consistent for a week', () => {
    expect(totalOf(getStats('weekly', 'time', 0))).toBe(totalOf(getStats('weekly', 'day', 0)));
  });

  it('never returns a zero max (avoids divide by zero in the chart)', () => {
    expect(maxOf([{ label: 'x', value: 0 }])).toBe(1);
  });

  it('computes week-over-week change from the data', () => {
    // week 0 total 29, week 1 total 26 -> +12%
    expect(trend('weekly', 0)).toEqual({ percentage: '+12%', isUp: true });
  });

  it('formats the peak slot', () => {
    expect(peakTimeSlot('weekly', 0)).toBe('12:00 - 16:00');
  });

  it('weeks run Monday to Sunday', () => {
    const { start, end } = weekRange(0, new Date(2026, 10, 20)); // Friday
    expect(start.getDay()).toBe(1);
    expect(end.getDay()).toBe(0);
    expect(start.getDate()).toBe(16);
  });
});
