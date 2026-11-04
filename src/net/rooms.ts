import { FunctionsHttpError } from '@supabase/supabase-js';
import { unpackTimeline, type PackedTimeline } from '../sim/pack.ts';
import type { GroupKind } from '../sim/odds.ts';
import type { BoxType, RaceLength, Timeline } from '../sim/types.ts';
import type { TrackId } from '../render/track.ts';
import type { CosmeticSlot } from '../shop/cosmetics.ts';
import type { Database } from './database.types.ts';
import { ensureSignedIn, supabase } from './supabase.ts';

type Tables = Database['public']['Tables'];
export type Room = Tables['rooms']['Row'];
export type RoomPlayer = Tables['room_players']['Row'];
export type Race = Tables['races']['Row'];
export type Purchase = Tables['purchases']['Row'];
export type Bet = Tables['bets']['Row'];
export type BetKind = 'win' | 'place' | GroupKind;
export type RoomState = {
  room: Room;
  players: RoomPlayer[];
  /** The current race (SHOP..PODIUM) and its rows; null / empty in the LOBBY. */
  race: Race | null;
  purchases: Purchase[];
  bets: Bet[];
  balances: Record<string, number>;
};

type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;

async function call<T>(request: Res<T>): Promise<T> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

export const createRoom = (length: RaceLength, prize: string) =>
  call(supabase.rpc('create_room', { p_length: length, p_prize: prize }));
export const joinRoom = (code: string, name: string) =>
  call(supabase.rpc('join_room', { p_code: code, p_name: name }));
export const addPlayer = (roomId: string, name: string) =>
  call(supabase.rpc('add_player', { p_room: roomId, p_name: name }));
export const removePlayer = (playerId: string) =>
  call(supabase.rpc('remove_player', { p_player: playerId }));
export const setTicked = (playerId: string, ticked: boolean) =>
  call(supabase.rpc('set_ticked', { p_player: playerId, p_ticked: ticked }));
// Omitting an argument keeps that setting (SQL default null), so edits can't undo each other.
export const setRaceLength = (roomId: string, length: RaceLength) =>
  call(supabase.rpc('update_room_settings', { p_room: roomId, p_length: length }));
export const setPrize = (roomId: string, prize: string) =>
  call(supabase.rpc('update_room_settings', { p_room: roomId, p_prize: prize }));
export const setTrack = (roomId: string, track: TrackId | 'random') =>
  call(supabase.rpc('update_room_settings', { p_room: roomId, p_track: track }));
export const setPhase = (roomId: string, phase: 'LOBBY' | 'SHOP') =>
  call(supabase.rpc('set_phase', { p_room: roomId, p_phase: phase }));
export const setReady = (roomId: string, ready: boolean) =>
  call(supabase.rpc('set_ready', { p_room: roomId, p_ready: ready }));

export const buyBox = (roomId: string, box: BoxType) =>
  call(supabase.rpc('buy_box', { p_room: roomId, p_box: box }));
/** `horseId` is null for a group bet (Odd/Even/Low/High on the winner's number). */
export const placeBet = (roomId: string, horseId: string | null, kind: BetKind, stake: number) =>
  call(
    // The SQL takes a null horse for group bets; the generated Args say string, so only the
    // checked object is cast.
    supabase.rpc('place_bet', {
      p_room: roomId,
      p_horse: horseId,
      p_kind: kind,
      p_stake: stake,
    } satisfies {
      p_room: string;
      p_horse: string | null;
      p_kind: string;
      p_stake: number;
    } as never),
  );
export const cancelBet = (betId: string) => call(supabase.rpc('cancel_bet', { p_bet: betId }));
export const finishRace = (roomId: string) => call(supabase.rpc('finish_race', { p_room: roomId }));

/** Edge Functions answer errors as 400 `{ error: code }`, the same codes RPCs raise. */
async function callFunction<T>(
  name: 'lock-odds' | 'start-race' | 'admin',
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (payload?.error) throw new Error(payload.error);
  }
  throw new Error(error.message);
}
export const lockOdds = (roomId: string) => callFunction('lock-odds', { room: roomId });
export const startRace = (roomId: string) => callFunction('start-race', { room: roomId });
/** Signs the device in first: the admin lockout counts misses per device. */
export const adminAction = async <T = unknown>(
  password: string,
  action: string,
  args: Record<string, unknown> = {},
) => {
  await ensureSignedIn();
  return callFunction<T>('admin', { ...args, password, action });
};

export const officeRoster = () => call(supabase.rpc('office_roster'));
/** Names the host pre-entered that no phone has claimed yet (Private rooms). */
export const privateRoster = (code: string) =>
  call(supabase.rpc('private_roster', { p_code: code }));
/** Null from the server means a wrong PIN (the fail count must commit, so it doesn't raise). */
export async function officeLogin(playerId: string, pin: string): Promise<RoomPlayer> {
  const player = await call(supabase.rpc('office_login', { p_player: playerId, p_pin: pin }));
  if (!player) throw new Error('wrong_pin');
  // office_login returns jsonb (not a row type) so a wrong PIN can return a real null.
  return player as unknown as RoomPlayer;
}
export const officeLogout = (roomId: string) =>
  call(supabase.rpc('office_logout', { p_room: roomId }));
type SetMyHorseArgs = {
  p_room: string;
  p_coat: number | null;
  p_silk: number | null;
  p_horse_name: string;
};
export const setMyHorse = (
  roomId: string,
  coat: number | null,
  silk: number | null,
  horseName: string,
) =>
  call(
    // The SQL accepts null coat/silk (= lane default); the generated Args say number, so only the
    // checked object is cast.
    supabase.rpc('set_my_horse', {
      p_room: roomId,
      p_coat: coat,
      p_silk: silk,
      p_horse_name: horseName,
    } satisfies SetMyHorseArgs as never),
  );

export const buyCosmetic = (roomId: string, code: string) =>
  call(supabase.rpc('buy_cosmetic', { p_room: roomId, p_code: code }));
export const equipCosmetic = (roomId: string, slot: CosmeticSlot, code: string | null) =>
  call(
    // A null code unequips; the generated Args say string, so only the checked object is cast.
    supabase.rpc('equip_cosmetic', {
      p_room: roomId,
      p_slot: slot,
      p_code: code,
    } satisfies { p_room: string; p_slot: string; p_code: string | null } as never),
  );
/** The caller's bought cosmetic codes. */
export async function fetchOwnedCosmetics(playerId: string): Promise<string[]> {
  const rows = await call(
    supabase.from('player_cosmetics').select('code').eq('player_id', playerId),
  );
  return (rows ?? []).map((r) => r.code);
}

/** Null when the room doesn't exist or this device isn't in it (RLS hides it). */
export async function fetchRoom(code: string): Promise<RoomState | null> {
  const room = await call(supabase.from('rooms').select('*').eq('code', code).maybeSingle());
  if (!room) return null;
  const raceId = room.race_id;
  const [players, race, purchases, bets, balances] = await Promise.all([
    call(
      supabase
        .from('room_players')
        .select('*')
        .eq('room_id', room.id)
        .is('archived_at', null)
        .order('joined_at'),
    ),
    raceId ? call(supabase.from('races').select('*').eq('id', raceId).maybeSingle()) : null,
    raceId
      ? call(supabase.from('purchases').select('*').eq('race_id', raceId).order('created_at'))
      : [],
    raceId ? call(supabase.from('bets').select('*').eq('race_id', raceId).order('created_at')) : [],
    call(supabase.rpc('room_balances', { p_room: room.id })),
  ]);
  return {
    room,
    players: players ?? [],
    race,
    purchases: purchases ?? [],
    bets: bets ?? [],
    balances: Object.fromEntries((balances ?? []).map((r) => [r.player_id, r.balance])),
  };
}

/** The race's stored Timeline, unpacked; null until Start has written it. */
export async function fetchTimeline(raceId: string): Promise<Timeline | null> {
  const row = await call(
    supabase.from('race_timelines').select('timeline').eq('race_id', raceId).maybeSingle(),
  );
  return row ? unpackTimeline(row.timeline as unknown as PackedTimeline) : null;
}

const ERROR_TEXT: Record<string, string> = {
  room_not_found: 'No room with that code (or you were removed from it).',
  name_taken: 'That name is already taken in this room.',
  bad_name: 'Names are 1–24 characters.',
  room_full: 'This room is full.',
  field_full: 'A race has at most 22 horses.',
  need_two_horses: 'Tick at least 2 horses first.',
  wrong_phase: "That isn't possible right now.",
  bad_transition: "That isn't possible right now.",
  not_host: 'Only the host can do that.',
  not_in_room: "You're not in this room.",
  prize_too_long: 'Prize is at most 60 characters.',
  player_not_found: 'That player is no longer in the room.',
  bad_length: 'Race length must be Short or Long.',
  no_free_code: 'Could not find a free room code. Try again.',
  not_signed_in: 'Not signed in. Reload the page.',
  not_racing: 'Only horses in this race can buy boxes.',
  max_boxes: 'A horse can carry at most 3 bought boxes.',
  not_enough_coins: 'Not enough coins.',
  bad_box: 'Unknown box type.',
  bad_bet: 'Pick Win or Place.',
  bet_closed: 'That bet is closed: it is too likely to pay fairly.',
  bad_stake: 'Stake must be at least 1 coin.',
  not_in_race: "That horse isn't in this race.",
  bet_not_found: 'That bet is gone.',
  too_many_bets: 'That’s enough bets for one race.',
  race_not_finished: 'The race is still running.',
  race_not_found: 'That race no longer exists.',
  bad_odds: 'Odds calculation failed. Try again.',
  bad_result: 'Race calculation failed. Try again.',
  office_room: 'This is the office race: pick your name and enter your PIN.',
  wrong_pin: 'Wrong PIN.',
  pin_locked: 'Too many wrong PINs. Try again in 5 minutes.',
  bad_pin: 'PINs are 4 digits.',
  no_pin: 'No PIN yet. Ask the admin to set one.',
  admin_only: 'People are managed in /admin.',
  office_only: 'Only office horses can be customised.',
  bad_horse: 'Pick a coat and silk from the list; horse names are up to 24 characters.',
  bad_password: 'Wrong admin password.',
  admin_locked: 'Too many wrong admin passwords. Try again in 10 minutes.',
  admin_not_configured: 'The admin password is not set on the server.',
  bad_action: 'Unknown admin action.',
  bad_amount: 'Amount must be a whole number, not 0.',
  bad_reason: 'Give a reason (up to 100 characters).',
  race_in_use: "Can't delete the race in progress.",
  unknown_cosmetic: "That item isn't in the shop.",
  already_owned: 'You already own that.',
  not_owned: 'Buy that first.',
  wrong_slot: "That item doesn't go there.",
};

export function errorText(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  return ERROR_TEXT[code] ?? code;
}
