import { describe, expect, it } from 'vitest';
import { buildSeedIncidents } from '../services/incidentService';
import { scenarioFor } from '../services/scenarioService';
import { PlatformScene } from '../services/feedRenderer';

const seed = buildSeedIncidents(new Date(2026, 10, 20));
const byId = (id: string) => seed.find((f) => f.id === id)!;

describe('incident replay scenarios', () => {
  it.each([
    ['F-001', 'slip'],
    ['F-002', 'trespass'],
    ['F-003', 'crowd'],
    ['F-004', 'bag'],
    ['F-005', 'edge'],
    ['F-006', 'door'],
  ])('replays %s as %s', (id, scenario) => {
    expect(scenarioFor(byId(id))).toBe(scenario);
  });

  it('has no scenario for vague remarks', () => {
    expect(scenarioFor({ ...byId('F-001'), remarks: 'See footage.' })).toBeUndefined();
  });

  it('live camera raises and clears the yellow-line alert', () => {
    const scene = new PlatformScene(1, 'active', 'live-edge');
    const seen = new Set<string | null>();
    for (let i = 0; i < 400; i++) {
      scene.update(0.1);
      seen.add(scene.getAlert());
    }
    expect(seen).toContain('Past yellow line');
    expect(seen).toContain(null);
  });

  it('normal cameras never raise an alert', () => {
    const scene = new PlatformScene(1, 'active');
    for (let i = 0; i < 400; i++) {
      scene.update(0.1);
      expect(scene.getAlert()).toBeNull();
    }
  });
});
