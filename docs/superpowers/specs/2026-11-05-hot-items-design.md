# Hot items (random events) — design

**Status:** approved by the owner 2026-11-05 (brainstorm). Sub-project C of the race-core expansion
(A cut-ins ✅, B weather ✅, C random events, D horse traits, E new items — each its own spec).

## Goal

Every race buffs 3 random powerups ("hot items"), announced when the shop opens, so buying a box
type becomes a choice: if the Carrot is hot today, Speed boxes are worth more.

## Decisions (owner)

- **3 hot items per race**, rolled when the shop opens, shown from shop to finish.
- **One buff each:** 🍀 **Lucky** (2× as likely to come out of its box) or ⏱️ **Extended** (effect
  lasts 50 % longer), 50/50. Shield and Mirror (no duration, held until used) always get Lucky.
- **Eligible:** the 14 non-dud items (4 speed incl. Stampede, 7 attack incl. Lasso, Swarm,
  Thunderclap, 3 defense). Duds are never hot.
- **Pick:** 3 different items, at most 2 from one box type.
- **Option:** an office switch **Hot items on/off** on `/admin`, next to Weather, on by default.
  Off = no hot items, races exactly as before.
- **Shown everywhere:** shop strip + 🔥 on box-type buttons, betting strip, 🔥 on in-race popups,
  occasional commentary, replays.

## Data flow

1. **Roll:** the race row is created when the host opens the shop (`set_phase` → SHOP, latest in
   `20261104000017_back_to_shop.sql`). That insert also rolls `races.hot_items jsonb not null
   default '[]'` in SQL (Postgres `random()`; hot items are public, no crypto needed) when
   `rooms.hot_items_enabled` is true. Shape: `[{ "item": "speed:self1", "buff": "lucky" }, …]`.
2. **Odds lock:** `private.race_input` returns `hot_items`; `lock-odds` passes it as `hot` to
   `simulateOdds`. **Race start:** `start-race` passes the same `hot` to `simulateRace`.
3. **Clients:** read `races.hot_items` with the race (shop, betting); playback reads `timeline.hot`.
4. Going back from betting to the shop keeps the same race row (`set_phase` updates it), so the hot
   items stay.

## Simulation (`src/sim`)

- Types: `HotBuff = 'lucky' | 'extended'`, `HotItem = { item: ItemCode; buff: HotBuff }`.
  `RaceInput.hot?: readonly HotItem[]` (missing/empty = none). `Timeline.hot?: readonly HotItem[]`.
  The `pickup` event gains optional `hot?: HotBuff` when the picked item is hot.
- **Determinism:** with no hot items the RNG draws and results are unchanged (fingerprint test).
  Lucky changes weights only; it never adds draws.
- **Lucky:** the item's weight in its roll is multiplied by `HOT.luckyWeight = 2`:
  - Speed / Defense box: uniform pick becomes weighted (Lucky Carrot: 2 of 4 instead of 1 of 3).
  - Attack: the band weight of that target doubles (impossible targets still removed).
  - Mystery-only rolls: Stampede chance `PASS3_CHANCE_PERCENT` 25 → 50, Thunderclap
    `THUNDERCLAP_CHANCE_PERCENT` 5 → 10 (×2, capped at 100).
- **Extended:** the item's effect seconds × `HOT.extendedFactor = 1.5`: speed boosts, attack
  slowdowns, Lucky Bubble immunity, Stampede's sprint window, each Golden Carrot burst.
- `validateRaceInput`: at most 3 entries, distinct items, no duds, buff valid, Extended only on
  items with `EFFECTS[item].seconds > 0`.
- Numbers in `config.ts` under `HOT` (`count: 3`, `maxPerType: 2`, `luckyWeight: 2`,
  `extendedFactor: 1.5`).

## Server

One migration:
- `rooms.hot_items_enabled boolean not null default true`; `races.hot_items jsonb not null default '[]'`.
- `set_phase` (SHOP insert) rolls the list: shuffle the 14 eligible items, take them in order while
  skipping any that would make a third of one type, stop at 3; buff `lucky`/`extended` at 50 %
  except Shield/Mirror → `lucky`.
- `private.race_input` returns `hot_items`.
- `admin_set_hot_items(boolean)` (service role) and `admin_overview` returns `hot_items_enabled`;
  admin Edge Function action `hot_items`.
- `RaceInputRow` + `database.types.ts` updated; redeploy `lock-odds`, `start-race`, `admin`.

## UI

- **Shop (big screen + phones):** "🔥 Hot items" strip, e.g. "🥕 Carrot 🍀 Lucky · 🪢 Golden Lasso
  ⏱️ Extended · 🛡️ Horseshoe Shield 🍀 Lucky", plus "🍀 2× more likely from its box · ⏱️ lasts 50 %
  longer". Phone Speed/Attack/Defense buy buttons show 🔥 when their type has a hot item (the
  strip says which).
- **Betting:** the same strip on the board and phones, next to the weather badge.
- **Admin:** "Hot items" on/off switch next to Weather.
- Nothing shows when the list is empty.

## Race

- Popups for a hot pickup read "🔥 🥕 Carrot"; the held-item icon over the horse gets a flame.
- Commentary: occasional ordinary line on a hot pickup ("Hot item! {h} grabs a Lucky Carrot!").
- Extended effects simply last longer on screen; effect durations are read from the extended value
  (`effects.ts` uses `EFFECTS` seconds today, so it must take the race's hot list into account).
- Cut-ins unchanged.
- **Replay:** hot strip from `timeline.hot`.

## Testing

- Sim: no hot items → same fingerprint; Lucky doubles shares (chi-square vs doubled weights,
  incl. Stampede/Thunderclap chances); Extended effect windows 1.5×; validation rejects bad lists;
  odds receive `hot`.
- DB: opening the shop gives 3 distinct eligible items, ≤ 2 per type, Shield/Mirror never Extended;
  switch off → `[]`; `race_input` carries the list; back-to-shop keeps it; admin switch is
  service-only.
- UI: strip text and type flags; commentary line; 🔥 popup; effect durations for Extended.
- Sandbox: a hot-items picker.
