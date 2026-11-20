/**
 * Domain types shared across services, hooks and pages.
 */

// ============ Camera ============
export type CameraStatus = 'active' | 'warning' | 'offline';

/** Incident scenarios the simulated cameras can act out. */
export type Scenario = 'slip' | 'trespass' | 'crowd' | 'bag' | 'edge' | 'door' | 'live-edge';

/** A point in normalised image coordinates: [x, y], each 0..1 from the top-left. */
export type ZonePoint = [number, number];

/** Detection zones for one camera, as polygons (normally 4 corners). */
export interface CameraZones {
  /** Restricted area (the track): a person here raises an intrusion alert. */
  red: ZonePoint[];
  /** Warning strip next to the platform edge. */
  yellow: ZonePoint[];
}

export interface CameraFeed {
  id: string;
  name: string;
  location: string;
  status: CameraStatus;
  /** Optional URL of your own recorded clip (.mp4/.webm). Without it a simulated feed is drawn. */
  videoUrl?: string;
  /** Demo only: the simulated feed periodically acts out this scenario. */
  scenario?: Scenario;
  /** For recorded detection output: [start, end] seconds where the model raised an alert. */
  alertWindows?: Array<[number, number]>;
  /** Text shown while inside an alert window. */
  alertLabel?: string;
  /** Red and yellow zones the edge device uses for this camera. */
  zones?: CameraZones;
}

// ============ Incidents ============
export type Severity = 'low' | 'medium' | 'high';
export type AnalysisMode = 'gemini-proxy' | 'gemini-direct' | 'offline-rules';

export interface AnalysisReport {
  text: string;
  mode: AnalysisMode;
  generatedAt: string; // ISO timestamp
  severity?: Severity;
  category?: string;
  notice?: string;
}

export interface FootageFolder {
  id: string;
  date: string; // DD/MM/YYYY
  day: string; // Monday, Tuesday...
  time: string; // HH:MM (24h)
  platform: string;
  remarks: string;
  cameras: string[];
  saved: boolean;
  analysis?: AnalysisReport;
}

// ============ Analytics ============
export interface AccidentStat {
  label: string;
  value: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// ============ Raw data catalog ============
export interface CameraFile {
  id: string;
  name: string;
  size: string;
  resolution: string;
  timestamp: string;
}

export interface DayFolder {
  id: string;
  date: string;
  day: string;
  totalSize: string;
  files: CameraFile[];
}

// ============ Auth ============
export type Role = 'admin' | 'operator' | 'viewer';

export type Permission =
  | 'incident:edit'
  | 'incident:save'
  | 'incident:export'
  | 'ai:run'
  | 'footage:capture'
  | 'camera:configure'
  | 'logs:view';

export interface UserAccount {
  id: string; // 8-digit employee ID
  name: string;
  position: string;
  role: Role;
  passwordHash: string;
}

export interface UserSession {
  id: string;
  name: string;
  position: string;
  role: Role;
  loginTime: string; // ISO
}

export interface LoginHistoryEntry {
  name: string;
  id: string;
  position: string;
  loginTime: string; // YYYY-MM-DD HH:MM:SS
  signOutTime: string | null; // null while still signed in
}
