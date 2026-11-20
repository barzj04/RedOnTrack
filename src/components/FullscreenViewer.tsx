import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraFeed, Scenario } from '../domain';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { exportService } from '../services';
import CCTVFeed from './CCTVFeed';
import type { FeedHandle } from './SimulatedFeed';

interface Props {
  feeds: CameraFeed[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Show snapshot / record buttons. */
  allowCapture?: boolean;
  /** Archived playback label, e.g. "21/11/2026 14:30". */
  playbackLabel?: string;
  variant?: string;
  /** Incident to act out in playback. */
  scenario?: Scenario;
}

const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

const FullscreenViewer: React.FC<Props> = ({
  feeds,
  index,
  onIndexChange,
  onClose,
  allowCapture = false,
  playbackLabel,
  variant,
  scenario,
}) => {
  const feed = feeds[index];
  const feedRef = useRef<FeedHandle>(null);
  const { currentTime } = useCurrentTime();
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const stopRecording = useCallback(async () => {
    const blob = await feedRef.current?.stopRecording();
    setRecording(false);
    if (blob) {
      const r = await exportService.downloadBlob(blob, `RedOnTrack_${feed.id}_${Date.now()}.webm`);
      say(r === 'saved' ? 'Recording saved' : r === 'declined' ? 'Recording not saved' : 'Could not save the recording');
    }
  }, [feed.id]);

  const close = useCallback(async () => {
    if (recording) await stopRecording();
    onClose();
  }, [recording, stopRecording, onClose]);

  const step = useCallback(
    (delta: number) => {
      if (recording) return; // don't switch camera mid-recording
      onIndexChange((index + delta + feeds.length) % feeds.length);
    },
    [recording, index, feeds.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, step]);

  useEffect(() => {
    if (!recording) return setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const snapshot = async () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    const blob = await feedRef.current?.snapshot();
    if (!blob) return say('Snapshot not available for this feed');
    const r = await exportService.downloadBlob(blob, `RedOnTrack_${feed.id}_${Date.now()}.png`);
    say(r === 'saved' ? 'Snapshot saved' : r === 'declined' ? 'Snapshot not saved' : 'Could not save the snapshot');
  };

  const toggleRecording = async () => {
    if (recording) return stopRecording();
    const ok = feedRef.current?.startRecording();
    if (ok) setRecording(true);
    else say('Recording is not supported in this browser');
  };

  if (!feed) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`${feed.name} full screen`}
    >
      {flash && <div className="absolute inset-0 bg-white z-[110] opacity-80 pointer-events-none" />}

      <div className="w-full max-w-[min(100vw,calc(80vh*16/9))] px-2 sm:px-16">
        <CCTVFeed
          ref={feedRef}
          feed={feed}
          variant={variant}
          scenario={scenario}
          playback={!!playbackLabel}
          timestampLabel={playbackLabel}
        />
      </div>

      <button
        onClick={close}
        aria-label="Close full screen"
        className="absolute top-4 right-4 z-[101] p-2 bg-white/15 hover:bg-white/30 rounded-full text-white"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {feeds.length > 1 && (
        <>
          <button
            onClick={() => step(-1)}
            disabled={recording}
            aria-label="Previous camera"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-[101] p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-full text-white border border-white/10"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => step(1)}
            disabled={recording}
            aria-label="Next camera"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-[101] p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-full text-white border border-white/10"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {recording && (
        <div className="absolute top-4 left-4 z-[101] flex items-center gap-3 bg-red-600/30 backdrop-blur px-4 py-2 rounded-full border border-red-500/40">
          <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
          <span className="text-xs font-black text-white mono tracking-widest">REC {fmt(seconds)}</span>
        </div>
      )}

      <div className="absolute bottom-4 inset-x-4 z-[101] flex flex-col-reverse sm:flex-row sm:items-end justify-between gap-4">
        {allowCapture ? (
          <div className="flex gap-3">
            <button
              onClick={snapshot}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl border border-white/10"
            >
              Snapshot
            </button>
            <button
              onClick={toggleRecording}
              className={`px-5 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl flex items-center gap-2 ${
                recording ? 'bg-red-600 text-white' : 'bg-white text-gray-900 hover:bg-zinc-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${recording ? 'bg-white' : 'bg-red-600'}`} />
              {recording ? 'Stop & save' : 'Record clip'}
            </button>
          </div>
        ) : (
          <span />
        )}
        <div className="text-right">
          <p className="text-white text-lg font-black italic uppercase tracking-tighter leading-none">{feed.name}</p>
          <p className="text-zinc-400 text-[10px] font-bold uppercase mono tracking-widest">
            {feed.location} · {playbackLabel ? `Recorded ${playbackLabel}` : currentTime}
          </p>
        </div>
      </div>

      {toast && (
        <div role="status" className="absolute top-16 left-1/2 -translate-x-1/2 z-[120] bg-white text-gray-900 text-xs font-bold px-4 py-2 rounded-full shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
};

export default FullscreenViewer;
