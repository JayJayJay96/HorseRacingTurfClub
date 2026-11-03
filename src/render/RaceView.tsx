import { useEffect, useRef } from 'react';
import { standingsAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';
import { Pixel2DRenderer, VIEW, defaultColors, type ColorsOf } from './Pixel2DRenderer.ts';
import { TRACK, type Track } from './track.ts';
import { useRaceTime } from './useRaceTime.ts';

/** A horse's silk colour as a small square. */
export function Silk({ color }: { color: string }) {
  return <span className="silk" style={{ background: color }} />;
}

type Props = {
  timeline: Timeline;
  /** Epoch ms of the gun (`gunMs(race.started_at)`). */
  startAtMs: number;
  names: Readonly<Record<HorseId, string>>;
  /** Per-horse colours (Office); lane colours by default. */
  colors?: ColorsOf;
  track?: Track;
};

/** Big-screen race: the pixel track plus live standings. */
export function RaceView({ timeline, startAtMs, names, colors, track = TRACK }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // A ref, so a room refetch (new colours function) doesn't restart the race.
  const colorsRef = useRef(colors ?? defaultColors);
  useEffect(() => {
    colorsRef.current = colors ?? defaultColors;
  });
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const renderer = new Pixel2DRenderer(el, (h, lane) => colorsRef.current(h, lane));
    renderer.play(timeline, track, startAtMs);
    return () => renderer.stop();
  }, [timeline, startAtMs, track]);

  const t = useRaceTime(startAtMs);
  return (
    <div className="race">
      <canvas
        ref={canvas}
        width={VIEW.width}
        height={VIEW.height}
        role="img"
        aria-label="Race track (standings listed alongside)"
      />
      <ol className="standings">
        {standingsAt(timeline, t).map((h) => {
          const time = timeline.finishTimes[h]!;
          return (
            <li key={h}>
              <Silk color={(colors ?? defaultColors)(h, timeline.horses.indexOf(h)).silk} />{' '}
              {names[h] ?? '?'}
              {time <= t && ` · ${time.toFixed(2)} s`}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
