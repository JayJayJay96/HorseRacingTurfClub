import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { member, officeRoom } from './officeFixtures.ts';
import { fixtureOdds, shopRoom } from './raceFixtures.ts';

describe('weather', () => {
  afterAll(async () => {
    await ok(adminClient().rpc('admin_set_weather', { p_on: true })); // leave the office default
  });

  it('race_input carries the switch and lock_odds_finish stores the weather', async () => {
    const r = await shopRoom();
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.weather_enabled).toBe(true);
    expect(input.weather).toBe('clear');
    await ok(
      adminClient().rpc('lock_odds_finish', {
        p_race: r.raceId,
        p_odds: fixtureOdds(r),
        p_weather: 'rain',
      }),
    );
    const [race] = await ok(r.host.from('races').select('weather').eq('id', r.raceId));
    expect(race.weather).toBe('rain');
    const again = await ok(r.host.rpc('start_race_begin', { p_room: r.room.id }));
    expect(again.weather).toBe('rain');
  });

  it('rejects an unknown weather', async () => {
    const r = await shopRoom();
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(
      await fails(
        adminClient().rpc('lock_odds_finish', {
          p_race: r.raceId,
          p_odds: fixtureOdds(r),
          p_weather: 'snow',
        }),
      ),
    ).toBe('bad_weather');
  });

  it('two-argument calls still mean clear', async () => {
    const r = await shopRoom();
    await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    await ok(adminClient().rpc('lock_odds_finish', { p_race: r.raceId, p_odds: fixtureOdds(r) }));
    const [race] = await ok(r.host.from('races').select('weather').eq('id', r.raceId));
    expect(race.weather).toBe('clear');
  });

  it('admin_set_weather is service-only and shows in the overview', async () => {
    const phone = await anonClient();
    expect(await fails(phone.rpc('admin_set_weather', { p_on: false }))).toMatch(
      /permission denied/,
    );
    const admin = adminClient();
    await ok(admin.rpc('admin_set_weather', { p_on: false }));
    const o = (await ok(admin.rpc('admin_overview'))) as { room: { weather_enabled: boolean } };
    expect(o.room.weather_enabled).toBe(false);
    await ok(admin.rpc('admin_set_weather', { p_on: true }));
  });

  it('the office switch off refuses rain but allows clear', async () => {
    const r = await officeRoom();
    const horses = [await member('W'), await member('W')];
    for (const h of horses)
      await ok(r.host.rpc('set_ticked', { p_player: h.player.id, p_ticked: true }));
    try {
      await ok(r.admin.rpc('admin_set_weather', { p_on: false }));
      const shop = await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
      await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
      const odds = Object.fromEntries(horses.map((h) => [h.player.id, { win: 2, place: 1.1 }]));
      expect(
        await fails(
          r.admin.rpc('lock_odds_finish', {
            p_race: shop.race_id,
            p_odds: odds,
            p_weather: 'rain',
          }),
        ),
      ).toBe('bad_weather');
      await ok(
        r.admin.rpc('lock_odds_finish', { p_race: shop.race_id, p_odds: odds, p_weather: 'clear' }),
      );
    } finally {
      await ok(r.admin.rpc('admin_set_weather', { p_on: true }));
    }
  });
});
