import { useEffect, useRef, useState, type ReactNode } from 'react';
import { raceAnnouncement } from '../app/announce.ts';
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
  /** Overlays (e.g. cheers) that should stay visible in fullscreen. */
  children?: ReactNode;
};

/** Big-screen race: the pixel track plus live standings. */
export function RaceView({ timeline, startAtMs, names, colors, track = TRACK, children }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFull = () =>
    (full ? document.exitFullscreen() : box.current!.requestFullscreen()).catch(() => {});
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
    <div className="race" ref={box}>
      {document.fullscreenEnabled && (
        <button type="button" className="fullscreen" aria-pressed={full} onClick={toggleFull}>
          {full ? 'Exit fullscreen' : '⛶ Fullscreen'}
        </button>
      )}
      <canvas
        ref={canvas}
        width={VIEW.width}
        height={VIEW.height}
        role="img"
        aria-label={`${track.name} race, ${timeline.horses.length} horses (standings listed alongside)`}
      />
      <p className="visually-hidden" role="status" aria-live="polite">
        {raceAnnouncement(timeline, t, names)}
      </p>
      <ol className="standings">
        {standingsAt(timeline, t).map((h) => {
          const time = timeline.finishTimes[h]!;
          const lane = timeline.horses.indexOf(h);
          return (
            <li key={h}>
              <Silk color={(colors ?? defaultColors)(h, lane).silk} /> #{lane + 1} {names[h] ?? '?'}
              {time <= t && ` · ${time.toFixed(2)} s`}
            </li>
          );
        })}
      </ol>
      {children}
    </div>
  );
}
