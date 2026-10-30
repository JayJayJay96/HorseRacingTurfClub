import { describe, expect, it } from 'vitest';
import { ODDS } from '../../src/sim/odds.ts';
import { anonClient, failsInvoke, guestClient, invoke, ok } from './helpers.ts';
import { balance, shopRoom } from './raceFixtures.ts';

type Bet = { horse_id: string; kind: string; stake: number; odds: number; payout: number };

describe('lock-odds and start-race', () => {
  it('runs a whole race: odds, bets, exactly one Start, payouts', { timeout: 60_000 }, async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));

    const { sims } = await invoke<{ sims: number }>(r.host, 'lock-odds', { room: r.room.id });
    expect(sims).toBeGreaterThanOrEqual(ODDS.minSims);
    const [race] = await ok(r.host.from('races').select('*').eq('id', r.raceId));
    expect(race.horses).toEqual([r.ali.player.id, r.bea.player.id, r.siti.id]);
    for (const id of race.horses) {
      const line = race.odds[id];
      expect(line.win).toBeGreaterThanOrEqual(ODDS.win.min);
      expect(line.win).toBeLessThanOrEqual(ODDS.win.max);
      expect(line.place).toBe(ODDS.place.min); // everyone places in a 3-horse race
    }

    const bet = (horse: string, kind: string, stake: number) =>
      ok(r.cal.client.rpc('place_bet', { p_room: r.room.id, p_horse: horse, p_kind: kind, p_stake: stake }));
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

    const [stored] = await ok(r.cal.client.from('race_timelines').select('timeline').eq('race_id', r.raceId));
    expect(stored.timeline.finishOrder).toEqual(done.finish_order);
    expect(stored.timeline.progressDm[r.ali.player.id].length).toBeGreaterThan(100);
  });

  it('refuses non-hosts, signed-out callers and wrong phases', { timeout: 60_000 }, async () => {
    const r = await shopRoom();
    expect(await failsInvoke(r.ali.client, 'lock-odds', { room: r.room.id })).toBe('not_host');
    expect(await failsInvoke(guestClient(), 'lock-odds', { room: r.room.id })).toMatch(/permission denied/);
    expect(await failsInvoke(r.host, 'start-race', { room: r.room.id })).toBe('wrong_phase');

    const other = await anonClient();
    const lobby = await ok(other.rpc('create_room', {}));
    expect(await failsInvoke(other, 'lock-odds', { room: lobby.id })).toBe('wrong_phase');
  });
});
