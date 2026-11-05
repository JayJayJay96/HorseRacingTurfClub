# Weather — design

**Status:** approved by the owner 2026-11-05 (brainstorm). Sub-project B of the race-core expansion
(A cut-ins ✅, B weather, C random events, D horse traits, E new items — each its own spec).

## Goal

Some races run in rain or fog. Weather changes the race (slips, bumps), is known before betting so
the odds include it, and sets a mood on the big screen without ever hiding the horses.

## Decisions (owner)

- **Weathers:** Clear 50 %, 🌧️ Rain 25 %, 🌫️ Fog 25 %.
- **Rain:** wide puddles, each across **3 adjacent lanes**. A horse running into one has a **15 %**
  chance to slip: **0.5× speed for 1.5 s**.
- **Fog:** horses side by side in neighbouring lanes can bump: **both 0.7× for 1 s**.
- **Items don't touch weather:** shields and mirrors never block a slip or a bump; boosts don't skip
  puddles. (A later "Mudder" trait, sub-project D, is the rain specialist.)
- **Look:** weather layers on top of the seed's lighting (afternoon / sunset / night). Light touch:
  vibe only, horses always clearly visible.
- **Shown everywhere betting happens:** badge on the big screen and phones from odds lock, a
  commentator line, kept in history and replays.
- **Option:** an office setting **Weather on/off** (admin page), on by default. Off = always Clear.
- **HD-2D puddle reflections:** horses are mirrored in the puddles they run through.

## Data flow

1. **Setting:** `rooms.weather_enabled boolean not null default true`, toggled from the admin page
   (admin RPC, same guard as the other admin actions).
2. **Odds lock:** `lock_odds_begin` → `private.race_input` also returns `weather_enabled`. The
   `lock-odds` Edge Function rolls the weather with `createCryptoRng()` (`rollWeather(rng, enabled)`
   in `src/sim/weather.ts`), runs `simulateOdds({ ...input, weather }, …)`, and passes it to
   `lock_odds_finish(p_race, p_odds, p_weather)`, which validates it (`clear|rain|fog`) and stores
   `races.weather text not null default 'clear'`. A retried lock re-rolls; safe, nobody saw the odds.
3. **Race start:** `private.race_input` returns `races.weather`; `start-race` passes it to
   `simulateRace`. Odds and race always share the weather.
4. **Clients:** `races.weather` is read with the race (badge from `ODDS_LOCKED` on); playback reads
   `timeline.weather`.

## Simulation (`src/sim`)

- `RaceInput.weather?: Weather` (`'clear' | 'rain' | 'fog'`, default `'clear'`).
- `Timeline` gains `weather: Weather` and `puddles: readonly Puddle[]`,
  `Puddle = { at: number /* metres, start edge */; lanes: readonly [number, number] /* inclusive */ }`.
  Old stored timelines lack both: readers treat missing as `'clear'` / `[]`.
- New events: `{ t, type: 'slip', horse }` and `{ t, type: 'bump', horse, with }` (one event per
  bump, `horse` = lower lane).
- **Determinism:** weather draws come from the race RNG **only when weather ≠ clear**, so clear
  races, old replays and every existing seed test are unchanged.
- **Rain puddles:** `PUDDLE_LENGTH_M = 4`. Per-lane quota `PUDDLES_PER_LANE {short: 3, long: 5}`;
  total puddles `ceil(lanes × quota / 3)`. Each puddle is placed over the 3-lane window that
  includes the lane with the fewest puddles so far (ties random), at a random distance inside
  `BOX_ZONE`, not overlapping any box in its lanes (±2 m) nor another puddle in those lanes. Fewer than
  3 horses: the puddle spans all lanes. Placement retries a bounded number of times, then drops
  that puddle.
- **Slip:** the first tick a horse is inside a puddle, roll `SLIP_CHANCE_PERCENT = 15`; on a slip,
  apply a timed effect `{ mult: 0.5, seconds: 1.5 }` and emit `slip`.
- **Fog bumps:** every tick, for each pair in neighbouring lanes, both racing, within
  `BUMP_RANGE_M = 2`, and not bumped together in the last `BUMP_COOLDOWN_S = 3`: chance
  `BUMP_PER_SECOND = 0.02`, rolled as `BUMP_PER_SECOND / TICK_HZ` per tick. On a bump both get
  `{ mult: 0.7, seconds: 1 }`; emit `bump`.
- Weather effects stack with item effects the same way item effects stack with each other. No
  defense interaction.
- All numbers in `config.ts` under `WEATHER`, plus `WEATHER_WEIGHTS { clear: 50, rain: 25, fog: 25 }`.
- `validateRaceInput` accepts `weather`.

## Server

One migration:
- `rooms.weather_enabled`, `races.weather` (with check constraint).
- `private.race_input` returns `weather_enabled` and `weather`.
- `lock_odds_finish(uuid, jsonb, text)` replaces the 2-arg version (old one dropped; grant to
  service_role only).
- Admin RPC to set `weather_enabled`.
- `RaceInputRow` (`supabase/functions/_shared`) and `database.types.ts` updated.
- Redeploy `lock-odds` and `start-race` (both bundle `src/sim`), then Vercel.

## UI

- **Badge:** "🌧️ Rain · horses may slip" / "🌫️ Fog · horses may bump" beside the race title on the
  track page and the phone play page, from `ODDS_LOCKED`. Clear shows nothing.
- **Admin page:** a "Weather" on/off switch for the office.
- **Commentary:** a line at the gun for rain/fog; occasional lines on slip/bump (existing
  commentator throttling).
- **History / replays:** weather icon from `races.weather` / the timeline.
- Phones' mini oval: no weather visuals.

## Rendering

Light touch everywhere; the pack and leaders are never obscured.

**HD-2D**
- Puddles: dark, slightly glossy decals on the track, spanning their lanes.
- **Reflections:** puddle meshes write the stencil buffer; each horse has one mirrored copy of its
  sprite (texture cloned from the horse sheet, like the Stampede ghosts) at ~40 % opacity with a
  blue tint, drawn only where the stencil marks a puddle, so it appears on entering the water and is
  clipped at the puddle edge. A small horizontal wobble plus a ripple ring under the hooves. Only
  horses near a puddle draw it (max one extra sprite per horse).
- Rain: one sparse layer of thin streak particles and a slight grey tint over the preset lighting.
- Fog: soft scene fog reaching only the far course; near pack stays crisp.
- `splash` effect (water particles) on `slip`, with the trip-style stumble pose; `bonk` effect (small
  yellow star between the two horses) on `bump`.

**2D**
- Puddles as blue-grey ellipses; faint rain streak layer; soft white haze gradient at the top. No
  reflection. Splash and bonk drawn from the same `effectsOf`/`particlesOf`.

**Reduced motion:** no rain streaks, no reflection wobble, small splashes.

## Sound

- New SFX `splash` (slip) and `bonk` (bump), queued by `raceCues`.
- Soft looping rain hiss during rain races, under the existing sound toggle.

## Testing

- `weather.test.ts` / `simulate.test.ts`:
  - clear race timeline identical to before for a fixed seed (no extra RNG draws);
  - puddles span 3 lanes, sit in `BOX_ZONE`, avoid boxes, per-lane counts within ±1;
  - slip rate ≈ 15 % over many entries; slips only inside puddles;
  - bumps only between neighbouring lanes within range, cooldown respected;
  - `rollWeather` weights (chi-square, existing helper) and off → always clear.
- `odds.test.ts`: weather reaches the odds simulations.
- DB tests: `weather_enabled` off → clear; weather stored at odds lock equals the one the race
  starts with; bad weather rejected.
- `effects.test.ts`: splash/bonk from events, particles finite. `raceCues.test.ts`: splash/bonk.
- Sandbox: Weather picker (Clear / Rain / Fog), "Slip" and "Bump" moment buttons; screenshots in 2D
  and HD-2D, day and night, including a reflection frame.
