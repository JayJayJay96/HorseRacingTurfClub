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
}

/** 6 coats × 11 silks (coprime), so the first 66 lanes all differ. */
export function colorsOf(lane: number): HorseColors {
  const c = lane % COAT_COLORS.length;
  return { coat: COAT_COLORS[c]!, mane: MANES[c]!, silk: SILK_COLORS[lane % SILK_COLORS.length]! };
}

/** A member's chosen coat/silk (null = lane default). */
export function colorsFor(
  lane: number,
  choice?: { coat: number | null; silk: number | null },
): HorseColors {
  const base = colorsOf(lane);
  if (!choice) return base;
  return {
    coat: choice.coat === null ? base.coat : COAT_COLORS[choice.coat]!,
    mane: choice.coat === null ? base.mane : MANES[choice.coat]!,
    silk: choice.silk === null ? base.silk : SILK_COLORS[choice.silk]!,
  };
}

/** Colour lookup for the renderer: horse id + lane -> colours, from the room's players. */
export const colorsByPlayer =
  (players: readonly { id: string; coat: number | null; silk: number | null }[]) =>
  (horse: string, lane: number) =>
    colorsFor(
      lane,
      players.find((p) => p.id === horse),
    );

export const BOX_COLOR: Readonly<Record<BoxKind, string>> = {
  mystery: '#ffd54f',
  speed: '#29b6f6',
  defense: '#66bb6a',
  attack: '#ef5350',
};
