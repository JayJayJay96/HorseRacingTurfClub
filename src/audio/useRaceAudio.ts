import { useEffect, useRef } from 'react';
import type { HorseId, Timeline } from '../sim/types.ts';
import { createCommentator } from './commentator.ts';
import { prioritise, raceCues, type SfxName } from './raceCues.ts';
import { soundEngine } from './sound.ts';

const TICK_MS = 100;
/** At most this many effects per tick, so a pile-up doesn't turn into noise. */
const MAX_CUES = 3;

/**
 * Plays a race's sounds against its clock (gun at `startAtMs`). `cues` filters which effects play
 * (phones only want count/go/bell); `commentary` adds spoken lines. Starting mid-race skips the past.
 */
export function useRaceAudio(
  timeline: Timeline | null,
  startAtMs: number,
  opts: {
    names?: Readonly<Record<HorseId, string>>;
    commentary?: boolean;
    cues?: (c: SfxName) => boolean;
    odds?: Readonly<Record<HorseId, { win: number } | undefined>>;
    prize?: string;
    /** Cheers on screen right now, for crowd lines. */
    cheers?: () => number;
  },
) {
  const { commentary = false } = opts;
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  useEffect(() => {
    if (!timeline) return;
    const clock = () => (Date.now() - startAtMs) / 1000;
    let last = clock();
    const lastFinish = Math.max(...Object.values(timeline.finishTimes));
    const com = commentary
      ? createCommentator(timeline, (h) => optsRef.current.names?.[h] ?? '?', last, {
          odds: optsRef.current.odds,
          prize: optsRef.current.prize,
        })
      : null;
    const timer = setInterval(() => {
      const t = clock();
      const engine = soundEngine();
      const keep = optsRef.current.cues;
      const cues = raceCues(timeline, last, t).filter((x) => !keep || keep(x));
      for (const c of prioritise(cues, MAX_CUES)) engine.sfx(c);
      for (const line of com?.linesUpTo(t, optsRef.current.cheers?.() ?? 0) ?? []) engine.say(line);
      last = t;
      // Nothing left to play once the race is well over.
      if (t > lastFinish + 5) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [timeline, startAtMs, commentary]);
}
