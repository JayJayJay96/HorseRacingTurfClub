import type { BoxKind } from '../sim/types.ts';

export const COAT_COLORS = ['#8b4a2b', '#b5651d', '#2b2b2b', '#9e9e9e', '#d8b26e', '#efe8dc'];
const MANES = ['#2b1a10', '#6e3510', '#111111', '#e0e0e0', '#f3e2b0', '#b9b0a0'];
export const SILK_COLORS = [
  '#e53935',
  '#1e88e5',
  '#fdd835',
  '#43a047',
  '#8e24aa',
  '#fb8c00',
  '#00acc1',
  '#d81b60',
  '#ffffff',
  '#3949ab',
  '#7cb342',
];

export interface HorseColors {
  readonly coat: string;
  readonly mane: string;
  readonly silk: string;
  /** Bought looks, as `player_cosmetics` codes (`pattern:hoops`, `trail:dust`, ...). */
  readonly pattern?: string | null;
  readonly trail?: string | null;
}

type Choice = {
  coat: number | null;
  silk: number | null;
  pattern?: string | null;
  trail?: string | null;
};

/** 6 coats × 11 silks (coprime), so the first 66 lanes all differ. */
export function colorsOf(lane: number): HorseColors {
  const c = lane % COAT_COLORS.length;
  return { coat: COAT_COLORS[c]!, mane: MANES[c]!, silk: SILK_COLORS[lane % SILK_COLORS.length]! };
}

/** A member's chosen coat/silk (null = lane default) and worn pattern/trail. */
export function colorsFor(lane: number, choice?: Choice): HorseColors {
  const base = colorsOf(lane);
  if (!choice) return base;
  return {
    coat: choice.coat === null ? base.coat : COAT_COLORS[choice.coat]!,
    mane: choice.coat === null ? base.mane : MANES[choice.coat]!,
    silk: choice.silk === null ? base.silk : SILK_COLORS[choice.silk]!,
    pattern: choice.pattern,
    trail: choice.trail,
  };
}

/** Colour lookup for the renderer: horse id + lane -> colours, from the room's players. */
export function colorsByPlayer(players: readonly ({ id: string } & Choice)[]) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (horse: string, lane: number) => colorsFor(lane, byId.get(horse));
}

/**
 * A horse's colours anywhere outside the race renderer, matching the colours it will race in.
 * Lane = its place in `horses` (the race order); before odds lock `horses` is empty and
 * lock_odds_begin will fill it with the ticked players ordered by (joined_at, id), so a ticked
 * horse takes its index in that order. Non-ticked horses don't race: roster position, else lane 0.
 */
export function horseColors(
  players: readonly ({ id: string; ticked?: boolean; joined_at?: string } & Choice)[],
  horses: readonly string[],
  id: string,
): HorseColors {
  let lane = horses.indexOf(id);
  if (lane < 0 && players.find((p) => p.id === id)?.ticked) {
    const t = (p: { joined_at?: string }) => Date.parse(p.joined_at ?? '') || 0;
    lane = players
      .filter((p) => p.ticked)
      .sort((a, b) => t(a) - t(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .findIndex((p) => p.id === id);
  }
  if (lane < 0) lane = Math.max(0, players.findIndex((p) => p.id === id));
  return colorsByPlayer(players)(id, lane);
}

/** Black or white, whichever stands out on `hex` (#rrggbb). */
export function contrastOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luma = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 150 ? '#1a1a1a' : '#ffffff';
}

export const BOX_COLOR: Readonly<Record<BoxKind, string>> = {
  mystery: '#ffd54f',
  speed: '#29b6f6',
  defense: '#66bb6a',
  attack: '#ef5350',
};
