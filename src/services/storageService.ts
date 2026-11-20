/**
 * Thin, failure-tolerant wrapper around localStorage.
 * Storage can be unavailable (private mode, blocked site data), so every
 * call is wrapped and falls back to an in-memory copy.
 */

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    /* storage blocked */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked or full: in-memory copy still works for this visit */
  }
}

function remove(key: string): void {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  INCIDENTS: 'rot_incidents_v2',
  USERS: 'rot_users_v1',
  SESSION: 'rot_session_v1',
  ACCESS_LOG: 'rot_access_log_v1',
  LOGIN_ATTEMPTS: 'rot_login_attempts_v1',
  CAMERAS: 'rot_cameras_v1',
} as const;

const storageService = {
  getJSON<T>(key: string, fallback: T): T {
    const raw = read(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  setJSON<T>(key: string, value: T): void {
    write(key, JSON.stringify(value));
  },

  remove,

  /** Wipes all RedOnTrack data (used by "Reset demo data"). */
  clearAll(): void {
    Object.values(KEYS).forEach(remove);
  },
};

export default storageService;
