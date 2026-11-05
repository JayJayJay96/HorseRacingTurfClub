# Horse traits — design

**Status:** approved by the owner 2026-11-05 (brainstorm). Sub-project D of the race-core expansion
(A cut-ins ✅, B weather ✅, C hot items, D horse traits, E new items — each its own spec). Built and
deployed together with C (`2026-11-05-hot-items-design.md`): same item-roll and effect code, same
migration.

## Goal

Each race, every player picks a trait for their horse in the shop, after seeing the hot items. Every
trait has a clear upside and a small downside; Normal stays balanced; the odds price traits in.

## Decisions (owner)

- **Picked per race on the phone during the shop, free**, changeable until odds lock. Host-typed
  horses (no phone) run Normal.
- **Six traits:**

| Trait | Upside | Downside |
|---|---|---|
| ⚖️ Normal | — | — |
| 🧿 Charmed | mystery boxes give duds about half as often | never gets the rare Stampede/Thunderclap upgrade |
| 🛡️ Tough | slowdowns 30 % weaker | boosts 30 % weaker |
| ⚡ Sprinter | +4 % pace over the first third | finishing kick +5 % instead of +10 % |
| 🐢 Stayer | finishing kick +15 % and 1 s longer | −3 % pace over the first third |
| 🌧️ Mudder | rain slip 5 % instead of 15 %; fog bump chance halved | −1.5 % pace in clear weather |

("Lucky" was renamed Charmed so it doesn't clash with the 🍀 Lucky hot-item buff.)

## Data flow

1. **Pick:** `room_players.trait text not null default 'normal'` (check: the six codes). RPC
   `set_trait(p_room uuid, p_trait text)`: the caller's own player, room in `SHOP`, valid trait;
   errors `wrong_phase`, `bad_trait`. Host-typed players can't call it (no uid) and stay Normal.
2. **Snapshot:** `lock_odds_begin` (when moving SHOP → ODDS_LOCKED) writes
   `races.traits jsonb not null default '{}'` = `{ horseId: trait }` for every runner, Normal
   included. Odds and race both read the snapshot; picks after the lock don't affect this race.
   Back to the shop reopens picking; the next lock snapshots again.
3. **Sim input:** `private.race_input` returns `traits`; `lock-odds` and `start-race` pass them.
4. **Replays:** the timeline records `traits`.

## Simulation (`src/sim`)

- Types: `Trait = 'normal' | 'charmed' | 'tough' | 'sprinter' | 'stayer' | 'mudder'`.
  `RaceInput.traits?: Readonly<Record<HorseId, Trait>>` (missing horse or map = normal).
  `Timeline.traits?` same shape. `validateRaceInput` rejects unknown traits and unknown horse ids.
- **Determinism:** an all-Normal race draws exactly as today (fingerprint test). Trait effects that
  need randomness (Charmed's re-roll) draw only for that horse when it happens.
- Numbers in `config.ts` under `TRAITS`:
  - **Charmed:** when a mystery box's type roll gives `dud`, roll the type once more (the re-roll may
    give dud again → about half the duds). Never upgrades to Stampede (`speed:pass3`) or
    Thunderclap (`attack:all`); no draw is made for those chances.
  - **Tough:** every slowdown mult `m < 1` (attacks, duds, weather slips and bumps) becomes
    `1 − (1 − m) × 0.7`; every boost mult `m > 1` (speed items, Stampede) becomes `1 + (m − 1) × 0.7`.
    Durations unchanged.
  - **Sprinter:** pace × 1.04 while progress < distance / 3; kick boost 0.05 instead of `KICK.boost`.
  - **Stayer:** pace × 0.97 while progress < distance / 3; kick boost 0.15 and kick length + 1 s.
  - **Mudder:** slip chance 5 %; fog bump chance × 0.5 per Mudder in the pair (both → × 0.25);
    pace × 0.985 when weather is clear.
- Traits combine with hot items and weather (e.g. Extended Lasso on a Tough horse: longer, weaker).
- **Balance test** (`balance.slow.test.ts`): 12-horse fields, weather mix 50/25/25, no hot items,
  traits assigned evenly; each trait's win share within ±15 % (relative) of Normal's. Tune numbers
  until it passes; record final values in `PROJECT_STATUS.md`.

## Server

Same migration as hot items: `room_players.trait`, `races.traits`, `set_trait` (authenticated,
security definer, own player only), snapshot in `lock_odds_begin`, `race_input` returns `traits`.
`RaceInputRow` and `database.types.ts` updated; `lock-odds` and `start-race` redeployed.

## UI

- **Phone, shop:** "Your trait" row of six buttons (icon, name, one-line effect, e.g. "🛡️ Tough ·
  hits hurt less, boosts help less"); the current pick highlighted (`aria-pressed`); saves on tap.
  During betting: read-only "Trait: 🛡️ Tough".
- **Big screen:** trait icon next to each runner on the shop board (live) and on the betting board
  (column next to Form, with a small legend); icon in the race standings list. Nothing extra on the
  track itself.
- **Commentary:** occasional trait lines, e.g. at the gun in rain with a Mudder running ("Mudder {h}
  loves this rain!"), or a Tough horse hit by the Lasso ("Tough {h} shrugs it off!").
- **Replays:** standings show traits from `timeline.traits`. Per-trait stats: later.

## Testing

- Sim: each trait rule in isolation (Charmed fewer duds and no rare upgrades; Tough scaling incl.
  weather; Sprinter/Stayer pace and kick; Mudder slip/bump/clear pace); all-Normal fingerprint;
  balance test.
- DB: `set_trait` only in SHOP, own horse, valid codes; snapshot at lock equals the picks; a pick
  after the lock doesn't change the race; back-to-shop then re-lock snapshots again.
- UI: picker labels and `aria-pressed`; board icons; commentary lines.
