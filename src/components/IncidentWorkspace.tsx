import React, { useState } from 'react';
import { MODEL_CLIP } from '../constants';
import { getCameraFeed } from '../services/cameraService';
import type { AnalysisReport, FootageFolder } from '../domain';
import { useAuth } from '../hooks/useAuth';
import { aiService, exportService, scenarioFor } from '../services';
import CCTVFeed from './CCTVFeed';
import FullscreenViewer from './FullscreenViewer';
import IncidentCard, { SEVERITY_STYLE } from './IncidentCard';
import { Modal } from './UIComponents';

interface Props {
  folders: FootageFolder[];
  updateRemarks: (id: string, remarks: string) => void;
  toggleSave: (id: string) => void;
  setAnalysis: (id: string, report: AnalysisReport) => void;
  empty: React.ReactNode;
}

/** Renders a text report: numbered headings, bullets and numbered items. */
const ReportText: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1.5 text-sm text-zinc-700 leading-relaxed">
    {text.split('\n').map((line, i) => {
      const t = line.trim();
      if (!t) return <div key={i} className="h-2" />;
      const clean = t.replace(/\*\*/g, '').replace(/^#+\s*/, '');
      if (/^\d\.\s+[A-Z][A-Z\s/&-]{4,}/.test(clean))
        return (
          <h4 key={i} className="pt-3 text-[11px] font-black uppercase tracking-widest text-gray-900 mono">
            {clean}
          </h4>
        );
      if (/^[-*•]\s+/.test(clean))
        return (
          <p key={i} className="pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2.5 before:w-1.5 before:h-1.5 before:rounded-full before:bg-red-500">
            {clean.replace(/^[-*•]\s+/, '')}
          </p>
        );
      return <p key={i}>{clean}</p>;
    })}
  </div>
);

const IncidentWorkspace: React.FC<Props> = ({ folders, updateRemarks, toggleSave, setAnalysis, empty }) => {
  const { user, can } = useAuth();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState<number | null>(null);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const viewing = folders.find((f) => f.id === viewingId) ?? null;
  const analysing = folders.find((f) => f.id === analysingId) ?? null;
  const baseFeeds = viewing ? viewing.cameras.map(getCameraFeed) : [];
  const viewingScenario = viewing ? scenarioFor(viewing) : undefined;
  // Red-zone incidents replay the model's recorded detection on the first camera.
  const usesModel = viewingScenario === 'trespass' || viewingScenario === 'edge';
  const viewingFeeds = usesModel
    ? baseFeeds.map((f, i) => (i === 0 ? { ...f, ...MODEL_CLIP } : f))
    : baseFeeds;

  const run = async (folder: FootageFolder) => {
    setRunning(true);
    try {
      const report = await aiService.analyseIncident(folder);
      setAnalysis(folder.id, report);
    } finally {
      setRunning(false);
    }
  };

  const openAnalysis = (folder: FootageFolder) => {
    setAnalysingId(folder.id);
    if (!folder.analysis && can('ai:run')) run(folder);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {folders.length
          ? folders.map((f) => (
              <IncidentCard
                key={f.id}
                folder={f}
                canEdit={can('incident:edit')}
                canSave={can('incident:save')}
                canExport={can('incident:export')}
                canAnalyse={can('ai:run')}
                onRemarksChange={(r) => updateRemarks(f.id, r)}
                onToggleSave={() => toggleSave(f.id)}
                onViewCameras={() => setViewingId(f.id)}
                onAnalyse={() => openAnalysis(f)}
                onExport={() => exportService.downloadIncidentReport(f, user?.name)}
              />
            ))
          : empty}
      </div>

      {/* Camera perspectives */}
      <Modal isOpen={!!viewing && fullscreen === null} onClose={() => setViewingId(null)} title={`Camera views · ${viewing?.id ?? ''}`} size="xl">
        {viewing && (
          <div className="space-y-6">
            <p className="text-xs text-zinc-500">
              Recorded {viewing.day} {viewing.date} at {viewing.time}, {viewing.platform}. Replay of the event (Edge AI recording for red-zone incidents, simulation for others); click a view to open it full screen.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {viewingFeeds.map((feed, i) => (
                <CCTVFeed
                  key={feed.id}
                  feed={feed}
                  playback
                  variant={viewing.id}
                  scenario={viewingScenario}
                  timestampLabel={`${viewing.date} ${viewing.time}`}
                  onClick={() => setFullscreen(i)}
                />
              ))}
            </div>
          </div>
        )}
      </Modal>

      {viewing && fullscreen !== null && (
        <FullscreenViewer
          feeds={viewingFeeds}
          index={fullscreen}
          onIndexChange={setFullscreen}
          onClose={() => setFullscreen(null)}
          allowCapture={can('footage:capture')}
          playbackLabel={`${viewing.date} ${viewing.time}`}
          variant={viewing.id}
          scenario={viewingScenario}
        />
      )}

      {/* Analysis */}
      <Modal isOpen={!!analysing} onClose={() => setAnalysingId(null)} title={`Incident analysis · ${analysing?.id ?? ''}`} size="lg">
        {analysing && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest mono text-zinc-500 bg-zinc-100 rounded-full px-3 py-1">
                Engine: {aiService.MODE_LABELS[analysing.analysis?.mode ?? aiService.activeMode()]}
              </span>
              {analysing.analysis?.severity && (
                <span className={`text-[10px] font-black uppercase tracking-widest rounded-full px-3 py-1 border ${SEVERITY_STYLE[analysing.analysis.severity]}`}>
                  {analysing.analysis.severity} risk
                </span>
              )}
            </div>

            {analysing.analysis?.notice && (
              <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">{analysing.analysis.notice}</p>
            )}

            {running ? (
              <div className="py-12 flex flex-col items-center gap-3 text-zinc-500" role="status">
                <span className="w-8 h-8 border-4 border-zinc-200 border-t-red-600 rounded-full animate-spin" />
                <span className="text-xs mono uppercase tracking-widest">Analysing incident…</span>
              </div>
            ) : analysing.analysis ? (
              <>
                <ReportText text={analysing.analysis.text} />
                <p className="text-[10px] text-zinc-400 mono">
                  Generated {new Date(analysing.analysis.generatedAt).toLocaleString('en-GB')}. Based on the incident metadata and staff remarks
                  only; verify against the footage before acting.
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">No analysis yet. Your role can view analyses but not run them.</p>
            )}

            <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-zinc-100">
              {can('ai:run') && (
                <button
                  disabled={running}
                  onClick={() => run(analysing)}
                  className="px-5 py-3 rounded-2xl border border-zinc-200 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 disabled:opacity-40"
                >
                  {analysing.analysis ? 'Re-run analysis' : 'Run analysis'}
                </button>
              )}
              {can('incident:export') && analysing.analysis && (
                <button
                  disabled={running}
                  onClick={() => exportService.downloadIncidentReport(analysing, user?.name)}
                  className="px-5 py-3 rounded-2xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black disabled:opacity-40"
                >
                  Export report
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default IncidentWorkspace;
