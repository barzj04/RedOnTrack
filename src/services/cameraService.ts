/**
 * Camera settings: names, locations and the red/yellow detection zones.
 * Saved per browser; in production these would be pushed to each edge device.
 */

import { CAMERA_FEEDS } from '../constants';
import type { CameraFeed, CameraZones, ZonePoint } from '../domain';
import storageService, { KEYS } from './storageService';

/**
 * Default zones, traced from the model's own overlay in the recorded footage:
 * the track on the left half is red, the strip beside it yellow.
 */
export const DEFAULT_ZONES: CameraZones = {
  red: [
    [0, 0],
    [0.49, 0],
    [0.49, 1],
    [0, 1],
  ],
  yellow: [
    [0.49, 0],
    [0.62, 0],
    [0.62, 1],
    [0.49, 1],
  ],
};

export interface CameraOverride {
  name?: string;
  location?: string;
  zones?: CameraZones;
}

type Overrides = Record<string, CameraOverride>;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const round = (n: number) => Math.round(n * 1000) / 1000;

export function normaliseZone(points: ZonePoint[]): ZonePoint[] {
  return points.map(([x, y]) => [round(clamp01(x)), round(clamp01(y))]);
}

function loadOverrides(): Overrides {
  return storageService.getJSON<Overrides>(KEYS.CAMERAS, {});
}

function merge(feed: CameraFeed, o?: CameraOverride): CameraFeed {
  return {
    ...feed,
    name: o?.name?.trim() || feed.name,
    location: o?.location?.trim() || feed.location,
    zones: o?.zones ?? feed.zones ?? DEFAULT_ZONES,
  };
}

/** All cameras with any saved settings applied. */
export function listCameras(): CameraFeed[] {
  const overrides = loadOverrides();
  return CAMERA_FEEDS.map((f) => merge(f, overrides[f.id]));
}

export function getCameraFeed(id: string): CameraFeed {
  const feed = CAMERA_FEEDS.find((c) => c.id === id);
  if (!feed) return { id, name: id, location: 'Unmapped camera', status: 'offline' };
  return merge(feed, loadOverrides()[id]);
}

export function saveCameraConfig(id: string, config: CameraOverride): CameraFeed {
  const overrides = loadOverrides();
  const zones = config.zones && { red: normaliseZone(config.zones.red), yellow: normaliseZone(config.zones.yellow) };
  overrides[id] = { ...overrides[id], ...config, ...(zones ? { zones } : {}) };
  storageService.setJSON(KEYS.CAMERAS, overrides);
  return getCameraFeed(id);
}

export function resetCameraConfig(id: string): CameraFeed {
  const overrides = loadOverrides();
  delete overrides[id];
  storageService.setJSON(KEYS.CAMERAS, overrides);
  return getCameraFeed(id);
}

/** Zone file for the edge device / model script (normalised 0..1 coordinates). */
export function zonesExport(feed: CameraFeed) {
  const zones = feed.zones ?? DEFAULT_ZONES;
  return {
    camera_id: feed.id,
    camera_name: feed.name,
    coordinates: 'normalised (0-1), origin top-left; multiply by frame width/height for pixels',
    red_zone: zones.red,
    yellow_zone: zones.yellow,
  };
}
