import { beforeEach, describe, expect, it } from 'vitest';
import * as cams from '../services/cameraService';
import storageService from '../services/storageService';
import { hasPermission } from '../services/authService';

beforeEach(() => storageService.clearAll());

describe('camera configuration', () => {
  it('gives every camera the default red and yellow zones', () => {
    for (const c of cams.listCameras()) expect(c.zones).toEqual(cams.DEFAULT_ZONES);
  });

  it('saves a new name and zones for one camera only', () => {
    const red: [number, number][] = [[0, 0], [0.4, 0], [0.45, 1], [0, 1]];
    cams.saveCameraConfig('CAM-02', { name: 'Platform 2 North', zones: { red, yellow: cams.DEFAULT_ZONES.yellow } });
    expect(cams.getCameraFeed('CAM-02').name).toBe('Platform 2 North');
    expect(cams.getCameraFeed('CAM-02').zones?.red).toEqual(red);
    expect(cams.getCameraFeed('CAM-01').zones).toEqual(cams.DEFAULT_ZONES);
  });

  it('clamps points into the frame', () => {
    expect(cams.normaliseZone([[-0.2, 1.4], [0.33333, 0.5]])).toEqual([[0, 1], [0.333, 0.5]]);
  });

  it('keeps the original name when the new one is blank', () => {
    cams.saveCameraConfig('CAM-01', { name: '   ' });
    expect(cams.getCameraFeed('CAM-01').name).toBe('Platform 1');
  });

  it('resets a camera to its defaults', () => {
    cams.saveCameraConfig('CAM-03', { name: 'X' });
    expect(cams.resetCameraConfig('CAM-03').name).toBe('Platform 3');
  });

  it('exports a zone file the model script can read', () => {
    const z = cams.zonesExport(cams.getCameraFeed('CAM-02'));
    expect(z.camera_id).toBe('CAM-02');
    expect(z.red_zone).toHaveLength(4);
    expect(z.yellow_zone).toHaveLength(4);
  });

  it('lets admins and operators configure zones, not viewers', () => {
    expect(hasPermission('admin', 'camera:configure')).toBe(true);
    expect(hasPermission('operator', 'camera:configure')).toBe(true);
    expect(hasPermission('viewer', 'camera:configure')).toBe(false);
  });
});
