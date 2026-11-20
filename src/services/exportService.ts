/**
 * File downloads: incident reports, CSV export, snapshots and recordings.
 */

import type { FootageFolder, LoginHistoryEntry } from '../domain';
import { MODE_LABELS } from './aiService';
import { systemFilename } from './incidentService';

type SaveOutcome = 'saved' | 'declined' | 'failed';

interface DownloadsApi {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: string }>;
}
type ClaudeHost = { use?: (name: string) => Promise<unknown> };

/**
 * Saves a file. Inside a claude.ai artifact (where plain downloads are
 * sandboxed) it asks the host's `downloads` capability; everywhere else it
 * uses a normal browser download.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<SaveOutcome> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    try {
      const api = (await host.use('downloads')) as DownloadsApi | null;
      if (api) {
        await api.save({ filename, data: blob });
        return 'saved';
      }
    } catch (err) {
      return (err as { code?: string })?.code === 'declined' ? 'declined' : 'failed';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}

export function incidentReportText(f: FootageFolder, exportedBy?: string): string {
  const lines = [
    'REDONTRACK INCIDENT REPORT',
    '==========================',
    `Incident ID : ${f.id}`,
    `File name   : ${systemFilename(f)}`,
    `Date / time : ${f.day} ${f.date} ${f.time}`,
    `Location    : ${f.platform}`,
    `Cameras     : ${f.cameras.join(', ')}`,
    `Archived    : ${f.saved ? 'Yes' : 'No'}`,
    '',
    'STAFF REMARKS',
    '-------------',
    f.remarks || '(none)',
    '',
  ];
  if (f.analysis) {
    lines.push(
      'ANALYSIS',
      '--------',
      `Engine    : ${MODE_LABELS[f.analysis.mode]}`,
      `Generated : ${new Date(f.analysis.generatedAt).toLocaleString('en-GB')}`,
      '',
      f.analysis.text,
      '',
    );
  }
  lines.push(`Exported ${new Date().toLocaleString('en-GB')}${exportedBy ? ` by ${exportedBy}` : ''}`);
  return lines.join('\n');
}

export function downloadIncidentReport(f: FootageFolder, exportedBy?: string): Promise<SaveOutcome> {
  const blob = new Blob([incidentReportText(f, exportedBy)], { type: 'text/plain;charset=utf-8' });
  return downloadBlob(blob, `RedOnTrack_${f.id}_${systemFilename(f)}.txt`);
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function accessLogCsv(rows: LoginHistoryEntry[]): string {
  const header = ['Name', 'Employee ID', 'Position', 'Login', 'Sign out'];
  const body = rows.map((r) => [r.name, r.id, r.position, r.loginTime, r.signOutTime ?? 'Still active'].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...body].join('\n');
}

export function downloadAccessLog(rows: LoginHistoryEntry[]): Promise<SaveOutcome> {
  return downloadBlob(new Blob([accessLogCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'RedOnTrack_access_log.csv');
}
