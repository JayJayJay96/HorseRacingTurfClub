import { useMemo } from 'react';
import { defaultColors, type ColorsOf } from './Pixel2DRenderer.ts';
import { TRACK, finishS, horsePoint, trackBounds, trackPoint, type Track } from './track.ts';
import { progressAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';

const PAD = 10;

/**
 * Top-down dots on the track (phone and the big screen's corner map); `mine`, when given, is drawn
 * last, bigger and outlined.
 */
export function MiniOval({
  timeline,
  t,
  mine,
  colors,
  track = TRACK,
}: {
  timeline: Timeline;
  t: number;
  mine?: HorseId;
  colors?: ColorsOf;
  track?: Track;
}) {
  const lanes = timeline.horses.length;
  const width = lanes * TRACK.laneWidth;
  const { halfWidth, halfHeight } = useMemo(() => trackBounds(track, lanes), [track, lanes]);
  // Both rails as closed rings, filled even-odd: the same ribbon the race view draws.
  const path = useMemo(
    () =>
      [width + 2, -2]
        .map(
          (offset) =>
            Array.from({ length: 240 }, (_, i) => trackPoint(track, (i / 240) * track.lap, offset))
              .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(' ') + 'Z',
        )
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
      {/* Turned 180° about the centre, as the big screen shows it (stands at the top). */}
      <g transform="rotate(180)">
        <path d={path} fill="currentColor" fillOpacity={0.25} fillRule="evenodd" />
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
      </g>
    </svg>
  );
}
