import type { Json } from '../net/database.types.ts';
import type { OddsLine } from '../sim/odds.ts';
import type { BoxType } from '../sim/types.ts';

export const BOX_TYPES = ['speed', 'defense', 'attack'] as const satisfies readonly BoxType[];
export const BOX_ICON: Record<BoxType, string> = { speed: '⚡', defense: '🛡️', attack: '💥' };
export const BOX_NAME: Record<BoxType, string> = {
  speed: 'Speed',
  defense: 'Defense',
  attack: 'Attack',
};

type Owned = { player_id: string };

export const boxesOf = (purchases: readonly (Owned & { box: string })[], playerId: string) =>
  purchases.filter((p) => p.player_id === playerId).map((p) => p.box as BoxType);

export const potOf = (bets: readonly { stake: number }[]) =>
  bets.reduce((sum, b) => sum + b.stake, 0);

/** races.odds is jsonb written by lock-odds: { [player id]: OddsLine }. */
export const oddsOf = (race: { odds: Json | null } | null) =>
  (race?.odds ?? {}) as Record<string, OddsLine | undefined>;

export const nameOf = (players: readonly { id: string; name: string }[], id: string | undefined) =>
  players.find((p) => p.id === id)?.name ?? '?';

type Named = { id: string; name: string; horse_name?: string | null };

/** Office horses may have their own name; Private horses are named after their person. */
export const horseName = (p: Pick<Named, 'name' | 'horse_name'>) => p.horse_name || p.name;

export const horseNameOf = (players: readonly Named[], id: string | undefined) => {
  const p = players.find((x) => x.id === id);
  return p ? horseName(p) : '?';
};

/** With 3 or fewer horses every horse places, so the server refuses Place bets. */
export const canPlace = (horses: readonly string[]) => horses.length > 3;

export const formatOdds = (odds: number | undefined) =>
  odds === undefined ? '–' : `${Number(odds.toFixed(2))}×`;

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen
    ? 'th'
    : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}
