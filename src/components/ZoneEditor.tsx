import React, { useRef, useState } from 'react';
import type { CameraFeed, CameraZones, ZonePoint } from '../domain';
import SimulatedFeed from './SimulatedFeed';

type ZoneKey = keyof CameraZones;

interface Props {
  feed: CameraFeed;
  zones: CameraZones;
  onChange: (zones: CameraZones) => void;
}

const W = 1600;
const H = 900;

const STYLE: Record<ZoneKey, { fill: string; stroke: string; label: string; chip: string }> = {
  red: { fill: 'rgba(220,38,38,0.32)', stroke: '#ef4444', label: 'Red zone (track)', chip: 'bg-red-600 text-white' },
  yellow: { fill: 'rgba(250,204,21,0.35)', stroke: '#facc15', label: 'Yellow zone (warning)', chip: 'bg-yellow-400 text-black' },
};

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Drag the corners of the red and yellow zones over the camera image. */
const ZoneEditor: React.FC<Props> = ({ feed, zones, onChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<ZoneKey>('red');
  const [drag, setDrag] = useState<{ zone: ZoneKey; index: number } | null>(null);

  const setPoint = (zone: ZoneKey, index: number, p: ZonePoint) =>
    onChange({ ...zones, [zone]: zones[zone].map((q, i) => (i === index ? [clamp(p[0]), clamp(p[1])] : q)) });

  const shiftZone = (zone: ZoneKey, dx: number, dy: number) => {
    const pts = zones[zone];
    // keep the whole shape inside the frame
    const minX = Math.min(...pts.map((p) => p[0]));
    const maxX = Math.max(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1]));
    const maxY = Math.max(...pts.map((p) => p[1]));
    const sx = Math.max(-minX, Math.min(1 - maxX, dx));
    const sy = Math.max(-minY, Math.min(1 - maxY, dy));
    onChange({ ...zones, [zone]: pts.map(([x, y]) => [x + sx, y + sy] as ZonePoint) });
  };

  const toPoint = (e: React.PointerEvent): ZonePoint => {
    const r = svgRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const onKey = (zone: ZoneKey, index: number) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d: Record<string, ZonePoint> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    const [x, y] = zones[zone][index];
    setPoint(zone, index, [x + m[0], y + m[1]]);
  };

  const order: ZoneKey[] = active === 'red' ? ['yellow', 'red'] : ['red', 'yellow']; // active zone drawn on top

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-950 select-none touch-none">
        {feed.videoUrl ? (
          <video className="absolute inset-0 w-full h-full object-cover grayscale brightness-90 contrast-125" autoPlay muted loop playsInline aria-hidden>
            {feed.videoUrl.endsWith('.mp4') && <source src={feed.videoUrl.replace(/\.mp4$/, '.webm')} type="video/webm" />}
            <source src={feed.videoUrl} />
          </video>
        ) : (
          <div className="absolute inset-0 grayscale">
            <SimulatedFeed seed={feed.id} status={feed.status} />
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          onPointerMove={(e) => drag && setPoint(drag.zone, drag.index, toPoint(e))}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
          role="group"
          aria-label="Zone editor"
        >
          {order.map((zone) => (
            <g key={zone} onPointerDown={() => setActive(zone)}>
              <polygon
                points={zones[zone].map(([x, y]) => `${x * W},${y * H}`).join(' ')}
                fill={STYLE[zone].fill}
                stroke={STYLE[zone].stroke}
                strokeWidth={zone === active ? 6 : 3}
                strokeDasharray={zone === active ? undefined : '14 10'}
              />
              {zone === active &&
                zones[zone].map(([x, y], i) => (
                  <circle
                    key={i}
                    cx={x * W}
                    cy={y * H}
                    r={22}
                    fill="#fff"
                    stroke={STYLE[zone].stroke}
                    strokeWidth={8}
                    tabIndex={0}
                    role="slider"
                    aria-label={`${STYLE[zone].label} corner ${i + 1}: ${pct(x)} across, ${pct(y)} down. Arrow keys move it.`}
                    aria-valuenow={Math.round(x * 100)}
                    className="cursor-grab focus:outline-none"
                    style={{ outline: 'none' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as Element).setPointerCapture(e.pointerId);
                      setDrag({ zone, index: i });
                    }}
                    onKeyDown={onKey(zone, i)}
                  />
                ))}
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-2" role="radiogroup" aria-label="Zone to edit">
          {(['red', 'yellow'] as ZoneKey[]).map((z) => (
            <button
              key={z}
              role="radio"
              aria-checked={active === z}
              onClick={() => setActive(z)}
              className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-colors ${
                active === z ? `${STYLE[z].chip} border-transparent` : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {STYLE[z].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-zinc-400 mono uppercase tracking-widest mr-1">Move zone</span>
          {(
            [
              ['Left', -0.01, 0, 'M15 19l-7-7 7-7'],
              ['Up', 0, -0.01, 'M5 15l7-7 7 7'],
              ['Down', 0, 0.01, 'M19 9l-7 7-7-7'],
              ['Right', 0.01, 0, 'M9 5l7 7-7 7'],
            ] as const
          ).map(([label, dx, dy, d]) => (
            <button
              key={label}
              onClick={() => shiftZone(active, dx, dy)}
              aria-label={`Move ${STYLE[active].label} ${label.toLowerCase()}`}
              className="p-2 rounded-lg border border-zinc-200 hover:border-red-500 hover:text-red-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={d} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-zinc-500">
        The camera image is shown in grey so the zones stand out. Drag the white corners, or select a corner and use the arrow keys (hold Shift for bigger steps). Coordinates are saved
        as a fraction of the frame, so they work at any camera resolution.
      </p>
    </div>
  );
};

export default ZoneEditor;
