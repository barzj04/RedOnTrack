import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, SectionHeader } from '../components';
import type { CameraFeed } from '../domain';
import { useAuth, useIncidents } from '../hooks';
import { cameraService, incidentService } from '../services';
import {
  DEFAULT_SETTINGS,
  RiskTracker,
  type DetectionSettings,
  type FrameResult,
  type IncidentEvent,
  type RiskLevel,
} from '../services/detectionService';
import { detect, loadModel } from '../services/onnxDetector';

type Source = { kind: 'clip'; cameraId: string } | { kind: 'file'; name: string; url: string } | { kind: 'webcam' };

interface LoggedEvent extends IncidentEvent {
  id: string;
  clock: string;
  camera: string;
  snapshot: string;
  logged: boolean;
}

const RISK_STYLE: Record<RiskLevel, { label: string; cls: string }> = {
  none: { label: 'All clear', cls: 'bg-green-600 text-white' },
  low: { label: 'Low · near edge', cls: 'bg-yellow-300 text-black' },
  medium: { label: 'Medium · warning', cls: 'bg-orange-500 text-white' },
  high: { label: 'High · intrusion', cls: 'bg-red-600 text-white animate-pulse' },
};

const BOX_COLOR = { red: '#ef4444', yellow: '#facc15', safe: '#22c55e' } as const;

const LiveDetection: React.FC = () => {
  const { can } = useAuth();
  const { addIncident } = useIncidents();
  const cameras = useMemo(() => cameraService.listCameras(), []);

  const [cameraId, setCameraId] = useState(cameras[1]?.id ?? cameras[0].id);
  const camera: CameraFeed = cameras.find((c) => c.id === cameraId) ?? cameras[0];
  const [source, setSource] = useState<Source>({ kind: 'clip', cameraId });
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_SETTINGS);
  const [autoLog, setAutoLog] = useState(can('incident:edit'));
  const [model, setModel] = useState<'loading' | 'ready' | 'error'>('loading');
  const [running, setRunning] = useState(false);
  const [frame, setFrame] = useState<FrameResult | null>(null);
  const [stats, setStats] = useState({ ms: 0, fps: 0 });
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef(new RiskTracker(camera.zones!, settings));
  const runningRef = useRef(false);
  const autoLogRef = useRef(autoLog);
  const startRef = useRef(0);

  autoLogRef.current = autoLog;

  useEffect(() => {
    loadModel()
      .then(() => setModel('ready'))
      .catch((e) => {
        setModel('error');
        setError(`Model failed to load: ${e?.message ?? e}`);
      });
  }, []);

  useEffect(() => {
    // switching zone profile restarts detection so names and zones stay consistent
    runningRef.current = false;
    setRunning(false);
    trackerRef.current.setZones(camera.zones!);
    trackerRef.current.reset();
  }, [camera]);
  useEffect(() => trackerRef.current.setSettings(settings), [settings]);

  // ---------- source ----------
  const stopWebcam = () => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setRunning(false);
    runningRef.current = false;
    trackerRef.current.reset();
    setFrame(null);
    stopWebcam();
    if (source.kind === 'webcam') {
      navigator.mediaDevices
        ?.getUserMedia({ video: true })
        .then((stream) => {
          v.srcObject = stream;
          v.play();
        })
        .catch(() => setError('Camera permission was refused or no camera is available.'));
    } else {
      v.src = source.kind === 'clip' ? cameras.find((c) => c.id === source.cameraId)?.videoUrl ?? '' : source.url;
      v.load();
    }
    return stopWebcam;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // ---------- drawing ----------
  const draw = useCallback(
    (r: FrameResult) => {
      const c = overlayRef.current;
      const v = videoRef.current;
      if (!c || !v) return;
      const W = (c.width = v.videoWidth || 960);
      const H = (c.height = v.videoHeight || 540);
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);

      const zones = camera.zones!;
      const poly = (pts: [number, number][], fill: string, stroke: string) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      if (!r.trainPresent) {
        poly(zones.red, 'rgba(239,68,68,0.18)', '#ef4444');
        poly(zones.yellow, 'rgba(250,204,21,0.18)', '#facc15');
      }

      ctx.font = `bold ${Math.round(H / 34)}px ui-monospace, monospace`;
      for (const t of r.trains) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.strokeRect(t.x1 * W, t.y1 * H, (t.x2 - t.x1) * W, (t.y2 - t.y1) * H);
      }
      for (const p of r.people) {
        const col = BOX_COLOR[p.zone];
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.strokeRect(p.x1 * W, p.y1 * H, (p.x2 - p.x1) * W, (p.y2 - p.y1) * H);
        const label = `#${p.id} ${p.zone.toUpperCase()}${p.zone !== 'safe' ? ` ${p.dwell.toFixed(1)}s` : ''}`;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = col;
        ctx.fillRect(p.x1 * W, p.y1 * H - H / 26, tw, H / 26);
        ctx.fillStyle = p.zone === 'yellow' ? '#000' : '#fff';
        ctx.fillText(label, p.x1 * W + 4, p.y1 * H - 6);
        // foot point used for the zone check
        ctx.beginPath();
        ctx.arc(((p.x1 + p.x2) / 2) * W, p.y2 * H, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = r.trainPresent ? '#38bdf8' : '#22c55e';
      ctx.fillText(r.trainPresent ? 'TRAIN PRESENT: ZONES DISABLED' : 'ZONES ACTIVE', 10, H / 20);
    },
    [camera],
  );

  const snapshot = (): string => {
    const v = videoRef.current!;
    const o = overlayRef.current!;
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = Math.round((320 * (v.videoHeight || 540)) / (v.videoWidth || 960));
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.drawImage(o, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  };

  // ---------- loop ----------
  const loop = useCallback(async () => {
    const v = videoRef.current;
    let last = performance.now();
    while (runningRef.current && v) {
      if (v.readyState >= 2 && v.videoWidth) {
        const t0 = performance.now();
        try {
          const dets = await detect(v, v.videoWidth, v.videoHeight, 0.25);
          const t = source.kind === 'webcam' ? (t0 - startRef.current) / 1000 : v.currentTime;
          const r = trackerRef.current.update(dets, t);
          draw(r);
          setFrame(r);
          const now = performance.now();
          setStats({ ms: Math.round(now - t0), fps: Math.round(10000 / (now - last)) / 10 });
          last = now;
          if (r.incident) {
            const ev = r.incident;
            const logged = autoLogRef.current;
            setEvents((list) =>
              [
                {
                  ...ev,
                  id: `${Date.now()}-${ev.personId}`,
                  clock: new Date().toLocaleTimeString('en-GB'),
                  camera: `${camera.id} · ${camera.name}`,
                  snapshot: snapshot(),
                  logged,
                },
                ...list,
              ].slice(0, 30),
            );
            if (logged) addIncident(incidentService.liveIncident(ev, camera));
          }
        } catch (e) {
          setError(`Detection error: ${(e as Error).message}`);
          runningRef.current = false;
          setRunning(false);
        }
      }
      await new Promise((res) => requestAnimationFrame(res));
    }
  }, [addIncident, camera, draw, source.kind]);

  const toggle = () => {
    const v = videoRef.current!;
    if (running) {
      runningRef.current = false;
      setRunning(false);
      if (source.kind !== 'webcam') v.pause();
      return;
    }
    setError('');
    startRef.current = performance.now();
    runningRef.current = true;
    setRunning(true);
    if (source.kind !== 'webcam') v.play();
    loop();
  };

  useEffect(() => () => void (runningRef.current = false), []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setSource({ kind: 'file', name: f.name, url: URL.createObjectURL(f) });
  };

  const exportCsv = () => {
    const rows = [
      ['clock', 'camera', 'video_time_s', 'severity', 'zone', 'person_id', 'dwell_s', 'message'],
      ...events.map((e) => [e.clock, e.camera, e.time.toFixed(2), e.severity, e.zone, e.personId, e.dwell.toFixed(2), e.message]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `redontrack_live_events_${camera.id}.csv`;
    a.click();
  };

  const risk = frame?.risk ?? 'none';
  const banner = risk === 'none' && frame?.trainPresent ? { label: 'Train at platform · zones off', cls: 'bg-sky-500 text-white' } : RISK_STYLE[risk];
  const counts = {
    red: frame?.people.filter((p) => p.zone === 'red').length ?? 0,
    yellow: frame?.people.filter((p) => p.zone === 'yellow').length ?? 0,
    safe: frame?.people.filter((p) => p.zone === 'safe').length ?? 0,
  };

  const slider = (key: keyof DetectionSettings, label: string, min: number, max: number, step: number, unit = '') => (
    <label className="block space-y-1">
      <span className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
        {label}
        <span className="mono text-zinc-900">
          {settings[key]}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))}
        className="w-full accent-red-600"
      />
    </label>
  );

  const btn = 'px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-colors';

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
        <SectionHeader
          title="Live Detection"
          subtitle="RedOnTrack model running in your browser · frames never leave this device"
          actions={
            <span className={`${btn} ${model === 'ready' ? 'border-green-200 text-green-700 bg-green-50' : model === 'error' ? 'border-red-200 text-red-600' : 'border-zinc-200 text-zinc-500'}`}>
              {model === 'ready' ? 'Model ready · YOLO11n ONNX' : model === 'error' ? 'Model error' : 'Loading model…'}
            </span>
          }
        />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* video */}
          <section className="space-y-3">
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ${banner.cls}`} aria-live="assertive">
              <span className="font-black uppercase italic tracking-tighter text-lg">{banner.label}</span>
              <span className="mono text-xs">
                {counts.red} red · {counts.yellow} yellow · {counts.safe} safe
                {frame?.trainPresent ? ' · train at platform' : ''}
              </span>
            </div>
            <div className="relative rounded-[24px] overflow-hidden bg-black aspect-video">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" muted playsInline loop crossOrigin="anonymous" />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] mono text-zinc-500">
              <button
                onClick={toggle}
                disabled={model !== 'ready'}
                className={`${btn} ${running ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-red-600 bg-red-600 text-white'} disabled:opacity-40`}
              >
                {running ? 'Stop' : 'Start detection'}
              </button>
              <span>Inference {stats.ms} ms</span>
              <span>{stats.fps} FPS</span>
              {source.kind === 'clip' && <span>Tip: the sample clips already have the old overlay burned in. Upload a raw platform video for the cleanest result.</span>}
            </div>
            {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
          </section>

          {/* controls */}
          <aside className="space-y-6 rounded-[24px] border border-zinc-200 p-5">
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900">Video source</h3>
              <select
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                value={source.kind === 'clip' ? source.cameraId : source.kind}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'webcam') setSource({ kind: 'webcam' });
                  else if (val !== 'file') setSource({ kind: 'clip', cameraId: val });
                }}
              >
                {cameras.filter((c) => c.videoUrl).map((c) => (
                  <option key={c.id} value={c.id}>
                    Sample clip · {c.name} ({c.location})
                  </option>
                ))}
                <option value="webcam">Webcam / USB camera</option>
                {source.kind === 'file' && <option value="file">File · {source.name}</option>}
              </select>
              <label className={`${btn} block text-center border-zinc-200 hover:border-red-600 hover:text-red-600 cursor-pointer`}>
                Upload a video
                <input type="file" accept="video/*" className="hidden" onChange={onFile} />
              </label>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900">Zones from camera</h3>
              <select className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm" value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500">
                Edit the red and yellow zones on the <Link to="/monitoring" className="text-red-600 underline">Cameras</Link> page (gear icon). The same zones are exported to the edge device.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900">Risk rules</h3>
              {slider('personScore', 'Person confidence', 0.2, 0.9, 0.05)}
              {slider('redConfirmSec', 'Red zone confirm', 0, 3, 0.1, ' s')}
              {slider('yellowDwellSec', 'Yellow zone warning after', 0.5, 10, 0.5, ' s')}
              {slider('trainScore', 'Train confidence', 0.5, 0.95, 0.05)}
              {slider('incidentCooldownSec', 'Gap between incidents', 5, 60, 5, ' s')}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-red-600" checked={autoLog} disabled={!can('incident:edit')} onChange={(e) => setAutoLog(e.target.checked)} />
              Auto-log incidents to the Incident log
            </label>
          </aside>
        </div>

        <section className="rounded-[28px] border border-zinc-200 p-5 sm:p-8 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Detected events</h3>
            <div className="flex gap-2">
              <button onClick={exportCsv} disabled={!events.length} className={`${btn} border-zinc-200 hover:border-red-600 hover:text-red-600 disabled:opacity-40`}>
                Export CSV
              </button>
              <Link to="/analysis" className={`${btn} border-zinc-200 hover:border-red-600 hover:text-red-600`}>
                Incident log →
              </Link>
            </div>
          </div>
          {events.length ? (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((e) => (
                <li key={e.id} className="rounded-2xl border border-zinc-100 overflow-hidden">
                  <img src={e.snapshot} alt={`Snapshot of ${e.message}`} className="w-full" />
                  <div className="p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 ${RISK_STYLE[e.severity].cls.replace('animate-pulse', '')}`}>{e.severity}</span>
                      <span className="mono text-[11px] text-zinc-500">
                        {e.clock} · t={e.time.toFixed(1)}s
                      </span>
                    </div>
                    <p className="text-xs text-zinc-700">{e.message}</p>
                    <p className="text-[10px] mono text-zinc-400">
                      {e.camera} · {e.logged ? 'logged as incident' : 'not logged'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No events yet. Start detection on a clip, an uploaded video or a webcam.</p>
          )}
        </section>
      </main>
    </div>
  );
};

export default LiveDetection;
