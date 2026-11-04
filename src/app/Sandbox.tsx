import { useEffect, useMemo, useState } from 'react';
import { RaceView } from '../render/RaceView.tsx';
import type { PresetId } from '../render/hd2d/lighting.ts';
import { COUNTDOWN_SECONDS } from '../sim/playback.ts';
import { createCryptoRng } from '../sim/rng.ts';
import { simulateRace } from '../sim/simulate.ts';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type { RaceLength, Timeline } from '../sim/types.ts';
import { TRACKS, type TrackId } from '../render/track.ts';
import { colorsOf } from '../render/palette.ts';
import { COSMETICS, type CosmeticSlot } from '../shop/cosmetics.ts';

const SAMPLE_HORSES = [
  'Nasi Lemak Express',
  'Teh Tarik Turbo',
  'Roti Canai Rocket',
  'Kopi O Kid',
  'Satay Sprinter',
  'Durian Dasher',
];
/** A full 22-horse field for the performance target (spec §4). */
const FULL_FIELD = [...SAMPLE_HORSES, ...Array.from({ length: 16 }, (_, i) => `Extra ${i + 1}`)];

/** Runs the engine locally with a crypto seed and plays it back; no Supabase needed. */
export function Sandbox() {
  const [run, setRun] = useState<{ timeline: Timeline; gun: number } | null>(null);
  const [trackId, setTrackId] = useState<TrackId>('oval');
  const [looks, setLooks] = useState<Record<CosmeticSlot, string>>({ pattern: '', trail: '' });
  const [field, setField] = useState<6 | 22>(6);
  const [preset, setPreset] = useState<PresetId | ''>('');
  const [lookTest, setLookTest] = useState(false);
  const [frameMs, setFrameMs] = useState(0);
  const horses = field === 6 ? SAMPLE_HORSES : FULL_FIELD;
  // Lane 0 wears the picked looks, so each pattern and trail can be checked by eye.
  const colors = useMemo(
    () => (_horse: string, lane: number) =>
      lane === 0 ? { ...colorsOf(0), ...looks } : colorsOf(lane),
    [looks],
  );
  const names = useMemo(() => Object.fromEntries(FULL_FIELD.map((h) => [h, h])), []);
  // Look test: 6 horses on the home straight, frozen (leader 100 m out at t = 170 s).
  const lookRun = useMemo(() => {
    const speeds = Object.fromEntries(SAMPLE_HORSES.map((h, i) => [h, 10 - i * 0.03] as const));
    return { timeline: fakeTimeline(speeds, 1800), gun: 0 };
  }, []);
  const look = useMemo(
    () => ({ ...(lookTest ? { freezeT: 170 } : {}), ...(preset ? { preset } : {}) }),
    [lookTest, preset],
  );
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = setInterval(
      () => setFrameMs((globalThis as { hd2dFrameMs?: number }).hd2dFrameMs ?? 0),
      500,
    );
    return () => clearInterval(id);
  }, []);
  const start = (length: RaceLength) =>
    setRun({
      timeline: simulateRace({
        seed: createCryptoRng().nextInt(2 ** 32),
        horses,
        bought: { [SAMPLE_HORSES[0]!]: ['speed', 'attack', 'defense'] },
        length,
      }),
      gun: Date.now() + COUNTDOWN_SECONDS * 1000,
    });
  const shown = lookTest ? lookRun : run;

  return (
    <main className="track">
      <h1>Horse Racing Turf Club · sandbox</h1>
      <p>
        <button type="button" onClick={() => start('short')}>
          Run short race
        </button>{' '}
        <button type="button" onClick={() => start('long')}>
          Run long race
        </button>
        <label>
          {' '}
          Track{' '}
          <select value={trackId} onChange={(e) => setTrackId(e.target.value as TrackId)}>
            {Object.values(TRACKS).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {' '}
          Horses{' '}
          <select value={field} onChange={(e) => setField(Number(e.target.value) === 22 ? 22 : 6)}>
            <option value={6}>6</option>
            <option value={22}>22</option>
          </select>
        </label>
        {(['pattern', 'trail'] as const).map((slot) => (
          <label key={slot}>
            {' '}
            Lane 1 {slot}{' '}
            <select
              value={looks[slot]}
              onChange={(e) => setLooks({ ...looks, [slot]: e.target.value })}
            >
              <option value="">None</option>
              {COSMETICS.filter((c) => c.slot === slot).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {' '}
          Light{' '}
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetId | '')}>
            <option value="">From seed</option>
            <option value="afternoon">Afternoon</option>
            <option value="sunset">Sunset</option>
            <option value="night">Night</option>
          </select>
        </label>{' '}
        <button type="button" aria-pressed={lookTest} onClick={() => setLookTest(!lookTest)}>
          Look test
        </button>
        {run && !lookTest && ` Seed ${run.timeline.seed} · ${run.timeline.events.length} events`}
        {import.meta.env.DEV && frameMs > 0 && ` · ${frameMs.toFixed(1)} ms/frame`}
      </p>
      {shown && (
        <RaceView
          key={`${shown.gun}-${lookTest}`}
          timeline={shown.timeline}
          startAtMs={shown.gun}
          names={names}
          track={TRACKS[trackId]}
          colors={colors}
          look={look}
        />
      )}
    </main>
  );
}
