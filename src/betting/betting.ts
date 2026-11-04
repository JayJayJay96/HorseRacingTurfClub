import type { Json } from '../net/database.types.ts';
import { GROUP_KINDS, groupLanes, type GroupKind, type OddsLine } from '../sim/odds.ts';
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

export const GROUP_NAME: Record<GroupKind, string> = {
  odd: 'Odd numbers',
  even: 'Even numbers',
  low: 'Low numbers',
  high: 'High numbers',
};

export const isGroup = (kind: string): kind is GroupKind =>
  (GROUP_KINDS as readonly string[]).includes(kind);

/** races.odds.groups: Odd/Even/Low/High odds, written by lock-odds for 4+ horses. */
export const groupOddsOf = (race: { odds: Json | null } | null) =>
  (race?.odds as { groups?: Partial<Record<GroupKind, number>> } | null)?.groups ?? {};

type BetLike = { horse_id: string | null; kind: string };

/** What a bet is on: "Ann to win", "Ann to place", "Odd numbers". */
export const betOn = (b: BetLike, players: readonly Named[]) =>
  isGroup(b.kind)
    ? GROUP_NAME[b.kind]
    : `${horseNameOf(players, b.horse_id ?? undefined)} to ${b.kind}`;

/** Whether `b` wins if the race ended in `order` (`horses` is the lane order, #1 first). */
export function betWinning(b: BetLike, order: readonly string[], horses: readonly string[]) {
  if (isGroup(b.kind)) {
    const lane = horses.indexOf(order[0] ?? '') + 1;
    return lane > 0 && groupLanes(b.kind, horses.length).includes(lane);
  }
  const place = order.indexOf(b.horse_id ?? '');
  return place >= 0 && (b.kind === 'win' ? place === 0 : place < 3);
}

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
