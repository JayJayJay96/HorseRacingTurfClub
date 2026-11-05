import { raceAwards } from '../sim/awards.ts';
import { progressAt, standingsAt } from '../sim/playback.ts';
import type { HorseId, RaceEvent, Timeline, Trait } from '../sim/types.ts';
import { ITEM_INFO } from '../render/items.ts';
import { line, LINES, type Rand } from './lines.ts';

/**
 * Seconds between ordinary lines (big moments ignore it), and when lead calls may start. Outsiders
 * have Win odds of at least `outsiderOdds`; neck and neck is within `neckMetres` after `neckFrom`
 * of the winner's time; crowd lines need `crowdCheers` on screen, at most every `crowdGap` s.
 */
export const COMMENTARY = {
  minGap: 4,
  leadAfter: 3,
  finalStretchMetres: 300,
  introAt: -4,
  outsiderOdds: 8,
  neckMetres: 1.5,
  neckFrom: 0.7,
  crowdCheers: 3,
  crowdGap: 15,
} as const;

export interface Commentator {
  /** New lines for race time up to `t` (call with increasing t). */
  linesUpTo(t: number, cheersOnScreen?: number): string[];
}

type Line = [pool: readonly string[], vars: Record<string, string>];
type TraitOf = (h: HorseId) => Trait;
const BUFF_NAME = { lucky: 'Lucky', extended: 'Extended' } as const;

function bigMoment(e: RaceEvent, name: (h: HorseId) => string, trait: TraitOf): Line | null {
  if (e.type === 'hit' && e.item === 'attack:leader') {
    const vars = { by: name(e.by), v: name(e.horse) };
    return [trait(e.horse) === 'tough' ? LINES.toughLasso : LINES.lasso, vars];
  }
  if (e.type === 'pickup' && e.item === 'attack:all')
    return [LINES.thunderclap, { h: name(e.horse) }];
  if (e.type === 'pickup' && e.item === 'speed:pass3')
    return [LINES.stampede, { h: name(e.horse) }];
  return null;
}

/** Item jokes (ordinary lines). A Hornet Swarm hits up to 3 horses at once; the gap says it once. */
function itemJoke(e: RaceEvent, name: (h: HorseId) => string, trait: TraitOf): Line | null {
  switch (e.type) {
    case 'hit': {
      const vars = { v: name(e.horse), by: name(e.by) };
      if (trait(e.horse) === 'tough') return [LINES.tough, { h: name(e.horse) }];
      if (e.item === 'attack:behind1') return [LINES.banana, vars];
      if (e.item === 'attack:front1') return [LINES.horseshoe, vars];
      if (e.item === 'attack:behind3' || e.item === 'attack:front3') return [LINES.mess, vars];
      if (e.item === 'attack:top3') return [LINES.hornets, vars];
      return null;
    }
    case 'pickup': {
      const vars = { h: name(e.horse) };
      if (e.hot && e.item)
        return [LINES.hot, { h: name(e.horse), b: BUFF_NAME[e.hot], i: ITEM_INFO[e.item].name }];
      if (e.item === 'dud:stop') return [LINES.snack, vars];
      if (e.item === 'dud:slow') return [LINES.sleepy, vars];
      if (e.item === 'dud:trip') return [LINES.trip, vars];
      if (e.item === 'speed:star') return [LINES.thunderHooves, vars];
      if (e.item === 'speed:self1' || e.item === 'speed:self3') return [LINES.carrot, vars];
      return null;
    }
    case 'reflected':
      return [LINES.reflect, { h: name(e.horse), by: name(e.by) }];
    case 'blocked':
      return [e.reason === 'immune' ? LINES.bubble : LINES.shield, { h: name(e.horse) }];
    case 'slip':
      return [LINES.slip, { h: name(e.horse) }];
    case 'stumble':
      return [LINES.hurdle, { h: name(e.horse) }];
    case 'bump':
      return [LINES.bump, { a: name(e.horse), b: name(e.with) }];
    default:
      return null;
  }
}

/**
 * Race commentary from the Timeline (spec §11, browser voice). `startT` skips everything up to
 * then, so a reloaded big screen doesn't replay old lines. `rand` picks each line from its pool.
 */
export function createCommentator(
  timeline: Timeline,
  name: (horse: HorseId) => string,
  startT = -Infinity,
  opts: {
    finalStretchMetres?: number;
    rand?: Rand;
    odds?: Readonly<Record<HorseId, { win: number | null } | undefined>>;
    prize?: string;
  } = {},
): Commentator {
  const rand = opts.rand ?? Math.random;
  const trait: TraitOf = (h) => timeline.traits?.[h] ?? 'normal';
  const awards = raceAwards(timeline);
  const stretchAt = timeline.distance - (opts.finalStretchMetres ?? COMMENTARY.finalStretchMetres);
  const [winner, second, third] = timeline.finishOrder;
  const wonAt = winner === undefined ? Infinity : timeline.finishTimes[winner]!;
  const from = Math.max(0, startT);
  let last = startT;
  let lastLineAt = -Infinity;
  let leader: HorseId | undefined = standingsAt(timeline, from)[0];
  let saidIntro = startT >= COMMENTARY.introAt;
  let saidStart = startT >= 0;
  let saidStretch =
    leader !== undefined && progressAt(timeline, leader, from) >= stretchAt && startT >= 0;
  let saidNeck = false;
  let saidFinish = wonAt <= startT;
  let crowdAt = -Infinity;

  return {
    linesUpTo(t, cheersOnScreen = 0) {
      const out: string[] = [];
      if (t <= last) return out;
      const say = (pool: readonly string[], vars: Record<string, string | number> = {}) => {
        out.push(line(pool, vars, rand));
        lastLineAt = t;
      };
      const quiet = () => t - lastLineAt >= COMMENTARY.minGap;
      if (!saidIntro && t >= COMMENTARY.introAt) {
        saidIntro = true;
        // An intro after the gun would be odd, so a late first tick skips it.
        if (t < 0) {
          say(LINES.intro, { n: timeline.horses.length });
          if (opts.prize) say(LINES.prize, { p: opts.prize });
        }
      }
      if (!saidStart && t >= 0) {
        saidStart = true;
        say(LINES.off);
        if (timeline.weather === 'rain') {
          say(LINES.rainStart);
          const mudder = timeline.horses.find((h) => trait(h) === 'mudder');
          if (mudder) say(LINES.mudderRain, { h: name(mudder) });
        } else if (timeline.weather === 'fog') say(LINES.fogStart);
      }
      for (const e of timeline.events) {
        if (e.t > last && e.t <= t) {
          const pick = bigMoment(e, name, trait) ?? (quiet() ? itemJoke(e, name, trait) : null);
          if (pick) say(...pick);
        }
      }
      const standings = standingsAt(timeline, t);
      const now = standings[0];
      if (now !== leader) {
        if (now !== undefined && t >= COMMENTARY.leadAfter && quiet()) {
          const win = opts.odds?.[now]?.win ?? 0;
          if (win >= COMMENTARY.outsiderOdds) {
            say(LINES.outsider, { h: name(now), o: Math.round(win) });
          } else say(LINES.lead, { h: name(now) });
        }
        leader = now;
      }
      const [a, b] = standings;
      if (
        !saidNeck &&
        t >= wonAt * COMMENTARY.neckFrom &&
        t < wonAt &&
        a !== undefined &&
        b !== undefined &&
        quiet() &&
        Math.abs(progressAt(timeline, a, t) - progressAt(timeline, b, t)) <= COMMENTARY.neckMetres
      ) {
        saidNeck = true;
        say(LINES.neck, { a: name(a), b: name(b) });
      }
      if (
        cheersOnScreen >= COMMENTARY.crowdCheers &&
        t - crowdAt >= COMMENTARY.crowdGap &&
        quiet()
      ) {
        crowdAt = t;
        say(LINES.crowd);
      }
      if (
        !saidStretch &&
        t >= 0 &&
        leader !== undefined &&
        progressAt(timeline, leader, t) >= stretchAt
      ) {
        saidStretch = true;
        if (wonAt > t) say(LINES.stretch);
      }
      if (!saidFinish && wonAt <= t) {
        saidFinish = true;
        const prefix =
          (awards.photo_finish.length > 0 ? line(LINES.photo, {}, rand) : '') +
          (awards.comeback.length > 0 ? line(LINES.comeback, {}, rand) : '');
        const podium =
          second !== undefined && third !== undefined
            ? line(LINES.podiumRest, { b: name(second), c: name(third) }, rand)
            : '';
        out.push(prefix + line(LINES.win, { w: name(winner!) }, rand) + podium);
        lastLineAt = t;
      }
      last = t;
      return out;
    },
  };
}

/** One line of banter for the podium screen; `winners` sorted by payout, highest first. */
export function podiumLine(
  winners: readonly { name: string; payout: number }[],
  betCount: number,
  rand: Rand = Math.random,
): string {
  if (betCount === 0) return line(LINES.noBets, {}, rand);
  const top = winners[0];
  return top
    ? line(LINES.bigWin, { h: top.name, n: top.payout }, rand)
    : line(LINES.noWinners, {}, rand);
}
