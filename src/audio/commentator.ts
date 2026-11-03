import { progressAt, standingsAt } from '../sim/playback.ts';
import type { HorseId, RaceEvent, Timeline } from '../sim/types.ts';

/** Seconds between ordinary lines (big moments ignore it), and when lead calls may start. */
export const COMMENTARY = { minGap: 4, leadAfter: 3, finalStretchMetres: 300 } as const;

export interface Commentator {
  /** New lines for race time up to `t` (call with increasing t). */
  linesUpTo(t: number): string[];
}

function bigMoment(e: RaceEvent, name: (h: HorseId) => string): string | null {
  if (e.type === 'hit' && e.item === 'attack:leader') {
    return `Golden Lasso! ${name(e.by)} stops ${name(e.horse)}!`;
  }
  if (e.type === 'pickup' && e.item === 'attack:all') return `Thunderclap from ${name(e.horse)}!`;
  if (e.type === 'pickup' && e.item === 'speed:pass3')
    return `${name(e.horse)} stampedes through the field!`;
  return null;
}

/**
 * Race commentary from the Timeline (spec §11, browser voice). `startT` skips everything up to
 * then, so a reloaded big screen doesn't replay old lines.
 */
export function createCommentator(
  timeline: Timeline,
  name: (horse: HorseId) => string,
  startT = -Infinity,
  opts: { finalStretchMetres?: number } = {},
): Commentator {
  const stretchAt = timeline.distance - (opts.finalStretchMetres ?? COMMENTARY.finalStretchMetres);
  const [winner, second, third] = timeline.finishOrder;
  const wonAt = winner === undefined ? Infinity : timeline.finishTimes[winner]!;
  const from = Math.max(0, startT);
  let last = startT;
  let lastLineAt = -Infinity;
  let leader: HorseId | undefined = standingsAt(timeline, from)[0];
  let saidStart = startT >= 0;
  let saidStretch =
    leader !== undefined && progressAt(timeline, leader, from) >= stretchAt && startT >= 0;
  let saidFinish = wonAt <= startT;

  return {
    linesUpTo(t) {
      const out: string[] = [];
      if (t <= last) return out;
      const say = (line: string) => {
        out.push(line);
        lastLineAt = t;
      };
      if (!saidStart && t >= 0) {
        saidStart = true;
        say("And they're off!");
      }
      for (const e of timeline.events) {
        if (e.t > last && e.t <= t) {
          const line = bigMoment(e, name);
          if (line) say(line);
        }
      }
      const now = standingsAt(timeline, t)[0];
      if (now !== leader) {
        if (now !== undefined && t >= COMMENTARY.leadAfter && t - lastLineAt >= COMMENTARY.minGap) {
          say(`${name(now)} takes the lead!`);
        }
        leader = now;
      }
      if (
        !saidStretch &&
        t >= 0 &&
        leader !== undefined &&
        progressAt(timeline, leader, t) >= stretchAt
      ) {
        saidStretch = true;
        if (wonAt > t) say('Into the final stretch!');
      }
      if (!saidFinish && wonAt <= t) {
        saidFinish = true;
        const podium =
          second !== undefined && third !== undefined
            ? ` ${name(second)} second, ${name(third)} third.`
            : '';
        say(`${name(winner!)} wins it!${podium}`);
      }
      last = t;
      return out;
    },
  };
}
