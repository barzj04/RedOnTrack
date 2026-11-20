import { useMemo, useState } from 'react';
import { analyticsService } from '../services';

export type Period = 'weekly' | 'monthly';
export type Dimension = 'day' | 'time';

/** Chart state for the Accident Analysis page. */
export function useAccidentAnalytics() {
  const [period, setPeriodState] = useState<Period>('weekly');
  const [dimension, setDimensionState] = useState<Dimension>('day');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const stats = useMemo(() => analyticsService.getStats(period, dimension, weekOffset), [period, dimension, weekOffset]);
  const totalCases = useMemo(() => analyticsService.totalOf(stats), [stats]);
  const maxValue = useMemo(() => analyticsService.maxOf(stats), [stats]);
  const dateRangeLabel = useMemo(() => analyticsService.formatRange(analyticsService.weekRange(weekOffset)), [weekOffset]);
  const trend = useMemo(() => analyticsService.trend(period, weekOffset), [period, weekOffset]);
  const peakSlot = useMemo(() => analyticsService.peakTimeSlot(period, weekOffset), [period, weekOffset]);

  // Changing the chart axis clears the bar filter so the list never shows a stale filter.
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    setSelectedFilter(null);
  };
  const setDimension = (d: Dimension) => {
    setDimensionState(d);
    setSelectedFilter(null);
  };

  return {
    period,
    setPeriod,
    dimension,
    setDimension,
    weekOffset,
    setWeekOffset,
    maxWeekOffset: analyticsService.MAX_WEEK_OFFSET,
    selectedFilter,
    setSelectedFilter,
    stats,
    totalCases,
    maxValue,
    dateRangeLabel,
    trend,
    peakSlot,
  };
}
