import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balanceOf, member, officeRoom } from './officeFixtures.ts';
import { balance, bettingRoom, shopRoom } from './raceFixtures.ts';

describe('private_roster', () => {
  it('lists only unclaimed host-typed names of a private room', async () => {
    const r = await shopRoom();
    const stranger = await anonClient();
    const rows = (await ok(stranger.rpc('private_roster', { p_code: r.room.code }))) as {
      name: string;
    }[];
    expect(rows.map((x) => x.name).sort()).toEqual(['Dan', 'Siti']);
    expect(await ok(stranger.rpc('private_roster', { p_code: 'TURF' }))).toEqual([]);
  });
});

describe('late claim', () => {
  it('claims a pre-entered horse in SHOP, gets 100 once, and can buy for it', async () => {
    const r = await shopRoom();
    const phone = await anonClient();
    const siti = await ok(phone.rpc('join_room', { p_code: r.room.code, p_name: 'Siti' }));
    expect(await balance(phone, r.raceId, siti.id)).toBe(100);
    // Rejoining (probe) does not pay again.
    await ok(phone.rpc('join_room', { p_code: r.room.code, p_name: '' }));
    expect(await balance(phone, r.raceId, siti.id)).toBe(100);
    await ok(phone.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    expect(await balance(phone, r.raceId, siti.id)).toBe(80);
  });

  it('claims in BETTING and can bet; refuses once the race runs', async () => {
    const r = await bettingRoom();
    const phone = await anonClient();
    const dan = await ok(phone.rpc('join_room', { p_code: r.room.code, p_name: 'Dan' }));
    await ok(
      phone.rpc('place_bet', {
        p_room: r.room.id,
        p_horse: r.ali.player.id,
        p_kind: 'win',
        p_stake: 10,
      }),
    );
    expect(await balance(phone, r.raceId, dan.id)).toBe(90);
    await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: r.raceId,
        p_timeline: {},
        p_finish: [r.ali.player.id, r.bea.player.id, r.siti.id, r.dan.id],
        p_seconds: 100,
      }),
    );
    const another = await anonClient();
    expect(await fails(another.rpc('join_room', { p_code: r.room.code, p_name: 'Siti' }))).toBe(
      'wrong_phase',
    );
  });
});

describe('cancel race', () => {
  it('BETTING -> LOBBY deletes the race (full refund) and is host-only', async () => {
    const r = await bettingRoom();
    await ok(
      r.cal.client.rpc('place_bet', {
        p_room: r.room.id,
        p_horse: r.ali.player.id,
        p_kind: 'win',
        p_stake: 30,
      }),
    );
    expect(
      await fails(r.ali.client.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' })),
    ).toBe('not_host');
    const room = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(room).toMatchObject({ phase: 'LOBBY', race_id: null });
    expect(await ok(adminClient().from('races').select('id').eq('id', r.raceId))).toEqual([]);
  });

  it('ODDS_LOCKED -> LOBBY works too; RUNNING can not be cancelled', async () => {
    const r = await shopRoom();
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    const r2 = await bettingRoom();
    await ok(r2.host.rpc('start_race_begin', { p_room: r2.room.id }));
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: r2.raceId,
        p_timeline: {},
        p_finish: [r2.ali.player.id, r2.bea.player.id, r2.siti.id, r2.dan.id],
        p_seconds: 100,
      }),
    );
    expect(await fails(r2.host.rpc('set_phase', { p_room: r2.room.id, p_phase: 'LOBBY' }))).toBe(
      'bad_transition',
    );
  });

  it('Office: cancelling in BETTING undoes topups, purchases and bets', async () => {
    const { host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b])
      await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await ok(a.client.rpc('buy_box', { p_room: room.id, p_box: 'speed' }));
    await ok(host.rpc('lock_odds_begin', { p_room: room.id }));
    const odds = { [a.player.id]: { win: 2, place: 1.1 }, [b.player.id]: { win: 2, place: 1.1 } };
    await ok(adminClient().rpc('lock_odds_finish', { p_race: shop.race_id, p_odds: odds }));
    await ok(
      b.client.rpc('place_bet', {
        p_room: room.id,
        p_horse: a.player.id,
        p_kind: 'win',
        p_stake: 40,
      }),
    );
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(100);
    expect(await balanceOf(a.client, room.id, b.player.id)).toBe(100);
  });
});
