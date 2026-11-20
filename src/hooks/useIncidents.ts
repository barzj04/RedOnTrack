import { useCallback, useEffect, useState } from 'react';
import type { AnalysisReport, FootageFolder } from '../domain';
import { incidentService } from '../services';

/** Incident list with persistence. Shared by the Analysis and Archive pages. */
export function useIncidents() {
  const [incidents, setIncidents] = useState<FootageFolder[]>(() => incidentService.loadIncidents());

  useEffect(() => {
    incidentService.saveIncidents(incidents);
  }, [incidents]);

  const patch = useCallback((id: string, changes: Partial<FootageFolder>) => {
    setIncidents((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }, []);

  const updateRemarks = useCallback((id: string, remarks: string) => patch(id, { remarks }), [patch]);

  const toggleSave = useCallback(
    (id: string) => setIncidents((prev) => prev.map((f) => (f.id === id ? { ...f, saved: !f.saved } : f))),
    [],
  );

  const setAnalysis = useCallback((id: string, analysis: AnalysisReport) => patch(id, { analysis }), [patch]);

  return { incidents, updateRemarks, toggleSave, setAnalysis };
}
