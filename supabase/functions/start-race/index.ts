import { raceAwards } from '../../../src/sim/awards.ts';
import { packTimeline } from '../../../src/sim/pack.ts';
import { playbackSeconds } from '../../../src/sim/playback.ts';
import { createCryptoRng } from '../../../src/sim/rng.ts';
import { simulateRace } from '../../../src/sim/simulate.ts';
import { rpc, serve, type RaceInputRow } from '../_shared/http.ts';

// BETTING -> crypto seed -> one simulation -> results, payouts and RUNNING in one transaction.
serve(async ({ room }, user, admin) => {
  const input = await rpc<RaceInputRow>(user, 'start_race_begin', { p_room: room });
  const seed = createCryptoRng().nextInt(2 ** 32);
  const timeline = simulateRace({ seed, horses: input.horses, bought: input.bought, length: input.length });
  await rpc(admin, 'start_race_finish', {
    p_race: input.race_id,
    p_timeline: packTimeline(timeline),
    p_finish: timeline.finishOrder,
    // ends_at covers the countdown, the race and the finish hold, so PODIUM comes after the replay.
    p_seconds: playbackSeconds(timeline),
    p_awards: raceAwards(timeline),
  });
  return { race: input.race_id };
});
