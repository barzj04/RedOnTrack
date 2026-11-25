/**
 * Incident service: seed data, persistence and filtering for incident folders.
 */

import type { FootageFolder } from '../domain';
import storageService, { KEYS } from './storageService';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Four-hour time slots used by the "By Time" chart and filter. Half-open: [start, end). */
export const TIME_SLOTS = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];

const pad = (n: number) => n.toString().padStart(2, '0');

export function formatDDMMYYYY(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Sample incidents dated relative to "now", so the demo never looks stale. */
export function buildSeedIncidents(now: Date = new Date()): FootageFolder[] {
  const seed: Array<Omit<FootageFolder, 'date' | 'day'> & { daysAgo: number }> = [
    { id: 'F-001', daysAgo: 1, time: '14:30', platform: 'Platform 2', remarks: 'Passenger slipped near the escalator. Floor was wet after cleaning. Medical team responded in 2 mins.', cameras: ['CAM-02', 'CAM-04'], saved: true },
    { id: 'F-002', daysAgo: 3, time: '02:45', platform: 'Platform 4', remarks: 'Unauthorised track access. Trespasser climbed down from platform end and fled toward North Exit.', cameras: ['CAM-04', 'CAM-03', 'CAM-01'], saved: false },
    { id: 'F-003', daysAgo: 6, time: '08:15', platform: 'Platform 1', remarks: 'Heavy congestion during morning peak led to a minor collision between commuters at the stairs.', cameras: ['CAM-01'], saved: true },
    { id: 'F-004', daysAgo: 9, time: '18:50', platform: 'Platform 3', remarks: 'Bag left unattended for 20 mins. Area cordoned off, cleared by security team.', cameras: ['CAM-03', 'CAM-02'], saved: false },
    { id: 'F-005', daysAgo: 2, time: '21:20', platform: 'Platform 2', remarks: 'Intoxicated passenger standing over the yellow line near platform edge. Escorted out by security.', cameras: ['CAM-02'], saved: false },
    { id: 'F-006', daysAgo: 5, time: '07:45', platform: 'Platform 1', remarks: 'Technical fault on platform screen doors, door 3 failed to close. Maintenance notified.', cameras: ['CAM-01', 'CAM-02'], saved: true },
  ];

  return seed
    .map(({ daysAgo, ...rest }) => {
      const d = new Date(now);
      d.setDate(now.getDate() - daysAgo);
      return { ...rest, date: formatDDMMYYYY(d), day: DAY_NAMES[d.getDay()] };
    })
    .sort((a, b) => incidentSortKey(b) - incidentSortKey(a));
}

/** Sortable number from DD/MM/YYYY + HH:MM (newest first when sorted descending). */
export function incidentSortKey(f: Pick<FootageFolder, 'date' | 'time'>): number {
  const [dd, mm, yyyy] = f.date.split('/').map(Number);
  const [hh, mi] = f.time.split(':').map(Number);
  return new Date(yyyy, mm - 1, dd, hh, mi).getTime();
}

/** Incident folder for an event raised by Live Detection. */
export function liveIncident(
  ev: { severity: string; message: string; dwell: number },
  camera: { id: string; name: string },
  now: Date = new Date(),
): FootageFolder {
  return {
    id: `L-${now.getTime().toString(36).toUpperCase()}`,
    date: formatDDMMYYYY(now),
    day: DAY_NAMES[now.getDay()],
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    platform: camera.name,
    remarks: `[Auto-logged by Live Detection · ${ev.severity.toUpperCase()}] ${ev.message} Time in zone: ${ev.dwell.toFixed(1)} s.`,
    cameras: [camera.id],
    saved: false,
  };
}

export function loadIncidents(): FootageFolder[] {
  return storageService.getJSON<FootageFolder[] | null>(KEYS.INCIDENTS, null) ?? buildSeedIncidents();
}

export function saveIncidents(incidents: FootageFolder[]): void {
  storageService.setJSON(KEYS.INCIDENTS, incidents);
}

export function systemFilename(f: FootageFolder): string {
  return `${f.date.replace(/\//g, '')}_${f.day.substring(0, 3)}_${f.time.replace(':', '')}_${f.platform.replace(/\s+/g, '')}`;
}

// ---------- filters ----------

/** True if the incident's hour falls in a slot label like "08-12" (half-open). */
export function matchesTimeSlot(time: string, slot: string): boolean {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(slot);
  if (!match) return false;
  const start = Number(match[1]);
  const end = Number(match[2]) === 0 ? 24 : Number(match[2]);
  const hour = Number(time.split(':')[0]);
  if (Number.isNaN(hour)) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** True if the incident's day matches a short ("Mon") or long ("Monday") day label. */
export function matchesDay(day: string, label: string): boolean {
  return day === label || day.substring(0, 3) === label;
}

export function filterIncidents(
  incidents: FootageFolder[],
  filter: string | null,
  dimension: 'day' | 'time',
): FootageFolder[] {
  if (!filter) return incidents;
  return incidents.filter((f) => (dimension === 'day' ? matchesDay(f.day, filter) : matchesTimeSlot(f.time, filter)));
}
