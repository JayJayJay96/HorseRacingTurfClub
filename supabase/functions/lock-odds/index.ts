import { simulateOdds } from '../../../src/sim/odds.ts';
import { createCryptoRng } from '../../../src/sim/rng.ts';
import { rpc, serve, type RaceInputRow } from '../_shared/http.ts';

// SHOP -> ODDS_LOCKED (begin, as the host) -> odds from simulations -> BETTING (finish, service role).
serve(async ({ room }, user, admin) => {
  const input = await rpc<RaceInputRow>(user, 'lock_odds_begin', { p_room: room });
  const { odds, groups, sims } = simulateOdds(
    input,
    createCryptoRng(),
    undefined,
    input.history ?? undefined,
  );
  // Group odds (Odd/Even/Low/High) ride along under their own key; horse ids are uuids.
  await rpc(admin, 'lock_odds_finish', { p_race: input.race_id, p_odds: { ...odds, groups } });
  return { sims };
});
