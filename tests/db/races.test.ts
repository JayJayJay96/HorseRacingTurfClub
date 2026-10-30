import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balance, shopRoom } from './raceFixtures.ts';

describe('races', () => {
  it('opening the shop starts a race and tops up every phone with 100', async () => {
    const r = await shopRoom();
    expect(r.raceId).toBeTruthy();
    const ledger = await ok(
      r.host.from('coin_ledger').select('player_id, type, amount').eq('race_id', r.raceId),
    );
    expect(ledger).toHaveLength(3); // Siti has no phone
    for (const p of [r.ali.player, r.bea.player, r.cal.player]) {
      expect(ledger).toContainEqual({ player_id: p.id, type: 'topup', amount: 100 });
    }
  });

  it('going back to the lobby cancels the race; reopening gives a fresh 100', async () => {
    const r = await shopRoom();
    const lobby = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(lobby.race_id).toBeNull();
    expect(await ok(adminClient().from('races').select('id').eq('id', r.raceId))).toEqual([]);

    const again = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(again.race_id).not.toBe(r.raceId);
    expect(await balance(r.ali.client, again.race_id, r.ali.player.id)).toBe(100);
  });

  it('members read race data; strangers see nothing and nobody writes directly', async () => {
    const r = await shopRoom();
    expect(await ok(r.cal.client.from('races').select('id').eq('id', r.raceId))).toHaveLength(1);

    const stranger = await anonClient();
    expect(await ok(stranger.from('races').select('id').eq('id', r.raceId))).toEqual([]);
    expect(await ok(stranger.from('coin_ledger').select('id').eq('race_id', r.raceId))).toEqual([]);

    const error = await fails(
      r.ali.client.from('coin_ledger').insert({
        race_id: r.raceId,
        room_id: r.room.id,
        player_id: r.ali.player.id,
        type: 'topup',
        amount: 1000,
      }),
    );
    expect(error).toMatch(/permission denied/);
  });
});
