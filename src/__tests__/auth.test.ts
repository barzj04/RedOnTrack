import { beforeEach, describe, expect, it } from 'vitest';
import * as auth from '../services/authService';
import storageService from '../services/storageService';

beforeEach(() => storageService.clearAll());

describe('authService', () => {
  it('signs in a demo admin and records the session', async () => {
    const r = await auth.login('10064620', 'admin123');
    expect(r.ok).toBe(true);
    expect(auth.getSession()?.role).toBe('admin');
    expect(auth.getAccessLog().at(-1)?.signOutTime).toBeNull();
  });

  it('rejects a wrong password', async () => {
    const r = await auth.login('10064620', 'nope');
    expect(r.ok).toBe(false);
    expect(auth.getSession()).toBeNull();
  });

  it('rejects IDs that are not 8 digits', async () => {
    const r = await auth.login('123', 'admin123');
    expect(r).toEqual({ ok: false, error: 'Employee ID must be 8 digits.' });
  });

  it('locks out after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) await auth.login('10064620', 'wrong');
    const r = await auth.login('10064620', 'admin123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Try again/);
  });

  it('gives new sign-ups the read-only viewer role', async () => {
    const r = await auth.signup('Test User', '12345678', 'password1');
    expect(r.ok && r.session.role).toBe('viewer');
    expect(auth.hasPermission('viewer', 'incident:edit')).toBe(false);
  });

  it('refuses duplicate employee IDs', async () => {
    const r = await auth.signup('Someone', '10064620', 'password1');
    expect(r.ok).toBe(false);
  });

  it('closes the access log entry on logout', async () => {
    await auth.login('22839401', 'operator123');
    auth.logout();
    expect(auth.getSession()).toBeNull();
    expect(auth.getAccessLog().at(-1)?.signOutTime).not.toBeNull();
  });

  it('only admins can view the access log', () => {
    expect(auth.hasPermission('admin', 'logs:view')).toBe(true);
    expect(auth.hasPermission('operator', 'logs:view')).toBe(false);
    expect(auth.hasPermission('operator', 'ai:run')).toBe(true);
  });

  it('never stores plain-text passwords', async () => {
    await auth.login('10064620', 'admin123');
    expect(JSON.stringify(storageService.getJSON('rot_users_v1', []))).not.toContain('admin123');
  });
});
