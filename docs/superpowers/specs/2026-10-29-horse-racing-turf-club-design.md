# Horse Racing Turf Club — Design Spec

**Date:** 2026-10-29 · **Status:** Design approved in brainstorming (sections 1–5); awaiting owner review of this document.
**Sibling project:** King of Fate (`C:\AILAB\KOFv1`) — same purpose (fun office decider), same fairness spirit. This is a **separate app** that may copy and adapt KOF parts (crypto RNG, roster validation, audio engine, test setup, docs process).

## 1. Goal

A web horse race for an office (typically ≤20 people, Malaysian office, English UI). Each person is a horse. Everyone joins on their own phone, gets coins, buys powerup boxes for their own lane and bets on any horse. The host shows the race on a big screen. 1st place wins the prize (e.g. picks lunch); the podium is 1st/2nd/3rd.

Luck dominates. Bought powerups give a **small, real, disclosed edge**.

## 2. Modes

| | **Office** | **Private** |
|---|---|---|
| Club | One fixed, built-in office | Temporary room per host (room code) |
| Identity | Pick name from roster + own 4-digit PIN | Type a name, no PIN |
| Coins | Persistent wallet (carry over) | 100 per race, nothing kept |
| History, odds history, badges | Yes | No (odds from simulation only) |
| Admin | `/admin` with one admin password | Room host only |
| Lifetime | Forever | Deleted 24 h after last race |

In both modes, a user either **hosts** (opens the big-screen track) or **joins** (phone). In Office mode any member may host.

## 3. Players and field

- The host ticks today's roster in the lobby. Ticked people race; **a phone is optional** (no phone means no shop and no betting).
- Office roster is managed in `/admin`. Private roster = names that joined plus names the host types.
- Field size: **2–22 horses**.
- All horses have identical base speed. There is no horse "condition".
- Horse customization (Office, cosmetic only): coat colour, jockey silks colours/pattern, horse name (≤24 chars). Later: cosmetics bought with coins.

## 4. Architecture

```
Vercel (static): React + TypeScript + Vite, one app, three views
  /track  big screen (host)   /play  phone   /admin  office management
        │ Supabase Realtime: one channel per race (phase, presence, ready, cheers)
        │ HTTPS: Edge Functions / Postgres RPC for every coin or race action
Supabase (free tier)
  Postgres: clubs, players, horses, races, race_entries, purchases, bets,
            coin_ledger, race_results, race_timelines, badges
  Edge Functions: lock-odds, start-race (+ small RPCs for buy/bet/unbet)
  Realtime: race-room channels + presence
```

- Phase/roster/ready reach clients as Postgres Changes on `rooms`/`room_players` (RLS-filtered; clients refetch on any change); presence uses the same channel.
- Phase 3: coin/bet tables are not published; every mutating RPC updates the `rooms` row instead, so each action costs one Realtime event.

- **`sim/` package:** pure TypeScript with no DOM or React, shared by the Edge Functions (Deno) and the client. `simulateRace({ seed, horses, bought, length }) → Timeline` is deterministic (contract in `src/sim/types.ts`). The engine works in progress metres only; track geometry (laps, curves) belongs to the renderer.
- **Timeline:** finish order and times, box spots per lane, per-horse progress samples (10 Hz, metres to 0.01), and an event list (pickup with the item it contained, hit, blocked, reflected, finish). Raw JSON is ~100–330 KB per race, so Phase 3 must shrink it before storing or broadcasting (e.g. send 2–5 Hz and interpolate, or integer decimetres + compression).
- **Clients never decide outcomes.** They only play back a Timeline.
- **Renderer interface:** `RaceRenderer.play(timeline, track, startAtMs)`. MVP: `Pixel2DRenderer`. Later: `HD2DRenderer` (Three.js). Both read the same Timeline and the same track definition.
- **Track definition:** a 3D centreline path (y = 0 for now), lane width, lane count, finish point, stand position. New maps are new track files.
- **Money is server-side only.** Phones never write coins directly. Row-level security on all tables; mutations go through Edge Functions/RPCs that check phase, ownership and balance.

### Free-tier budget (checked against Supabase docs, 2026-10-29)

- Edge Functions: 2 s CPU per request, 150 s wall clock. One race sim ≈ 1–5 ms; odds (~500 sims) ≈ 100–300 ms. Two function calls per race.
- Realtime free plan: 200 concurrent connections, 100 messages/s, 2M messages/month. 23 clients is fine.
- **Cheers are throttled:** max 1 per 2 s per phone, sent only to the big screen. The big screen broadcasts one combined cheer summary per second.
- During a race, clients receive the Timeline **once**. No per-tick server traffic.

## 5. Race flow

```
LOBBY → SHOP → ODDS_LOCKED → BETTING → RUNNING → PODIUM → LOBBY
```

| Phase | Big screen | Phone | Advanced by |
|---|---|---|---|
| LOBBY | QR + room code, roster ticks, joined badges, prize line, race length (Short/Long) | Log in / join; Office: edit horse | Host **Open shop** (≥2 ticked) |
| SHOP | Lanes with box counts, Ready ticks | Wallet, buy Speed/Defense/Attack boxes (max +3), Ready | Host **Lock odds** (anytime) |
| ODDS_LOCKED | "Calculating odds…" then odds board | same | Automatic (lock-odds) |
| BETTING | Odds board, pot, Ready ticks | Bet slip: Win/Place on any horse, change until Start, Ready | Host **Start race** (anytime) |
| RUNNING | Full race, standings, item popups, cheers | Mini oval, own horse, live bet status, cheer buttons | Automatic (timeline end) |
| PODIUM | 1–2–3 podium, payouts, biggest win | Own result and new balance | Host **Next race** |

**Rules:**
- Shop closes at odds lock. Purchases are not refundable.
- Coins for a bet are taken when it's placed. Unbet refunds in full until Start.
- `start-race` is **idempotent**: it runs the sim with a crypto seed, then writes results, timeline, payouts and ledger rows in **one transaction**. A second Start is rejected.
- Payouts are applied at Start, but phones reveal them only when playback reaches the finish (no spoilers).
- Refresh/reconnect: state is read from the database, and an in-progress race resumes at `now − started_at` on the same Timeline. Never re-rolled.
- If the host disconnects, nothing is lost; any device can reopen `/track`.

## 6. Race simulation

- Tick 10 Hz. Position = **progress distance** along the centreline (lanes are visual; inner/outer equal).
- **Length option** (host, lobby): **Short ≈ 2:00** (≈1.5 laps) or **Long ≈ 3:00** (≈2 laps). The finish is in front of the stands. Same base speed; only distance changes.
- Pace = base × (1 + smooth noise ±6%) × active item modifiers. Each horse gets one random finishing kick (2–5 s burst) in the last 20%.
- **Boxes:** each lane has **5 mystery boxes + up to 3 bought boxes**, spread over the race distance at seed-chosen spots (shown before the start). A horse picks up only boxes in its own lane, and items **fire automatically on pickup**.
- Defense items don't stack: one held at a time, and a new one replaces the old.
- Every race must finish: every effect is time-limited, and the engine throws if a race runs past 3× its nominal length.

### Item codes

Format `<type>:<target><n>`, used in logic, logs and the odds board; each code has a display name and icon.

| Code | Name | Effect |
|---|---|---|
| `speed:self1` | Carrot | +20% speed, 2 s |
| `speed:self3` | Golden Carrot | 3 × (+20%, 1.5 s) |
| `speed:star` | Thunder Hooves | +20%, 3.5 s |
| `speed:pass3` | Stampede *(mystery only, back half)* | Sprints (+80%) past up to 3 horses, max 8 s; can still be hit |
| `attack:behind1` | Banana Peel | Horse directly behind: −50%, 1.5 s |
| `attack:behind3` | Dust Kick | 3 horses behind: −25%, 2 s |
| `attack:front1` | Horseshoe Toss | Horse directly ahead: −50%, 2 s |
| `attack:front3` | Mud Cloud | 3 horses ahead: −25%, 2 s |
| `attack:leader` | Golden Lasso | 1st place stops, 2 s |
| `attack:top3` | Hornet Swarm | Current 1st–3rd (not the sender): −60%, 3.5 s |
| `attack:all` | Thunderclap *(mystery only, last place)* | All others −30%, 1.5 s |
| `defense:block1` | Horseshoe Shield | Blocks next attack |
| `defense:immune` | Lucky Bubble | Immune 6 s (the only source of immunity) |
| `defense:reflect` | Mirror Saddle | Next attack bounces back to its sender |
| `dud:stop` | Snack Break | Stops 1.5 s |
| `dud:slow` | Sleepy Jockey | −30%, 2.5 s |
| `dud:trip` | Stumble | −50%, 1 s |

### Position weighting

Position band is set at pickup: front third / middle / back third of the current race order (by progress).

**Mystery box type:**

| Band | Speed | Attack | Defense | Dud |
|---|---|---|---|---|
| Front | 15% | 30% | 25% | 30% |
| Middle | 25% | 40% | 20% | 15% |
| Back | 40% | 40% | 10% | 10% |

**Attack item (any Attack box, bought or mystery):**

| Band | behind1 | behind3 | front1 | front3 | leader | top3 |
|---|---|---|---|---|---|---|
| Front | 45% | 30% | 15% | 10% | 0% | 0% |
| Middle | 10% | 10% | 15% | 15% | 10% | 40% |
| Back | 5% | 5% | 10% | 10% | 25% | 45% |

*Rebalanced 2026-10-29 (owner decision):* the original +40–55% boosts made 3 bought Speed boxes win ~61% of 10-horse races. Weaker boosts, immunity moved to Defense only, and the Hornet Swarm (attacks aimed at the top 3) bring it to ~17% while keeping a real finishing spread (~3 s first to last). A catch-up "slipstream" was tried and rejected: it met the target only by turning every race into a ~1 m photo finish.

- Impossible targets (nobody ahead or behind) are removed and the remaining weights renormalized.
- Mystery-only extras: `speed:pass3` replaces a Speed roll at 25% in the back half. `attack:all` replaces 5% of last place's Attack rolls.
- **Bought boxes:** type as bought. Speed and Defense pick uniformly within their type (excluding mystery-only items); Attack uses the table above. Bought boxes never contain duds.

### Shop

| Box | Price (initial, tuned by balance tests) |
|---|---|
| Speed | 60 |
| Defense | 35 |
| Attack | 20 |

Own lane only, max **3 bought boxes** per lane, any mix.

### Balance targets (automated, 10,000 races, both lengths)

- Equal 10-horse field: each horse wins 10% ± 1%.
- One horse with 3 Speed boxes: win ≤ ~18% (currently 17.5% short / 16.6% long; re-run the suite after any item change). Attack boxes: smaller edge than Speed (≤ ~13% with 3).
- Winner time within ±20 s of nominal length in 99% of races.
- 100% of races finish.

## 7. Odds

Computed once at **lock-odds**:

- `p_sim`: Win and Top-3 probability per horse from ~500 simulations of this exact race (field, boxes, length, track). Simulation count is time-budgeted (≤500, ≥50, ~800 ms) to fit the Edge Function CPU limit.
- `p_hist` (Office only): `(wins + 5·(1/N)) / (races + 5)`. Place uses the top-3 rate with `3/N`.
- `p = 0.7·p_sim + 0.3·p_hist` (Private: `p = p_sim`).
- `odds = clamp(0.9 / p)` (10% house edge). Win clamped 1.2–20×, Place 1.05–6×. Rounded to 0.1.
- Odds are frozen for BETTING. The board shows Win/Place odds, each horse's bought boxes and its last-5 form, plus a note that bought boxes change chances.

**Bet types:** **Win** (horse finishes 1st) and **Place** (top 3). A player may bet any amount on any number of horses. A losing bet loses its stake; a winning bet pays `stake × odds`.

## 8. Economy

- **Office:** new player starts with 100. +100 whenever ticked into a race. If a balance is below 50 at race start, it's raised to 50. No expiry.
- **Private:** 100 per race.
- **`coin_ledger`** is the single source of truth: types `topup`, `floor`, `purchase`, `bet`, `unbet`, `payout`, `admin_adjust` (with reason), later `cosmetic`. Balance = sum of ledger rows.

## 9. History & badges (Office)

- **Race record:** date, length, prize line, field, boxes, odds, podium and times, all bets and payouts, item event log.
- **Timeline (replay):** kept 90 days (size target ~40 KB each after Phase 3 compression). Results kept forever.
- **Leaderboards:**
  - richest
  - biggest single payout
  - biggest loss in one race
  - best betting profit
- **Horse records:** races, wins, places, win %, last 5.
- **Badges** (luck, not skill):
  - First Win
  - Hat-trick (3 wins in a row)
  - Photo Finish (won by < 0.2 s)
  - Comeback (last at halfway, won)
  - Banana King (most attacks landed)
  - Untouchable (won without being hit)
  - Long Shot (bet won at ≥10×)
  - Big Spender (3 boxes bought, 5 times)
  - Broke (hit the floor)
  - Sniper (Golden Lasso hit the leader)

## 10. Identity & admin

- **PIN:** set on first Office login, stored as a salted hash. 5 wrong tries locks that name for 5 minutes. The phone keeps a session token.
- **`/admin`:** one admin password (a server secret). It covers:
  - adding, removing and renaming people
  - resetting a PIN
  - adjusting coins (reason required, ledgered)
  - deleting a race
- Removing a person keeps their history.
- A 4-digit PIN protects fake coins only. The UI tells users not to reuse a real PIN.

## 11. Presentation

- **MVP visuals:** an **oblique 3/4 pixel oval** with **side-view** horse and jockey sprites (run cycle drawn in code, palette-swapped coats and silks). Side view is chosen so the same sprites become HD-2D billboards later.
- **Big screen:** track, live standings, item popups, floating cheers. Camera follows the leading pack, with wide shots at the start and finish.
- **Phone:** light mini oval (dots), own horse highlighted, live bet status, cheer buttons.
- **HD-2D (later phase):** Three.js scene from the same track path and sprites; depth of field, bloom, lighting, particles. The 2D renderer stays as a fallback.
- **Audio:**
  - MVP: sound effects (gallop, box, each item, crowd, bell) and one chiptune loop, adapted from KOF's engine.
  - Later: race commentator (browser TTS first, optional recorded clips, KOF pipeline). Audio on the big screen; phone sounds are opt-in.

## 12. Phases

| # | Phase | Acceptance |
|---|---|---|
| 1 | Foundation + `sim/` | Repo, deterministic sim, balance tests pass for both lengths |
| 2 | Private rooms + lobby | Supabase schema; host creates room; phones join by QR; roster ticks; realtime phases |
| 3 | Shop, odds, betting, ledger | Buy, lock odds, bet/unbet, idempotent Start with transactional payouts |
| 4 | Playback + podium | Pixel 2D track, phone mini view, podium; **Private fully playable** |
| 5 | Office mode | PIN login, `/admin`, carried wallets, horse customization; **MVP complete** |
| 6 | History & fun | Leaderboards, horse records, replays, badges |
| 7 | Sound & commentator | Music, SFX polish, commentator |
| 8 | HD-2D renderer | Three.js renderer on the same Timeline; 2D fallback |
| 9 | Hardening & maps | E2E, accessibility, performance, extra tracks, optional cosmetic shop |

## 13. Testing

- **Sim (Vitest):**
  - same seed gives an identical Timeline
  - every race finishes
  - 10k-race balance statistics with fixed tolerances
  - mystery and attack tables match configured frequencies per band
  - no impossible targets
  - reflect, block and immune interactions behave as specified
- **Server:**
  - payouts, refunds, ledger sums, odds math and clamps
  - phase guards (no buying after lock, no betting after Start)
  - Start runs once only
  - PIN hashing and lockout
  - Private room cleanup
- **E2E (Playwright):** a host plus 3 phone contexts complete a Private race. Refresh mid-race resumes the same Timeline. Office login + admin smoke test.
- Each phase ends running, typechecked, built and tested. Docs follow KOF: `PROJECT.md`, `AGENTS.md`, `PROJECT_STATUS.md`.

## 14. Out of scope (for now)

- Live player-fired items or targeting.
- Skill/tap mechanics.
- Permanent horse stats.
- Multiple offices.
- Real-money anything.
- Pari-mutuel pools and exact-podium bets.
- Cosmetic shop (deferred to phase 9).
