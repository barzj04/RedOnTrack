import { describe, expect, it } from 'vitest';
import { analyseOffline } from '../services/aiService';
import { accessLogCsv, incidentReportText } from '../services/exportService';
import { buildSeedIncidents } from '../services/incidentService';

describe('exports', () => {
  it('includes remarks and analysis in the incident report', () => {
    const f = buildSeedIncidents(new Date(2026, 10, 20))[0];
    const text = incidentReportText({ ...f, analysis: analyseOffline(f) }, 'Sarah Jenkins');
    expect(text).toContain(f.remarks);
    expect(text).toContain('FORENSIC SUMMARY');
    expect(text).toContain('by Sarah Jenkins');
  });

  it('escapes quotes in CSV and marks active sessions', () => {
    const csv = accessLogCsv([{ name: 'A "B" C', id: '1', position: 'x', loginTime: 't', signOutTime: null }]);
    expect(csv).toContain('"A ""B"" C"');
    expect(csv).toContain('Still active');
  });
});
