import { simulateOdds } from '../../../src/sim/odds.ts';
import { createCryptoRng } from '../../../src/sim/rng.ts';
import { rpc, serve, type RaceInputRow } from '../_shared/http.ts';

// SHOP -> ODDS_LOCKED (begin, as the host) -> odds from simulations -> BETTING (finish, service role).
serve(async ({ room }, user, admin) => {
  const input = await rpc<RaceInputRow>(user, 'lock_odds_begin', { p_room: room });
  const { odds, sims } = simulateOdds(input, createCryptoRng());
  await rpc(admin, 'lock_odds_finish', { p_race: input.race_id, p_odds: odds });
  return { sims };
});
