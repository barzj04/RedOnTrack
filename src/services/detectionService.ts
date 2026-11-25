/**
 * Live detection logic (no browser APIs, so it is unit-testable).
 *
 * Pipeline per frame:
 *   YOLO output -> decode + NMS -> train gate -> zone check per person
 *   -> tracker (dwell time) -> risk level -> incident events
 *
 * Model output format (YOLO11 detect, exported to ONNX): [1, 4 + C, N]
 * rows 0-3 = cx, cy, w, h in model-input pixels, rows 4.. = class scores.
 * Classes: 0 = person, 1 = train.
 */

import type { CameraZones, Severity, ZonePoint } from '../domain';

export const CLASS_NAMES = ['person', 'train'] as const;
export type ClassName = (typeof CLASS_NAMES)[number];

/** Box in normalised frame coordinates (0..1, origin top-left). */
export interface Detection {
  cls: ClassName;
  score: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** How the frame was letterboxed into the square model input. */
export interface Letterbox {
  /** model input size (e.g. 640) */
  size: number;
  /** scale applied to the source frame */
  scale: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
}

export function letterbox(srcW: number, srcH: number, size = 640): Letterbox {
  const scale = Math.min(size / srcW, size / srcH);
  return {
    size,
    scale,
    padX: (size - srcW * scale) / 2,
    padY: (size - srcH * scale) / 2,
    srcW,
    srcH,
  };
}

/** Decode raw YOLO output into boxes on the original frame (normalised). */
export function decodeYolo(
  data: Float32Array | number[],
  numAnchors: number,
  lb: Letterbox,
  minScore = 0.25,
  numClasses = CLASS_NAMES.length,
): Detection[] {
  const out: Detection[] = [];
  for (let i = 0; i < numAnchors; i++) {
    let best = 0;
    let cls = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = data[(4 + c) * numAnchors + i];
      if (s > best) {
        best = s;
        cls = c;
      }
    }
    if (best < minScore) continue;
    const cx = data[i];
    const cy = data[numAnchors + i];
    const w = data[2 * numAnchors + i];
    const h = data[3 * numAnchors + i];
    const toX = (v: number) => clamp01((v - lb.padX) / lb.scale / lb.srcW);
    const toY = (v: number) => clamp01((v - lb.padY) / lb.scale / lb.srcH);
    out.push({
      cls: CLASS_NAMES[cls],
      score: best,
      x1: toX(cx - w / 2),
      y1: toY(cy - h / 2),
      x2: toX(cx + w / 2),
      y2: toY(cy + h / 2),
    });
  }
  return nms(out);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function iou(a: Detection, b: Detection): number {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Class-wise non-max suppression. */
export function nms(dets: Detection[], threshold = 0.45): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const keep: Detection[] = [];
  for (const d of sorted) {
    if (keep.every((k) => k.cls !== d.cls || iou(k, d) < threshold)) keep.push(d);
  }
  return keep;
}

// ---------------- zones ----------------

export function pointInPolygon([x, y]: ZonePoint, poly: ZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type ZoneHit = 'red' | 'yellow' | 'safe';

/** A person is placed by their feet (bottom-centre of the box), same as the edge script. */
export function zoneOf(d: Detection, zones: CameraZones): ZoneHit {
  const foot: ZonePoint = [(d.x1 + d.x2) / 2, d.y2];
  if (pointInPolygon(foot, zones.red)) return 'red';
  if (pointInPolygon(foot, zones.yellow)) return 'yellow';
  return 'safe';
}

/** Share of the red zone's bounding box covered by a box (0..1). */
export function redZoneCoverage(d: Detection, zones: CameraZones): number {
  const xs = zones.red.map((p) => p[0]);
  const ys = zones.red.map((p) => p[1]);
  const zx1 = Math.min(...xs);
  const zx2 = Math.max(...xs);
  const zy1 = Math.min(...ys);
  const zy2 = Math.max(...ys);
  const ix = Math.max(0, Math.min(d.x2, zx2) - Math.max(d.x1, zx1));
  const iy = Math.max(0, Math.min(d.y2, zy2) - Math.max(d.y1, zy1));
  const area = (zx2 - zx1) * (zy2 - zy1);
  return area <= 0 ? 0 : (ix * iy) / area;
}

// ---------------- settings ----------------

export interface DetectionSettings {
  /** Minimum score to keep a person box. */
  personScore: number;
  /** Minimum score for a train to count. */
  trainScore: number;
  /** Train box must cover at least this share of the red zone. */
  trainCoverage: number;
  /** Train must be seen for this long before zones switch off (and gone this long before they switch back on). */
  trainHoldSec: number;
  /** Seconds in the yellow strip before a warning becomes MEDIUM. */
  yellowDwellSec: number;
  /** Seconds in the red zone before the alert is confirmed (filters one-frame glitches). */
  redConfirmSec: number;
  /** Seconds between two logged incidents from the same camera. */
  incidentCooldownSec: number;
}

export const DEFAULT_SETTINGS: DetectionSettings = {
  personScore: 0.35,
  trainScore: 0.8,
  trainCoverage: 0.25,
  trainHoldSec: 1,
  yellowDwellSec: 3,
  redConfirmSec: 0.5,
  incidentCooldownSec: 15,
};

// ---------------- tracker + risk ----------------

export type RiskLevel = 'none' | Severity;

export interface TrackedPerson extends Detection {
  id: number;
  zone: ZoneHit;
  /** Seconds this person has been continuously in their current zone. */
  dwell: number;
  risk: RiskLevel;
}

export interface FrameResult {
  people: TrackedPerson[];
  trains: Detection[];
  /** True while a confirmed train is at the platform: zones are disabled. */
  trainPresent: boolean;
  /** Highest risk in the frame. */
  risk: RiskLevel;
  /** Set on the frame where a new incident should be logged. */
  incident?: IncidentEvent;
}

export interface IncidentEvent {
  time: number; // seconds (video time or since start)
  severity: Severity;
  zone: ZoneHit;
  personId: number;
  dwell: number;
  message: string;
}

const RISK_ORDER: RiskLevel[] = ['none', 'low', 'medium', 'high'];
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel =>
  RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;

export function riskFor(zone: ZoneHit, dwell: number, s: DetectionSettings): RiskLevel {
  if (zone === 'red') return dwell >= s.redConfirmSec ? 'high' : 'medium';
  if (zone === 'yellow') return dwell >= s.yellowDwellSec ? 'medium' : 'low';
  return 'none';
}

interface Track {
  id: number;
  box: Detection;
  zone: ZoneHit;
  zoneSince: number;
  lastSeen: number;
}

/**
 * Keeps identities across frames (greedy IoU matching), measures how long
 * each person stays in a zone, gates zones on a confirmed train, and emits
 * at most one incident per cooldown window.
 */
export class RiskTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private trainSeenSince: number | null = null;
  private trainGoneSince: number | null = null;
  private trainPresent = false;
  private lastIncident = -Infinity;
  private lastSeverity: Severity | null = null;

  constructor(
    private zones: CameraZones,
    private settings: DetectionSettings = DEFAULT_SETTINGS,
  ) {}

  setZones(z: CameraZones) {
    this.zones = z;
  }

  setSettings(s: DetectionSettings) {
    this.settings = s;
  }

  reset() {
    this.tracks = [];
    this.nextId = 1;
    this.trainSeenSince = null;
    this.trainGoneSince = null;
    this.trainPresent = false;
    this.lastIncident = -Infinity;
    this.lastSeverity = null;
  }

  update(dets: Detection[], t: number): FrameResult {
    const s = this.settings;
    // A clock jump backwards (video looped or seeked) restarts the timers.
    if (this.tracks.some((tr) => tr.lastSeen > t + 0.5)) this.reset();

    const trains = dets.filter(
      (d) => d.cls === 'train' && d.score >= s.trainScore && redZoneCoverage(d, this.zones) >= s.trainCoverage,
    );
    this.updateTrainGate(trains.length > 0, t);

    const people = dets.filter((d) => d.cls === 'person' && d.score >= s.personScore);
    const used = new Set<number>();
    const result: TrackedPerson[] = [];

    for (const p of people) {
      let best: Track | undefined;
      let bestIou = 0.2;
      for (const tr of this.tracks) {
        if (used.has(tr.id)) continue;
        const o = iou(tr.box, p);
        if (o > bestIou) {
          bestIou = o;
          best = tr;
        }
      }
      const zone: ZoneHit = this.trainPresent ? 'safe' : zoneOf(p, this.zones);
      if (!best) {
        best = { id: this.nextId++, box: p, zone, zoneSince: t, lastSeen: t };
        this.tracks.push(best);
      } else if (best.zone !== zone) {
        best.zone = zone;
        best.zoneSince = t;
      }
      best.box = p;
      best.lastSeen = t;
      used.add(best.id);
      const dwell = t - best.zoneSince;
      result.push({ ...p, id: best.id, zone, dwell, risk: riskFor(zone, dwell, s) });
    }

    // forget people not seen for a second
    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen <= 1);

    const risk = result.reduce<RiskLevel>((r, p) => maxRisk(r, p.risk), 'none');
    const frame: FrameResult = { people: result, trains, trainPresent: this.trainPresent, risk };

    // Loggable: a confirmed red-zone intrusion, or someone lingering in the yellow strip.
    // An unconfirmed red hit (medium) waits for confirmation instead of using up the cooldown.
    const loggable = result
      .filter((p) => p.risk === 'high' || (p.zone === 'yellow' && p.risk === 'medium'))
      .sort((a, b) => RISK_ORDER.indexOf(b.risk) - RISK_ORDER.indexOf(a.risk) || b.dwell - a.dwell);
    const worst = loggable[0];
    const escalates = worst?.risk === 'high' && this.lastSeverity === 'medium';
    if (worst && (t - this.lastIncident >= s.incidentCooldownSec || escalates)) {
      this.lastIncident = t;
      this.lastSeverity = worst.risk as Severity;
      frame.incident = {
        time: t,
        severity: worst.risk as Severity,
        zone: worst.zone,
        personId: worst.id,
        dwell: worst.dwell,
        message:
          worst.zone === 'red'
            ? `Person #${worst.id} entered the track (red zone) with no train at the platform.`
            : `Person #${worst.id} stayed in the yellow strip for ${worst.dwell.toFixed(1)} s.`,
      };
    }
    return frame;
  }

  private updateTrainGate(seen: boolean, t: number) {
    const hold = this.settings.trainHoldSec;
    if (seen) {
      this.trainGoneSince = null;
      this.trainSeenSince ??= t;
      if (!this.trainPresent && t - this.trainSeenSince >= hold) this.trainPresent = true;
    } else {
      this.trainSeenSince = null;
      this.trainGoneSince ??= t;
      if (this.trainPresent && t - this.trainGoneSince >= hold) this.trainPresent = false;
    }
  }
}
