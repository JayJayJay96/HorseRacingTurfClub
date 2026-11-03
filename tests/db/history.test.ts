import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, ok } from './helpers.ts';
import { badgesOf, member, officeRace, officeRoom } from './officeFixtures.ts';
import { bettingRoom } from './raceFixtures.ts';

describe('badges at Start', () => {
  it('first win, then a hat-trick after three wins in a row', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win']);
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win']);
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win', 'hat_trick']);
    expect(await badgesOf(b.player.id)).toEqual([]);
  });

  it('long shot: a winning bet at 10x or more goes to the bettor', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const fan = await member('F');
    await officeRace(r, [a, b], [b.player.id, a.player.id], {
      odds: { [a.player.id]: { win: 1.2, place: 1.05 }, [b.player.id]: { win: 12, place: 4 } },
      betting: () =>
        ok(
          fan.client.rpc('place_bet', {
            p_room: r.room.id,
            p_horse: b.player.id,
            p_kind: 'win',
            p_stake: 5,
          }),
        ),
    });
    expect(await badgesOf(fan.player.id)).toEqual(['long_shot']);
  });

  it('broke: lifted to the floor; event badges only for horses in the race', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const poor = await member('P');
    const outsider = await member('X');
    await ok(
      r.admin.rpc('admin_adjust', { p_player: poor.player.id, p_amount: -95, p_reason: 'test' }),
    );
    await officeRace(r, [a, b], [a.player.id, b.player.id], {
      awards: {
        photo_finish: [a.player.id],
        sniper: [b.player.id],
        banana_king: [outsider.player.id],
      },
    });
    expect(await badgesOf(poor.player.id)).toEqual(['broke']);
    expect(await badgesOf(a.player.id)).toEqual(['first_win', 'photo_finish']);
    expect(await badgesOf(b.player.id)).toEqual(['sniper']);
    expect(await badgesOf(outsider.player.id)).toEqual([]);
  });

  it('big spender: 3 boxes in 5 races', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const buy3 = async () => {
      for (let i = 0; i < 3; i++)
        await ok(a.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    };
    for (let race = 1; race <= 5; race++) {
      await officeRace(r, [a, b], [b.player.id, a.player.id], { shop: buy3 });
      expect((await badgesOf(a.player.id)).includes('big_spender')).toBe(race === 5);
    }
  });

  it('Private races award nothing; deleting a race removes its badges', async () => {
    const p = await bettingRoom();
    await ok(p.host.rpc('start_race_begin', { p_room: p.room.id }));
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: p.raceId,
        p_timeline: {},
        p_finish: [p.ali.player.id, p.bea.player.id, p.siti.id, p.dan.id],
        p_seconds: 1,
        p_awards: { photo_finish: [p.ali.player.id] },
      }),
    );
    expect(await badgesOf(p.ali.player.id)).toEqual([]);

    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const race = await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await badgesOf(a.player.id)).toEqual(['first_win']);
    await ok(r.admin.rpc('admin_delete_race', { p_race: race }));
    expect(await badgesOf(a.player.id)).toEqual([]);
  });

  it('clients read badges of their own room only', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    await officeRace(r, [a, b], [a.player.id, b.player.id]);
    expect(await ok(b.client.from('badges').select('badge').eq('player_id', a.player.id))).toEqual([
      { badge: 'first_win' },
    ]);
    const stranger = await anonClient();
    expect(await ok(stranger.from('badges').select('badge').eq('player_id', a.player.id))).toEqual(
      [],
    );
  });
});
