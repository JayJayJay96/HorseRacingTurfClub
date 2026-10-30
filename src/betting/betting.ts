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

export const balanceOf = (ledger: readonly (Owned & { amount: number })[], playerId: string) =>
  ledger.reduce((sum, row) => (row.player_id === playerId ? sum + row.amount : sum), 0);

export const boxesOf = (purchases: readonly (Owned & { box: string })[], playerId: string) =>
  purchases.filter((p) => p.player_id === playerId).map((p) => p.box as BoxType);

export const potOf = (bets: readonly { stake: number }[]) =>
  bets.reduce((sum, b) => sum + b.stake, 0);

/** races.odds is jsonb written by lock-odds: { [player id]: OddsLine }. */
export const oddsOf = (race: { odds: Json | null } | null) =>
  (race?.odds ?? {}) as Record<string, OddsLine | undefined>;

export const nameOf = (players: readonly { id: string; name: string }[], id: string | undefined) =>
  players.find((p) => p.id === id)?.name ?? '?';

export const formatOdds = (odds: number | undefined) =>
  odds === undefined ? '–' : `${Number(odds.toFixed(2))}×`;

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen
    ? 'th'
    : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}
