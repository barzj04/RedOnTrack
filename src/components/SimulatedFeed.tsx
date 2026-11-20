import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CameraStatus, Scenario } from '../domain';
import { FEED_HEIGHT, FEED_WIDTH, PlatformScene, hashSeed } from '../services/feedRenderer';

export interface FeedHandle {
  /** PNG snapshot of the current frame, or null if unavailable. */
  snapshot: () => Promise<Blob | null>;
  /** Starts recording the canvas; resolves to false if the browser cannot record. */
  startRecording: () => boolean;
  /** Stops recording and resolves to the WebM clip. */
  stopRecording: () => Promise<Blob | null>;
}

interface Props {
  seed: string;
  status: CameraStatus;
  className?: string;
  /** Pause animation (e.g. thumbnails that are off-screen). */
  paused?: boolean;
  /** Incident to act out in the scene. */
  scenario?: Scenario;
  /** Called when the on-screen alert starts (label) or ends (null). */
  onAlert?: (label: string | null) => void;
}

const FRAME_MS = 1000 / 15;

const SimulatedFeed = forwardRef<FeedHandle, Props>(({ seed, status, className = '', paused = false, scenario, onAlert }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const visibleRef = useRef(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const scene = new PlatformScene(hashSeed(seed), status, scenario);
    let lastAlert: string | null = null;
    // warm up so trains/people are mid-motion on first paint
    for (let i = 0; i < 60; i++) scene.update(0.25);
    scene.render(ctx);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (pausedRef.current || !visibleRef.current || document.hidden) return;
      acc += dt * 1000;
      if (acc < FRAME_MS) return;
      scene.update(acc / 1000);
      acc = 0;
      scene.render(ctx);
      const alert = scene.getAlert();
      if (alert !== lastAlert) {
        lastAlert = alert;
        onAlertRef.current?.(alert);
      }
    };
    raf = requestAnimationFrame(loop);

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visibleRef.current = entry.isIntersecting;
          })
        : null;
    io?.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [seed, status, scenario]);

  useImperativeHandle(ref, () => ({
    snapshot: () =>
      new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) return resolve(null);
        canvas.toBlob((b) => resolve(b), 'image/png');
      }),
    startRecording: () => {
      const canvas = canvasRef.current;
      if (!canvas || typeof MediaRecorder === 'undefined' || !('captureStream' in canvas)) return false;
      const stream = canvas.captureStream(15);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.start(500);
      recorderRef.current = recorder;
      return true;
    },
    stopRecording: () =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder) return resolve(null);
        recorder.onstop = () => {
          recorderRef.current = null;
          resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: 'video/webm' }) : null);
        };
        recorder.stop();
      }),
  }));

  return (
    <canvas
      ref={canvasRef}
      width={FEED_WIDTH}
      height={FEED_HEIGHT}
      className={`block w-full h-full object-cover ${className}`}
      aria-label="Simulated CCTV feed"
    />
  );
});

SimulatedFeed.displayName = 'SimulatedFeed';
export default SimulatedFeed;
