import { describe, expect, it } from 'vitest';
import { buildSeedIncidents, filterIncidents, matchesDay, matchesTimeSlot, TIME_SLOTS } from '../services/incidentService';

describe('matchesTimeSlot', () => {
  it('matches the start hour and excludes the end hour (half-open)', () => {
    expect(matchesTimeSlot('08:00', '08-12')).toBe(true);
    expect(matchesTimeSlot('11:59', '08-12')).toBe(true);
    expect(matchesTimeSlot('12:00', '08-12')).toBe(false);
  });

  it('handles the slot that ends at midnight', () => {
    expect(matchesTimeSlot('23:30', '20-24')).toBe(true);
    expect(matchesTimeSlot('00:10', '20-24')).toBe(false);
    expect(matchesTimeSlot('00:10', '00-04')).toBe(true);
  });

  it('puts every hour of the day in exactly one slot', () => {
    for (let h = 0; h < 24; h++) {
      const time = `${String(h).padStart(2, '0')}:30`;
      expect(TIME_SLOTS.filter((s) => matchesTimeSlot(time, s))).toHaveLength(1);
    }
  });

  it('rejects malformed slot labels', () => {
    expect(matchesTimeSlot('08:00', 'morning')).toBe(false);
  });
});

describe('matchesDay', () => {
  it('accepts short and long day names', () => {
    expect(matchesDay('Monday', 'Mon')).toBe(true);
    expect(matchesDay('Monday', 'Monday')).toBe(true);
    expect(matchesDay('Monday', 'Tue')).toBe(false);
  });
});

describe('seed incidents', () => {
  const now = new Date(2026, 10, 20, 12, 0); // Fri 20 Nov 2026
  const seed = buildSeedIncidents(now);

  it('dates incidents relative to today with the correct weekday', () => {
    const f1 = seed.find((f) => f.id === 'F-001')!;
    expect(f1.date).toBe('19/11/2026');
    expect(f1.day).toBe('Thursday');
  });

  it('is sorted newest first', () => {
    expect(seed[0].id).toBe('F-001');
  });

  it('filters by time slot so the 02:45 trespass shows under 00-04', () => {
    const night = filterIncidents(seed, '00-04', 'time');
    expect(night.map((f) => f.id)).toEqual(['F-002']);
  });

  it('returns everything when no filter is set', () => {
    expect(filterIncidents(seed, null, 'day')).toHaveLength(seed.length);
  });
});
