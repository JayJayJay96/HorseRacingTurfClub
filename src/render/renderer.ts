import type { Timeline } from '../sim/types.ts';
import type { Track } from './track.ts';

/** Spec §4: every renderer plays the same Timeline on the same track. */
export interface RaceRenderer {
  /** `startAtMs` is the epoch ms of the gun (race time 0); earlier times show the countdown. */
  play(timeline: Timeline, track: Track, startAtMs: number): void;
  stop(): void;
}
