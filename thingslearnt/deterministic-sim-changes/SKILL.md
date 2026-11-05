---
name: deterministic-sim-changes
description: Use when adding a feature (weather, buffs, traits, items) to a seeded, deterministic simulation whose stored results/replays must not change. Covers RNG discipline, fingerprint tests, odds pricing and balance tuning.
---

# Adding features to a deterministic simulation

Learnt building weather, hot items and horse traits on the Turf Club race sim (`src/sim`).

## Before touching the sim

1. **Record a fingerprint first.** Hash `JSON.stringify(simulateRace(...))` for a few fixed seeds
   with the current code, and hard-code that number in a test. After the change, the
   "feature off" path must produce the same number. This is the only reliable proof that old
   replays and existing seeds are untouched.
2. Strip new optional output keys (e.g. `weather`, `puddles`) before hashing, so the fingerprint
   compares the race itself.

## RNG discipline

- **Draw extra randomness only when the feature is active** (weather ≠ clear, a horse is Charmed,
  a box has a Lucky item). One extra `rng.nextInt` anywhere shifts every later draw.
- **Prefer changing weights over adding draws.** Doubling a weight inside an existing
  `pickWeighted` keeps one draw. But switching `pickOne` (nextInt(n)) to `pickWeighted`
  (nextInt(total)) changes the draw value, so only switch when the feature applies to that roll.
- Thresholds (`nextInt(100) < 25`) can be scaled (`< 50`) without changing the draw count.
- Place feature setup draws (e.g. puddle placement) **after** existing setup draws.

## Make new inputs/outputs optional

- `RaceInput.feature?` and `Timeline.feature?` optional; readers default (`?? 'clear'`, `?? []`).
  Old stored timelines then keep working everywhere (renderers, commentary, replays).
- Adding a new event type to a discriminated union breaks every exhaustive `switch` — run the
  typechecker right after adding the type to find all consumers.

## Odds and pricing

- If odds are computed by simulating and **averaging "equivalent" horses** (same boxes), any new
  per-horse attribute (trait) must join the equivalence key, or the odds silently ignore it.
- Pass the feature into the odds simulation and the real race from the **same stored value**
  (roll once server-side, store it, both read it).

## Fairness and balance

- Check exposure fairness (e.g. every lane meets the same number of puddles). Greedy windowed
  placement was uneven at the edges; **round-based tiling** (random offset per round, clipped edge
  blocks) gives exact equality.
- Write a slow balance test (many seeded races, conditions rotated so lane/length/weather don't
  bias) asserting each variant's win share within ±15 % of the baseline. Expect the first numbers
  to fail; tune magnitudes, keep the approved up/downside semantics. Guesses about which way to
  tune were wrong — measure.
- Measure per-race frequencies (slips, bumps, rare items) with a scratch script and compare with
  the design target before shipping.
- Watch for **no-op features**: an "Extended" Stampede did nothing because the effect ends on a
  distance target long before its time cap. Check what actually bounds an effect.
