# Traits v2, phone Guide, terrain tracks (2026-11-06)

Owner decisions (chat 2026-11-06): add Closer, Front-runner, Gambler, Brawler; rework Mudder so it
pays off whenever there is weather; no Climber/Daredevil. Clearer trait wording (UI is Claude's
call). A phone Guide covering every feature, kept current as features land. New tracks: Rolling
Downs, Summit Pass, Canyon Drop, Figure-8 Bridge, Forest Steeplechase, Seaside, Ice Ring (corners
slow you down: momentum).

## A. Wording and Guide

- `TRAIT_INFO[t]` becomes `{ icon, name, plus, minus }` (no digits, so tuning never changes text).
  The picker shows the chosen trait as two lines: `✅ plus` / `⚠️ minus`.
- `ITEM_INFO[item].desc`: one plain sentence per power-up.
- `src/play/Guide.tsx`: a `📖 Guide` button on every phone screen opens a full-screen `<dialog>` with
  sections: Race day, Boxes, Power-ups, Traits, Weather, Hot items, Tracks, Betting, Coins and looks
  (office), Badges. Built from the same tables the game uses (`ITEM_INFO`, `TRAIT_INFO`, `BADGES`,
  `PRICES`, `TRACKS`), so new entries appear automatically; prose sections are edited by hand.
- Rule: every user-facing feature change updates the Guide in the same change.

## B. Traits

Position effects use the previous tick's ranking (`bandOf`, front/middle/back third). No new RNG
draws for any trait, so a race without these traits replays exactly as before.

| Trait | Plus | Minus |
|---|---|---|
| 🏹 Closer | faster while in the back third | slower while in the front third |
| 🚩 Front-runner | faster while in the front third | slower while in the back third |
| 🎲 Gambler | rare upgrades (Stampede, Thunderclap) twice as likely | more duds from mystery boxes |
| 🥊 Brawler | attacks you throw last longer | your speed items last shorter |
| 🌧️ Mudder (reworked) | faster in rain or fog, rarely slips, fog bumps hurt less | slower on clear days |

Values live in `TRAITS` (config.ts) and are tuned by `balance.slow.test.ts` (every trait within
±15 % of Normal's win share). DB: trait check constraint + `set_trait` whitelist extended.

## C. Terrain tracks

- `RaceInput.track?: TrackId`; missing = Oval. Old tracks (Oval, Speedway, Kidney) stay flat, so old
  races and replays are unchanged.
- `src/sim/terrain.ts` (pure): per track, a list of segments over the lap
  (`{ from, to, kind, grade? }`, metres along the inner rail): `hill` (signed grade), `sand`,
  `ice` (a corner), `hurdle` (a point). Race metres map to lap metres as the renderer does
  (`finishS - distance + metres`).
- Pace: uphill `1 - UP * grade`, downhill `1 + DOWN * grade` (capped), sand and ice corners a flat
  slowdown. Hurdles: one stumble draw per horse per hurdle (Steeplechase only; Tough stumbles less).
- Renderers: Pixel 2D tints sand/ice, draws hurdles and hill shading; HD2D raises the track mesh by
  the height profile. Shapes: new closed curves in `track.ts`; Figure-8 crosses on a bridge.
- DB: track check constraints and `random` pick extended; `start_race_begin` and `lock-odds` pass
  the race's track into the sim.
