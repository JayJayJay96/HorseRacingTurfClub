import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, ok } from './helpers.ts';

/** Shop open. Phones Ali and Bea and host-typed Siti are racing (lane order); phone Cal only watches. */
export async function shopRoom() {
  const host = await anonClient();
  const created = await ok(host.rpc('create_room', {}));
  const join = async (name: string) => {
    const client = await anonClient();
    const player = await ok(client.rpc('join_room', { p_code: created.code, p_name: name }));
    return { client, player };
  };
  const ali = await join('Ali');
  const bea = await join('Bea');
  const cal = await join('Cal');
  const siti = await ok(host.rpc('add_player', { p_room: created.id, p_name: 'Siti' }));
  for (const id of [ali.player.id, bea.player.id, siti.id]) {
    await ok(host.rpc('set_ticked', { p_player: id, p_ticked: true }));
  }
  const room = await ok(host.rpc('set_phase', { p_room: created.id, p_phase: 'SHOP' }));
  return { host, room, ali, bea, cal, siti, raceId: room.race_id as string };
}

/** Fixed odds so payout tests are exact. */
export const fixtureOdds = (r: Awaited<ReturnType<typeof shopRoom>>) => ({
  [r.ali.player.id]: { win: 2.5, place: 1.5 },
  [r.bea.player.id]: { win: 3, place: 1.2 },
  [r.siti.id]: { win: 4, place: 1.6 },
});

/** Shop room moved to BETTING with fixtureOdds (no Edge Function involved). */
export async function bettingRoom() {
  const r = await shopRoom();
  await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
  await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
  return r;
}

export async function balance(client: SupabaseClient, raceId: string, playerId: string) {
  const rows = await ok(
    client.from('coin_ledger').select('amount').eq('race_id', raceId).eq('player_id', playerId),
  );
  return (rows as { amount: number }[]).reduce((sum, row) => sum + row.amount, 0);
}
