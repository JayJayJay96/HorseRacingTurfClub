import { simulateOdds } from '../../../src/sim/odds.ts';
import { createCryptoRng } from '../../../src/sim/rng.ts';
import { rollWeather } from '../../../src/sim/weather.ts';
import { rpc, serve, type RaceInputRow } from '../_shared/http.ts';

// SHOP -> ODDS_LOCKED (begin, as the host) -> weather, then odds from simulations with it ->
// BETTING (finish, service role). A retry re-rolls the weather: nobody has seen it yet.
serve(async ({ room }, user, admin) => {
  const input = await rpc<RaceInputRow>(user, 'lock_odds_begin', { p_room: room });
  const rng = createCryptoRng();
  const weather = rollWeather(rng, input.weather_enabled);
  const { odds, groups, sims } = simulateOdds(
    { horses: input.horses, bought: input.bought, length: input.length, weather },
    rng,
    undefined,
    input.history ?? undefined,
  );
  // Group odds (Odd/Even/Low/High) ride along under their own key; horse ids are uuids.
  await rpc(admin, 'lock_odds_finish', {
    p_race: input.race_id,
    p_odds: { ...odds, groups },
    p_weather: weather,
  });
  return { sims, weather };
});
