import type { CameraFeed } from '../domain';
import logo from '../assets/logo.png';

export const BRANDING = {
  logoUrl: logo,
  name: 'RedOnTrack',
  tagline: 'Station Safety Intelligence',
  station: 'HUB-09',
};

/**
 * Recorded output of the RedOnTrack Edge AI model (YOLO11n fine-tuned on
 * "person" and "train"). Each clip shows the model's own overlay: a red track
 * zone and yellow warning zone, switched off while a train is at the platform.
 * `alertWindows` are the seconds where the model raised INTRUSION ALERT.
 */
const ALERT_LABEL = 'Person in red zone';

export const MODEL_CLIPS = {
  trespass: { videoUrl: './footage/trespass.mp4', alertWindows: [[2.4, 3.4], [5.0, 8.0], [8.5, 12.0]] as Array<[number, number]>, alertLabel: ALERT_LABEL },
  comesIn: { videoUrl: './footage/comes.mp4', alertWindows: [] as Array<[number, number]>, alertLabel: ALERT_LABEL },
  static: { videoUrl: './footage/static.mp4', alertWindows: [] as Array<[number, number]>, alertLabel: ALERT_LABEL },
  leaving: { videoUrl: './footage/go.mp4', alertWindows: [] as Array<[number, number]>, alertLabel: ALERT_LABEL },
};

/** Clip used to replay red-zone incidents. */
export const MODEL_CLIP = MODEL_CLIPS.trespass;

/**
 * Camera nodes, each playing a recorded run of the model.
 * Remove `videoUrl` to fall back to a simulated feed.
 */
export const CAMERA_FEEDS: CameraFeed[] = [
  { id: 'CAM-01', name: 'Platform 1', location: 'Train arriving', status: 'active', ...MODEL_CLIPS.comesIn },
  { id: 'CAM-02', name: 'Platform 2', location: 'No train', status: 'active', ...MODEL_CLIPS.trespass },
  { id: 'CAM-03', name: 'Platform 3', location: 'Train at platform', status: 'active', ...MODEL_CLIPS.static },
  { id: 'CAM-04', name: 'Platform 4', location: 'Train departing', status: 'active', ...MODEL_CLIPS.leaving },
];
