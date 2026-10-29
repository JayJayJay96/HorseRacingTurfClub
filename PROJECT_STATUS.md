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
  - `set_ready` doesn't require `ticked` and doesn't bump `last_activity_at`; Phase 3 "all ready" logic must filter on ticked and its RPCs must bump activity.
  - `useRoom` receives every room's `room_players` DELETE events (primary key only).

Next: Task 13 (owner: hosted Supabase + Vercel), then Phase 3 (shop, odds, betting, ledger).
