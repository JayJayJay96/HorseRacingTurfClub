import { eventsBetween } from '../sim/playback.ts';
import type { RaceEvent, Timeline } from '../sim/types.ts';
import { cutinsOf } from '../render/cutins.ts';

export type SfxName =
  | 'count'
  | 'go'
  | 'bell'
  | 'box'
  | 'speed'
  | 'attack'
  | 'hit'
  | 'shield'
  | 'dud'
  | 'fizzle'
  | 'coin'
  | 'cheer'
  | 'cutin'
  | 'splash'
  | 'bonk'
  | 'rain';

function cueOf(e: RaceEvent): SfxName | null {
  switch (e.type) {
    case 'pickup':
      if (!e.item) return 'fizzle';
      if (e.item.startsWith('speed:')) return 'speed';
      if (e.item.startsWith('attack:')) return 'attack';
      if (e.item.startsWith('defense:')) return 'shield';
      return 'dud';
    case 'hit':
      return 'hit';
    case 'blocked':
    case 'reflected':
      return 'shield';
    case 'slip':
      return 'splash';
    case 'bump':
      return 'bonk';
    case 'finish':
      return e.place === 1 ? 'bell' : null;
  }
}

/** Sounds for race time (from, to]: the 3-2-1 countdown, "go" at 0, then timeline events. */
export function raceCues(timeline: Timeline, from: number, to: number): SfxName[] {
  const out: SfxName[] = [];
  for (const k of [3, 2, 1]) if (from < -k && -k <= to) out.push('count');
  if (from < 0 && 0 <= to) out.push('go');
  for (const e of eventsBetween(timeline, from, to)) {
    const cue = cueOf(e);
    if (cue && out.at(-1) !== cue) out.push(cue);
  }
  if (cutinsOf(timeline).some((c) => from < c.t && c.t <= to)) out.push('cutin');
  return out;
}

const PRIORITY: readonly SfxName[] = ['go', 'bell', 'cutin', 'count'];

/** At most `max` cues, race-structure cues (go/bell/count) first so a pile-up can't drop them. */
export function prioritise(cues: readonly SfxName[], max: number): SfxName[] {
  const key = (c: SfxName) => (PRIORITY.includes(c) ? PRIORITY.indexOf(c) : PRIORITY.length);
  return [...cues].sort((a, b) => key(a) - key(b)).slice(0, max);
}
