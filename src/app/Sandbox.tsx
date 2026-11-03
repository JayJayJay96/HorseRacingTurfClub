import { useMemo, useState } from 'react';
import { RaceView } from '../render/RaceView.tsx';
import { COUNTDOWN_SECONDS } from '../sim/playback.ts';
import { createCryptoRng } from '../sim/rng.ts';
import { simulateRace } from '../sim/simulate.ts';
import type { RaceLength, Timeline } from '../sim/types.ts';

const SAMPLE_HORSES = [
  'Nasi Lemak Express',
  'Teh Tarik Turbo',
  'Roti Canai Rocket',
  'Kopi O Kid',
  'Satay Sprinter',
  'Durian Dasher',
];

/** Runs the engine locally with a crypto seed and plays it back; no Supabase needed. */
export function Sandbox() {
  const [run, setRun] = useState<{ timeline: Timeline; gun: number } | null>(null);
  const names = useMemo(() => Object.fromEntries(SAMPLE_HORSES.map((h) => [h, h])), []);
  const start = (length: RaceLength) =>
    setRun({
      timeline: simulateRace({
        seed: createCryptoRng().nextInt(2 ** 32),
        horses: SAMPLE_HORSES,
        bought: { [SAMPLE_HORSES[0]!]: ['speed', 'attack', 'defense'] },
        length,
      }),
      gun: Date.now() + COUNTDOWN_SECONDS * 1000,
    });

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
        {run && ` Seed ${run.timeline.seed} · ${run.timeline.events.length} events`}
      </p>
      {run && <RaceView key={run.gun} timeline={run.timeline} startAtMs={run.gun} names={names} />}
    </main>
  );
}
