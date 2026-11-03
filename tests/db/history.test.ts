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

  it('malformed awards never block Start; valid entries still count', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const bad = { photo_finish: ['not-a-uuid', a.player.id], sniper: 'oops' };
    await officeRace(r, [a, b], [a.player.id, b.player.id], {
      awards: bad as unknown as Record<string, string[]>,
    });
    expect(await badgesOf(a.player.id)).toEqual(['first_win', 'photo_finish']);
    expect(await badgesOf(b.player.id)).toEqual([]);
    await officeRace(r, [a, b], [b.player.id, a.player.id], {
      awards: [] as unknown as Record<string, string[]>,
    });
    expect(await badgesOf(b.player.id)).toEqual(['first_win']);
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

type Stats = {
  members: { id: string; name: string }[];
  richest: { id: string; value: number }[];
  biggest_payout: { id: string; value: number }[];
  biggest_loss: { id: string; value: number }[];
  best_profit: { id: string; value: number }[];
  horses: { id: string; races: number; wins: number; places: number; last5: number[] }[];
  badges: { id: string; badge: string }[];
  recent: { race: string; podium: string[]; replay: boolean; track: string }[];
};

describe('office_stats', () => {
  it('is null for non-members and the full picture for members', async () => {
    const r = await officeRoom();
    // Leaderboards are office-wide top 5s: clear earlier races (and their bets and coins) so reruns pass.
    // This wipes office history in the LOCAL test database only; tests never run against hosted.
    await ok(r.admin.from('races').delete().eq('room_id', r.room.id));
    const a = await member('A');
    const b = await member('B');
    const fan = await member('F');
    const box = (kind: string) => ok(b.client.rpc('buy_box', { p_room: r.room.id, p_box: kind }));
    await officeRace(r, [a, b], [a.player.id, b.player.id], {
      // B spends 60 + 35 + 20 = 115 and wins nothing: the biggest loss in one race.
      shop: async () => {
        await box('speed');
        await box('defense');
        await box('attack');
      },
      betting: () =>
        ok(
          fan.client.rpc('place_bet', {
            p_room: r.room.id,
            p_horse: a.player.id,
            p_kind: 'win',
            p_stake: 30,
          }),
        ),
    });
    await officeRace(r, [a, b], [b.player.id, a.player.id]);

    const stranger = await anonClient();
    expect(await ok(stranger.rpc('office_stats'))).toBeNull();

    const s = (await ok(fan.client.rpc('office_stats'))) as Stats;
    expect(s.members.map((m) => m.id)).toEqual(
      expect.arrayContaining([a.player.id, b.player.id, fan.player.id]),
    );
    expect(s.horses.find((h) => h.id === a.player.id)).toEqual({
      id: a.player.id,
      races: 2,
      wins: 1,
      places: 2,
      last5: [2, 1],
    });
    expect(s.biggest_payout).toContainEqual(
      expect.objectContaining({ id: fan.player.id, value: 60 }),
    );
    expect(s.best_profit).toContainEqual(expect.objectContaining({ id: fan.player.id, value: 30 }));
    expect(s.biggest_loss).toContainEqual(expect.objectContaining({ id: b.player.id, value: 115 }));
    expect(s.badges).toContainEqual(
      expect.objectContaining({ id: a.player.id, badge: 'first_win' }),
    );
    expect(s.recent[0]).toMatchObject({
      podium: [b.player.id, a.player.id],
      replay: true,
      track: 'oval',
    });
  });

  it('hides the race being run until its podium', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    await officeRace(r, [a, b], [a.player.id, b.player.id], { stopAt: 'RUNNING' });
    const running = (await ok(a.client.rpc('office_stats'))) as Stats;
    expect(running.horses.find((h) => h.id === a.player.id)).toBeUndefined();
    expect(running.badges.filter((x) => x.id === a.player.id)).toEqual([]);
    await new Promise((res) => setTimeout(res, 50));
    await ok(r.host.rpc('finish_race', { p_room: r.room.id }));
    const podium = (await ok(a.client.rpc('office_stats'))) as Stats;
    expect(podium.horses.find((h) => h.id === a.player.id)?.wins).toBe(1);
  });

  it('cleanup keeps results forever but timelines only 90 days', async () => {
    const r = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const race = await officeRace(r, [a, b], [a.player.id, b.player.id]);
    const admin = adminClient();
    await ok(
      admin
        .from('races')
        .update({ started_at: new Date(Date.now() - 91 * 864e5).toISOString() })
        .eq('id', race),
    );
    await ok(admin.rpc('cleanup_rooms'));
    expect(await ok(admin.from('race_timelines').select('race_id').eq('race_id', race))).toEqual(
      [],
    );
    expect(await ok(admin.from('races').select('id').eq('id', race))).toHaveLength(1);
  });
});
