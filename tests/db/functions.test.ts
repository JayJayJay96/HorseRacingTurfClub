import { describe, expect, it } from 'vitest';
import { ODDS } from '../../src/sim/odds.ts';
import { raceAwards } from '../../src/sim/awards.ts';
import { unpackTimeline, type PackedTimeline } from '../../src/sim/pack.ts';
import { playbackSeconds } from '../../src/sim/playback.ts';
import { adminClient, anonClient, failsInvoke, guestClient, invoke, ok } from './helpers.ts';
import { adminPassword, member, officeRoom } from './officeFixtures.ts';
import { balance, shopRoom } from './raceFixtures.ts';

type Bet = { horse_id: string; kind: string; stake: number; odds: number; payout: number };

describe('lock-odds and start-race', () => {
  it('runs a whole race: odds, bets, exactly one Start, payouts', { timeout: 60_000 }, async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));

    const { sims } = await invoke<{ sims: number }>(r.host, 'lock-odds', { room: r.room.id });
    expect(sims).toBeGreaterThanOrEqual(ODDS.minSims);
    const [race] = await ok(r.host.from('races').select('*').eq('id', r.raceId));
    expect(race.horses).toEqual([r.ali.player.id, r.bea.player.id, r.siti.id, r.dan.id]);
    for (const id of race.horses) {
      const line = race.odds[id];
      expect(line.win).toBeGreaterThanOrEqual(ODDS.win.min);
      expect(line.win).toBeLessThanOrEqual(ODDS.win.max);
      expect(line.place).toBeGreaterThanOrEqual(ODDS.place.min);
      expect(line.place).toBeLessThanOrEqual(ODDS.place.max);
    }

    const bet = (horse: string, kind: string, stake: number) =>
      ok(
        r.cal.client.rpc('place_bet', {
          p_room: r.room.id,
          p_horse: horse,
          p_kind: kind,
          p_stake: stake,
        }),
      );
    await bet(r.siti.id, 'win', 40);
    await bet(r.ali.player.id, 'place', 60);

    const results = await Promise.allSettled([
      invoke(r.host, 'start-race', { room: r.room.id }),
      invoke(r.host, 'start-race', { room: r.room.id }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as Error).message).toBe('wrong_phase');

    const [done] = await ok(r.host.from('races').select('*').eq('id', r.raceId));
    expect([...done.finish_order].sort()).toEqual([...race.horses].sort());
    const bets = (await ok(r.cal.client.from('bets').select('*').eq('race_id', r.raceId))) as Bet[];
    for (const b of bets) {
      const won =
        b.kind === 'win'
          ? done.finish_order[0] === b.horse_id
          : done.finish_order.slice(0, 3).includes(b.horse_id);
      expect(b.payout).toBe(won ? Math.round(b.stake * b.odds) : 0);
    }
    const paid = bets.reduce((sum, b) => sum + b.payout, 0);
    expect(await balance(r.cal.client, r.raceId, r.cal.player.id)).toBe(100 - 40 - 60 + paid);

    const [stored] = await ok(
      r.cal.client.from('race_timelines').select('timeline').eq('race_id', r.raceId),
    );
    expect(stored.timeline.finishOrder).toEqual(done.finish_order);
    expect(stored.timeline.progressDm[r.ali.player.id].length).toBeGreaterThan(100);
    const span = (Date.parse(done.ends_at) - Date.parse(done.started_at)) / 1000;
    expect(span).toBeCloseTo(playbackSeconds(stored.timeline as PackedTimeline), 2);
  });

  it('refuses non-hosts, signed-out callers and wrong phases', { timeout: 60_000 }, async () => {
    const r = await shopRoom();
    expect(await failsInvoke(r.ali.client, 'lock-odds', { room: r.room.id })).toBe('not_host');
    expect(await failsInvoke(guestClient(), 'lock-odds', { room: r.room.id })).toMatch(
      /permission denied/,
    );
    expect(await failsInvoke(r.host, 'start-race', { room: r.room.id })).toBe('wrong_phase');

    const other = await anonClient();
    const lobby = await ok(other.rpc('create_room', {}));
    expect(await failsInvoke(other, 'lock-odds', { room: lobby.id })).toBe('wrong_phase');
  });
});

describe('admin function', () => {
  it('needs the password', { timeout: 30_000 }, async () => {
    const phone = await anonClient();
    expect(await failsInvoke(phone, 'admin', { password: 'nope', action: 'overview' })).toBe(
      'bad_password',
    );
  });

  it(
    'runs actions and unlocks the big screen for the calling device',
    { timeout: 30_000 },
    async () => {
      const { room } = await officeRoom();
      const m = await member('F');
      const screen = await anonClient();
      const password = adminPassword();
      const o = await invoke<{ members: { id: string }[] }>(screen, 'admin', {
        password,
        action: 'overview',
      });
      expect(o.members.map((x) => x.id)).toContain(m.player.id);
      await invoke(screen, 'admin', { password, action: 'claim_host' });
      expect(await ok(screen.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
      expect(await failsInvoke(screen, 'admin', { password, action: 'fly' })).toBe('bad_action');
    },
  );

  it('lock-odds prices an office race (with history)', { timeout: 60_000 }, async () => {
    const { host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b])
      await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await invoke(host, 'lock-odds', { room: room.id });
    const [race] = await ok(host.from('races').select('odds').eq('id', shop.race_id));
    expect(Object.keys(race.odds)).toEqual(expect.arrayContaining([a.player.id, b.player.id]));
  });

  it('start-race awards badges in an office race', { timeout: 60_000 }, async () => {
    const { host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b])
      await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await invoke(host, 'lock-odds', { room: room.id });
    await invoke(host, 'start-race', { room: room.id });
    const [race] = await ok(
      adminClient().from('races').select('finish_order').eq('id', shop.race_id),
    );
    const badges = (await ok(
      adminClient()
        .from('badges')
        .select('player_id, badge')
        .in('player_id', [a.player.id, b.player.id]),
    )) as { player_id: string; badge: string }[];
    expect(badges).toContainEqual({ player_id: race.finish_order[0], badge: 'first_win' });
    // Event badges are random, so check they match the stored timeline (comeback is left out:
    // the stored timeline is resampled, which can shift who was last at halfway).
    const [stored] = await ok(
      adminClient().from('race_timelines').select('timeline').eq('race_id', shop.race_id),
    );
    const awards = raceAwards(unpackTimeline(stored.timeline as PackedTimeline));
    for (const badge of ['photo_finish', 'banana_king', 'untouchable', 'sniper'] as const) {
      expect(
        badges
          .filter((x) => x.badge === badge)
          .map((x) => x.player_id)
          .sort(),
      ).toEqual([...awards[badge]].sort());
    }
  });
});
