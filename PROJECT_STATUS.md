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
- [x] Task 13: hosted Supabase + Vercel (2026-11-03; real-phone test pending)

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

## Phase 4 — Playback + podium (branch `phase4-playback`)

- [x] Task 0: Branch
- [x] Task 1: Playback maths (pure)
- [x] Task 2: Start covers countdown and finish hold
- [x] Task 3: Track geometry
- [x] Task 4: Camera
- [x] Task 5: Item labels and palette
- [x] Task 6: Pixel 2D renderer
- [x] Task 7: RaceView and sandbox
- [x] Task 8: Timeline loading
- [x] Task 9: Big screen running and podium
- [x] Task 10: Phone mini view
- [x] Task 11: Smoke test and docs

## Phase 5 — Office mode (branch `phase5-office`)

- [x] Task 0: Branch
- [x] Task 1: Odds blend with history (pure)
- [x] Task 2: Office schema, wallets, host fix
- [x] Task 3: PIN login and horse settings
- [x] Task 4: Office race flow and history input
- [x] Task 5: Admin RPCs
- [x] Task 6: Edge Functions: admin, lock-odds history
- [x] Task 7: Client library
- [x] Task 8: Per-horse colours in the renderer
- [x] Task 9: Phone: PIN login and horse panel
- [x] Task 10: Big screen: office unlock and lobby
- [x] Task 11: Home and /admin
- [x] Task 12: Smoke test, docs, hosted deploy (2026-11-03)

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

- Built Phase 4 per `docs/superpowers/plans/2026-10-30-phase4-playback-podium.md` (Tasks 0-11) on 2026-11-03.
- Decisions:
  - Clients fetch `race_timelines` once per race and play it from `now − (started_at + 5 s countdown)`; a reload resumes at the same point.
  - `start-race` sets `ends_at` to countdown + last finish + 4 s hold (`playbackSeconds`), so PODIUM (and payouts on phones) only comes after the replay shows the finish. No migration needed.
  - One stadium oval: 1200 m lap, 300 m straights, finish mid home straight in front of the stands; lanes are visual only.
  - Pixel canvas 640×360 scaled with `image-rendering: pixelated`; side-view sprites drawn in code, 6 coats × 11 silks per lane.
  - After a browser check (deviations from the plan): camera follow zoom 6 / finish shot 3.5 at 60 m (plan: 2.5 / 1.8 at 150 m); sprites 2× when zoomed in; no name tags on the canvas (silks match the HTML standings); finished horses coast past the line on screen.
- Smoke test (4 origins, Short race, 4 horses + 1 watcher): countdown in sync on all screens; phone mini oval and live bet lines; phone and big-screen reloads mid-race resume with matching positions; PODIUM only after the hold; podium swatches, times, prize and biggest win; Cal's 40 Win on Siti @ 4.1× paid 164 (balance 164); Next race → 3-horse race hides Place and plays. Not observed: the phone's 4 s "All home!" line (timing).
- Checks: `npm test` 105 pass, `npm run test:db` 54 pass, typecheck, lint and build clean.
- Deferred:
  - Cheers (spec §5 RUNNING), sound (Phase 7), HD-2D (Phase 8).
  - Devices use their own clock against the DB's `started_at` (no server clock offset); NTP-synced devices agree within ~1 s.
  - Generic track path / more maps (Phase 9); one oval for now.
  - Results are readable in the DB during RUNNING; the spoiler guard is UI-only (from Phase 3).
  - The box-hiding loop and popups scan all events each frame; fine at 22 horses, revisit if profiling says so.

### 2026-11-03 — hosted

- Supabase project `HorseRacingTurfClub` (Singapore, ref `esytitjhdnefgiqcjemg`): linked, 7 migrations pushed, `lock-odds` and `start-race` deployed (the `../../../src/sim` imports bundle fine, no copy step needed). Created with "Automatically expose new tables" off; the migrations' explicit grants are enough. Anonymous sign-ins on.
- GitHub `JayJayJay96/HorseRacingTurfClub` (`origin`, `master`); Vercel project `hanailab/horseracingturfclub` builds from it → https://horseracingturfclub.vercel.app with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set.
- Hosted check: anonymous sign-in, `create_room`, and a full big-screen race (2 host-added horses: odds, Start, playback, podium) worked; no console errors. Not yet tested: real phones joining over the internet.

### 2026-11-03 — Phase 5

- Built Phase 5 per `docs/superpowers/plans/2026-11-03-phase5-office-mode.md` (Tasks 0-12).
- Decisions (owner: big screen needs the admin password; odds history now; coat + silk + horse name):
  - The office is a permanent `rooms` row (`kind = 'office'`, code `TURF`); its `room_players` are the members, archived (not deleted) when removed. PIN hashes live in `private.office_pins` (no client access, RLS on).
  - Wallets: `coin_ledger.race_id` nullable for the starting 100 and admin adjustments; `private.balance` sums all office rows; `room_balances` replaces the per-race ledger fetch. LOBBY→SHOP: +100 per ticked horse, then floor 50 for everyone; both tied to the race, so cancelling undoes them.
  - Odds blend `0.7·p_sim + 0.3·p_hist` with a 5-race prior toward the field share.
  - `admin` Edge Function: password checked in constant time, then a DB lockout (`admin_gate`: 10 wrong → 10 min); claim_host uses the caller's verified JWT.
  - `office_login` returns jsonb so a wrong PIN returns a real null (a raise would roll back the fail count).
- Review fixes: null host is nobody (`lock_host_room` uses `is distinct from`); host FK `on delete set null` (deleting the host's anonymous user no longer deletes the office); room-before-player lock order everywhere; admin password lockout; `admin_locked` handling; typed `set_my_horse` args; normalised big-screen code.
- Smoke test (local, 4 origins): /admin adds 4 people; big screen unlocked with the password (also `?code=turf`); 3 phones set PINs, wrong PIN → "Wrong PIN." and the owner stays signed in; Ali's coat/silk/"Thunder" show on the shop, odds board, track and standings; race 1 paid +100 per racer, Thunder won; balances carried (Ali 140 after a 60 box); race 2 odds favoured Thunder (3.2×, no box) from history; admin +25 → 325; removing a member mid-race refused; Cal's PIN reset; deleting race 1 reversed its coins exactly; a second screen took over the big screen and the first fell back to the unlock form.
- Checks: `npm test` 108 pass, `npm run test:db` 83 pass, typecheck, lint and build clean.
- Deferred:
  - First sign-in sets the PIN, so anyone can claim a name that has no PIN yet (admin resets it).
  - Anyone can lock `/admin` for 10 minutes with 10 wrong passwords (clear with `admin_gate_reset()`).
  - Deleting a finished race can leave a negative balance if its payout was already spent; the next race's floor lifts it to 50.
  - A chosen coat/silk can match another lane's default colours.
  - The office ledger, races and members only grow (fine at office scale; `room_balances` sums per member).
  - No last-5 form on the odds board yet (Phase 6).
  - Members can read the office ledger, including admin adjustment reasons: keep reasons non-sensitive.
  - The host FK is now `on delete set null` for Private rooms too: a deleted host leaves a hostless room until the 24 h cleanup.
  - A reset PIN or a removal doesn't push an update to the affected phone; it notices on its next reload.
  - Hosted deploy of Phase 5 needs the owner to set the `ADMIN_PASSWORD` secret first.

### 2026-11-04 — join-by-pick, late claim, cancel race

- Built per `docs/superpowers/plans/2026-11-04-join-and-cancel.md`; migration `20261104000012_join_and_cancel.sql`.
- Pick: `private_roster(code)` lists a Private room's unclaimed host-typed names; the phone join screen shows "I'm <name>" buttons above the typed form.
- Late claim: `join_room` v4 claims a pre-entered name in LOBBY, SHOP, ODDS_LOCKED and BETTING (not RUNNING); a claimer after the shop opened gets that race's 100 coins. New names still join only in the LOBBY. It now locks the room row first (same lock order as the other RPCs).
- Cancel race: `set_phase` v4 also allows ODDS_LOCKED→LOBBY and BETTING→LOBBY (host only). Deleting the race cascades its topups, floors, purchases and bets: a full refund in both modes. A `lock-odds`/`start-race` call still running then fails in its `*_finish` (`race_not_found`/`wrong_phase`). The big screen has "Cancel race (refund everything)" on the odds and betting boards, behind a confirm.
- Checks: `npm test` 108 pass, `npm run test:db` 89 pass, typecheck, lint and build clean. Browser smoke test passed (pick list, late claim with 100 coins, cancel from Betting).
- Deployed 2026-11-04: hosted DB migrated (012), `master` pushed; Vercel production branch set to `master`, so pushes go live on their own (deploy the DB first when a push needs a migration).

## Phase 6 — History & fun (branch `phase6-history`)

- [x] Task 0: Branch
- [x] Task 1: Event badges (pure)
- [x] Task 2: Badges table and awarding at Start
- [x] Task 3: office_stats and 90-day timelines
- [x] Task 4: start-race passes awards
- [x] Task 5: Client stats library and badge labels
- [x] Task 6: /stats page with replays
- [x] Task 7: Game-screen touches
- [x] Task 8: Smoke test and docs (deploy after merge)

### 2026-11-04 — Phase 6

- Built Phase 6 per `docs/superpowers/plans/2026-11-04-phase6-history.md` (Tasks 0-8), Office only.
- Decisions (owner: all 10 badges; `/stats` page plus small touches on the game screens):
  - `badges` table, one row per member per badge, awarded in `start_race_finish` (same transaction as payouts). Five event badges come from the timeline (`src/sim/awards.ts`, passed as `p_awards` by `start-race`); five come from SQL (first win, hat-trick, long shot, big spender, broke). Deleting a race removes the badges earned in it.
  - `office_stats()` returns everything for `/stats` in one call, null for non-members, and leaves out the race being run (results, badges and its payouts in Richest) until its podium.
  - Replays play the stored timeline; timelines are kept 90 days (`cleanup_rooms` v3), results forever.
  - Comeback = last at half the winner's finish time (time-based halfway).
- Review fixes: a malformed `p_awards` can't block Start (text match before the uuid cast); deterministic hat-trick order; visible badge descriptions (not only `title`); stale stats responses ignored; the replay countdown starts after the timeline loads.
- Smoke test (local, office): race 1 → Cal won 🥇 First Win; Ali got 🍌 Banana King and 🪢 Sniper from real race events; phones show "Your record" and badge chips; the lobby shows the richest 3; race 2's odds board showed Form (1/2/3/4) and the winner's shorter odds; Cancel from Betting worked; `/stats` showed the boards, horse table, badges and recent races; Replay played race 1 with the right names and colours and Back returned; a signed-out device gets the sign-in hint; no failed requests.
- Checks: `npm test` 115 pass, `npm run test:db` 100 pass, typecheck, lint and build clean.
- Deferred:
  - Best betting profit counts bets only; biggest loss counts boxes too (different bases, by design).
  - Archived members show as "?" in old podiums and replays.
  - `/stats` doesn't refresh while open (reload the page).
  - The db test for `office_stats` wipes office history in the local test database.
  - No backfill: badges start empty at deploy, so long-time winners earn First Win on their next win.
  - Members can query `badges` directly during a race (like results; the UI and `office_stats` hide them until PODIUM).
- Deploy order: `db push` (013), then `functions deploy start-race`, then push `master`. Races started between the first two steps get no event badges (SQL badges still work).

## Phase 7 — Sound, commentator & cheers (branch `phase7-sound`)

- [x] Task 0: Branch
- [x] Task 1: Settings and chiptune themes
- [x] Task 2: Race cue names and sound engine
- [x] Task 3: Race cues
- [x] Task 4: Commentator
- [x] Task 5: Sound hooks and toggle
- [x] Task 6: Big screen audio
- [x] Task 7: Cheers
- [x] Task 8: Phone sounds
- [x] Task 9: Smoke test and docs (deploy after merge)

### 2026-11-04 — Phase 7

- Built Phase 7 per `docs/superpowers/plans/2026-11-04-phase7-sound.md` (Tasks 0-9). No database changes.
- Decisions (owner: commentator, phone cheers and opt-in phone sounds; two original loops):
  - Web Audio engine adapted from King of Fate; music and effects synthesised at runtime, nothing bundled (`THIRD_PARTY_NOTICES.md`).
  - Lobby loop in LOBBY..BETTING, race loop while RUNNING, quiet podium. Audio unlocks on the first click/tap.
  - Pure `raceCues` (events → effects) and `createCommentator` (events → lines) drive `useRaceAudio` 10×/s against the race clock; a reload starts from "now".
  - Cheers: Supabase Realtime Broadcast on `cheers:<roomId>`; phones `httpSend` without subscribing, only the big screen listens. Validated (emoji list, roster id), per-sender 1 per 2 s, room-wide 5 per second; names come from the roster.
  - Settings per browser: big screen on by default with volumes and a commentator switch; phones muted by default.
- Review fixes: no music burst after a background tab; touch-friendly unlock; a speech queue that can't stall; start/finish cues never dropped; a limiter on the master bus; room-wide cheer cap; safe coin sound; phone toggle in the page flow.
- Smoke test (local office, big screen + 2 phones): after one click the lobby music scheduled notes; volume panel works; race music and effects scheduled; Ali's 🔥 floated "🔥 Ali" on the big screen and the phone's buttons waited 2 s; the commentator called the start, lead changes, a Golden Lasso, a Stampede, the final stretch and "Bea wins it! Ali second, Dan third." matching the podium; reloading the big screen mid-race didn't replay old lines; no console errors or failed requests. Not verified by ear (no speakers here) or on a real touch phone.
- Checks: `npm test` 132 pass, typecheck, lint and build clean.
- Deferred:
  - The `/stats` replay is silent.
  - Phones don't see each other's cheers (only the big screen).
  - The commentator voice depends on the browser and computer.
  - Anyone with the room id could send cheers in a player's name (cosmetic; rate-limited).

Next: Phase 8 (HD-2D renderer) or Phase 9 (hardening & maps).
