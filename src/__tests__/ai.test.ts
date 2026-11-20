import { describe, expect, it } from 'vitest';
import { activeMode, analyseIncident, analyseOffline, buildPrompt } from '../services/aiService';
import { buildSeedIncidents } from '../services/incidentService';

const seed = buildSeedIncidents(new Date(2026, 10, 20));
const byId = (id: string) => seed.find((f) => f.id === id)!;

describe('offline analyser', () => {
  it.each([
    ['F-001', 'Slip, trip or fall'],
    ['F-002', 'Track intrusion / trespass'],
    ['F-003', 'Crowding and congestion'],
    ['F-004', 'Unattended or suspicious item'],
    ['F-005', 'Passenger at platform edge'],
    ['F-006', 'Equipment or technical fault'],
  ])('classifies %s as %s', (id, category) => {
    expect(analyseOffline(byId(id)).category).toBe(category);
  });

  it('rates the night-time trespass as high severity', () => {
    expect(analyseOffline(byId('F-002')).severity).toBe('high');
  });

  it('always produces the four report sections', () => {
    const { text } = analyseOffline(byId('F-001'));
    for (const h of ['1. ANOMALY DETECTION', '2. RISK ASSESSMENT', '3. PREVENTATIVE MEASURES', '4. FORENSIC SUMMARY']) {
      expect(text).toContain(h);
    }
  });

  it('falls back to a generic category for vague remarks', () => {
    const r = analyseOffline({ ...byId('F-001'), remarks: 'See footage.' });
    expect(r.category).toBe('General safety incident');
    expect(r.severity).toBe('low');
  });
});

describe('analyseIncident', () => {
  it('uses the offline engine when no key or proxy is configured', async () => {
    expect(activeMode()).toBe('offline-rules');
    const r = await analyseIncident(byId('F-004'));
    expect(r.mode).toBe('offline-rules');
  });

  it('includes the incident metadata in the Gemini prompt', () => {
    const p = buildPrompt(byId('F-002'));
    expect(p).toContain('Platform 4');
    expect(p).toContain('02:45');
  });
});
