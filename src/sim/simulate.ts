import { placeBoxes } from './boxes.ts';
import {
  BASE_SPEED,
  DISTANCE,
  EFFECTS,
  KICK,
  MAX_BOUGHT,
  MAX_HORSES,
  MAX_RACE_FACTOR,
  MIN_HORSES,
  NOISE,
  NOMINAL_SECONDS,
  PASS3_MARGIN,
  PASS3_PLACES,
  SELF3_GAP_SECONDS,
  TICK_HZ,
} from './config.ts';
import { resolveHit, type HeldDefense } from './effects.ts';
import { rollBox } from './items.ts';
import { round2, round3 } from './math.ts';
import { createSeededRng, type Rng } from './rng.ts';
import type { AttackTarget, HorseId, ItemCode, RaceEvent, RaceInput, Timeline } from './types.ts';

interface Mod {
  readonly mult: number;
  readonly from: number;
  /** Exclusive. */
  readonly until: number;
}

interface Horse {
  readonly id: HorseId;
  readonly index: number;
  readonly knots: readonly number[];
  readonly kickAt: number;
  readonly kickTicks: number;
  progress: number;
  kickStart: number | null;
  mods: Mod[];
  immuneUntil: number;
  held: HeldDefense | null;
  stampede: { readonly target: number; readonly until: number } | null;
  nextBox: number;
  finishTime: number | null;
  /** Unrounded finish time, used only to order same-tick finishers. */
  finishExact: number;
}

const toTicks = (seconds: number): number => Math.round(seconds * TICK_HZ);
/** Uniform in [0, 1] at 1/1000 resolution. */
const fraction = (rng: Rng): number => rng.nextInt(1001) / 1000;
const byPosition = (a: Horse, b: Horse): number => b.progress - a.progress || a.index - b.index;

function targetsOf(running: readonly Horse[], i: number): Record<AttackTarget, readonly Horse[]> {
  return {
    behind1: running.slice(i + 1, i + 2),
    behind3: running.slice(i + 1, i + 4),
    front1: running.slice(Math.max(0, i - 1), i),
    front3: running.slice(Math.max(0, i - 3), i),
    leader: i > 0 ? running.slice(0, 1) : [],
  };
}

export function validateRaceInput(input: RaceInput): void {
  const n = input.horses.length;
  if (!Number.isInteger(input.seed))
    throw new RangeError(`seed must be an integer, got ${input.seed}`);
  if (n < MIN_HORSES || n > MAX_HORSES) {
    throw new RangeError(`a race needs ${MIN_HORSES}-${MAX_HORSES} horses, got ${n}`);
  }
  if (new Set(input.horses).size !== n) throw new RangeError('horse ids must be unique');
  for (const [id, boxes] of Object.entries(input.bought)) {
    if (!input.horses.includes(id)) throw new RangeError(`bought boxes for unknown horse ${id}`);
    if (boxes.length > MAX_BOUGHT)
      throw new RangeError(`horse ${id} has more than ${MAX_BOUGHT} bought boxes`);
  }
}

/**
 * Runs one whole race. Deterministic: the same input always gives the same Timeline.
 * Real races pass a crypto-random seed, so the outcome is fixed before anything is animated.
 */
export function simulateRace(input: RaceInput): Timeline {
  validateRaceInput(input);
  const rng = createSeededRng(input.seed);
  const distance = DISTANCE[input.length];
  const maxTicks = toTicks(NOMINAL_SECONDS[input.length] * MAX_RACE_FACTOR);
  const knotTicks = toTicks(NOISE.knotSeconds);
  const boxes = placeBoxes(rng, input.horses, input.bought, distance);
  const horses: Horse[] = input.horses.map((id, index) => ({
    id,
    index,
    knots: Array.from({ length: Math.ceil(maxTicks / knotTicks) + 2 }, () => fraction(rng) * 2 - 1),
    kickAt: distance * (KICK.fromFraction + fraction(rng) * (KICK.toFraction - KICK.fromFraction)),
    kickTicks:
      toTicks(KICK.minSeconds) +
      rng.nextInt(toTicks(KICK.maxSeconds) - toTicks(KICK.minSeconds) + 1),
    progress: 0,
    kickStart: null,
    mods: [],
    immuneUntil: 0,
    held: null,
    stampede: null,
    nextBox: 0,
    finishTime: null,
    finishExact: 0,
  }));
  const progress: Record<HorseId, number[]> = Object.fromEntries(
    input.horses.map((id) => [id, [0]]),
  );
  const events: RaceEvent[] = [];
  const finishOrder: HorseId[] = [];
  const finishTimes: Record<HorseId, number> = {};

  const pace = (h: Horse, tick: number): number => {
    const i = Math.floor(tick / knotTicks);
    const f = (tick % knotTicks) / knotTicks;
    const a = h.knots[i]!;
    const b = h.knots[i + 1]!;
    const noise = 1 + (a + (b - a) * f) * NOISE.amplitude;
    const kick = h.kickStart !== null && tick < h.kickStart + h.kickTicks ? 1 + KICK.boost : 1;
    if (h.stampede) return BASE_SPEED * noise * kick * EFFECTS['speed:pass3'].mult;
    let mult = 1;
    for (const m of h.mods) if (m.from <= tick && tick < m.until) mult *= m.mult;
    return BASE_SPEED * noise * kick * mult;
  };

  const addMod = (h: Horse, item: ItemCode, from: number): void => {
    const e = EFFECTS[item];
    h.mods.push({ mult: e.mult, from, until: from + toTicks(e.seconds) });
  };

  const hit = (
    target: Horse,
    by: Horse,
    item: ItemCode,
    tick: number,
    allowReflect: boolean,
  ): void => {
    const t = round2(tick / TICK_HZ);
    const outcome = resolveHit(
      { immuneUntil: target.immuneUntil, held: target.held, stampeding: target.stampede !== null },
      tick,
      allowReflect,
    );
    switch (outcome) {
      case 'immune':
        events.push({ t, type: 'blocked', horse: target.id, by: by.id, item, reason: 'immune' });
        return;
      case 'shield':
        target.held = null;
        events.push({ t, type: 'blocked', horse: target.id, by: by.id, item, reason: 'shield' });
        return;
      case 'reflect':
        target.held = null;
        events.push({ t, type: 'reflected', horse: target.id, by: by.id, item });
        hit(by, target, item, tick, false);
        return;
      case 'hit':
        addMod(target, item, tick + 1);
        events.push({ t, type: 'hit', horse: target.id, by: by.id, item });
    }
  };

  const use = (
    h: Horse,
    item: ItemCode,
    tick: number,
    running: readonly Horse[],
    targets: Record<AttackTarget, readonly Horse[]>,
  ): void => {
    switch (item) {
      case 'speed:self1':
      case 'dud:stop':
      case 'dud:slow':
      case 'dud:trip':
        addMod(h, item, tick + 1);
        return;
      case 'speed:star':
        addMod(h, item, tick + 1);
        h.immuneUntil = Math.max(h.immuneUntil, tick + 1 + toTicks(EFFECTS[item].seconds));
        return;
      case 'speed:self3':
        for (let k = 0; k < 3; k++) addMod(h, item, tick + 1 + k * toTicks(SELF3_GAP_SECONDS));
        return;
      case 'speed:pass3': {
        const ahead = running[Math.max(0, running.indexOf(h) - PASS3_PLACES)]!;
        h.stampede = {
          target: Math.min(distance, ahead.progress + PASS3_MARGIN),
          until: tick + toTicks(EFFECTS[item].seconds),
        };
        return;
      }
      case 'defense:block1':
      case 'defense:reflect':
        h.held = item;
        return;
      case 'defense:immune':
        h.immuneUntil = Math.max(h.immuneUntil, tick + 1 + toTicks(EFFECTS[item].seconds));
        return;
      case 'attack:all':
        for (const other of running) if (other !== h) hit(other, h, item, tick, true);
        return;
      default:
        for (const victim of targets[item.slice('attack:'.length) as AttackTarget]) {
          hit(victim, h, item, tick, true);
        }
    }
  };

  for (let tick = 1; finishOrder.length < horses.length; tick++) {
    if (tick > maxTicks)
      throw new Error(`race did not finish within ${maxTicks} ticks (seed ${input.seed})`);

    const finishedNow: Horse[] = [];
    for (const h of horses) {
      if (h.finishTime !== null) continue;
      const before = h.progress;
      if (h.kickStart === null && before >= h.kickAt) h.kickStart = tick;
      h.progress = before + pace(h, tick) / TICK_HZ;
      if (h.stampede && (h.progress >= h.stampede.target || tick >= h.stampede.until))
        h.stampede = null;
      if (h.mods.length > 0) h.mods = h.mods.filter((m) => m.until > tick + 1);
      if (h.progress >= distance) {
        h.finishExact = (tick - 1 + (distance - before) / (h.progress - before)) / TICK_HZ;
        h.finishTime = round3(h.finishExact);
        h.progress = distance;
        finishedNow.push(h);
      }
    }
    finishedNow.sort((a, b) => a.finishExact - b.finishExact || a.index - b.index);
    for (const h of finishedNow) {
      finishOrder.push(h.id);
      finishTimes[h.id] = h.finishTime!;
      events.push({ t: h.finishTime!, type: 'finish', horse: h.id, place: finishOrder.length });
    }

    // Boxes open after everyone has moved this tick, front-runner first so no lane is favoured;
    // the ranking is only computed when some horse crossed a box.
    const crossed = (h: Horse): boolean =>
      h.finishTime === null &&
      h.nextBox < boxes[h.id]!.length &&
      boxes[h.id]![h.nextBox]!.at <= h.progress;
    const ranked = horses.some(crossed) ? [...horses].sort(byPosition) : [];
    for (const h of ranked) {
      const lane = boxes[h.id]!;
      while (
        h.finishTime === null &&
        h.nextBox < lane.length &&
        lane[h.nextBox]!.at <= h.progress
      ) {
        const spot = lane[h.nextBox++]!;
        const running = ranked.filter((r) => r.finishTime === null);
        const targets = targetsOf(running, running.indexOf(h));
        const item = rollBox(rng, spot.kind, {
          rank: ranked.indexOf(h),
          count: horses.length,
          canTarget: {
            behind1: targets.behind1.length > 0,
            behind3: targets.behind3.length > 0,
            front1: targets.front1.length > 0,
            front3: targets.front3.length > 0,
            leader: targets.leader.length > 0,
          },
        });
        events.push({
          t: round2(tick / TICK_HZ),
          type: 'pickup',
          horse: h.id,
          kind: spot.kind,
          item,
        });
        if (item) use(h, item, tick, running, targets);
      }
    }

    for (const h of horses) progress[h.id]!.push(round2(h.progress));
  }

  return {
    seed: input.seed,
    length: input.length,
    distance,
    tickHz: TICK_HZ,
    horses: [...input.horses],
    boxes,
    progress,
    events,
    finishOrder,
    finishTimes,
  };
}
