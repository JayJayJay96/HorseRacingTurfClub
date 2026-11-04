import type { AttackTarget, Band, BoxType, ItemCode, MysteryType, RaceLength } from './types.ts';

/** Simulation steps per second. Timelines store one progress sample per step. */
export const TICK_HZ = 10;
/** Base gallop speed in metres per second; identical for every horse. */
export const BASE_SPEED = 15;
export const DISTANCE: Readonly<Record<RaceLength, number>> = { short: 1800, long: 2700 };
export const NOMINAL_SECONDS: Readonly<Record<RaceLength, number>> = { short: 120, long: 180 };
/** A race still running after this many times its nominal length is an engine bug. */
export const MAX_RACE_FACTOR = 3;

export const MIN_HORSES = 2;
export const MAX_HORSES = 22;
/** Mystery boxes per lane, about 4 a minute (owner 2026-11-04: 8 for 2 min, 12 for 3 min). */
export const MYSTERY_PER_LANE: Readonly<Record<RaceLength, number>> = { short: 8, long: 12 };
export const MAX_BOUGHT = 3;
/** Boxes sit between these fractions of the race distance (owner 2026-11-04: 5-95%, fully random). */
export const BOX_ZONE = { start: 0.05, end: 0.95 } as const;
/** Minimum spacing between two boxes in one lane, as a share of the distance. */
export const BOX_MIN_GAP = 0.03;
export const PRICES: Readonly<Record<BoxType, number>> = { speed: 60, defense: 35, attack: 20 };

/** Smooth per-horse pace wobble: random knots every `knotSeconds`, linearly interpolated. */
export const NOISE = { amplitude: 0.06, knotSeconds: 5 } as const;
/** One finishing burst per horse, starting somewhere in [fromFraction, toFraction] of the distance. */
export const KICK = {
  boost: 0.1,
  minSeconds: 2,
  maxSeconds: 5,
  fromFraction: 0.8,
  toFraction: 0.95,
} as const;

export interface Effect {
  readonly mult: number;
  readonly seconds: number;
}

/** Speed multiplier and duration per item. Shield and Mirror only set held state (mult 1). */
export const EFFECTS: Readonly<Record<ItemCode, Effect>> = {
  'speed:self1': { mult: 1.2, seconds: 2 },
  'speed:self3': { mult: 1.2, seconds: 1.5 },
  'speed:star': { mult: 1.2, seconds: 3.5 },
  'speed:pass3': { mult: 1.8, seconds: 8 },
  'attack:behind1': { mult: 0.5, seconds: 1.5 },
  'attack:behind3': { mult: 0.75, seconds: 2 },
  'attack:front1': { mult: 0.5, seconds: 2 },
  'attack:front3': { mult: 0.75, seconds: 2 },
  'attack:leader': { mult: 0, seconds: 2 },
  'attack:top3': { mult: 0.4, seconds: 3.5 },
  'attack:all': { mult: 0.7, seconds: 1.5 },
  'defense:block1': { mult: 1, seconds: 0 },
  'defense:immune': { mult: 1, seconds: 6 },
  'defense:reflect': { mult: 1, seconds: 0 },
  'dud:stop': { mult: 0, seconds: 1.5 },
  'dud:slow': { mult: 0.7, seconds: 2.5 },
  'dud:trip': { mult: 0.5, seconds: 1 },
};

/** Golden Carrot: three bursts, each starting this many seconds after the previous one. */
export const SELF3_GAP_SECONDS = 3;
/** Stampede aims this many places ahead, finishing this many metres past that horse. */
export const PASS3_PLACES = 3;
export const PASS3_MARGIN = 5;

/** Items a Speed / Defense box or a Dud can contain (mystery-only extras excluded). */
export const SPEED_ITEMS = [
  'speed:self1',
  'speed:self3',
  'speed:star',
] as const satisfies readonly ItemCode[];
export const DEFENSE_ITEMS = [
  'defense:block1',
  'defense:immune',
  'defense:reflect',
] as const satisfies readonly ItemCode[];
export const DUD_ITEMS = [
  'dud:stop',
  'dud:slow',
  'dud:trip',
] as const satisfies readonly ItemCode[];

/** Mystery box type by position band (percent). */
export const MYSTERY_TYPE_WEIGHTS: Readonly<Record<Band, Readonly<Record<MysteryType, number>>>> = {
  front: { speed: 15, attack: 30, defense: 25, dud: 30 },
  middle: { speed: 25, attack: 40, defense: 20, dud: 15 },
  back: { speed: 40, attack: 40, defense: 10, dud: 10 },
};

/** Attack target by position band (percent), for every Attack box, bought or mystery. */
export const ATTACK_WEIGHTS: Readonly<Record<Band, Readonly<Record<AttackTarget, number>>>> = {
  front: { behind1: 45, behind3: 30, front1: 15, front3: 10, leader: 0, top3: 0 },
  middle: { behind1: 10, behind3: 10, front1: 15, front3: 15, leader: 10, top3: 40 },
  back: { behind1: 5, behind3: 5, front1: 10, front3: 10, leader: 25, top3: 45 },
};

/** Mystery Speed roll in the back half of the field becomes a Stampede this often. */
export const PASS3_CHANCE_PERCENT = 25;
/** Mystery Attack roll by the last-placed horse becomes a Thunderclap this often. */
export const THUNDERCLAP_CHANCE_PERCENT = 5;
