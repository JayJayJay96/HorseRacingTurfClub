import { useMemo } from 'react';
import { defaultColors, type ColorsOf } from '../render/Pixel2DRenderer.ts';
import {
  TRACK,
  finishS,
  horsePoint,
  trackBounds,
  trackPoint,
  type Track,
} from '../render/track.ts';
import { progressAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';

const PAD = 10;

/** Top-down dots on the track; `mine` is drawn last, bigger and outlined. */
export function MiniOval({
  timeline,
  t,
  mine,
  colors,
  track = TRACK,
}: {
  timeline: Timeline;
  t: number;
  mine: HorseId;
  colors?: ColorsOf;
  track?: Track;
}) {
  const lanes = timeline.horses.length;
  const width = lanes * TRACK.laneWidth;
  const { halfWidth, halfHeight } = useMemo(() => trackBounds(track, lanes), [track, lanes]);
  const path = useMemo(
    () =>
      Array.from({ length: 121 }, (_, i) => trackPoint(track, (i / 120) * track.lap, width / 2))
        .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' '),
    [track, width],
  );
  const f0 = trackPoint(track, finishS(track), 0);
  const f1 = trackPoint(track, finishS(track), width);
  const dots = timeline.horses
    .map((id, lane) => ({
      id,
      lane,
      p: horsePoint(track, timeline.distance, progressAt(timeline, id, t), lane),
    }))
    .sort((a, b) => Number(a.id === mine) - Number(b.id === mine));
  return (
    <svg
      className="mini"
      viewBox={`${-halfWidth - PAD} ${-halfHeight - PAD} ${2 * (halfWidth + PAD)} ${2 * (halfHeight + PAD)}`}
      role="img"
      aria-label="Race positions"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={width + 4}
      />
      <line x1={f0.x} y1={f0.y} x2={f1.x} y2={f1.y} stroke="currentColor" strokeWidth={3} />
      {dots.map(({ id, lane, p }) => (
        <circle
          key={id}
          cx={p.x}
          cy={p.y}
          r={id === mine ? 14 : 8}
          fill={(colors ?? defaultColors)(id, lane).silk}
          stroke={id === mine ? 'currentColor' : 'none'}
          strokeWidth={4}
        />
      ))}
    </svg>
  );
}
