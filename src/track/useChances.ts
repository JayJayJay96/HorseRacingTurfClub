import { useEffect, useState } from 'react';
import type { HorseId, RaceInput } from '../sim/types.ts';

export type Chances = {
  /** Shares 0..1 per horse. */
  win: Record<HorseId, number>;
  top3: Record<HorseId, number>;
  sims: number;
};

type Counts = { wins: Record<HorseId, number>; top3: Record<HorseId, number>; sims: number };

/**
 * Win and top-3 chances from simulating this field with its bought boxes, in a worker. Reruns
 * whenever the field or its boxes change; the last result stays up until the new one arrives.
 */
export function useChances(race: Omit<RaceInput, 'seed'> | null): Chances | null {
  const key = race ? JSON.stringify(race) : '';
  const [chances, setChances] = useState<Chances | null>(null);
  useEffect(() => {
    if (!key) return;
    const worker = new Worker(new URL('./chances.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<Counts>) => {
      const share = (c: Record<HorseId, number>) =>
        Object.fromEntries(Object.entries(c).map(([h, n]) => [h, n / data.sims]));
      setChances({ win: share(data.wins), top3: share(data.top3), sims: data.sims });
      worker.terminate();
    };
    worker.postMessage(JSON.parse(key));
    // A newer field (another box bought) replaces a run still in progress.
    return () => worker.terminate();
  }, [key]);
  return chances;
}
