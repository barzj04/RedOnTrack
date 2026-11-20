import React from 'react';
import type { FootageFolder, Severity } from '../domain';
import { incidentService } from '../services';

export const SEVERITY_STYLE: Record<Severity, string> = {
  high: 'bg-red-600 text-white border-red-600',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

interface Props {
  folder: FootageFolder;
  canEdit: boolean;
  canSave: boolean;
  canExport: boolean;
  canAnalyse: boolean;
  onRemarksChange: (remarks: string) => void;
  onToggleSave: () => void;
  onViewCameras: () => void;
  onAnalyse: () => void;
  onExport: () => void;
}

const IncidentCard: React.FC<Props> = ({
  folder,
  canEdit,
  canSave,
  canExport,
  canAnalyse,
  onRemarksChange,
  onToggleSave,
  onViewCameras,
  onAnalyse,
  onExport,
}) => {
  const a = folder.analysis;
  return (
    <article className="bg-white border border-zinc-100 rounded-[28px] overflow-hidden hover:shadow-xl hover:shadow-zinc-200/50 transition-shadow">
      <div className="flex flex-col md:flex-row">
        {/* Sidebar */}
        <div className="w-full md:w-72 bg-zinc-50 p-6 sm:p-8 flex flex-col gap-6 border-b md:border-b-0 md:border-r border-zinc-100">
          <div className="flex items-center gap-4">
            <button
              onClick={onViewCameras}
              aria-label={`View cameras for ${folder.id}`}
              className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105 ${
                folder.saved ? 'bg-red-600 text-white shadow-red-600/20' : 'bg-white border border-zinc-200 text-zinc-300'
              }`}
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
              </svg>
            </button>
            <div>
              <p className="text-[10px] font-black text-zinc-400 mono uppercase tracking-widest">Event ID</p>
              <p className="text-sm font-black text-gray-900 mono">{folder.id}</p>
              <p className="text-xs text-zinc-600 font-semibold">
                {folder.day.substring(0, 3)} {folder.date} · {folder.time}
              </p>
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-zinc-200/60">
            <p className="text-[9px] font-black text-zinc-400 mono uppercase mb-1 tracking-widest">File name</p>
            <p className="text-[11px] font-black text-gray-900 mono break-all">{incidentService.systemFilename(folder)}</p>
          </div>

          {canSave ? (
            <button
              onClick={onToggleSave}
              className={`w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-colors ${
                folder.saved
                  ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                  : 'bg-white text-gray-900 border-zinc-200 hover:border-red-600 hover:text-red-600'
              }`}
            >
              {folder.saved ? 'Saved · remove from archive' : 'Save to archive'}
            </button>
          ) : (
            <p className="text-[10px] text-zinc-400 mono uppercase tracking-widest">{folder.saved ? 'In archive' : 'Not archived'}</p>
          )}
        </div>

        {/* Main */}
        <div className="flex-1 p-6 sm:p-8 space-y-5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight mr-2">{folder.platform}</h3>
            {folder.cameras.map((cam) => (
              <span key={cam} className="text-[9px] font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 mono">
                {cam}
              </span>
            ))}
            {a?.severity && (
              <span className={`ml-auto text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${SEVERITY_STYLE[a.severity]}`}>
                {a.severity} risk
              </span>
            )}
          </div>

          <div>
            <label htmlFor={`remarks-${folder.id}`} className="text-[10px] font-black text-zinc-400 mono uppercase tracking-widest">
              Investigation log
            </label>
            <textarea
              id={`remarks-${folder.id}`}
              value={folder.remarks}
              readOnly={!canEdit}
              onChange={(e) => onRemarksChange(e.target.value)}
              placeholder="Describe what happened: sequence of events, people involved, damage, response time..."
              className={`mt-2 w-full h-32 p-5 text-sm border rounded-2xl outline-none transition-all leading-relaxed resize-y ${
                canEdit
                  ? 'bg-zinc-50 border-zinc-200 focus:ring-4 focus:ring-red-500/10 focus:bg-white focus:border-red-300'
                  : 'bg-zinc-50/60 border-zinc-100 text-zinc-600'
              }`}
            />
            {!canEdit && <p className="text-[10px] text-zinc-400 mt-1">Read-only for your role.</p>}
          </div>

          {a && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
              <p className="text-[10px] font-black text-zinc-400 mono uppercase tracking-widest mb-1">
                Latest analysis{a.category ? ` · ${a.category}` : ''}
              </p>
              <p className="text-xs text-zinc-700 line-clamp-2">
                {a.text.split('\n').find((l) => l.startsWith('On ') || l.toLowerCase().includes('summary')) ?? a.text.slice(0, 160)}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-4 border-t border-zinc-100">
            <button
              onClick={onViewCameras}
              className="px-5 py-3 rounded-2xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black"
            >
              View cameras
            </button>
            {(canAnalyse || a) && (
              <button
                onClick={onAnalyse}
                className="px-5 py-3 rounded-2xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700"
              >
                {a ? 'Open analysis' : 'Analyse incident'}
              </button>
            )}
            {canExport && (
              <button
                onClick={onExport}
                className="px-5 py-3 rounded-2xl border border-zinc-200 text-zinc-600 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50"
              >
                Export report
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default IncidentCard;
