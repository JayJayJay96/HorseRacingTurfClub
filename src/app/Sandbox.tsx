import { useState } from 'react';
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

/** Phase 1 sandbox: runs the engine with a crypto seed and lists the result. No graphics yet. */
export function Sandbox() {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const run = (length: RaceLength) =>
    setTimeline(
      simulateRace({
        seed: createCryptoRng().nextInt(2 ** 32),
        horses: SAMPLE_HORSES,
        bought: {},
        length,
      }),
    );

  return (
    <main>
      <h1>Horse Racing Turf Club</h1>
      <p>Phase 1 sandbox: runs the race engine and lists the result.</p>
      <button type="button" onClick={() => run('short')}>
        Run short race
      </button>{' '}
      <button type="button" onClick={() => run('long')}>
        Run long race
      </button>
      {timeline && (
        <>
          <p>
            Seed {timeline.seed} · {timeline.length} · {timeline.events.length} events
          </p>
          <ol>
            {timeline.finishOrder.map((id) => (
              <li key={id}>
                {id}: {timeline.finishTimes[id]?.toFixed(2)} s
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
