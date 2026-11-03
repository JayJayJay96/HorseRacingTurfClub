import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, ok } from './helpers.ts';

/** ADMIN_PASSWORD from supabase/functions/.env (the local Edge Function secret; Task 6). */
export function adminPassword(): string {
  const text = readFileSync(new URL('../../supabase/functions/.env', import.meta.url), 'utf8');
  const m = /^ADMIN_PASSWORD=(.+)$/m.exec(text);
  if (!m) throw new Error('Set ADMIN_PASSWORD in supabase/functions/.env');
  return m[1]!.trim();
}

/** The office room row (service role). */
export async function officeRow() {
  const [room] = await ok(adminClient().from('rooms').select('*').eq('kind', 'office'));
  return room as {
    id: string;
    code: string;
    phase: string;
    race_id: string | null;
    host_uid: string | null;
  };
}

/**
 * The single office room, reset to LOBBY with nobody ticked, hosted by a fresh device.
 * Tests share it, so each test resets it first (DB tests run one file at a time).
 */
export async function officeRoom() {
  const admin = adminClient();
  const room = await officeRow();
  await ok(admin.from('rooms').update({ phase: 'LOBBY', race_id: null }).eq('id', room.id));
  await ok(
    admin.from('room_players').update({ ticked: false, ready: false }).eq('room_id', room.id),
  );
  const host = await anonClient();
  const { data } = await host.auth.getUser();
  await ok(admin.rpc('admin_claim_host', { p_uid: data.user!.id }));
  return { admin, host, room };
}

let seq = 0;
/** A new member with a unique name and PIN `pin`; the returned phone is signed in as them. */
export async function member(prefix = 'M', pin = '1234') {
  const name = `${prefix}${Date.now().toString(36).slice(-5)}${seq++}`;
  const player = await ok(adminClient().rpc('admin_add_member', { p_name: name, p_pin: pin }));
  const client: SupabaseClient = await anonClient();
  await ok(client.rpc('office_login', { p_player: player.id, p_pin: pin }));
  return { client, player: player as { id: string; name: string }, name };
}

/** One member's balance through room_balances, as `client` sees it. */
export async function balanceOf(client: SupabaseClient, roomId: string, playerId: string) {
  const rows = (await ok(client.rpc('room_balances', { p_room: roomId }))) as {
    player_id: string;
    balance: number;
  }[];
  return rows.find((r) => r.player_id === playerId)?.balance;
}

type Room = Awaited<ReturnType<typeof officeRoom>>;
type Horse = { player: { id: string } };

/**
 * Runs one office race with a fixed finish order: SHOP -> odds -> BETTING -> Start -> PODIUM -> LOBBY.
 * `shop` / `betting` hooks run in those phases (buy boxes, bet). `stopAt: 'RUNNING'` stops after Start.
 * Unticks the horses afterwards. Returns the race id.
 */
export async function officeRace(
  r: Room,
  horses: Horse[],
  finish: string[],
  opts: {
    odds?: Record<string, { win: number; place: number }>;
    shop?: () => Promise<unknown>;
    betting?: () => Promise<unknown>;
    awards?: Record<string, string[]>;
    stopAt?: 'RUNNING';
  } = {},
): Promise<string> {
  for (const h of horses)
    await ok(r.host.rpc('set_ticked', { p_player: h.player.id, p_ticked: true }));
  const shop = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
  await opts.shop?.();
  await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
  const odds =
    opts.odds ?? Object.fromEntries(horses.map((h) => [h.player.id, { win: 2, place: 1.1 }]));
  await ok(r.admin.rpc('lock_odds_finish', { p_race: shop.race_id, p_odds: odds }));
  await opts.betting?.();
  await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
  await ok(
    r.admin.rpc('start_race_finish', {
      p_race: shop.race_id,
      p_timeline: {},
      p_finish: finish,
      p_seconds: 0.01,
      p_awards: opts.awards ?? {},
    }),
  );
  if (opts.stopAt === 'RUNNING') return shop.race_id as string;
  await new Promise((res) => setTimeout(res, 50));
  await ok(r.host.rpc('finish_race', { p_room: r.room.id }));
  await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
  for (const h of horses)
    await ok(r.host.rpc('set_ticked', { p_player: h.player.id, p_ticked: false }));
  return shop.race_id as string;
}

/** Badge codes a member holds (service role), sorted. */
export async function badgesOf(playerId: string): Promise<string[]> {
  const rows = (await ok(
    adminClient().from('badges').select('badge').eq('player_id', playerId),
  )) as {
    badge: string;
  }[];
  return rows.map((b) => b.badge).sort();
}
