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

## Fun polish (branch `fun-polish`)

### 2026-11-04 — Fun polish

- Built per `docs/superpowers/plans/2026-11-04-fun-polish.md`. No database changes.
- Owner asks: funnier commentator (plain English, no local slang), fully random box spots, more horse angles. The oval question was answered only: the sim has no lanes, so every horse runs the same distance by design.
- Boxes: each lane's spots are uniformly random in 10-90% of the distance (was even slots in 10-85%), sorted, at least 3% apart. Balance suite 8/8:

  | Check | Short (was) | Long (was) |
  |---|---|---|
  | Equal field share | 9.5–10.4% (9.6–10.5%) | 9.2–10.5% (9.5–10.7%) |
  | Winner within ±20 s | 100% | 100% |
  | 3 Speed share (≤18%) | 17.3% (17.5%) | 17.1% (16.6%) |
  | 3 Attack share (≤13%) | 11.0% (10.6%) | 11.2% (10.8%) |

- Commentator: line pools in `src/audio/lines.ts` picked at random; intro and prize before the gun, outsider leads (Win odds ≥ 8), a joke per item, hornets once per swarm, neck and neck, crowd reactions to cheers (≤ 1 per 15 s), "Photo finish!" / "From last to first!" winner calls, and one podium line (`podiumLine`).
- Sprites: `poseOf` picks side, 3/4 rear (`away`) or 3/4 front (`toward`) from the on-screen direction; 1 px gallop bob. No flicker on a full lap, so no hysteresis.
- Checks: `npm test` 143 pass, typecheck, lint and build clean, `npm run test:db` 100 pass. Seen in `/sandbox`: rear views on the bend. Not heard by ear.
- Deploy: redeploy `lock-odds` and `start-race` (they import `src/sim`), then push master.

## Phase 9 — Hardening, maps & looks shop (branch `phase9-hardening`)

- [x] Task 1: Performance
- [x] Task 2: Track shapes
- [x] Task 3: Track choice per race
- [x] Task 4: Cosmetic shop — database
- [x] Task 5: Cosmetic shop — phone UI and rendering
- [x] Task 6: Accessibility
- [x] Task 7: E2E tests
- [x] Task 8: Smoke test and docs (deploy after merge)

### 2026-11-04 — Phase 9

- Built per `docs/superpowers/plans/2026-11-04-phase9-hardening.md`. Owner picked all four parts; tracks: 2 new shapes.
- Performance: per-race render caches (sorted boxes, pickup times, world-space track path) cut `draw()` from ~0.23 to ~0.16 ms/frame (long race, dev build); `colorsByPlayer` uses a Map; `useRoom` coalesces bursts of changes into one refetch (150 ms, one in flight).
- Tracks (looks only; every horse still runs the same distance): `oval` (unchanged), `speedway` (420 m straights) and `kidney` (bean, dent radius ~90 m > the 55 m outer lane). Host picks Oval / Speedway / Kidney / Random in the lobby; `races.track` stores the concrete shape (migration 0014); big screen, phone mini map and replays use it.
- Looks shop (office only, lobby, migration 0015): hoops 150, sash 150, stars 200 (silk patterns), dust 250, sparkle 400 (trails). Bought once per member (`player_cosmetics`), new raceless ledger type `cosmetic`, no buying while RUNNING, wear/remove any time.
- Accessibility: phone and big-screen live regions, canvas labels, labelled radios, focus ring, dark-mode error red 8.2:1, reduced motion snaps the camera.
- E2E (`npm run test:e2e`, local stack only): private race with 3 phones and a mid-race reload; office looks shop and Kidney track; axe on 6 pages with no serious/critical issues. 6/6, twice, ~160 s.
- Checks: `npm test` 170 pass, `npm run test:db` 116 pass, typecheck, lint and build clean. Kidney + hoops + sparkle seen in `/sandbox`.
- Not verified: a real screen reader; the shop on a real phone; prices are a first guess.

## Race view polish + deferred fixes (master, 2026-11-04)

- Race view: fullscreen button (cheers stay inside); pixel number badge (lane + 1) over each horse, `#n` in standings and "You're #n" on the phone; grabbed items hover and spin for 1.5 s before they open (display only: boxes are drawn where the horse was 1.5 s before the sim opened them, so the sim, odds and balance are unchanged).
- Fixed deferred items:
  - Office PINs are set in /admin (add needs a PIN; Reset/Set PIN asks for a new one). Nobody can claim a name; a name without a PIN shows "Ask the admin" (migration 0016).
  - A PIN reset signs that phone out; reset and Remove tell the phone over its room channel (`signed_out` broadcast), so it updates at once.
  - Admin lockout is per device (anonymous uid), not global.
  - Big screen: Open shop is disabled while a request runs (the double-click).
  - `/stats` polls every 30 s while visible; its replay has commentary and sound.
  - Racing phones see everyone's cheers (`sendCheer` no longer removes a channel it didn't create).
- Won't fix (owner 2026-11-04):
  - Room refetch traffic: the free plan doesn't cap API requests; bursts already coalesce.
  - Results readable during RUNNING: every screen needs the whole Timeline to animate; bets close at Start.
- Known limits: fresh anonymous devices each get 10 admin guesses (plus the 1 s delay); members added before 0016 without a PIN need /admin → Set PIN.
- Deploy: `db push` (0016), then `functions deploy admin`, then push `master`. Until the function is redeployed, adding members fails.

## UI theme (branch `ui-theme`, 2026-11-04)

- Built per `docs/superpowers/plans/2026-11-04-ui-theme.md` (spec `docs/superpowers/specs/2026-11-04-ui-theme-design.md`). No logic, data or sim changes.
- Look: always dark, HD-2D-style see-through navy panels with double gold trim and corner marks, Pixelify Sans (OFL, self-hosted TTF) for headings/buttons/numbers, system font for body text, gold gradient primary buttons, soft glow behind the room code, countdown and winner.
- New `src/app/theme.css` (tokens, element styles, `.panel/.card/.chip/.glow/.topbar`) and `src/app/TopBar.tsx` (brand, room/coins chips, sound). The brand links home only outside a room.
- Layouts: big-screen lobby columns with roster cards, odds-board tables, framed race with standings side panel, podium steps; phone box-shop cards, bet slip horse radio cards + Win/Place toggle, large place lines, results card, centred sign-in panels; Home cards; Stats panels; Admin theme only.
- Decisions made during the build: TTF not woff2 (no converter without a new dependency); silk and `#n` only from Betting on (lanes exist once odds lock); page gradient's turf end mixed to 30 % for contrast; coins live in the top bar (dropped from the phone shop/bet lines).
- Checks: typecheck, lint, `npm test` 171 pass, `npm run test:e2e` 6/6 (axe included). Headless screenshots at 1920×1080, 1280×800 and 375×812 in `docs/ui-theme-screens/` (not committed).
- Not verified: a real phone, a real TV, `/stats` signed in, fullscreen.

## Music, shop chances and group bets (master, 2026-11-04)

- Music: songs in `src/assets/music/{lobby,race}/` are found by `import.meta.glob` (an empty folder keeps the chiptune); a random song plays on the music bus, never the same one twice in a row, and Lobby → Shop → Betting keeps the same song. Now 2 lobby and 6 race songs.
- Crowd bed: the first file in `src/assets/music/background/` loops under the race music on its own Crowd bus and slider (default 80%).
- The MP3s (~43 MB) are bundled and come from a royalty-free library. Their site and licence are not recorded yet (`THIRD_PARTY_NOTICES.md`).
- Shop board: live Win and Top 3 chances from 500 simulated races with the boxes bought so far (web worker, reruns on each purchase), Form column for office races, horses face right.
- Equal horses: `simulateShares` averages horses with the same bought boxes, so equal horses show identical chances and odds instead of simulation noise.
- Betting → Shop: refunds bets, clears odds, keeps boxes (migration 0017).
- Group bets (4+ horses) on the winner's number: Odd, Even, Low (first half, rounded down), High. Priced at Lock from the summed win chances, 90% of fair like Win; paid in `start_race_finish`; no horse (migration 0018).
- Lobby: add-a-name form above the roster; tapping a roster card toggles the tick. Shop and betting boards mark phones that pressed Ready; the bet slip preselects the player's own horse.
- Deployed: hosted DB has 0017 and 0018, `lock-odds` redeployed after the last commit (`start-race` only imports a type from `odds.ts`), `master` pushed.
- Checks (2026-11-04): typecheck, lint and build clean, `npm test` 177 pass, `npm run test:db` 121 pass (`realtime.test.ts` failed once in the full run and passed alone, so it's flaky), `npm run test:e2e` 6/6.
- Not verified: the music by ear, a real phone or TV.
- Before or during Phase 8: the main JS chunk is 547 KB, so lazy-load the Three.js renderer; `RaceView` always creates `Pixel2DRenderer` and `RaceRenderer` lives in that file.

## Phase 8 — HD-2D renderer (branch `phase8-hd2d`)

- Built per `docs/superpowers/plans/2026-11-04-phase8-hd2d.md` (spec `docs/superpowers/specs/2026-11-04-hd2d-renderer-design.md`). No database, Edge Function or sim changes.
- Three.js r187, lazy-loaded only when the HD view starts; phones and the 2D view never download it.
- Look: pixel-art textures and code-drawn sprites at one texel size, high narrow camera on the infield side, lit billboards with sun shadows, tilt-shift + bloom + grade/vignette; approved values in the spec.
- Shots: wide 2 s → chase → side-on finish, hard cuts; reduced motion holds wide.
- Lighting from `seed % 3`: afternoon, sunset (light shafts), night (floodlights, fireflies).
- Six item-family effects, motes, confetti, crowd bob; boxes, items, popups, badges and trails follow the 2D rules.
- HD by default; "HD" chip per browser (`hrtc.render`); falls back to 2D on no WebGL2, a failed import, a `play()` error or context loss, at the same race time.
- Deviations from the spec: the sun and cameras sit on the infield side, so the stands are the backdrop; chase and finish shots aim `LOOK_PAST_M` (12 m) past the pack; camera easing is frame-rate independent (`EASE` is the 60 fps value); shadows use `PCFShadowMap` because r187 dropped `PCFSoftShadowMap`; the GL context is released only after the canvas has left the page (StrictMode's simulated unmount reuses the same canvas).
- Fallback checks (headless Chromium, `/sandbox`): `hrtc.render=2d` shows the 640×360 2D canvas with the chip unpressed, and the chip brings up the `hd` canvas; `loseContext()` during an HD race gives one "HD-2D unavailable" warning, a 2D canvas, and a disabled "HD unavailable" chip; 10 back-to-back races: JS heap 31.8 MB after the 1st, 34.2 MB after the 10th (+2.4 MB, forced GC).
- Checks: typecheck, lint, `npm test` 206 pass (35 files), `npm run test:e2e` 6/6 (the full run failed the lobby a11y test once on a roster realtime update that never arrived, the same flake as `realtime.test.ts`; it passes on re-run and the private-race spec passed with the HD chip and no page errors); build: HD chunk 589.91 kB (148.15 kB gzip), main chunk 552.03 kB (+4.5 kB from 547.55 kB). Nine screenshots (3 tracks × 3 lights) in `docs/hd2d-screens/`.
- Frame time, 22 horses, long race, about 25 s in: 125.9 ms/frame on headless software GL (SwiftShader, CPU), not representative; the 16.7 ms target is unmeasured on a real GPU.
- Not verified: a real TV, a real office laptop GPU.

## Odds loopholes closed (master, 2026-11-04)

- Two ways a bet could pay more than it was worth on average:
  - the office history blend ignored this race's bought boxes and lengthened a boxed horse's odds (~4% profitable in a 10-horse race, more in small fields);
  - the minimum odds (Win 1.2, Place/groups 1.05) lifted near-certain picks above their fair price.
- Fix: price from max(p_sim, history blend), so history only ever shortens odds; a bet whose 90% price falls below the minimum is closed (null in `races.odds`), not lifted. Every open bet now returns at most ~94% on average (unit test sweeps p).
- Migration 0019: `lock_odds_finish` accepts null prices; `place_bet` refuses them with `bet_closed`. Phone bet slip greys out closed picks and says why; boards show "Closed".
- Checks: `npm test` 210 pass, `npm run test:db` 122 pass (the realtime roster test flaked once in the full run, passed alone), typecheck, lint and build clean.
- Deploy order: `db push` (0019) first, then `functions deploy lock-odds`, then push `master`. The new function sends nulls, which the old `lock_odds_finish` rejects.

## More power-ups on longer races (master, 2026-11-04)

- Mystery boxes per lane now follow race length: 8 on Short (2 min), 12 on Long (3 min), about 4 a minute (was 5 for both). Bought boxes are unchanged (up to 3). Box zone widened from 10-90% to 5-95% of the distance, still fully random and at least 3% apart.
- Balance suite 8/8 with the new counts (equal-field share, winner window, 3 Speed ≤ 18%, 3 Attack ≤ 13%, both lengths). `npm test` 212 pass.
- HD-2D follow camera at 1.3× the pixel-target distance (was 1.6×): bigger horses, the top five in frame.
- Deploy: `functions deploy lock-odds start-race` (both bundle `src/sim`), then push `master`. No migration.

Next: owner review of Phase 8 on a real TV.

## Cut-ins and special-item animations (master, 2026-11-05)

Spec: `docs/superpowers/specs/2026-11-05-cutins-design.md` (sub-project A of the race-core expansion: next B weather, C random events, D horse traits, E new items).

- Cut-in band across the top of the big screen (both renderers) for 🌩️ Thunderclap, 🪢 Golden Lasso and 🐎 Stampede: the horse's outlined portrait, name and the move, 1.3 s, with a rising sting. Priority in that order, at most one every 12 s; a rarer item within 1 s takes the slot. The race keeps running underneath. Thunderclap also flashes the view. Phones unchanged (mini oval, no cut-in sound).
- In-race animations in HD-2D and 2D: Stampede dust plus 3 ghost horses, Thunderclap bolts onto every target, Lasso rope then a spinning loop on the leader, Hornet Swarm round the top 3 (no cut-in). A blocked or reflected one plays only its incoming part, then the shield/mirror effect.
- Derived from the stored timeline at playback: no sim, Edge Function or database change; old replays get it too. Box counts unchanged (8 short / 12 long).
- Sandbox: Moment buttons jump to 4 s before each moment; "Freeze on band / effect" holds HD there for screenshots.
- `npm test` 223 pass; E2E 5/6 in the full run, the a11y track-lobby test is the known flake and passes alone (4/4).

## Weather (master, 2026-11-05)

Spec: `docs/superpowers/specs/2026-11-05-weather-design.md` (sub-project B). Plan: `docs/superpowers/plans/2026-11-05-weather.md`.

- Weather is rolled at odds lock: 50 % clear, 25 % rain, 25 % fog. The odds are priced with it and it is stored on `races.weather`; `start-race` reads it back. Optional `RaceInput.weather`: clear races and old replays are bit-identical.
- Office switch on /admin (default on); off means every race is clear.
- Rain: puddles tiled so every lane meets the same number (3 short, 5 long), edge puddles cover 1-2 lanes. Stepping in one has a 15 % chance to slip: 0.5x speed for 1.5 s. Fog: neighbour bumps at 0.7x for 1 s, 3 s cooldown per pair. Defenses do not block either.
- Badge on the big screen, phones and replay; commentary lines; splash, bonk and rain-bed SFX.
- 2D and HD-2D visuals: puddles, rain streaks, fog haze, "Slip!" / "Bump!" popups, splash and bonk particles; HD-2D puddle reflections are stencil-clipped so they never show outside a puddle or over a horse.
- Measured per race. 12 horses short: rain about 14 puddles and 5.4 slips, fog about 3.7 bumps. 22 horses long: rain 40 puddles and 16.5 slips, fog about 9.9 bumps.
- Sandbox: Weather picker (Clear / Rain / Fog), Slip and Bump moment buttons, weather in the status line.
- `npm test` 250 pass (39 files); `npm run test:db` 128 pass (the realtime test flaked once, passed on rerun); E2E 6/6; typecheck, lint and build clean.
- Not done: real-TV frame-rate check.
- Deploy pending owner approval, in this order: `npx supabase db push --linked`, then `npx supabase functions deploy admin lock-odds start-race`, then `git push origin master`.

## Hot items and horse traits (master, 2026-11-05)

Specs C and D and plan: `docs/superpowers/plans/2026-11-05-hot-items-and-traits.md`.

- Hot items: 3 per race, rolled at shop open (any 3 of the 14 non-dud items, at most 2 per type). 🍀 Lucky gives 2x weight, ⏱️ Extended gives 1.5x duration; Stampede, Shield and Mirror are Lucky only. Office switch "Hot items" on /admin, default on.
- Shown as a strip on the shop, betting and replay screens, 🔥 on the buy buttons and on in-race pickups, plus a commentary line.
- Traits: picked per race on the phone in the shop: Normal, 🧿 Charmed, 🛡️ Tough, ⚡ Sprinter, 🐢 Stayer, 🌧️ Mudder. Snapshotted at odds lock; icons on the boards and standings.
- Final `TRAITS` (`src/sim/config.ts`): charmed rerollPercent 10; tough hitFactor 0.9, boostFactor 0.7; sprinter earlyPace 1.05, kickBoost 0.09; stayer earlyPace 0.90, kickBoost 0.105, kickExtraSeconds 1; mudder slipChancePercent 5, bumpFactor 0.5, clearPace 0.996.
- Balance (win share, Normal 0.169): charmed 0.178 (+5 %), tough 0.167 (-1 %), sprinter 0.153 (-9 %), stayer 0.177 (+5 %), mudder 0.155 (-8 %); all within the +-15 % gate.
- Notes: odds group horses by boxes and trait; private rooms always have hot items; traits reset to Normal each new race. Sandbox has hot-item and trait pickers.
- `npm test` 303 pass (44 files); `test:balance` 9 pass; `npm run test:db` 137 pass (18 files); E2E 6/6; typecheck, lint and build clean.
- Not done: real-TV frame-rate check.
- Deploy pending owner approval, in this order: `npx supabase db push --linked`, then `npx supabase functions deploy admin lock-odds start-race`, then `git push origin master`.

## Visual polish (master, 2026-11-05)

- Pixel horse sprites (`src/render/HorseSprite.tsx`, colours from `horseColors`) beside every horse name: lobby/shop/betting boards, race standings, stats, bet slip, phone header and lobby card, cut-in portraits. Before odds lock a horse's default colours use the lane it will race in (ticked players by `joined_at`, `id`), so colours match the race. Stats can't know lanes (accepted exception).
- Podium: horses on the steps, the winner bigger and hopping, confetti on entry, prize banner, payout lines with sprites (top payout gold). Phone result card: sprite, place, winnings.
- Phase banners ("SHOP OPEN!", "ODDS LOCKED", "PLACE YOUR BETS!", "RACE TIME!", "RESULTS!") on the shared screen and phones with a soft `phase` sting; only on a real phase change; shown inside race fullscreen too; reduced motion fades.
- Phone: one-row header (sprite, name, coins, sound icon), sticky bottom action bar (Bet / I'm ready) pinned to the bottom, trait picker as a 2×3 grid, hot strip only in shop and betting, race line "#1 Ann · 2nd".
- Icons: five Emoji 13–14 icons swapped for older ones (Mirror 🔁, Lasso ➰, Bubble 🔮, Broke 💸, Untouchable 👻); `src/app/emojiSupport.test.ts` blocks newer emoji.
- Checks: `npm test` 339 pass, typecheck, lint, build clean, `npm run test:e2e` 6/6.
- Known: the two `join_room` 400s in a phone's console on first load are the deliberate rejoin probe (empty name), harmless. Not done: real-TV/monitor frame-rate check.

## Cosmetics shop (master, 2026-11-05, live)

- Office Looks shop on the phone: preview of your horse with try-on, tabs Patterns · Trails · Caps · Celebrations · 🎁 Crate (3 + 2 grid), item cards with a sprite and Buy (confirm) / Wear / Remove.
- Catalogue (`src/shop/cosmetics.ts` mirrors `private.cosmetic_catalog()`; a test compares them): 7 patterns 150–250, 6 trails 250–500, 4 caps 200–400 (new slot, drawn on the jockey everywhere), 4 victory celebrations 500–800 (new slot, podium winner only: spin, fireworks, moonwalk, confetti cannon; default hop).
- Mystery crate 250 coins (`open_crate`): random unowned item, weight 1/price (celebrations ≈ 1 in 12), office lobby only, locked like `buy_cosmetic` (two concurrent opens charge once — tested), `nothing_left` / `not_enough_coins`.
- Migration `20261105000022_cosmetics_shop.sql`; no Edge Function change. The sim never reads cosmetics.
- Bet slip: Win/Place under the horse list, number bets (Odd/Even/Low/High) below.
- Checks: `npm test` 372, `npm run test:db` 147, `npm run test:e2e` 6/6, typecheck, lint, build clean.
