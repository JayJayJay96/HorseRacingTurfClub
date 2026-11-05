import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { member, officeRoom } from './officeFixtures.ts';
import { fixtureOdds, shopRoom } from './raceFixtures.ts';

type Hot = { item: string; buff: string };
const ELIGIBLE = [
  'speed:self1',
  'speed:self3',
  'speed:star',
  'speed:pass3',
  'attack:behind1',
  'attack:behind3',
  'attack:front1',
  'attack:front3',
  'attack:leader',
  'attack:top3',
  'attack:all',
  'defense:block1',
  'defense:immune',
  'defense:reflect',
];
const hotOf = async (raceId: string) => {
  const [race] = await ok(adminClient().from('races').select('hot_items').eq('id', raceId));
  return race.hot_items as Hot[];
};
const traitsOf = async (raceId: string) => {
  const [race] = await ok(adminClient().from('races').select('traits').eq('id', raceId));
  return race.traits as Record<string, string>;
};
const traitOfPlayer = async (playerId: string) => {
  const [p] = await ok(adminClient().from('room_players').select('trait').eq('id', playerId));
  return p.trait as string;
};

describe('hot items', () => {
  afterAll(async () => {
    await ok(adminClient().rpc('admin_set_hot_items', { p_on: true })); // leave the office default
  });

  it(
    'opening the shop rolls 3 distinct eligible items, at most 2 per type',
    { timeout: 60_000 },
    async () => {
      const r = await shopRoom();
      let raceId = r.raceId;
      const seen = new Set<string>();
      let extended = 0;
      for (let i = 0; i < 30; i++) {
        if (i > 0) {
          await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
          const room = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
          raceId = room.race_id as string;
        }
        const hot = await hotOf(raceId);
        expect(hot).toHaveLength(3);
        expect(new Set(hot.map((h) => h.item)).size).toBe(3);
        for (const { item, buff } of hot) {
          expect(ELIGIBLE).toContain(item);
          expect(['lucky', 'extended']).toContain(buff);
          if (['speed:pass3', 'defense:block1', 'defense:reflect'].includes(item))
            expect(buff).toBe('lucky');
          if (buff === 'extended') extended++;
          seen.add(item);
        }
        for (const type of ['speed', 'attack', 'defense'])
          expect(hot.filter((h) => h.item.startsWith(`${type}:`)).length).toBeLessThanOrEqual(2);
      }
      expect(seen.size).toBeGreaterThan(9); // random order: most items come up in 90 picks
      expect(extended).toBeGreaterThan(10); // ~40 of 90 expected
    },
  );

  it('the office switch off opens the shop with no hot items', async () => {
    const r = await officeRoom();
    const horses = [await member('H'), await member('H')];
    for (const h of horses)
      await ok(r.host.rpc('set_ticked', { p_player: h.player.id, p_ticked: true }));
    try {
      await ok(r.admin.rpc('admin_set_hot_items', { p_on: false }));
      const shop = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
      expect(await hotOf(shop.race_id as string)).toEqual([]);
    } finally {
      await ok(r.admin.rpc('admin_set_hot_items', { p_on: true }));
    }
  });

  it('race_input carries the list and back-to-shop keeps it', async () => {
    const r = await shopRoom();
    const hot = await hotOf(r.raceId);
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.hot_items).toEqual(hot);
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(await hotOf(r.raceId)).toEqual(hot);
    const again = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(again.hot_items).toEqual(hot);
  });

  it('admin_set_hot_items is service-only and shows in the overview', async () => {
    const phone = await anonClient();
    expect(await fails(phone.rpc('admin_set_hot_items', { p_on: false }))).toMatch(
      /permission denied/,
    );
    const admin = adminClient();
    await ok(admin.rpc('admin_set_hot_items', { p_on: false }));
    const o = (await ok(admin.rpc('admin_overview'))) as { room: { hot_items_enabled: boolean } };
    expect(o.room.hot_items_enabled).toBe(false);
    await ok(admin.rpc('admin_set_hot_items', { p_on: true }));
  });
});

describe('traits', () => {
  it('set_trait: own runner, valid code, shop only', async () => {
    const r = await shopRoom();
    const me = await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }));
    expect(me.id).toBe(r.ali.player.id);
    expect(me.trait).toBe('tough');
    expect(await traitOfPlayer(r.bea.player.id)).toBe('normal'); // Ali's call changed only Ali
    expect(
      await fails(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'lucky' })),
    ).toBe('bad_trait');
    expect(
      await fails(r.cal.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' })),
    ).toBe('not_racing');
    const outsider = await anonClient();
    expect(await fails(outsider.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }))).toBe(
      'not_in_room',
    );
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(
      await fails(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'stayer' })),
    ).toBe('wrong_phase');
  });

  it('the lock snapshots every runner; the retry and the race keep it', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }));
    // Traits v2 codes (migration 0023) are accepted too; the last pick wins.
    for (const t of ['closer', 'frontrunner', 'gambler', 'brawler'])
      await ok(r.bea.client.rpc('set_trait', { p_room: r.room.id, p_trait: t }));
    const expected = {
      [r.ali.player.id]: 'tough',
      [r.bea.player.id]: 'brawler',
      [r.siti.id]: 'normal',
      [r.dan.id]: 'normal',
    };
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.traits).toEqual(expected);
    expect(await traitsOf(r.raceId)).toEqual(expected);
    // A change after the lock (service role, behind the RPCs' back) does not reach this race.
    await ok(
      adminClient().from('room_players').update({ trait: 'stayer' }).eq('id', r.ali.player.id),
    );
    const retry = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(retry.traits).toEqual(expected);
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    const start = await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
    expect(start.traits).toEqual(expected);
  });

  it('back to the shop reopens picking and the next lock snapshots again', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'tough' }));
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(await traitsOf(r.raceId)).toEqual({});
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'sprinter' }));
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.traits[r.ali.player.id]).toBe('sprinter');
  });

  it('a new race starts every trait at Normal', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('set_trait', { p_room: r.room.id, p_trait: 'charmed' }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(await traitOfPlayer(r.ali.player.id)).toBe('normal');
  });
});
