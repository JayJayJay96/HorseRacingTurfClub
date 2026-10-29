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

Next: write the Phase 2 plan (Supabase schema, private rooms, lobby).
