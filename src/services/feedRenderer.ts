/**
 * Procedural CCTV scene renderer.
 *
 * Draws an original, simulated station-platform camera view on a canvas
 * (platform, tracks, pillars, commuters walking, trains arriving and leaving,
 * sensor noise). Used for demos so the app needs no third-party footage.
 * Real deployments replace this with the camera's video stream.
 */

export const FEED_WIDTH = 640;
export const FEED_HEIGHT = 360;

type Rand = () => number;

/** Small deterministic PRNG so each camera always looks the same. */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Person {
  x: number;
  z: number;
  speed: number; // m/s along z (negative = towards camera)
  shade: number;
  height: number;
  phase: number;
  waitTimer: number;
}

type TrainState = 'away' | 'arriving' | 'dwell' | 'departing';

import type { Scenario } from '../domain';

export type { Scenario };

export const SCENARIO_LABELS: Record<Scenario, string> = {
  slip: 'Person down',
  trespass: 'Person on track',
  crowd: 'Crowd density high',
  bag: 'Unattended item',
  edge: 'Past yellow line',
  door: 'Platform door fault',
  'live-edge': 'Past yellow line',
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/** Live-edge cycle (seconds): someone walks to the edge, stays, walks back. */
const LIVE_CYCLE = 32;

interface Vec {
  x: number;
  y: number;
}

const CAM_Y = 3.2;
const NEAR_Z = 1.2;
const FAR_Z = 140;

export class PlatformScene {
  private rand: Rand;
  private people: Person[] = [];
  private mirror: boolean;
  private cx: number;
  private cy: number;
  private focal: number;
  private tint: [number, number, number];
  private trainState: TrainState = 'away';
  private trainZ = 400; // z of the train's front
  private trainSpeed = 0;
  private stateTimer: number;
  private time = 0;
  private glitch = 0;
  private actor: Person;
  private boxes: Box[] = [];
  private alert: string | null = null;

  constructor(
    seed: number,
    private readonly status: 'active' | 'warning' | 'offline' = 'active',
    private readonly scenario?: Scenario,
  ) {
    this.rand = mulberry32(seed);
    const r = this.rand;
    this.mirror = r() > 0.5;
    this.cx = FEED_WIDTH * (0.5 + r() * 0.12);
    this.cy = FEED_HEIGHT * (0.36 + r() * 0.06);
    this.focal = FEED_WIDTH * (0.7 + r() * 0.2);
    const warm = r() > 0.5;
    this.tint = warm ? [1.0, 0.97, 0.9] : [0.92, 0.98, 1.0];
    this.stateTimer = 3 + r() * 10;

    const count = scenario === 'crowd' ? 42 : scenario === 'trespass' ? 2 : 7 + Math.floor(r() * 9);
    for (let i = 0; i < count; i++) this.people.push(this.spawnPerson(true));

    // the person / object the scenario is about
    this.actor = {
      x: scenario === 'trespass' ? 2.1 : scenario === 'edge' ? 0.3 : scenario === 'bag' ? -1.4 : -2.2,
      z: scenario === 'trespass' ? 24 : 7 + r() * 1.5,
      speed: 0,
      shade: scenario === 'trespass' ? 0.5 : 0.1,
      height: 1.72,
      phase: 0,
      waitTimer: 0,
    };
  }

  /** Current alert text, or null when nothing abnormal is on screen. */
  getAlert(): string | null {
    return this.alert;
  }

  private spawnPerson(anywhere: boolean): Person {
    const r = this.rand;
    if (this.scenario === 'crowd') {
      const dir = r() > 0.5 ? 1 : -1;
      return {
        x: -5.4 + r() * 4.8,
        z: anywhere ? 4 + r() * 20 : dir > 0 ? 4 : 24,
        speed: r() < 0.6 ? 0 : dir * (0.2 + r() * 0.3),
        shade: 0.12 + r() * 0.25,
        height: 1.55 + r() * 0.3,
        phase: r() * Math.PI * 2,
        waitTimer: 5 + r() * 30,
      };
    }
    const standing = r() < 0.35;
    const dir = r() > 0.5 ? 1 : -1;
    return {
      x: -5.4 + r() * 4.6,
      z: anywhere ? 3 + r() * 55 : dir > 0 ? 2 + r() * 2 : 55 + r() * 5,
      speed: standing ? 0 : dir * (0.7 + r() * 0.8),
      shade: 0.12 + r() * 0.25,
      height: 1.55 + r() * 0.3,
      phase: r() * Math.PI * 2,
      waitTimer: standing ? 4 + r() * 20 : 0,
    };
  }

  // ---------- projection ----------

  private project(x: number, y: number, z: number): Vec {
    const zz = Math.max(z, NEAR_Z);
    const sx = (this.mirror ? -x : x) / zz;
    return { x: this.cx + sx * this.focal, y: this.cy + ((CAM_Y - y) / zz) * this.focal };
  }

  private shade(v: number, alpha = 1): string {
    const [r, g, b] = this.tint;
    const c = (k: number) => Math.round(Math.min(255, Math.max(0, v * 255 * k)));
    return `rgba(${c(r)},${c(g)},${c(b)},${alpha})`;
  }

  private quad(ctx: CanvasRenderingContext2D, pts: Vec[], fill: string) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** Quad on a plane of constant x, spanning y0..y1 and z0..z1. */
  private wallX(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, z0: number, z1: number, fill: string) {
    this.quad(ctx, [this.project(x, y0, z0), this.project(x, y1, z0), this.project(x, y1, z1), this.project(x, y0, z1)], fill);
  }

  /** Quad on a plane of constant y, spanning x0..x1 and z0..z1. */
  private floorY(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number, z0: number, z1: number, fill: string) {
    this.quad(ctx, [this.project(x0, y, z0), this.project(x1, y, z0), this.project(x1, y, z1), this.project(x0, y, z1)], fill);
  }

  /** Quad on a plane of constant z. */
  private faceZ(ctx: CanvasRenderingContext2D, z: number, x0: number, x1: number, y0: number, y1: number, fill: string) {
    this.quad(ctx, [this.project(x0, y0, z), this.project(x1, y0, z), this.project(x1, y1, z), this.project(x0, y1, z)], fill);
  }

  // ---------- simulation ----------

  update(dt: number) {
    this.time += dt;
    const r = this.rand;

    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      if (p.speed === 0) {
        p.waitTimer -= dt;
        if (p.waitTimer <= 0 || this.trainState === 'dwell') {
          // waiting passengers start walking (or board when a train is in)
          p.speed = (r() > 0.5 ? 1 : -1) * (0.7 + r() * 0.8);
        }
      } else {
        p.z += p.speed * dt;
        p.phase += dt * 7 * Math.abs(p.speed);
      }
      const maxZ = this.scenario === 'crowd' ? 26 : 62;
      if (p.z < (this.scenario === 'crowd' ? 3 : 1.5) || p.z > maxZ) this.people[i] = this.spawnPerson(false);
    }

    this.updateScenario(dt);

    // no train runs through an active track intrusion
    if (this.scenario === 'trespass') return;

    this.stateTimer -= dt;
    switch (this.trainState) {
      case 'away':
        if (this.stateTimer <= 0) {
          this.trainState = 'arriving';
          this.trainZ = 260;
          this.trainSpeed = 26;
        }
        break;
      case 'arriving': {
        const stopAt = 5;
        const dist = this.trainZ - stopAt;
        this.trainSpeed = Math.max(1.2, Math.min(26, dist * 0.55));
        this.trainZ -= this.trainSpeed * dt;
        if (this.trainZ <= stopAt) {
          this.trainZ = stopAt;
          this.trainState = 'dwell';
          this.stateTimer = 6 + r() * 4;
        }
        break;
      }
      case 'dwell':
        if (this.stateTimer <= 0) {
          this.trainState = 'departing';
          this.trainSpeed = 0;
        }
        break;
      case 'departing':
        this.trainSpeed = Math.min(30, this.trainSpeed + 3.5 * dt);
        this.trainZ -= this.trainSpeed * dt;
        if (this.trainZ < -90) {
          this.trainState = 'away';
          this.stateTimer = 10 + r() * 18;
        }
        break;
    }

    if (this.status === 'warning' && r() < 0.01) this.glitch = 0.3;
    this.glitch = Math.max(0, this.glitch - dt);
  }

  private updateScenario(dt: number) {
    const a = this.actor;
    switch (this.scenario) {
      case 'trespass':
        a.speed = -0.7;
        a.z -= 0.7 * dt;
        a.phase += dt * 5;
        if (a.z < 5) a.z = 26;
        this.alert = SCENARIO_LABELS.trespass;
        break;
      case 'edge':
        a.phase += dt;
        this.alert = SCENARIO_LABELS.edge;
        break;
      case 'bag':
      case 'crowd':
      case 'door':
        this.alert = SCENARIO_LABELS[this.scenario];
        break;
      case 'slip': {
        const t = this.time % 9;
        a.speed = t < 2 ? 0.8 : 0;
        if (t < 2) a.phase += dt * 6;
        this.alert = t >= 2.3 ? SCENARIO_LABELS.slip : null;
        break;
      }
      case 'live-edge': {
        const t = this.time % LIVE_CYCLE;
        // 0-14 out of view, 14-18 walk to edge, 18-25 past the line, 25-29 walk back
        if (t < 14 || t >= 29) a.x = -9;
        else if (t < 18) a.x = -2.4 + ((t - 14) / 4) * 2.7;
        else if (t < 25) a.x = 0.3;
        else a.x = 0.3 - ((t - 25) / 4) * 2.7;
        a.speed = (t >= 14 && t < 18) || (t >= 25 && t < 29) ? 1 : 0;
        a.phase += dt * 6;
        this.alert = a.x > 0.1 ? SCENARIO_LABELS['live-edge'] : null;
        break;
      }
      default:
        this.alert = null;
    }
  }

  /** Screen rectangle around a world-space box. */
  private screenBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, label: string): Box {
    const pts: Vec[] = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(this.project(x, y, z));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX - 4, y: minY - 4, w: Math.max(...xs) - minX + 8, h: Math.max(...ys) - minY + 8, label };
  }

  private drawLying(ctx: CanvasRenderingContext2D, x: number, z: number) {
    const a = this.project(x - 0.85, 0.16, z);
    const b = this.project(x + 0.85, 0.16, z);
    const t = (0.34 / Math.max(z, NEAR_Z)) * this.focal;
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    ctx.fillStyle = this.shade(this.actor.shade);
    ctx.fillRect(left, a.y - t / 2, right - left - t * 0.6, t);
    ctx.beginPath();
    ctx.arc(right - t * 0.3, a.y - t * 0.1, t * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBag(ctx: CanvasRenderingContext2D, x: number, z: number) {
    this.wallX(ctx, x + 0.3, 0, 0.45, z, z + 0.25, this.shade(0.12));
    this.faceZ(ctx, z, x - 0.3, x + 0.3, 0, 0.45, this.shade(0.18));
    this.floorY(ctx, 0.45, x - 0.3, x + 0.3, z, z + 0.25, this.shade(0.25));
  }

  /** Adds the scenario's actors to the depth-sorted list and records highlight boxes. */
  private scenarioItems(ctx: CanvasRenderingContext2D, items: Array<{ z: number; draw: () => void }>) {
    const a = this.actor;
    this.boxes = [];
    switch (this.scenario) {
      case 'trespass':
        items.push({ z: a.z, draw: () => this.drawPerson(ctx, a, -1.15) });
        this.boxes.push(this.screenBox(a.x - 0.35, a.x + 0.35, -1.15, -1.15 + a.height, a.z - 0.3, a.z + 0.3, SCENARIO_LABELS.trespass));
        break;
      case 'edge':
        items.push({ z: a.z, draw: () => this.drawPerson(ctx, a) });
        this.boxes.push(this.screenBox(a.x - 0.35, a.x + 0.35, 0, a.height, a.z - 0.3, a.z + 0.3, SCENARIO_LABELS.edge));
        break;
      case 'live-edge':
        if (a.x > -8) items.push({ z: a.z, draw: () => this.drawPerson(ctx, a) });
        if (this.alert) this.boxes.push(this.screenBox(a.x - 0.35, a.x + 0.35, 0, a.height, a.z - 0.3, a.z + 0.3, this.alert));
        break;
      case 'bag': {
        items.push({ z: a.z, draw: () => this.drawBag(ctx, a.x, a.z) });
        const secs = 18 * 60 + Math.floor(this.time);
        const mm = Math.floor(secs / 60).toString().padStart(2, '0');
        const ss = (secs % 60).toString().padStart(2, '0');
        this.boxes.push(this.screenBox(a.x - 0.35, a.x + 0.35, 0, 0.5, a.z - 0.05, a.z + 0.3, `Unattended ${mm}:${ss}`));
        break;
      }
      case 'slip': {
        const lying = this.time % 9 >= 2.3;
        items.push({ z: a.z, draw: () => (lying ? this.drawLying(ctx, a.x, a.z) : this.drawPerson(ctx, a)) });
        if (lying) this.boxes.push(this.screenBox(a.x - 0.9, a.x + 0.9, 0, 0.4, a.z - 0.3, a.z + 0.3, SCENARIO_LABELS.slip));
        break;
      }
      case 'crowd':
        this.boxes.push(this.screenBox(-4.6, -0.6, 0, 1.9, 9, 24, SCENARIO_LABELS.crowd));
        break;
      case 'door': {
        // platform screen doors along the edge; door 3 stuck open
        for (let i = 0; i < 8; i++) {
          const z0 = 5 + i * 4.5;
          if (i === 2) continue;
          items.push({ z: z0, draw: () => this.wallX(ctx, 0.45, 0, 2.1, z0, z0 + 4.2, this.shade(0.75, 0.35)) });
        }
        const z0 = 5 + 2 * 4.5;
        items.push({ z: z0, draw: () => this.wallX(ctx, 0.45, 2.0, 2.1, z0, z0 + 4.2, this.shade(0.9)) });
        this.boxes.push(this.screenBox(0.1, 0.8, 0, 2.2, z0, z0 + 4.2, 'Door 3 not closing'));
        break;
      }
    }
  }

  private drawBoxes(ctx: CanvasRenderingContext2D) {
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    for (const b of this.boxes) {
      ctx.strokeStyle = 'rgba(248,64,52,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      const text = b.label.toUpperCase();
      const tw = ctx.measureText(text).width + 10;
      const ty = b.y > 22 ? b.y - 18 : b.y + b.h + 2;
      const tx = Math.min(Math.max(2, b.x - 1), FEED_WIDTH - tw - 2);
      ctx.fillStyle = 'rgba(220,38,38,0.95)';
      ctx.fillRect(tx, ty, tw, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, tx + 5, ty + 8.5);
    }
  }

  // ---------- drawing ----------

  render(ctx: CanvasRenderingContext2D) {
    const W = FEED_WIDTH;
    const H = FEED_HEIGHT;

    if (this.status === 'offline') {
      this.renderNoSignal(ctx);
      return;
    }

    // ceiling / background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, this.shade(0.1));
    bg.addColorStop(0.5, this.shade(0.2));
    bg.addColorStop(1, this.shade(0.14));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ceiling plane
    this.floorY(ctx, 4.6, -6, 6, NEAR_Z, FAR_Z, this.shade(0.17));

    // far tunnel mouth
    this.faceZ(ctx, FAR_Z, -6, 6, -1.2, 4.6, this.shade(0.05));

    // left wall with advert panels
    this.wallX(ctx, -6, 0, 4.6, NEAR_Z, FAR_Z, this.shade(0.34));
    for (let z = 6; z < 90; z += 9) this.wallX(ctx, -5.99, 1.0, 2.6, z, z + 4.5, this.shade(z % 18 === 6 ? 0.55 : 0.46));

    // platform floor + tactile/safety strip
    this.floorY(ctx, 0, -6, 0.5, NEAR_Z, FAR_Z, this.shade(0.52));
    this.floorY(ctx, 0.001, -0.35, 0.1, NEAR_Z, FAR_Z, this.shade(0.82));

    // platform edge face and track bed
    this.wallX(ctx, 0.5, -1.15, 0, NEAR_Z, FAR_Z, this.shade(0.22));
    this.floorY(ctx, -1.15, 0.5, 6, NEAR_Z, FAR_Z, this.shade(0.12));
    for (let z = 2; z < 60; z += 1.6) this.floorY(ctx, -1.14, 0.9, 3.4, z, z + 0.25, this.shade(0.2));

    // rails
    ctx.strokeStyle = this.shade(0.6);
    ctx.lineWidth = 1.2;
    for (const rx of [1.3, 2.9]) {
      const a = this.project(rx, -1.0, NEAR_Z);
      const b = this.project(rx, -1.0, FAR_Z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // right (track-side) wall
    this.wallX(ctx, 6, -1.15, 4.6, NEAR_Z, FAR_Z, this.shade(0.24));

    // ceiling lights
    for (let z = 4; z < 100; z += 6) {
      for (const lx of [-3.2, 2.2]) this.floorY(ctx, 4.55, lx - 0.25, lx + 0.25, z, z + 2.2, this.shade(0.95));
    }

    // wet floor where the slip happened
    if (this.scenario === 'slip') {
      const a = this.actor;
      this.floorY(ctx, 0.002, a.x - 1.3, a.x + 1.4, a.z - 1.2, a.z + 1.6, this.shade(0.66, 0.8));
    }

    // depth-sorted objects: pillars, people, train
    type Drawable = { z: number; draw: () => void };
    const items: Drawable[] = [];
    this.scenarioItems(ctx, items);

    for (let z = 10; z < 100; z += 14) {
      items.push({
        z,
        draw: () => {
          this.wallX(ctx, -2.7, 0, 4.6, z, z + 0.7, this.shade(0.42));
          this.faceZ(ctx, z, -3.4, -2.7, 0, 4.6, this.shade(0.6));
        },
      });
    }

    for (const p of this.people) items.push({ z: p.z, draw: () => this.drawPerson(ctx, p) });

    if (this.trainState !== 'away') {
      items.push({ z: Math.max(this.trainZ, NEAR_Z), draw: () => this.drawTrain(ctx) });
    }

    items.sort((a, b) => b.z - a.z).forEach((d) => d.draw());

    // night-time darkness for the trespass replay
    if (this.scenario === 'trespass') {
      ctx.fillStyle = 'rgba(0,0,12,0.28)';
      ctx.fillRect(0, 0, W, H);
    }

    this.postProcess(ctx);
    this.drawBoxes(ctx);
  }

  private drawPerson(ctx: CanvasRenderingContext2D, p: Person, baseY = 0) {
    const feet = this.project(p.x, baseY, p.z);
    const head = this.project(p.x, baseY + p.height, p.z);
    const h = feet.y - head.y;
    if (h < 1.5) return;
    const w = h * 0.27;
    const swing = p.speed === 0 ? 0 : Math.sin(p.phase) * w * 0.25;

    ctx.fillStyle = this.shade(p.shade);
    // legs
    ctx.fillRect(feet.x - w * 0.35 + swing, feet.y - h * 0.45, w * 0.3, h * 0.45);
    ctx.fillRect(feet.x + w * 0.05 - swing, feet.y - h * 0.45, w * 0.3, h * 0.45);
    // torso
    ctx.fillRect(feet.x - w / 2, feet.y - h * 0.84, w, h * 0.42);
    // head
    ctx.beginPath();
    ctx.arc(feet.x, feet.y - h * 0.91, h * 0.075, 0, Math.PI * 2);
    ctx.fill();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y, w * 0.7, Math.max(1, h * 0.03), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTrain(ctx: CanvasRenderingContext2D) {
    const front = Math.max(this.trainZ, NEAR_Z);
    const back = Math.max(this.trainZ + 90, NEAR_Z + 0.1);
    if (back <= NEAR_Z + 0.1) return;
    const x0 = 0.7;
    const x1 = 3.5;
    // side facing the platform
    this.wallX(ctx, x0, -0.9, 3.3, front, back, this.shade(0.66));
    // window band and door outlines
    this.wallX(ctx, x0 - 0.01, 1.2, 2.4, front, back, this.shade(0.18));
    for (let z = front + 4; z < back; z += 9) this.wallX(ctx, x0 - 0.02, -0.4, 2.6, z, z + 1.4, this.shade(this.trainState === 'dwell' ? 0.85 : 0.5));
    // roof
    this.floorY(ctx, 3.3, x0, x1, front, back, this.shade(0.5));
    // front face
    if (this.trainZ > NEAR_Z) {
      this.faceZ(ctx, front, x0, x1, -0.9, 3.3, this.shade(0.74));
      this.faceZ(ctx, front - 0.01, x0 + 0.4, x1 - 0.4, 1.3, 2.5, this.shade(0.15));
      if (this.trainState === 'arriving') {
        for (const hx of [x0 + 0.5, x1 - 0.5]) {
          const c = this.project(hx, 0.2, front);
          const rad = Math.max(1.5, (0.25 / front) * this.focal);
          const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad * 4);
          glow.addColorStop(0, 'rgba(255,255,240,0.95)');
          glow.addColorStop(1, 'rgba(255,255,240,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(c.x - rad * 4, c.y - rad * 4, rad * 8, rad * 8);
        }
      }
    }
  }

  private postProcess(ctx: CanvasRenderingContext2D) {
    const W = FEED_WIDTH;
    const H = FEED_HEIGHT;
    const r = this.rand;

    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    // sensor grain
    for (let i = 0; i < 380; i++) {
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${r() * 0.07})` : `rgba(0,0,0,${r() * 0.1})`;
      ctx.fillRect(r() * W, r() * H, 1.5, 1.5);
    }

    // brightness flicker
    ctx.fillStyle = `rgba(0,0,0,${0.03 + 0.03 * Math.sin(this.time * 11)})`;
    ctx.fillRect(0, 0, W, H);

    if (this.glitch > 0) {
      for (let i = 0; i < 5; i++) {
        const y = r() * H;
        const h = 2 + r() * 14;
        ctx.drawImage(ctx.canvas, 0, y, W, h, (r() - 0.5) * 40, y, W, h);
      }
    }
  }

  private renderNoSignal(ctx: CanvasRenderingContext2D) {
    const W = FEED_WIDTH;
    const H = FEED_HEIGHT;
    const r = this.rand;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2500; i++) {
      const g = Math.floor(r() * 200);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(r() * W, r() * H, 2, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W / 2 - 90, H / 2 - 22, 180, 44);
    ctx.fillStyle = '#fff';
    ctx.font = '700 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO SIGNAL', W / 2, H / 2);
  }
}
