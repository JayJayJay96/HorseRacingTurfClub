import { describe, expect, it } from 'vitest';
import { PRICES } from '../../src/sim/config.ts';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balance, bettingRoom, fixtureOdds, shopRoom } from './raceFixtures.ts';

describe('buy_box', () => {
  it('charges PRICES and records the box', async () => {
    const r = await shopRoom();
    const c = r.ali.client;
    const bought = await ok(c.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));
    expect(bought).toMatchObject({ player_id: r.ali.player.id, box: 'speed', price: PRICES.speed });
    const attack = await ok(c.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    expect(attack.price).toBe(PRICES.attack);
    expect(await balance(c, r.raceId, r.ali.player.id)).toBe(100 - PRICES.speed - PRICES.attack);
    expect(await fails(c.rpc('buy_box', { p_room: r.room.id, p_box: 'defense' }))).toBe(
      'not_enough_coins',
    );
  });

  it('prices defense from PRICES too', async () => {
    const r = await shopRoom();
    const bought = await ok(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'defense' }));
    expect(bought.price).toBe(PRICES.defense);
  });

  it('allows at most 3 boxes', async () => {
    const r = await shopRoom();
    for (let i = 0; i < 3; i++) {
      await ok(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    }
    expect(await fails(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'max_boxes',
    );
  });

  it('is for racing phones while the shop is open', async () => {
    const r = await shopRoom();
    expect(await fails(r.cal.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'not_racing',
    );
    const stranger = await anonClient();
    expect(await fails(stranger.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'not_in_room',
    );
    expect(await fails(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'turbo' }))).toBe(
      'bad_box',
    );
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(await fails(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }))).toBe(
      'wrong_phase',
    );
  });

  it('feeds bought boxes into the race input', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    await ok(r.bea.client.rpc('buy_box', { p_room: r.room.id, p_box: 'defense' }));
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.bought).toEqual({
      [r.ali.player.id]: ['speed', 'attack'],
      [r.bea.player.id]: ['defense'],
    });
  });
});

describe('place_bet and cancel_bet', () => {
  it('takes the stake at the frozen odds; cancelling refunds it in full', async () => {
    const r = await bettingRoom();
    const c = r.cal.client;
    const bet = await ok(
      c.rpc('place_bet', {
        p_room: r.room.id,
        p_horse: r.bea.player.id,
        p_kind: 'win',
        p_stake: 30,
      }),
    );
    expect(bet).toMatchObject({ stake: 30, odds: 3, payout: null, player_id: r.cal.player.id });
    expect(await balance(c, r.raceId, r.cal.player.id)).toBe(70);

    await ok(c.rpc('cancel_bet', { p_bet: bet.id }));
    expect(await balance(c, r.raceId, r.cal.player.id)).toBe(100);
    const types = await ok(
      c
        .from('coin_ledger')
        .select('type')
        .eq('race_id', r.raceId)
        .eq('player_id', r.cal.player.id)
        .order('id'),
    );
    expect(types.map((t: { type: string }) => t.type)).toEqual(['topup', 'bet', 'unbet']);
    expect(await ok(c.from('bets').select('id').eq('id', bet.id))).toEqual([]);
  });

  it('validates stake, kind, horse and ownership', async () => {
    const r = await bettingRoom();
    const c = r.cal.client;
    const bet = (horse: string, kind: string, stake: number) =>
      c.rpc('place_bet', { p_room: r.room.id, p_horse: horse, p_kind: kind, p_stake: stake });
    expect(await fails(bet(r.ali.player.id, 'win', 0))).toBe('bad_stake');
    expect(await fails(bet(r.ali.player.id, 'win', 101))).toBe('not_enough_coins');
    expect(await fails(bet(r.ali.player.id, 'show', 10))).toBe('bad_bet');
    expect(await fails(bet(r.cal.player.id, 'win', 10))).toBe('not_in_race');

    const mine = await ok(bet(r.ali.player.id, 'win', 10));
    expect(await fails(r.ali.client.rpc('cancel_bet', { p_bet: mine.id }))).toBe('bet_not_found');
  });

  it('refuses Place bets when 3 or fewer horses race', async () => {
    const r = await shopRoom();
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'LOBBY' }));
    await ok(r.host.rpc('set_ticked', { p_player: r.dan.id, p_ticked: false }));
    const room = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    const { [r.dan.id]: _, ...odds } = fixtureOdds(r);
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    await ok(adminClient().rpc('lock_odds_finish', { p_race: room.race_id, p_odds: odds }));
    const bet = (kind: string) =>
      r.cal.client.rpc('place_bet', {
        p_room: r.room.id,
        p_horse: r.ali.player.id,
        p_kind: kind,
        p_stake: 10,
      });
    expect(await fails(bet('place'))).toBe('bad_bet');
    await ok(bet('win'));
  });

  it('needs the BETTING phase', async () => {
    const r = await shopRoom();
    expect(
      await fails(
        r.cal.client.rpc('place_bet', {
          p_room: r.room.id,
          p_horse: r.ali.player.id,
          p_kind: 'win',
          p_stake: 10,
        }),
      ),
    ).toBe('wrong_phase');
  });

  it('pays winners at Start in the same transaction', async () => {
    const r = await bettingRoom();
    const bet = (who: typeof r.ali, horse: string, kind: string, stake: number) =>
      ok(
        who.client.rpc('place_bet', {
          p_room: r.room.id,
          p_horse: horse,
          p_kind: kind,
          p_stake: stake,
        }),
      );
    const aliWin = await bet(r.ali, r.ali.player.id, 'win', 10); // Ali finishes 2nd: lost
    const aliPlace = await bet(r.ali, r.bea.player.id, 'place', 20); // Bea 1st: 20 × 1.2 = 24
    await bet(r.bea, r.siti.id, 'win', 30); // Siti 3rd: lost
    await bet(r.bea, r.siti.id, 'place', 10); // 10 × 1.6 = 16

    const finish = [r.bea.player.id, r.ali.player.id, r.siti.id, r.dan.id];
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: r.raceId,
        p_timeline: {},
        p_finish: finish,
        p_seconds: 100,
      }),
    );
    expect(await balance(r.ali.client, r.raceId, r.ali.player.id)).toBe(100 - 10 - 20 + 24);
    expect(await balance(r.bea.client, r.raceId, r.bea.player.id)).toBe(100 - 30 - 10 + 16);
    expect(await balance(r.cal.client, r.raceId, r.cal.player.id)).toBe(100);

    const payouts = await ok(
      r.ali.client.from('bets').select('id, payout').eq('player_id', r.ali.player.id),
    );
    expect(payouts).toContainEqual({ id: aliWin.id, payout: 0 });
    expect(payouts).toContainEqual({ id: aliPlace.id, payout: 24 });
    expect(await fails(r.ali.client.rpc('cancel_bet', { p_bet: aliPlace.id }))).toBe('wrong_phase');
  });
});

describe('back to the shop', () => {
  it('refunds bets and clears the odds; boxes stay and the race can be re-priced', async () => {
    const r = await shopRoom();
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'attack' }));
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    await ok(
      r.cal.client.rpc('place_bet', {
        p_room: r.room.id,
        p_horse: r.bea.player.id,
        p_kind: 'win',
        p_stake: 30,
      }),
    );

    const room = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    expect(room).toMatchObject({ phase: 'SHOP', race_id: r.raceId });
    expect(await balance(r.cal.client, r.raceId, r.cal.player.id)).toBe(100);
    expect(await balance(r.ali.client, r.raceId, r.ali.player.id)).toBe(100 - PRICES.attack);
    expect(await ok(adminClient().from('bets').select('id').eq('race_id', r.raceId))).toEqual([]);
    const [race] = await ok(adminClient().from('races').select('horses, odds').eq('id', r.raceId));
    expect(race).toEqual({ horses: [], odds: null });

    // The shop works again, and Lock odds prices the new field.
    await ok(r.ali.client.rpc('buy_box', { p_room: r.room.id, p_box: 'speed' }));
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
  });

  it('is only for the host, and not once the race runs', async () => {
    const r = await bettingRoom();
    expect(await fails(r.ali.client.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }))).toBe(
      'not_host',
    );
    await ok(
      adminClient().rpc('start_race_finish', {
        p_race: r.raceId,
        p_timeline: {},
        p_finish: [r.ali.player.id, r.bea.player.id, r.siti.id, r.dan.id],
        p_seconds: 60,
        p_awards: {},
      }),
    );
    expect(await fails(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }))).toBe(
      'bad_transition',
    );
  });
});
