import React, { useMemo, useState } from 'react';
import { FullscreenViewer, Header, SectionHeader } from '../components';
import { CAMERA_FEEDS } from '../constants';
import type { DayFolder } from '../domain';
import { useAuth } from '../hooks';
import { incidentService } from '../services';

const RETENTION_DAYS = 7;

/** Sample index of the last 7 days of continuous recordings (one file per camera per day). */
function buildCatalog(now = new Date()): DayFolder[] {
  const sizes = ['12.4 GB', '11.8 GB', '13.1 GB', '12.9 GB'];
  return Array.from({ length: RETENTION_DAYS }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const id = `DAY-${i + 1}`;
    return {
      id,
      date: incidentService.formatDDMMYYYY(d),
      day: incidentService.DAY_NAMES[d.getDay()],
      totalSize: '50.2 GB',
      files: CAMERA_FEEDS.map((cam, c) => ({
        id: `${id}-${cam.id}`,
        name: `${cam.id} · ${cam.name}`,
        size: sizes[c % sizes.length],
        resolution: '1080p',
        timestamp: i === 0 ? '00:00 - now' : '00:00 - 23:59',
      })),
    };
  });
}

const RawDataCatalog: React.FC = () => {
  const { can } = useAuth();
  const folders = useMemo(() => buildCatalog(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const selected = folders.find((f) => f.id === selectedId);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="p-4 sm:p-8 max-w-6xl mx-auto space-y-10">
        <SectionHeader
          title={selected ? `${selected.day} ${selected.date}` : 'Footage Catalog'}
          subtitle={selected ? `${selected.files.length} recordings · ${selected.totalSize}` : `Continuous recordings · last ${RETENTION_DAYS} days`}
          actions={
            selected && (
              <button
                onClick={() => setSelectedId(null)}
                className="px-5 py-2.5 bg-zinc-100 border border-zinc-200 text-zinc-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-200"
              >
                ← All days
              </button>
            )
          }
        />

        {!selected ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              {[
                ['Retention', `${RETENTION_DAYS} days`],
                ['Total storage', '351.4 GB'],
                ['Cameras', `${CAMERA_FEEDS.length}`],
                ['Status', 'Recording'],
              ].map(([label, value]) => (
                <div key={label} className="bg-zinc-50 border border-zinc-100 p-4 sm:p-6 rounded-2xl">
                  <p className="text-[9px] text-zinc-400 mono uppercase tracking-[0.2em] mb-1 font-black">{label}</p>
                  <p className="text-lg sm:text-xl font-black text-gray-900 italic tracking-tight">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8">
              {folders.map((folder, i) => (
                <button key={folder.id} onClick={() => setSelectedId(folder.id)} className="group text-center space-y-3">
                  <div className="relative aspect-square bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[32px] flex flex-col items-center justify-center transition-all group-hover:border-red-500 group-hover:bg-white group-hover:shadow-xl group-hover:-translate-y-1">
                    <svg className="w-14 h-14 sm:w-20 sm:h-20 text-zinc-200 group-hover:text-red-600 transition-colors" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
                    </svg>
                    <span className="mt-2 text-[10px] font-black text-zinc-400 mono uppercase tracking-widest">{folder.files.length} files</span>
                    {i === 0 && <span className="absolute top-4 right-5 text-[8px] font-black uppercase mono text-red-600">Today</span>}
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-gray-900 italic tracking-tighter uppercase">{folder.day}</h3>
                    <p className="text-[10px] text-zinc-400 mono">{folder.date}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {selected.files.map((file, i) => (
              <div
                key={file.id}
                className="bg-white border border-zinc-100 rounded-[24px] p-5 sm:p-7 flex items-center justify-between gap-4 hover:shadow-xl transition-shadow border-l-4 border-l-gray-900 hover:border-l-red-600"
              >
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-black text-gray-900 italic uppercase tracking-tighter truncate">{file.name}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[9px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded mono border border-red-100">{file.resolution}</span>
                    <span className="text-[10px] text-zinc-500 mono">{file.timestamp}</span>
                    <span className="text-[10px] text-zinc-400 mono">{file.size}</span>
                  </div>
                </div>
                <button
                  onClick={() => setPlaying(i)}
                  className="shrink-0 px-5 py-3 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-600 transition-colors"
                >
                  Play
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="pt-8 border-t border-zinc-100 text-center text-[10px] text-zinc-400 mono uppercase tracking-widest">
          Recordings older than {RETENTION_DAYS} days are deleted automatically unless saved to an incident.
        </p>
      </main>

      {selected && playing !== null && (
        <FullscreenViewer
          feeds={CAMERA_FEEDS}
          index={playing}
          onIndexChange={setPlaying}
          onClose={() => setPlaying(null)}
          allowCapture={can('footage:capture')}
          playbackLabel={selected.date}
          variant={selected.id}
        />
      )}
    </div>
  );
};

export default RawDataCatalog;
