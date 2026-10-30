# Project Status

## Phase 1 — Foundation + race simulation engine (done, branch `phase1-sim`)

- [x] Scaffold
- [x] RNG
- [x] Types + config
- [x] Weighted picks
- [x] Item rolls
- [x] Box placement
- [x] Hit resolution
- [x] Race simulation
- [x] Sandbox page
- [x] Balance suite passing (both lengths)

## Phase 2 — Private rooms + lobby (branch `phase2-rooms`)

- [x] Task 0
- [x] Task 1
- [x] Task 2
- [x] Task 3
- [x] Task 4
- [x] Task 5
- [x] Task 6
- [x] Task 7
- [x] Task 8
- [x] Task 9
- [x] Task 10
- [x] Task 11
- [x] Task 12
- [ ] Task 13: hosted Supabase + Vercel (pending owner)

## Phase 3 — Shop, odds, betting, ledger (branch `phase3-betting`)

- [x] Task 0: Branch
- [x] Task 1: Odds (pure)
- [x] Task 2: Timeline packing
- [x] Task 3: Races and ledger tables, `set_phase` v2
- [x] Task 4: Odds lock, Start and finish RPCs
- [x] Task 5: Buy, bet and unbet RPCs
- [x] Task 6: Edge Functions `lock-odds` and `start-race`
- [x] Task 7: Client library
- [x] Task 8: Big screen boards
- [x] Task 9: Phone panels
- [x] Task 10: Smoke test and docs

## Session log

### 2026-10-29

- Built Phase 1 per `docs/superpowers/plans/2026-10-29-phase1-foundation-sim.md`.
- Review fixes: timed effects now start the tick after pickup and last their full duration; same-tick box openings run front-runner first (lane-neutral); same-tick finishes ordered by exact time.
- Balance: the plan's item values let 3 bought Speed boxes win ~61%. Tried a "slipstream" catch-up (met targets but every race became a ~1 m photo finish; rejected; patch kept outside the repo). Owner-approved rebalance instead:
  - Speed boosts ×1.2 (was 1.4/1.4/1.55): Carrot 2 s (was 3), Golden Carrot 3 × 1.5 s (was 2), Thunder Hooves 3.5 s (was 5).
  - Immunity only from Lucky Bubble; Thunder Hooves and Stampede can be hit.
  - New `attack:top3` Hornet Swarm (×0.4, 3.5 s) hits the running top 3; attack weights and mystery Attack share (40% middle/back) raised.
  - `BASE_SPEED` unchanged (15).
- Final balance (10,000 seeded races, 10 horses):

  | Check | Short | Long |
  |---|---|---|
  | Equal field share | 9.6–10.5% | 9.5–10.7% |
  | Winner within ±20 s | 100% | 100% |
  | 3 Speed share (≤18%) | 17.5% | 16.6% |
  | 3 Attack share (≤13%) | 10.6% | 10.8% |

  Feel (short, equal field): 1st→last 3.2 s, 1st→2nd 0.5 s, halfway leader wins 13%, ~36 hits per race (~8 on the leader).
- Checks: `npm test` 56 pass, typecheck and lint clean, `npm run test:balance` 8/8.
- Known: 3-Speed sits close to its 18% limit — re-run the balance suite after any item change. Speed boosts are short; give them strong visuals in Phase 4.

### 2026-10-30

- Built Phase 2 per `docs/superpowers/plans/2026-10-30-phase2-private-rooms-lobby.md` (Tasks 0-12).
- Checks: `npm test` 60 pass, `npm run test:db` 33 pass, typecheck, lint and build clean.
- DB review fixes: joins only in LOBBY, tightened grants, RPC edge cases, idempotent realtime publication.
- Smoke-test fixes: (A) `update_room_settings` treats a NULL argument as "keep current", with `setRaceLength`/`setPrize` wrappers, so length and prize edits no longer overwrite each other; (B) a removed phone listens for its own `room_players` DELETE event (RLS hides everything else from it) and refetches, so it notices removal at once.
- LAN testing: phones need `VITE_SUPABASE_URL=http://<pc-lan-ip>:54321` and the host page opened via the LAN IP (see README).
- Deferred:
  - Private-room host handover ("any device can reopen /track").
  - 4-char room codes are guessable with no rate limit (acceptable for office use).
  - A removed phone can rejoin with a new name.
  - `set_ready` doesn't require `ticked` and doesn't bump `last_activity_at` (Phase 3 player RPCs do bump it).
  - `useRoom` receives every room's `room_players` DELETE events (primary key only).
- Built Phase 3 per `docs/superpowers/plans/2026-10-30-phase3-shop-odds-betting.md` (Tasks 0-10).
- Decisions:
  - Private coins are per race: LOBBY→SHOP creates the race and a 100-coin topup per phone; SHOP→LOBBY cancels the race (purchases, bets, ledger cascade away).
  - Odds are time-budgeted Monte Carlo (≤500 sims, ≥50, ~800 ms) to fit the Edge Function 2 s CPU limit: small fields get 500, a 22-horse long race ~200.
  - Seed is picked with crypto RNG at Start; payouts are written at Start and hidden in the UI until PODIUM.
  - Timeline stored packed at 2 Hz in integer decimetres (~1/3 the size, within ~2.3 m).
  - New tables aren't in the Realtime publication; every mutating RPC updates the `rooms` row instead (one event per action).
  - Place bets are refused (`bad_bet`) and hidden when 3 or fewer horses race: every horse places, so they could not lose.
- Review fixes: `lock_odds_finish` range-checks odds; `lock_odds_begin`/`finish_race` bump activity; the big screen retries `finish_race` while the browser clock runs ahead of the DB; phones have a busy guard against double taps; the bet slip's horse follows the horse list.
- Smoke test (4 origins, Short race): all 8 checks pass; Cal's 40 Win + 60 Place on Siti → 63, matching the payout.
- Checks: `npm test` 87 pass, `npm run test:db` 54 pass, typecheck, lint and build clean.
- Deferred:
  - Big-screen buttons rely on `disabled={busy}` only; a fast double-click (e.g. Open shop) sends a second request that the server rejects with "That isn't possible right now."
  - Each Realtime event makes every client refetch the whole room (6 queries); one phone made ~340 requests in a two-race session. Fine locally; watch hosted free-tier limits.
  - Odds for identical horses vary by ~±0.4× from simulation noise.
  - A phone reload logs 1-2 `join_room` 400 `bad_name` errors before rejoining (nothing on screen).
  - Edge Function catch-all returns raw error text for unexpected errors (no secrets); could map to `internal`.

Next: Phase 4 (playback + podium). Task 13 (owner: hosted Supabase + Vercel + `supabase functions deploy`) can happen any time.
