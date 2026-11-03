import { useEffect, useRef } from 'react';
import { standingsAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';
import { colorsOf } from './palette.ts';
import { Pixel2DRenderer, VIEW } from './Pixel2DRenderer.ts';
import { TRACK } from './track.ts';
import { useRaceTime } from './useRaceTime.ts';

/** A lane's silk colour as a small square. */
export function Silk({ lane }: { lane: number }) {
  return <span className="silk" style={{ background: colorsOf(lane).silk }} />;
}

type Props = {
  timeline: Timeline;
  /** Epoch ms of the gun (`gunMs(race.started_at)`). */
  startAtMs: number;
  names: Readonly<Record<HorseId, string>>;
};

/** Big-screen race: the pixel track plus live standings. */
export function RaceView({ timeline, startAtMs, names }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const renderer = new Pixel2DRenderer(el);
    renderer.play(timeline, TRACK, startAtMs);
    return () => renderer.stop();
  }, [timeline, startAtMs]);

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
              <Silk lane={timeline.horses.indexOf(h)} /> {names[h] ?? '?'}
              {time <= t && ` · ${time.toFixed(2)} s`}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
