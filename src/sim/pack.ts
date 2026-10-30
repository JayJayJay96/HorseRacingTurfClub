import type { HorseId, Timeline } from './types.ts';

/** Progress samples per second kept when a Timeline is stored or sent (raw JSON is 100-340 KB). */
export const PACK_HZ = 2;

/** A Timeline with progress thinned to PACK_HZ and stored as integer decimetres. */
export interface PackedTimeline extends Omit<Timeline, 'progress'> {
  /** Samples per horse in the unpacked Timeline (one per sim tick). */
  readonly ticks: number;
  /** Decimetres at every `tickHz / PACK_HZ`-th tick, plus the final tick. */
  readonly progressDm: Readonly<Record<HorseId, readonly number[]>>;
}

export function packTimeline(timeline: Timeline): PackedTimeline {
  const { progress, ...rest } = timeline;
  const step = timeline.tickHz / PACK_HZ; // TICK_HZ is a multiple of PACK_HZ
  const ticks = Object.values(progress)[0]?.length ?? 0;
  const progressDm: Record<HorseId, number[]> = {};
  for (const [horse, samples] of Object.entries(progress)) {
    const dm: number[] = [];
    for (let i = 0; i < ticks; i += step) dm.push(Math.round(samples[i]! * 10));
    if ((ticks - 1) % step !== 0) dm.push(Math.round(samples[ticks - 1]! * 10));
    progressDm[horse] = dm;
  }
  return { ...rest, ticks, progressDm };
}

/** Linear interpolation back to one sample per tick, in metres (within ~2.5 m of the original). */
export function unpackTimeline(packed: PackedTimeline): Timeline {
  const { ticks, progressDm, ...rest } = packed;
  const step = packed.tickHz / PACK_HZ;
  const tickOf = (k: number) => Math.min(k * step, ticks - 1);
  const progress: Record<HorseId, number[]> = {};
  for (const [horse, dm] of Object.entries(progressDm)) {
    progress[horse] = Array.from({ length: ticks }, (_, i) => {
      const k = Math.floor(i / step);
      const a = tickOf(k);
      const b = tickOf(k + 1);
      const value = b === a ? dm[k]! : dm[k]! + ((dm[k + 1]! - dm[k]!) * (i - a)) / (b - a);
      return value / 10;
    });
  }
  return { ...rest, progress };
}
