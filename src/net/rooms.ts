import type { RaceLength } from '../sim/types.ts';
import type { Database } from './database.types.ts';
import { supabase } from './supabase.ts';

export type Room = Database['public']['Tables']['rooms']['Row'];
export type RoomPlayer = Database['public']['Tables']['room_players']['Row'];
export type RoomState = { room: Room; players: RoomPlayer[] };

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

/** Null when the room doesn't exist or this device isn't in it (RLS hides it). */
export async function fetchRoom(code: string): Promise<RoomState | null> {
  const room = await call(supabase.from('rooms').select('*').eq('code', code).maybeSingle());
  if (!room) return null;
  const players = await call(
    supabase.from('room_players').select('*').eq('room_id', room.id).order('joined_at'),
  );
  return { room, players: players ?? [] };
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
};

export function errorText(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  return ERROR_TEXT[code] ?? code;
}
