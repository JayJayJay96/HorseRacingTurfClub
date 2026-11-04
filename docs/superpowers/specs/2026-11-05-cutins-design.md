# Cut-ins and special-item animations — design

**Status:** approved by the owner 2026-11-05 (brainstorm). Sub-project A of the race-core expansion
(A cut-ins, B weather, C random events, D horse traits, E new items — each its own spec).

## Goal

The rare, game-changing items get a big moment on the big screen: a cut-in band (the
"move animation" from monster-catching games: a diagonal band with the user's portrait and the
move name) plus an in-race animation. Every special attack also gets an in-race animation.

## Decisions (owner)

- **Box counts unchanged:** 8 per lane short, 12 long.
- **Cut-in items:** 🌩️ Thunderclap (`attack:all`), 🪢 Golden Lasso (`attack:leader`),
  🐎 Stampede (`speed:pass3`). Priority in that order. Bought or mystery, both count.
- **Cooldown:** at most one cut-in every **12 s**; a higher-priority item within **1 s** of a
  candidate replaces it. Skipped moments lose only the cut-in, never the in-race animation.
- **🐝 Hornet Swarm** (`attack:top3`): in-race animation only, no cut-in.
- **The race keeps running** under the cut-in (shared clock; no pause or slow motion).
- **Band position:** top ~20 % of the race view (stands and infield; the pack sits mid/bottom).
- **Screens:** big screen only, both renderers (2D and HD-2D). Phones show only the mini oval.

## Architecture

No sim, server, database or Edge Function change: everything is derived from the stored
timeline at playback, so old replays get it too. Ships as a normal Vercel deploy.

### `src/render/cutins.ts` (pure)

`cutinsOf(timeline): CutIn[]`, `CutIn = { t, horse, item }`, memoised per timeline (WeakMap).
Walk `pickup` events with a cut-in item in time order. A candidate is taken when `t >= nextFree`;
then any higher-priority candidate with `t <= taken.t + 1` replaces it (highest priority wins,
earliest among equals). After a take, `nextFree = taken.t + 12`. Also `cutinAt(cutins, t)` for the
one showing at race time `t` (`t0 <= t < t0 + CUTIN_SECONDS`, `CUTIN_SECONDS = 1.3`).

### `src/render/CutInOverlay.tsx`

A DOM overlay over the race canvas (inside `.race-frame`, which becomes `position: relative`), so
it works on both renderers and stays sharp (no tilt blur or bloom). Driven by `useRaceTime`
(4 Hz) for which cut-in is active, keyed per cut-in so its CSS animation starts once, with a
negative `animation-delay` of `-(t - cutin.t)` so a late tick lands mid-animation, not at the
start.

- Diagonal band across the top ~20 %, in the horse's silk colour with speed lines.
- The horse's pixel portrait (the 2D sprite `drawHorse`, side pose, drawn at size 4 into a small
  canvas, with the sheet outline), the horse name, the move name and the item icon, in the pixel
  font.
- 0.2 s slide in, 0.9 s hold, 0.2 s slide out. Reduced motion: no slide, appears and disappears.
- `aria-hidden` (the live standings announcement already covers the race); the
  Fullscreen/HD chips fade while a band shows.
- **Thunderclap flash:** every Thunderclap pickup (cut-in or not) also flashes the whole race view
  white for 0.25 s in this overlay (both renderers). Reduced motion: a softer, shorter flash.

### Sound

New SFX `cutin` (rising square arpeggio plus a noise sweep), queued by `raceCues` when a cut-in
starts and added to its `prioritise` list so a pile-up never drops it.

### In-race animations

The HD-2D effects system (`effects.ts`: events → timed effects → particles in the horse's frame)
gets four kinds. Effects gain an optional duration (`seconds`) so a blocked attack plays only its
incoming part. The 2D renderer reuses the same `effectsOf`/`particlesOf` for these four kinds,
projecting the particles to screen pixels (existing 2D effects unchanged).

| Kind | From events | Duration | Look |
|---|---|---|---|
| `stampede` | `pickup speed:pass3` on the user | 8 s | dust low behind the horse; plus ghost horses (below) |
| `thunder` | `hit`/`blocked`/`reflected` `attack:all` on each target | 1.5 s hit, 0.5 s otherwise | a white-yellow bolt column from high above down onto the horse, then sparks |
| `lasso` | `hit`/`blocked`/`reflected` `attack:leader` on the leader | 2.4 s hit, 0.5 s otherwise | a gold arc flying in from behind (0–0.4 s), then a spinning gold loop round the horse |
| `swarm` | `hit`/`blocked`/`reflected` `attack:top3` on each target | 3.5 s hit, 0.6 s otherwise | yellow/black dots flying in from behind, then orbiting the head |

Blocked or reflected: the short duration shows the incoming part, then the existing shield or
mirror effect plays, so viewers see why it failed.

**Stampede ghosts:** 3 faded copies of the stampeding horse 3/6/9 m behind it while the effect
runs. HD-2D: a pool of 6 ghost meshes (2 concurrent stampedes) textured from the horse sheet with
that horse's cell, 35 % opacity. 2D: faded `drawHorse` copies at the same offsets.

Effects stay capped (`MAX_FX`, raised to 96 for 22-horse Thunderclaps).

## Testing

- `cutins.test.ts`: cooldown, priority inside the 1 s window, earliest among equal priority,
  skipped items, non-cut-in items ignored, empty race, `cutinAt` window.
- `effects.test.ts`: the four kinds from events, hit vs blocked durations, particles finite, the
  lasso and swarm phases.
- `raceCues.test.ts`: `cutin` queued at a cut-in and kept by `prioritise`.
- Sandbox: a "Moment" picker (Thunderclap, Golden Lasso, Stampede, Hornet Swarm) that finds a
  seed with that moment and starts the race 4 s before it; screenshots in 2D and HD, day and night.
