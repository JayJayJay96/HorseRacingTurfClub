import { FunctionsHttpError } from '@supabase/supabase-js';
import type { BoxType, RaceLength } from '../sim/types.ts';
import type { Database } from './database.types.ts';
import { supabase } from './supabase.ts';

type Tables = Database['public']['Tables'];
export type Room = Tables['rooms']['Row'];
export type RoomPlayer = Tables['room_players']['Row'];
export type Race = Tables['races']['Row'];
export type Purchase = Tables['purchases']['Row'];
export type Bet = Tables['bets']['Row'];
export type LedgerRow = Tables['coin_ledger']['Row'];
export type BetKind = 'win' | 'place';
export type RoomState = {
  room: Room;
  players: RoomPlayer[];
  /** The current race (SHOP..PODIUM) and its rows; null / empty in the LOBBY. */
  race: Race | null;
  purchases: Purchase[];
  bets: Bet[];
  ledger: LedgerRow[];
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
export const setPhase = (roomId: string, phase: 'LOBBY' | 'SHOP') =>
  call(supabase.rpc('set_phase', { p_room: roomId, p_phase: phase }));
export const setReady = (roomId: string, ready: boolean) =>
  call(supabase.rpc('set_ready', { p_room: roomId, p_ready: ready }));

export const buyBox = (roomId: string, box: BoxType) =>
  call(supabase.rpc('buy_box', { p_room: roomId, p_box: box }));
export const placeBet = (roomId: string, horseId: string, kind: BetKind, stake: number) =>
  call(
    supabase.rpc('place_bet', { p_room: roomId, p_horse: horseId, p_kind: kind, p_stake: stake }),
  );
export const cancelBet = (betId: string) => call(supabase.rpc('cancel_bet', { p_bet: betId }));
export const finishRace = (roomId: string) => call(supabase.rpc('finish_race', { p_room: roomId }));

/** Edge Functions answer errors as 400 `{ error: code }`, the same codes RPCs raise. */
async function invoke(name: 'lock-odds' | 'start-race', roomId: string): Promise<void> {
  const { error } = await supabase.functions.invoke(name, { body: { room: roomId } });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) throw new Error(body.error);
  }
  throw new Error(error.message);
}
export const lockOdds = (roomId: string) => invoke('lock-odds', roomId);
export const startRace = (roomId: string) => invoke('start-race', roomId);

/** Null when the room doesn't exist or this device isn't in it (RLS hides it). */
export async function fetchRoom(code: string): Promise<RoomState | null> {
  const room = await call(supabase.from('rooms').select('*').eq('code', code).maybeSingle());
  if (!room) return null;
  const raceId = room.race_id;
  const [players, race, purchases, bets, ledger] = await Promise.all([
    call(supabase.from('room_players').select('*').eq('room_id', room.id).order('joined_at')),
    raceId ? call(supabase.from('races').select('*').eq('id', raceId).maybeSingle()) : null,
    raceId
      ? call(supabase.from('purchases').select('*').eq('race_id', raceId).order('created_at'))
      : [],
    raceId ? call(supabase.from('bets').select('*').eq('race_id', raceId).order('created_at')) : [],
    raceId ? call(supabase.from('coin_ledger').select('*').eq('race_id', raceId).order('id')) : [],
  ]);
  return {
    room,
    players: players ?? [],
    race,
    purchases: purchases ?? [],
    bets: bets ?? [],
    ledger: ledger ?? [],
  };
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
  bad_stake: 'Stake must be at least 1 coin.',
  not_in_race: "That horse isn't in this race.",
  bet_not_found: 'That bet is gone.',
  too_many_bets: 'That’s enough bets for one race.',
  race_not_finished: 'The race is still running.',
  race_not_found: 'That race no longer exists.',
  bad_odds: 'Odds calculation failed. Try again.',
  bad_result: 'Race calculation failed. Try again.',
};

export function errorText(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  return ERROR_TEXT[code] ?? code;
}
