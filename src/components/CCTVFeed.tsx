import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CameraFeed, Scenario } from '../domain';
import { useCurrentTime } from '../hooks/useCurrentTime';
import SimulatedFeed, { type FeedHandle } from './SimulatedFeed';

interface CCTVFeedProps {
  feed: CameraFeed;
  onClick?: () => void;
  /** Overrides the top-right clock, e.g. for archived playback. */
  timestampLabel?: string;
  /** Shows a PLAYBACK badge instead of LIVE. */
  playback?: boolean;
  /** Seed suffix so archived clips differ from the live view. */
  variant?: string;
  className?: string;
  rounded?: boolean;
  /** Overrides the camera's own scenario (incident playback). */
  scenario?: Scenario;
  /** Notified when this feed's alert starts or ends. */
  onAlert?: (label: string | null) => void;
}

const STATUS_DOT: Record<CameraFeed['status'], string> = {
  active: 'bg-green-500',
  warning: 'bg-yellow-400',
  offline: 'bg-zinc-500',
};

/** One camera tile: video (own footage) or simulated feed, plus HUD overlays. */
const CCTVFeed = forwardRef<FeedHandle, CCTVFeedProps>(
  ({ feed, onClick, timestampLabel, playback = false, variant = '', className = '', rounded = true, scenario, onAlert }, ref) => {
    const { currentTime } = useCurrentTime();
    const simRef = useRef<FeedHandle>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const [alert, setAlert] = useState<string | null>(null);
    const handleAlert = (label: string | null) => {
      setAlert(label);
      onAlert?.(label);
    };
    const onAlertRef = useRef(handleAlert);
    onAlertRef.current = handleAlert;

    // Recorded model output: follow the clip's own alert timing.
    useEffect(() => {
      const windows = feed.videoUrl ? feed.alertWindows : undefined;
      if (!windows?.length) return;
      let raf = 0;
      let last: string | null = null;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const t = videoRef.current?.currentTime ?? 0;
        const on = windows.some(([s, e]) => t >= s && t < e) ? feed.alertLabel ?? 'Alert' : null;
        if (on !== last) {
          last = on;
          onAlertRef.current(on);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [feed.videoUrl, feed.alertWindows, feed.alertLabel]);

    useImperativeHandle(ref, () => {
      if (!feed.videoUrl) {
        return {
          snapshot: () => simRef.current?.snapshot() ?? Promise.resolve(null),
          startRecording: () => simRef.current?.startRecording() ?? false,
          stopRecording: () => simRef.current?.stopRecording() ?? Promise.resolve(null),
        };
      }
      return {
        snapshot: () =>
          new Promise<Blob | null>((resolve) => {
            const v = videoRef.current;
            if (!v || !v.videoWidth) return resolve(null);
            const c = document.createElement('canvas');
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            c.getContext('2d')?.drawImage(v, 0, 0);
            c.toBlob((b) => resolve(b), 'image/png');
          }),
        startRecording: () => {
          const v = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream }) | null;
          if (!v?.captureStream || typeof MediaRecorder === 'undefined') return false;
          const rec = new MediaRecorder(v.captureStream());
          chunks.current = [];
          rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
          rec.start(500);
          recorderRef.current = rec;
          return true;
        },
        stopRecording: () =>
          new Promise<Blob | null>((resolve) => {
            const rec = recorderRef.current;
            if (!rec) return resolve(null);
            rec.onstop = () => resolve(new Blob(chunks.current, { type: 'video/webm' }));
            rec.stop();
          }),
      };
    }, [feed.videoUrl]);

    const interactive = !!onClick;

    return (
      <div
        onClick={onClick}
        onKeyDown={(e) => interactive && (e.key === 'Enter' || e.key === ' ') && onClick?.()}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `Open ${feed.name} camera` : undefined}
        className={`relative group overflow-hidden bg-zinc-950 aspect-video shadow-xl border border-white/5 ${
          rounded ? 'rounded-xl' : ''
        } ${interactive ? 'cursor-pointer hover:border-red-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500' : ''} ${className}`}
      >
        {feed.videoUrl ? (
          <video
            ref={videoRef}
            key={feed.videoUrl}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            aria-label={`${feed.name} recorded footage`}
          >
            {/* WebM first (plays in every modern browser), MP4 as fallback */}
            {feed.videoUrl.endsWith('.mp4') && <source src={feed.videoUrl.replace(/\.mp4$/, '.webm')} type="video/webm" />}
            <source src={feed.videoUrl} />
          </video>
        ) : (
          <SimulatedFeed
            ref={simRef}
            seed={`${feed.id}${variant}`}
            status={feed.status}
            scenario={scenario ?? feed.scenario}
            onAlert={handleAlert}
          />
        )}

        {/* scanlines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30 mix-blend-multiply"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 1px, transparent 1px, transparent 3px)' }}
        />

        {alert && (
          <div className="absolute inset-0 pointer-events-none border-[3px] border-red-600 rounded-[inherit] z-10" aria-hidden />
        )}
        {/* recorded model output already draws its own alert text */}
        {alert && !feed.alertWindows && (
          <div role="status" className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-red-600 text-white px-3 py-1 rounded mono text-[10px] font-black tracking-widest uppercase whitespace-nowrap shadow-lg animate-pulse">
            Alert · {alert}
          </div>
        )}

        {/* top-left: camera id */}
        <div className={`absolute ${feed.videoUrl ? 'bottom-10' : 'top-3'} left-3 z-10 flex items-center gap-2 bg-black/50 backdrop-blur px-2 py-1 rounded`}>
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[feed.status]} ${feed.status !== 'offline' ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-bold tracking-widest text-white/90 uppercase mono">
            {feed.id} · {feed.name}
          </span>
        </div>

        {/* top-right: clock */}
        <div className="absolute top-3 right-3 z-10 bg-black/50 backdrop-blur px-2 py-1 rounded">
          <span className="text-[10px] font-bold tracking-widest text-white/90 mono">{timestampLabel ?? currentTime}</span>
        </div>

        {/* bottom-left badges */}
        <div className="absolute bottom-3 left-3 z-10 flex gap-2">
          {feed.videoUrl ? (
            feed.alertWindows && (
              <span className="bg-black/70 px-2 py-1 rounded text-[8px] font-bold text-green-300 mono border border-green-400/30">
                EDGE AI MODEL
              </span>
            )
          ) : (
            <span className="bg-black/70 px-2 py-1 rounded text-[8px] font-bold text-white/80 mono border border-white/10">
              SIMULATED
            </span>
          )}
          {feed.status === 'warning' && (
            <span className="bg-yellow-400/90 px-2 py-1 rounded text-[8px] font-bold text-black mono">SIGNAL UNSTABLE</span>
          )}
          {feed.status !== 'offline' &&
            (playback ? (
              <span className="bg-zinc-100/90 px-2 py-1 rounded text-[8px] font-bold text-zinc-900 mono">PLAYBACK</span>
            ) : (
              <span className="bg-red-600/90 px-2 py-1 rounded text-[8px] font-bold text-white mono flex items-center gap-1">
                <span className="w-1 h-1 bg-white rounded-full animate-ping" />
                LIVE
              </span>
            ))}
        </div>

        {interactive && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-white/10 backdrop-blur-sm p-3 rounded-full border border-white/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </div>
          </div>
        )}
      </div>
    );
  },
);

CCTVFeed.displayName = 'CCTVFeed';
export default CCTVFeed;
