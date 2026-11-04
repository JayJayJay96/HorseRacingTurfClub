import { simulateShares } from '../sim/odds.ts';
import { createSeededRng } from '../sim/rng.ts';
import type { RaceInput } from '../sim/types.ts';

// Off the main thread: up to ~800 ms of simulation would stall the big screen's music and UI.
self.onmessage = ({ data }: MessageEvent<Omit<RaceInput, 'seed'>>) => {
  const { wins, top3, sims } = simulateShares(
    data,
    createSeededRng((Math.random() * 2 ** 32) >>> 0),
  );
  (self as unknown as Worker).postMessage({
    wins: Object.fromEntries(wins),
    top3: Object.fromEntries(top3),
    sims,
  });
};
