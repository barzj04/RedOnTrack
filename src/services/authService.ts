/**
 * Authentication service (client-side demo implementation).
 *
 * Passwords are stored as salted SHA-256 hashes, sessions and the access log
 * live in localStorage, and repeated failures trigger a short lockout.
 * This is enough to demo role-based access, but it is NOT a security boundary:
 * for a real deployment swap this module for a server-side provider
 * (Firebase Auth, Supabase Auth, Keycloak...). The rest of the app only talks
 * to the functions exported here, so the swap stays local to this file.
 */

import type { LoginHistoryEntry, Permission, Role, UserAccount, UserSession } from '../domain';
import storageService, { KEYS } from './storageService';

const SALT = 'redontrack::';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  operator: 'Operator',
  viewer: 'Viewer',
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['incident:edit', 'incident:save', 'incident:export', 'ai:run', 'footage:capture', 'camera:configure', 'logs:view'],
  operator: ['incident:edit', 'incident:save', 'incident:export', 'ai:run', 'footage:capture', 'camera:configure'],
  viewer: [],
};

/** Demo accounts shown on the login screen. */
export const DEMO_ACCOUNTS: Array<Omit<UserAccount, 'passwordHash'> & { password: string }> = [
  { id: '10064620', name: 'Sarah Jenkins', position: 'Station Manager', role: 'admin', password: 'admin123' },
  { id: '22839401', name: 'Marcus Thorne', position: 'Security Lead', role: 'operator', password: 'operator123' },
  { id: '33910284', name: 'Elena Rodriguez', position: 'Traffic Controller', role: 'viewer', password: 'viewer123' },
];

const SEED_ACCESS_LOG: LoginHistoryEntry[] = [
  { name: 'Sarah Jenkins', id: '10064620', position: 'Station Manager', loginTime: '2026-11-16 08:00:12', signOutTime: '2026-11-16 16:30:45' },
  { name: 'Marcus Thorne', id: '22839401', position: 'Security Lead', loginTime: '2026-11-16 16:25:00', signOutTime: '2026-11-17 00:15:22' },
  { name: 'Elena Rodriguez', id: '33910284', position: 'Traffic Controller', loginTime: '2026-11-17 00:10:15', signOutTime: '2026-11-17 08:05:00' },
  { name: 'Sarah Jenkins', id: '10064620', position: 'Station Manager', loginTime: '2026-11-17 08:00:00', signOutTime: '2026-11-17 16:20:11' },
  { name: 'Marcus Thorne', id: '22839401', position: 'Security Lead', loginTime: '2026-11-17 16:15:00', signOutTime: '2026-11-18 00:02:40' },
];

// ---------- helpers ----------

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + password);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function formatTimestamp(date: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export const isValidEmployeeId = (id: string) => /^\d{8}$/.test(id);

async function getAccounts(): Promise<UserAccount[]> {
  const stored = storageService.getJSON<UserAccount[] | null>(KEYS.USERS, null);
  if (stored && stored.length) return stored;
  const seeded = await Promise.all(
    DEMO_ACCOUNTS.map(async ({ password, ...rest }) => ({ ...rest, passwordHash: await hashPassword(password) })),
  );
  storageService.setJSON(KEYS.USERS, seeded);
  return seeded;
}

interface AttemptState {
  count: number;
  lockedUntil: number;
}

function getAttempts(): AttemptState {
  return storageService.getJSON<AttemptState>(KEYS.LOGIN_ATTEMPTS, { count: 0, lockedUntil: 0 });
}

// ---------- access log ----------

export function getAccessLog(): LoginHistoryEntry[] {
  return storageService.getJSON<LoginHistoryEntry[]>(KEYS.ACCESS_LOG, SEED_ACCESS_LOG);
}

function appendAccessLog(entry: LoginHistoryEntry) {
  storageService.setJSON(KEYS.ACCESS_LOG, [...getAccessLog(), entry]);
}

function closeAccessLog(session: UserSession) {
  const loginStamp = formatTimestamp(new Date(session.loginTime));
  const log = getAccessLog().map((e) =>
    e.id === session.id && e.loginTime === loginStamp && e.signOutTime === null
      ? { ...e, signOutTime: formatTimestamp(new Date()) }
      : e,
  );
  storageService.setJSON(KEYS.ACCESS_LOG, log);
}

// ---------- public API ----------

export type AuthResult = { ok: true; session: UserSession } | { ok: false; error: string };

function startSession(account: UserAccount): UserSession {
  const now = new Date();
  const session: UserSession = {
    id: account.id,
    name: account.name,
    position: account.position,
    role: account.role,
    loginTime: now.toISOString(),
  };
  storageService.setJSON(KEYS.SESSION, session);
  appendAccessLog({
    name: account.name,
    id: account.id,
    position: account.position,
    loginTime: formatTimestamp(now),
    signOutTime: null,
  });
  return session;
}

export async function login(employeeId: string, password: string): Promise<AuthResult> {
  const attempts = getAttempts();
  const now = Date.now();
  if (attempts.lockedUntil > now) {
    const secs = Math.ceil((attempts.lockedUntil - now) / 1000);
    return { ok: false, error: `Too many failed attempts. Try again in ${secs}s.` };
  }

  const id = employeeId.trim();
  if (!isValidEmployeeId(id)) return { ok: false, error: 'Employee ID must be 8 digits.' };

  const accounts = await getAccounts();
  const account = accounts.find((a) => a.id === id);
  const hash = await hashPassword(password);

  if (!account || account.passwordHash !== hash) {
    const count = attempts.count + 1;
    const locked = count >= MAX_ATTEMPTS;
    storageService.setJSON(KEYS.LOGIN_ATTEMPTS, {
      count: locked ? 0 : count,
      lockedUntil: locked ? now + LOCKOUT_MS : 0,
    });
    return {
      ok: false,
      error: locked
        ? 'Too many failed attempts. Login locked for 30 seconds.'
        : `Incorrect employee ID or password (${MAX_ATTEMPTS - count} attempts left).`,
    };
  }

  storageService.remove(KEYS.LOGIN_ATTEMPTS);
  return { ok: true, session: startSession(account) };
}

/** New sign-ups get the read-only Viewer role until an admin promotes them. */
export async function signup(name: string, employeeId: string, password: string): Promise<AuthResult> {
  const id = employeeId.trim();
  const cleanName = name.trim();
  if (cleanName.length < 2) return { ok: false, error: 'Please enter your full name.' };
  if (!isValidEmployeeId(id)) return { ok: false, error: 'Employee ID must be 8 digits.' };
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };

  const accounts = await getAccounts();
  if (accounts.some((a) => a.id === id)) return { ok: false, error: 'That employee ID is already registered.' };

  const account: UserAccount = {
    id,
    name: cleanName,
    position: 'New Staff',
    role: 'viewer',
    passwordHash: await hashPassword(password),
  };
  storageService.setJSON(KEYS.USERS, [...accounts, account]);
  return { ok: true, session: startSession(account) };
}

export function getSession(): UserSession | null {
  return storageService.getJSON<UserSession | null>(KEYS.SESSION, null);
}

export function logout(): void {
  const session = getSession();
  if (session) closeAccessLog(session);
  storageService.remove(KEYS.SESSION);
}
