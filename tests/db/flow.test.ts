import { describe, expect, it } from 'vitest';
import { adminClient, fails, ok } from './helpers.ts';
import { bettingRoom, fixtureOdds, shopRoom } from './raceFixtures.ts';

const phaseOf = async (r: Awaited<ReturnType<typeof shopRoom>>) =>
  (await ok(r.host.from('rooms').select('phase').eq('id', r.room.id)))[0].phase;

describe('lock_odds', () => {
  it('closes the shop, fixes lane order and returns the race input; retry returns the same', async () => {
    const r = await shopRoom();
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input).toEqual({
      race_id: r.raceId,
      length: 'short',
      weather: 'clear',
      weather_enabled: true,
      hot_items: expect.any(Array), // rolled at random
      traits: {
        [r.ali.player.id]: 'normal',
        [r.bea.player.id]: 'normal',
        [r.siti.id]: 'normal',
        [r.dan.id]: 'normal',
      },
      horses: [r.ali.player.id, r.bea.player.id, r.siti.id, r.dan.id],
      bought: {},
      history: null,
    });
    expect(await phaseOf(r)).toBe('ODDS_LOCKED');
    expect(await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }))).toEqual(input);
  });

  it('is host-only and needs the shop open', async () => {
    const r = await shopRoom();
    expect(await fails(r.ali.client.rpc('lock_odds_begin', { p_room: r.room.id }))).toBe(
      'not_host',
    );
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(await fails(r.host.rpc('lock_odds_begin', { p_room: r.room.id }))).toBe('wrong_phase');
  });

  it('lock_odds_finish is service-only, needs odds for every horse and opens betting', async () => {
    const r = await shopRoom();
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(
      await fails(r.host.rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) })),
    ).toMatch(/permission denied/);

    const admin = adminClient();
    const partial = { [r.ali.player.id]: { win: 2, place: 1.2 } };
    expect(await fails(admin.rpc('lock_odds_finish', { p_race: r.raceId, p_odds: partial }))).toBe(
      'bad_odds',
    );
    const wild = Object.fromEntries(
      Object.keys(fixtureOdds(r)).map((id) => [id, { win: 0, place: 1.2 }]),
    );
    expect(await fails(admin.rpc('lock_odds_finish', { p_race: r.raceId, p_odds: wild }))).toBe(
      'bad_odds',
    );
    await ok(admin.rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    expect(await phaseOf(r)).toBe('BETTING');
    const [race] = await ok(r.host.from('races').select('odds').eq('id', r.raceId));
    expect(race.odds).toEqual(fixtureOdds(r));
  });
});

describe('start_race', () => {
  it('writes the result once and refuses a second Start', async () => {
    const r = await bettingRoom();
    expect(await fails(r.ali.client.rpc('start_race_begin', { p_room: r.room.id }))).toBe(
      'not_host',
    );
    const input = await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
    expect(input.horses).toHaveLength(4);

    const admin = adminClient();
    const finish = [r.bea.player.id, r.ali.player.id, r.siti.id, r.dan.id];
    const args = {
      p_race: r.raceId,
      p_timeline: { finishOrder: finish },
      p_finish: finish,
      p_seconds: 118.5,
    };
    await ok(admin.rpc('start_race_finish', args));
    expect(await fails(admin.rpc('start_race_finish', args))).toBe('wrong_phase');
    expect(await fails(r.host.rpc('start_race_begin', { p_room: r.room.id }))).toBe('wrong_phase');

    expect(await phaseOf(r)).toBe('RUNNING');
    const [race] = await ok(r.host.from('races').select('*').eq('id', r.raceId));
    expect(race.finish_order).toEqual(finish);
    expect(Date.parse(race.ends_at) - Date.parse(race.started_at)).toBeCloseTo(118_500, -1);
    const timelines = await ok(
      r.cal.client.from('race_timelines').select('timeline').eq('race_id', r.raceId),
    );
    expect(timelines).toEqual([{ timeline: { finishOrder: finish } }]);
  });

  it('rejects a finish order that is not exactly the field', async () => {
    const r = await bettingRoom();
    const short = [r.ali.player.id, r.bea.player.id];
    expect(
      await fails(
        adminClient().rpc('start_race_finish', {
          p_race: r.raceId,
          p_timeline: {},
          p_finish: short,
          p_seconds: 100,
        }),
      ),
    ).toBe('bad_result');
  });
});

describe('finish_race', () => {
  it('moves to PODIUM only after the race has run; Next race keeps the result', async () => {
    const r = await bettingRoom();
    const admin = adminClient();
    const finish = [r.siti.id, r.ali.player.id, r.bea.player.id, r.dan.id];
    await ok(
      admin.rpc('start_race_finish', {
        p_race: r.raceId,
        p_timeline: {},
        p_finish: finish,
        p_seconds: 100,
      }),
    );
    expect(await fails(r.host.rpc('finish_race', { p_room: r.room.id }))).toBe('race_not_finished');

    await ok(
      admin
        .from('races')
        .update({ ends_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', r.raceId),
    );
    expect(await fails(r.ali.client.rpc('finish_race', { p_room: r.room.id }))).toBe('not_host');
    expect((await ok(r.host.rpc('finish_race', { p_room: r.room.id }))).phase).toBe('PODIUM');

    const lobby = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    expect(lobby.race_id).toBeNull();
    expect(await ok(r.host.from('races').select('finish_order').eq('id', r.raceId))).toEqual([
      { finish_order: finish },
    ]);
  });
});
