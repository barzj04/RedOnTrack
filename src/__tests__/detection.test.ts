import { describe, expect, it } from 'vitest';
import type { CameraZones } from '../domain';
import {
  DEFAULT_SETTINGS,
  RiskTracker,
  decodeYolo,
  letterbox,
  nms,
  pointInPolygon,
  redZoneCoverage,
  riskFor,
  zoneOf,
  type Detection,
} from '../services/detectionService';

const ZONES: CameraZones = {
  red: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]],
  yellow: [[0.5, 0], [0.6, 0], [0.6, 1], [0.5, 1]],
};

const person = (x1: number, y1: number, x2: number, y2: number, score = 0.9): Detection => ({ cls: 'person', score, x1, y1, x2, y2 });
const train = (score = 0.95): Detection => ({ cls: 'train', score, x1: 0, y1: 0, x2: 0.5, y2: 1 });

describe('geometry', () => {
  it('point in polygon', () => {
    expect(pointInPolygon([0.25, 0.5], ZONES.red)).toBe(true);
    expect(pointInPolygon([0.55, 0.5], ZONES.red)).toBe(false);
  });

  it('uses the feet (bottom-centre) to place a person', () => {
    expect(zoneOf(person(0.2, 0.2, 0.3, 0.6), ZONES)).toBe('red');
    expect(zoneOf(person(0.52, 0.2, 0.58, 0.6), ZONES)).toBe('yellow');
    expect(zoneOf(person(0.7, 0.2, 0.8, 0.6), ZONES)).toBe('safe');
  });

  it('red zone coverage', () => {
    expect(redZoneCoverage(train(), ZONES)).toBeCloseTo(1);
    expect(redZoneCoverage({ ...train(), x1: 0.45, x2: 0.9 }, ZONES)).toBeCloseTo(0.1);
  });
});

describe('decodeYolo', () => {
  it('maps model pixels back to the frame through the letterbox', () => {
    // 960x540 frame -> scale 2/3, padY 140
    const lb = letterbox(960, 540, 640);
    const n = 2;
    // anchor 0: person box centred at (320, 320), 64x64 -> frame centre; anchor 1: below threshold
    const data = new Float32Array(6 * n);
    data[0] = 320; data[n] = 320; data[2 * n] = 64; data[3 * n] = 64; data[4 * n] = 0.9; data[5 * n] = 0.1;
    data[4 * n + 1] = 0.05;
    const out = decodeYolo(data, n, lb, 0.25);
    expect(out).toHaveLength(1);
    expect(out[0].cls).toBe('person');
    expect((out[0].x1 + out[0].x2) / 2).toBeCloseTo(0.5);
    expect((out[0].y1 + out[0].y2) / 2).toBeCloseTo(0.5);
    expect(out[0].x2 - out[0].x1).toBeCloseTo(96 / 960);
  });

  it('nms keeps the best of overlapping boxes', () => {
    const kept = nms([person(0.1, 0.1, 0.3, 0.5, 0.8), person(0.11, 0.1, 0.31, 0.5, 0.9), person(0.7, 0.1, 0.8, 0.5, 0.7)]);
    expect(kept).toHaveLength(2);
    expect(kept[0].score).toBe(0.9);
  });
});

describe('risk', () => {
  it('levels by zone and dwell', () => {
    expect(riskFor('safe', 10, DEFAULT_SETTINGS)).toBe('none');
    expect(riskFor('yellow', 0.5, DEFAULT_SETTINGS)).toBe('low');
    expect(riskFor('yellow', 5, DEFAULT_SETTINGS)).toBe('medium');
    expect(riskFor('red', 0.1, DEFAULT_SETTINGS)).toBe('medium');
    expect(riskFor('red', 1, DEFAULT_SETTINGS)).toBe('high');
  });
});

describe('RiskTracker', () => {
  it('keeps the same id while a person moves and confirms a red intrusion once', () => {
    const tr = new RiskTracker(ZONES);
    const a = tr.update([person(0.2, 0.2, 0.3, 0.6)], 0);
    expect(a.people[0].risk).toBe('medium');
    expect(a.incident).toBeUndefined(); // not confirmed yet
    const b = tr.update([person(0.21, 0.2, 0.31, 0.6)], 0.6);
    expect(b.people[0].id).toBe(a.people[0].id);
    expect(b.risk).toBe('high');
    expect(b.incident?.severity).toBe('high');
    expect(tr.update([person(0.21, 0.2, 0.31, 0.6)], 1).incident).toBeUndefined(); // cooldown
  });

  it('a confirmed train disables the zones; a brief or off-track train does not', () => {
    const tr = new RiskTracker(ZONES);
    const p = person(0.2, 0.2, 0.3, 0.6);
    expect(tr.update([p, train()], 0).trainPresent).toBe(false); // needs to hold for 1 s
    const r = tr.update([p, train()], 1.1);
    expect(r.trainPresent).toBe(true);
    expect(r.people[0].zone).toBe('safe');

    const t2 = new RiskTracker(ZONES);
    const offTrack: Detection = { cls: 'train', score: 0.95, x1: 0.48, y1: 0, x2: 0.9, y2: 1 };
    t2.update([p, offTrack], 0);
    expect(t2.update([p, offTrack], 2).trainPresent).toBe(false);
  });

  it('logs yellow-strip lingering as medium, then escalates to high without waiting', () => {
    const tr = new RiskTracker(ZONES, { ...DEFAULT_SETTINGS, yellowDwellSec: 1 });
    tr.update([person(0.52, 0.2, 0.58, 0.6)], 0);
    expect(tr.update([person(0.52, 0.2, 0.58, 0.6)], 1.2).incident?.severity).toBe('medium');
    tr.update([person(0.45, 0.2, 0.55, 0.6)], 1.5); // steps onto the track (foot at x=0.5 -> red edge)
    tr.update([person(0.3, 0.2, 0.4, 0.6)], 1.6);
    const r = tr.update([person(0.3, 0.2, 0.4, 0.6)], 2.3);
    expect(r.incident?.severity).toBe('high');
  });

  it('resets when the video loops', () => {
    const tr = new RiskTracker(ZONES);
    tr.update([person(0.2, 0.2, 0.3, 0.6)], 10);
    const r = tr.update([person(0.2, 0.2, 0.3, 0.6)], 0);
    expect(r.people[0].dwell).toBe(0);
  });
});
