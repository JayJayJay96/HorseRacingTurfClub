import { placeBoxes } from './boxes.ts';
import { bandOf, rollBox } from './items.ts';
import {
  BASE_SPEED,
  DISTANCE,
  EFFECTS,
  HOT,
  KICK,
  MAX_BOUGHT,
  MAX_HORSES,
  MAX_RACE_FACTOR,
  MIN_HORSES,
  MYSTERY_PER_LANE,
  NOISE,
  NOMINAL_SECONDS,
  PASS3_MARGIN,
  PASS3_PLACES,
  SELF3_GAP_SECONDS,
  TICK_HZ,
  TERRAIN,
  TRAIT_CODES,
  TRAITS,
  WEATHER,
} from './config.ts';
import { raceTerrain } from './terrain.ts';
import { TRACKS, TRACK_IDS } from './track.ts';
import { resolveHit, type HeldDefense } from './effects.ts';
import { buffOf, canBeExtended, effectSeconds, HOT_ELIGIBLE } from './hot.ts';
import { round2, round3 } from './math.ts';
import { createSeededRng, type Rng } from './rng.ts';
import type {
  AttackTarget,
  Band,
  HorseId,
  ItemCode,
  RaceEvent,
  RaceInput,
  Timeline,
  Trait,
  Weather,
} from './types.ts';
import { earlyPaceOf, kickBoostOf, kickExtraSecondsOf, toughen } from './traits.ts';
import { placePuddles, puddlesByLane } from './weather.ts';

interface Mod {
  readonly mult: number;
  readonly from: number;
  /** Exclusive. */
  readonly until: number;
}

interface Horse {
  readonly id: HorseId;
  readonly index: number;
  readonly trait: Trait;
  readonly kickBoost: number;
  /** Pace factor while progress < distance / 3 (Sprinter, Stayer). */
  readonly earlyPace: number;
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
    top3: running.slice(0, 3).filter((_, k) => k !== i),
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
  const weathers: readonly Weather[] = ['clear', 'rain', 'fog'];
  if (input.weather !== undefined && !weathers.includes(input.weather))
    throw new RangeError(`unknown weather ${String(input.weather)}`);
  const hot = input.hot ?? [];
  if (hot.length > HOT.count) throw new RangeError(`at most ${HOT.count} hot items`);
  if (new Set(hot.map((x) => x.item)).size !== hot.length)
    throw new RangeError('hot items must be different items');
  for (const { item, buff } of hot) {
    if (!HOT_ELIGIBLE.includes(item)) throw new RangeError(`${String(item)} can't be a hot item`);
    if (buff !== 'lucky' && buff !== 'extended')
      throw new RangeError(`unknown hot buff ${String(buff)}`);
    if (buff === 'extended' && !canBeExtended(item))
      throw new RangeError(`${item} has no duration to extend`);
  }
  if (input.track !== undefined && !TRACK_IDS.includes(input.track))
    throw new RangeError(`unknown track ${String(input.track)}`);
  for (const [id, trait] of Object.entries(input.traits ?? {})) {
    if (!input.horses.includes(id)) throw new RangeError(`trait for unknown horse ${id}`);
    if (!TRAIT_CODES.includes(trait)) throw new RangeError(`unknown trait ${String(trait)}`);
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
  // Hot items (spec C) only change weights and durations: they never add RNG draws.
  const hot = input.hot ?? [];
  const lucky: ReadonlySet<ItemCode> = new Set(
    hot.flatMap((x) => (x.buff === 'lucky' ? [x.item] : [])),
  );
  const secondsOf = (item: ItemCode): number => effectSeconds(item, hot);
  const maxTicks = toTicks(NOMINAL_SECONDS[input.length] * MAX_RACE_FACTOR);
  const knotTicks = toTicks(NOISE.knotSeconds);
  const boxes = placeBoxes(
    rng,
    input.horses,
    input.bought,
    distance,
    MYSTERY_PER_LANE[input.length],
  );
  const horses: Horse[] = input.horses.map((id, index) => {
    const trait: Trait = input.traits?.[id] ?? 'normal';
    return {
      id,
      index,
      trait,
      // Draw order (knots, kickAt, kickTicks) is unchanged: traits add no draws here.
      knots: Array.from(
        { length: Math.ceil(maxTicks / knotTicks) + 2 },
        () => fraction(rng) * 2 - 1,
      ),
      kickAt:
        distance * (KICK.fromFraction + fraction(rng) * (KICK.toFraction - KICK.fromFraction)),
      kickTicks:
        toTicks(KICK.minSeconds) +
        rng.nextInt(toTicks(KICK.maxSeconds) - toTicks(KICK.minSeconds) + 1) +
        toTicks(kickExtraSecondsOf(trait)),
      kickBoost: kickBoostOf(trait),
      earlyPace: earlyPaceOf(trait),
      progress: 0,
      kickStart: null,
      mods: [],
      immuneUntil: 0,
      held: null,
      stampede: null,
      nextBox: 0,
      finishTime: null,
      finishExact: 0,
    };
  });
  const weather: Weather = input.weather ?? 'clear';
  const terrain = raceTerrain(TRACKS[input.track ?? 'oval'], distance);
  const nextHurdle = horses.map(() => 0);
  // Weather draws only happen off-clear, so clear races and old replays are unchanged.
  const puddles =
    weather === 'rain'
      ? placePuddles(
          rng,
          horses.length,
          input.horses.map((id) => boxes[id]!),
          distance,
          WEATHER.puddlesPerLane[input.length],
        )
      : [];
  const lanePuddles = puddlesByLane(puddles, horses.length);
  const nextPuddle = horses.map(() => 0);
  /** Per neighbour pair (lane i and i + 1): the tick of its last bump. */
  const lastBump = horses.map(() => -Infinity);
  const bumpOdds = Math.round((WEATHER.bumpPerSecond / TICK_HZ) * 1_000_000);
  /** Tough (spec D): every slowdown and boost on this horse is weaker; Normal untouched. */
  const tough = (h: Horse, mult: number): number => (h.trait === 'tough' ? toughen(mult) : mult);
  /** Closer / Front-runner (spec 2026-11-06 B): each horse's third of the field at the last tick. */
  const banded = horses.some((h) => h.trait === 'closer' || h.trait === 'frontrunner');
  const bands: Band[] = horses.map(() => 'middle');
  const bandPace = (h: Horse): number => {
    if (h.trait !== 'closer' && h.trait !== 'frontrunner') return 1;
    const t = TRAITS[h.trait];
    const band = bands[h.index];
    return band === 'front' ? t.frontPace : band === 'back' ? t.backPace : 1;
  };
  const mudPace = weather === 'clear' ? TRAITS.mudder.clearPace : TRAITS.mudder.weatherPace;
  const weatherMod = (h: Horse, e: { mult: number; seconds: number }, tick: number) =>
    h.mods.push({ mult: tough(h, e.mult), from: tick + 1, until: tick + 1 + toTicks(e.seconds) });
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
    const kick = h.kickStart !== null && tick < h.kickStart + h.kickTicks ? 1 + h.kickBoost : 1;
    // A Stampede is not immune: hits landed during the sprint still slow it.
    let mult = h.stampede ? tough(h, EFFECTS['speed:pass3'].mult) : 1;
    for (const m of h.mods) if (m.from <= tick && tick < m.until) mult *= m.mult;
    // Traits: Sprinter/Stayer over the first third, Mudder by weather, Closer/Front-runner by
    // position. Normal multiplies by 1.
    const early = h.progress < distance / 3 ? h.earlyPace : 1;
    const mud = h.trait === 'mudder' ? mudPace : 1;
    const ground = terrain.pace ? terrain.pace[Math.min(distance, Math.floor(h.progress))]! : 1;
    return BASE_SPEED * noise * kick * mult * early * mud * bandPace(h) * ground;
  };

  /** Brawler: its landed attacks last longer, its own speed items shorter. */
  const brawl = (h: Horse, kind: 'attack' | 'speed'): number =>
    h.trait !== 'brawler'
      ? 1
      : kind === 'attack'
        ? TRAITS.brawler.attackFactor
        : TRAITS.brawler.speedFactor;
  const addMod = (h: Horse, item: ItemCode, from: number, factor = 1): void => {
    const e = EFFECTS[item];
    h.mods.push({ mult: tough(h, e.mult), from, until: from + toTicks(secondsOf(item) * factor) });
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
      { immuneUntil: target.immuneUntil, held: target.held },
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
        addMod(target, item, tick + 1, brawl(by, 'attack'));
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
      case 'speed:star':
        addMod(h, item, tick + 1, brawl(h, 'speed'));
        return;
      case 'dud:stop':
      case 'dud:slow':
      case 'dud:trip':
        addMod(h, item, tick + 1);
        return;
      case 'speed:self3':
        for (let k = 0; k < 3; k++)
          addMod(h, item, tick + 1 + k * toTicks(SELF3_GAP_SECONDS), brawl(h, 'speed'));
        return;
      case 'speed:pass3': {
        const ahead = running[Math.max(0, running.indexOf(h) - PASS3_PLACES)]!;
        h.stampede = {
          target: Math.min(distance, ahead.progress + PASS3_MARGIN),
          until: tick + toTicks(secondsOf(item) * brawl(h, 'speed')),
        };
        return;
      }
      case 'defense:block1':
      case 'defense:reflect':
        h.held = item;
        return;
      case 'defense:immune':
        h.immuneUntil = Math.max(h.immuneUntil, tick + 1 + toTicks(secondsOf(item)));
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

    if (banded) {
      // Rank over every horse, finished ones included, like box rolls do.
      const order = [...horses].sort(byPosition);
      order.forEach((h, rank) => (bands[h.index] = bandOf(rank, horses.length)));
    }
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

    // Hurdles: one stumble draw per horse per hurdle, in lane order. Only hurdle tracks draw.
    for (const h of horses) {
      while (
        h.finishTime === null &&
        nextHurdle[h.index]! < terrain.hurdles.length &&
        terrain.hurdles[nextHurdle[h.index]!]! <= h.progress
      ) {
        nextHurdle[h.index]!++;
        const chance =
          h.trait === 'tough' ? TERRAIN.toughStumblePercent : TERRAIN.hurdleStumblePercent;
        if (rng.nextInt(100) < chance) {
          weatherMod(h, TERRAIN.stumble, tick);
          events.push({ t: round2(tick / TICK_HZ), type: 'stumble', horse: h.id });
        }
      }
    }

    if (weather === 'rain') {
      for (const h of horses) {
        const lane = lanePuddles[h.index]!;
        while (
          h.finishTime === null &&
          nextPuddle[h.index]! < lane.length &&
          lane[nextPuddle[h.index]!]!.at <= h.progress
        ) {
          nextPuddle[h.index]!++;
          const slipChance =
            h.trait === 'mudder' ? TRAITS.mudder.slipChancePercent : WEATHER.slipChancePercent;
          if (rng.nextInt(100) < slipChance) {
            weatherMod(h, WEATHER.slip, tick);
            events.push({ t: round2(tick / TICK_HZ), type: 'slip', horse: h.id });
          }
        }
      }
    } else if (weather === 'fog') {
      for (let i = 0; i + 1 < horses.length; i++) {
        const a = horses[i]!;
        const b = horses[i + 1]!;
        if (a.finishTime !== null || b.finishTime !== null) continue;
        if (Math.abs(a.progress - b.progress) > WEATHER.bumpRangeM) continue;
        if (tick - lastBump[i]! < toTicks(WEATHER.bumpCooldownS)) continue;
        // Each Mudder in the pair scales the chance; still exactly one draw.
        const mud = (x: Horse) => (x.trait === 'mudder' ? TRAITS.mudder.bumpFactor : 1);
        if (rng.nextInt(1_000_000) >= bumpOdds * mud(a) * mud(b)) continue;
        lastBump[i] = tick;
        weatherMod(a, WEATHER.bump, tick);
        weatherMod(b, WEATHER.bump, tick);
        events.push({ t: round2(tick / TICK_HZ), type: 'bump', horse: a.id, with: b.id });
      }
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
          lucky,
          charmed: h.trait === 'charmed',
          gambler: h.trait === 'gambler',
          canTarget: {
            behind1: targets.behind1.length > 0,
            behind3: targets.behind3.length > 0,
            front1: targets.front1.length > 0,
            front3: targets.front3.length > 0,
            leader: targets.leader.length > 0,
            top3: targets.top3.length > 0,
          },
        });
        const buff = buffOf(hot, item);
        events.push({
          t: round2(tick / TICK_HZ),
          type: 'pickup',
          horse: h.id,
          kind: spot.kind,
          item,
          ...(buff ? { hot: buff } : {}),
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
    weather,
    puddles,
    hot: [...hot],
    traits: Object.fromEntries(horses.map((h) => [h.id, h.trait])),
    ...(input.track ? { track: input.track } : {}),
    progress,
    events,
    finishOrder,
    finishTimes,
  };
}
