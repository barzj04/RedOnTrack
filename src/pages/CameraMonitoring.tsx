import React, { useState } from 'react';
import { CCTVFeed, FullscreenViewer, Header, SectionHeader } from '../components';
import DeviceConfigModal from '../components/DeviceConfigModal';
import type { CameraFeed } from '../domain';
import { useAuth } from '../hooks';
import { cameraService } from '../services';

const STATUS_TEXT: Record<CameraFeed['status'], { label: string; dot: string }> = {
  active: { label: 'Streaming', dot: 'bg-green-500' },
  warning: { label: 'Unstable signal', dot: 'bg-yellow-400' },
  offline: { label: 'Offline', dot: 'bg-zinc-400' },
};

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const CameraMonitoring: React.FC = () => {
  const { can } = useAuth();
  const [cameras, setCameras] = useState(() => cameraService.listCameras());
  const [configuring, setConfiguring] = useState<CameraFeed | null>(null);
  const [fullscreen, setFullscreen] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<Array<{ time: string; camera: string; label: string }>>([]);

  const logAlert = (feed: CameraFeed) => (label: string | null) => {
    if (!label) return;
    const time = new Date().toLocaleTimeString('en-GB');
    setAlerts((a) => [{ time, camera: `${feed.id} · ${feed.name}`, label }, ...a].slice(0, 8));
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="p-4 sm:p-8 max-w-7xl mx-auto space-y-10">
        <SectionHeader title="Camera Monitoring" subtitle={`${cameras.length} cameras · click a feed for full screen, snapshot and recording`} />

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5" aria-label="Camera grid">
          {cameras.map((feed, idx) => (
            <div key={feed.id} className="animate-in fade-in zoom-in-95 duration-500" style={{ animationDelay: `${idx * 80}ms` }}>
              <CCTVFeed feed={feed} onClick={() => setFullscreen(idx)} onAlert={logAlert(feed)} />
            </div>
          ))}
        </section>

        <section className="rounded-[28px] border border-zinc-200 p-5 sm:p-8 space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Live alerts</h3>
            <p className="text-[10px] text-zinc-400 mono uppercase tracking-widest">Raised by the camera feeds this session</p>
          </div>
          {alerts.length ? (
            <ul className="divide-y divide-zinc-100">
              {alerts.map((a, i) => (
                <li key={`${a.time}-${i}`} className="py-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                  <span className="mono text-xs text-zinc-500">{a.time}</span>
                  <span className="font-bold text-gray-900">{a.label}</span>
                  <span className="text-zinc-500">{a.camera}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No alerts yet. Every camera plays recorded output from the RedOnTrack Edge AI model; Platform 2 shows a trespasser, so its intrusion alerts appear here within a few seconds.</p>
          )}
        </section>

        <section className="bg-zinc-50 rounded-[28px] border border-zinc-200 p-5 sm:p-8 space-y-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Camera inventory</h3>
            <p className="text-[10px] text-zinc-400 mono uppercase tracking-widest">Status, grid order and detection zones</p>
          </div>

          <div className="bg-white border border-zinc-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 mono text-[9px] uppercase tracking-widest">
                  <th className="px-5 sm:px-8 py-4">Camera</th>
                  <th className="px-5 sm:px-8 py-4">Location</th>
                  <th className="px-5 sm:px-8 py-4">Status</th>
                  <th className="px-5 sm:px-8 py-4">Grid order</th>
                  {can('camera:configure') && <th className="px-5 sm:px-8 py-4">Zones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cameras.map((feed, idx) => (
                  <tr key={feed.id} className="hover:bg-zinc-50/60">
                    <td className="px-5 sm:px-8 py-4">
                      <span className="text-xs font-black text-gray-900 mono">{feed.id}</span>
                      <span className="block text-sm font-semibold text-gray-700">{feed.name}</span>
                    </td>
                    <td className="px-5 sm:px-8 py-4 text-xs text-zinc-500">{feed.location}</td>
                    <td className="px-5 sm:px-8 py-4">
                      <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                        <span className={`w-2 h-2 rounded-full ${STATUS_TEXT[feed.status].dot}`} />
                        {STATUS_TEXT[feed.status].label}
                      </span>
                    </td>
                    <td className="px-5 sm:px-8 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCameras((c) => move(c, idx, idx - 1))}
                          disabled={idx === 0}
                          aria-label={`Move ${feed.name} up`}
                          className="p-1.5 rounded-lg border border-zinc-200 hover:text-red-600 disabled:opacity-20"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setCameras((c) => move(c, idx, idx + 1))}
                          disabled={idx === cameras.length - 1}
                          aria-label={`Move ${feed.name} down`}
                          className="p-1.5 rounded-lg border border-zinc-200 hover:text-red-600 disabled:opacity-20"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </td>
                    {can('camera:configure') && (
                      <td className="px-5 sm:px-8 py-4">
                        <button
                          onClick={() => setConfiguring(feed)}
                          className="px-4 py-2 rounded-xl border border-zinc-200 text-[10px] font-black uppercase tracking-widest hover:border-red-600 hover:text-red-600"
                        >
                          Configure
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <DeviceConfigModal
        feed={configuring}
        onClose={() => setConfiguring(null)}
        onSaved={(saved) => setCameras((list) => list.map((c) => (c.id === saved.id ? saved : c)))}
      />

      {fullscreen !== null && (
        <FullscreenViewer
          feeds={cameras}
          index={fullscreen}
          onIndexChange={setFullscreen}
          onClose={() => setFullscreen(null)}
          allowCapture={can('footage:capture')}
        />
      )}
    </div>
  );
};

export default CameraMonitoring;
