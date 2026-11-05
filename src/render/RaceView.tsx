import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { raceAnnouncement } from '../app/announce.ts';
import { TraitIcon, asTrait } from '../app/Traits.tsx';
import { standingsAt } from '../sim/playback.ts';
import type { HorseId, Timeline } from '../sim/types.ts';
import { CutInOverlay } from './CutInOverlay.tsx';
import { cutinAt, cutinsOf } from './cutins.ts';
import type { HD2DOptions } from './hd2d/HD2DRenderer.ts';
import { HorseSprite } from './HorseSprite.tsx';
import { Pixel2DRenderer, VIEW, defaultColors, type ColorsOf } from './Pixel2DRenderer.ts';
import type { RaceRenderer } from './renderer.ts';
import {
  loadRenderMode,
  pickRenderer,
  saveRenderMode,
  webgl2Available,
  type RenderMode,
} from './renderSetting.ts';
import { TRACK, type Track } from './track.ts';
import { useRaceTime } from './useRaceTime.ts';

type Props = {
  timeline: Timeline;
  /** Epoch ms of the gun (`gunMs(race.started_at)`). */
  startAtMs: number;
  names: Readonly<Record<HorseId, string>>;
  /** Per-horse colours (Office); lane colours by default. */
  colors?: ColorsOf;
  track?: Track;
  /** Sandbox only: freeze time and/or force a lighting preset in HD. Keep the object stable. */
  look?: Pick<HD2DOptions, 'freezeT' | 'preset'>;
  /** Overlays (e.g. cheers) that should stay visible in fullscreen. */
  children?: ReactNode;
};

/** Big-screen race: the HD-2D or pixel track plus live standings. */
export function RaceView({
  timeline,
  startAtMs,
  names,
  colors,
  track = TRACK,
  look,
  children,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [mode, setMode] = useState<RenderMode>(() => loadRenderMode());
  const [hdFailed, setHdFailed] = useState(false);
  const webgl2 = useMemo(() => webgl2Available(), []);
  const active = pickRenderer(mode, webgl2, hdFailed);
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
    const colorsOf: ColorsOf = (h, lane) => colorsRef.current(h, lane);
    if (active === '2d') {
      const r = new Pixel2DRenderer(el, colorsOf);
      r.play(timeline, track, startAtMs);
      return () => r.stop();
    }
    let r: RaceRenderer | null = null;
    let cancelled = false;
    const fail = (why: unknown) => {
      console.warn('HD-2D unavailable, using the 2D view:', why);
      r?.stop();
      if (!cancelled) setHdFailed(true);
    };
    import('./hd2d/HD2DRenderer.ts')
      .then(({ HD2DRenderer }) => {
        if (cancelled) return;
        r = new HD2DRenderer(el, colorsOf, { ...look, onLost: () => fail('WebGL context lost') });
        r.play(timeline, track, startAtMs);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      r?.stop();
    };
  }, [timeline, startAtMs, track, active, look]);
  // Release the GL context of a canvas the view stops using (hd -> 2d swap or unmount). Only once
  // it has left the page: StrictMode's simulated unmount keeps the same canvas and reuses it.
  useEffect(() => {
    if (active !== 'hd') return;
    const el = canvas.current;
    return () => {
      setTimeout(() => {
        if (el && !el.isConnected) {
          el.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
        }
      });
    };
  }, [active]);

  const clock = useRaceTime(startAtMs);
  // Sandbox freezes HD at freezeT; the overlay and standings freeze with it (2D ignores it).
  const frozen = active === 'hd' ? look?.freezeT : undefined;
  const t = frozen ?? clock;
  const toggleMode = () => {
    const next: RenderMode = mode === 'hd' ? '2d' : 'hd';
    setMode(next);
    saveRenderMode(next);
  };
  return (
    <div
      className={`race${cutinAt(cutinsOf(timeline), t) ? ' cutin-on' : ''}${frozen === undefined ? '' : ' frozen'}`}
      ref={box}
    >
      <div className="race-buttons">
        {document.fullscreenEnabled && (
          <button type="button" className="chip" aria-pressed={full} onClick={toggleFull}>
            {full ? 'Exit fullscreen' : '⛶ Fullscreen'}
          </button>
        )}
        <button
          type="button"
          className="chip"
          aria-pressed={active === 'hd'}
          disabled={!webgl2 || hdFailed}
          aria-label="HD graphics"
          title={webgl2 && !hdFailed ? undefined : 'HD needs WebGL2; showing the 2D view'}
          onClick={toggleMode}
        >
          {webgl2 && !hdFailed ? 'HD' : 'HD unavailable'}
        </button>
      </div>
      <div className="panel race-frame">
        {/* A new element per renderer: a canvas with a WebGL context can't give a 2D one. */}
        <canvas
          key={active}
          ref={canvas}
          className={active === 'hd' ? 'hd' : undefined}
          width={active === '2d' ? VIEW.width : undefined}
          height={active === '2d' ? VIEW.height : undefined}
          role="img"
          aria-label={`${track.name} race, ${timeline.horses.length} horses (standings listed alongside)`}
        />
        <CutInOverlay timeline={timeline} t={t} names={names} colors={colors ?? defaultColors} />
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {raceAnnouncement(timeline, t, names)}
      </p>
      <ol className="standings panel">
        {standingsAt(timeline, t).map((h) => {
          const time = timeline.finishTimes[h]!;
          const lane = timeline.horses.indexOf(h);
          return (
            <li key={h}>
              <HorseSprite colors={(colors ?? defaultColors)(h, lane)} size="sm" /> #{lane + 1}{' '}
              {timeline.traits && <TraitIcon trait={asTrait(timeline.traits[h])} />}{' '}
              {names[h] ?? '?'}
              {time <= t && ` · ${time.toFixed(2)} s`}
            </li>
          );
        })}
      </ol>
      {children}
    </div>
  );
}
