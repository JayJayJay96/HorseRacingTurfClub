import type { TrackId } from './track.ts';

export type HorseId = string;
export type RaceLength = 'short' | 'long';
export type BoxType = 'speed' | 'attack' | 'defense';
/** What a lane box was before it was opened. */
export type BoxKind = BoxType | 'mystery';
/** A mystery box first rolls one of these types, then an item inside it. */
export type MysteryType = BoxType | 'dud';
export type Band = 'front' | 'middle' | 'back';
export type AttackTarget = 'behind1' | 'behind3' | 'front1' | 'front3' | 'leader' | 'top3';

export type Weather = 'clear' | 'rain' | 'fog';
/** Hot-item buffs (spec 2026-11-05 C): 2x as likely from its box, or 50 % longer. */
export type HotBuff = 'lucky' | 'extended';
/** Horse traits (spec 2026-11-05 D), picked per race on the phone. */
export type Trait =
  | 'normal'
  | 'charmed'
  | 'tough'
  | 'sprinter'
  | 'stayer'
  | 'mudder'
  | 'closer'
  | 'frontrunner'
  | 'gambler'
  | 'brawler';

export type ItemCode =
  | 'speed:self1'
  | 'speed:self3'
  | 'speed:star'
  | 'speed:pass3'
  | `attack:${AttackTarget}`
  | 'attack:all'
  | 'defense:block1'
  | 'defense:immune'
  | 'defense:reflect'
  | 'dud:stop'
  | 'dud:slow'
  | 'dud:trip';

export interface HotItem {
  readonly item: ItemCode;
  readonly buff: HotBuff;
}

export interface RaceInput {
  /** Real races pass a crypto-random 32-bit integer. */
  readonly seed: number;
  /** Lane order = array order. */
  readonly horses: readonly HorseId[];
  /** Bought boxes per horse (max 3 each); horses without purchases may be omitted. */
  readonly bought: Readonly<Record<HorseId, readonly BoxType[]>>;
  readonly length: RaceLength;
  /** Spec 2026-11-05 weather; missing = clear (no extra RNG draws). */
  readonly weather?: Weather;
  /** Spec C: up to 3 buffed items; missing or empty = none (no extra RNG draws). */
  readonly hot?: readonly HotItem[];
  /** Spec D: per-horse trait; a horse missing from the map (or no map) runs Normal. */
  readonly traits?: Readonly<Record<HorseId, Trait>>;
  /** Spec 2026-11-06 C: the track's terrain; missing = Oval (flat, no extra RNG draws). */
  readonly track?: TrackId;
}

export interface BoxSpot {
  /** Metres from the start along the race distance. */
  readonly at: number;
  readonly kind: BoxKind;
}

/** A rain puddle across adjacent lanes. */
export interface Puddle {
  /** Metres from the start to the puddle's near edge. */
  readonly at: number;
  /** First and last lane covered, inclusive. */
  readonly lanes: readonly [number, number];
}

/** `t` is seconds since the start. Events are listed in simulation order. */
export type RaceEvent =
  /**
   * `item` is null when an attack had nobody to hit and fizzled. `hot` is set only when the
   * picked item is one of the race's hot items.
   */
  | {
      t: number;
      type: 'pickup';
      horse: HorseId;
      kind: BoxKind;
      item: ItemCode | null;
      hot?: HotBuff;
    }
  | { t: number; type: 'hit'; horse: HorseId; by: HorseId; item: ItemCode }
  | {
      t: number;
      type: 'blocked';
      horse: HorseId;
      by: HorseId;
      item: ItemCode;
      reason: 'immune' | 'shield';
    }
  /** `horse` held the Mirror Saddle and sent the attack back to `by`. */
  | { t: number; type: 'reflected'; horse: HorseId; by: HorseId; item: ItemCode }
  /** Rain: the horse slipped in a puddle. */
  | { t: number; type: 'slip'; horse: HorseId }
  /** Steeplechase: the horse clipped a hurdle. */
  | { t: number; type: 'stumble'; horse: HorseId }
  /** Fog: `horse` (lower lane) and `with` (the next lane out) bumped. */
  | { t: number; type: 'bump'; horse: HorseId; with: HorseId }
  | { t: number; type: 'finish'; horse: HorseId; place: number };

export interface Timeline {
  readonly seed: number;
  readonly length: RaceLength;
  /** Metres. */
  readonly distance: number;
  readonly tickHz: number;
  readonly horses: readonly HorseId[];
  readonly boxes: Readonly<Record<HorseId, readonly BoxSpot[]>>;
  /** Missing on timelines stored before weather existed: read as 'clear' / []. */
  readonly weather?: Weather;
  readonly puddles?: readonly Puddle[];
  /** Missing on timelines stored before hot items / traits existed: read as [] / all Normal. */
  readonly hot?: readonly HotItem[];
  readonly traits?: Readonly<Record<HorseId, Trait>>;
  /** Missing on timelines stored before terrain tracks: the race ran flat. */
  readonly track?: TrackId;
  /** Metres from the start, one sample per tick; index 0 is the start. Finished horses stay at `distance`. */
  readonly progress: Readonly<Record<HorseId, readonly number[]>>;
  readonly events: readonly RaceEvent[];
  readonly finishOrder: readonly HorseId[];
  /** Seconds, interpolated within the tick (millisecond precision). */
  readonly finishTimes: Readonly<Record<HorseId, number>>;
}
