# Phase 9: Hardening, Maps and Cosmetic Shop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 9 of the spec (`docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md` §12): performance, two new track shapes picked per race, a cosmetic shop for office players, accessibility, and Playwright E2E tests covering everything.

**Owner choices (2026-11-04):** all four parts. Tracks: 2 new shapes (kidney/bean oval, long-straight speedway) with host pick or random per race.

**Architecture:**
- **Tracks are looks only.** The sim is 1-D (`src/sim` has no geometry), so every horse still runs `DISTANCE[length]` metres, and the balance and Edge Functions don't change.
- **Track choice data flow:** `rooms.track` (host setting, may be `random`) → `set_phase` copies a concrete shape into `races.track` → the client picks the `Track` by id.
- **Cosmetics** are owned per office player (`player_cosmetics`) and equipped on `room_players`.
  - Buying them is a new raceless ledger type, `cosmetic`.
  - The renderer draws silk patterns and trails.
- **E2E** runs Playwright against the local Supabase stack and the Vite dev server.

**Tech Stack:** TypeScript, React 19, Canvas 2D, Supabase (Postgres RPCs, RLS), Vitest, Playwright, @axe-core/playwright.

---

## Ground rules (all tasks)

- **TypeScript config:** strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`; imports carry `.ts` / `.tsx` extensions.
- **Prettier:** only on files you touched, never on whole directories.
- **Migrations:**
  - The next one is `supabase/migrations/20261104000014_<name>.sql`, numbered globally after that.
  - Redefine RPCs with `create or replace` and a "vN" comment (see `set_phase` in `_0012`).
  - RPCs are `security definer` with `set search_path = ''`.
  - After a migration: `npx supabase db reset`, regenerate types (`npx supabase gen types typescript --local > src/net/database.types.ts`), and run `npm run test:db`.
- **DB test quirks:**
  - The realtime DB test can flake once right after a reset; rerun it.
  - If Edge Functions return 503: `docker restart supabase_edge_runtime_HorseRacingTurfClub`.
  - After adding a new file under `src/sim` that a function imports: `npx supabase stop && npx supabase start`.
- **Every task ends with:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` (plus `npm run test:db` when SQL changed), then a commit ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Secrets:** never commit secrets, and never print the service-role key or the admin password.

---

### Task 1: Performance

**Files:** `src/render/Pixel2DRenderer.ts`, `src/render/palette.ts`, `src/net/useRoom.ts`, plus tests next to them.

1. **Renderer per-timeline caches.** Build these in `play()`, once per timeline, not per frame:
   - Each horse's boxes, sorted by `at`.
   - Each horse's pickup times, sorted. The opened count at `t` then comes from a binary search or pointer instead of `events.filter` per frame.

   Keep the behaviour identical, including the 10% reveal (`BOX_REVEAL`).
2. **Track ribbon.** Don't recompute `trackPoint` for about 900 points every frame.
   - `screen()` is an affine map (zoom, tilt and translate), so build the ribbon/rail `Path2D`s once per track in world coordinates.
   - Draw them under a `ctx.setTransform(...)` that matches `screen()`.
   - Line widths must stay visually the same, so compensate `lineWidth` for zoom or keep strokes in screen space.
3. **`colorsByPlayer`:** build a `Map` once per `players` array instead of calling `players.find` per call.
4. **`useRoom` coalescing.**
   - Bursts of `postgres_changes` (for example, N phones ticking) must trigger one `fetchRoom`, not N.
   - Coalesce with a trailing 150 ms timer; at most one fetch in flight, and if changes arrive during a fetch, run one more after it.
   - Resubscribe still refreshes immediately.
   - Unit-test the coalescing helper with fake timers by extracting it as a small pure function (e.g. `src/net/coalesce.ts`).
5. **Measure.** In `/sandbox`, record `performance.now()` frame cost before and after: average ms per frame over a long race in the dev build. Report both numbers in the commit body.

Commit: `perf: cache per-race render data and coalesce room refetches`.

---

### Task 2: Track shapes (geometry only)

**Files:** `src/render/track.ts`, `src/render/track.test.ts`, `src/render/Pixel2DRenderer.ts` (stands), `src/render/RaceView.tsx`, `src/play/MiniOval.tsx`, `src/app/Sandbox.tsx`, and camera tests if they import `TRACK`.

1. **Track type.** `Track` carries `id: TrackId`, `name`, `lap`, `laneWidth`, `finishS`, `point(s, offset): Point` and `stands: { x0, y0, x1, y1 }` (world metres).
   - Keep `trackPoint(track, s, offset)` as a thin wrapper over `track.point`, and `finishS(track)` reading the field, so callers don't change.
   - Define `type TrackId = 'oval' | 'speedway' | 'kidney'`.
   - Define `TRACKS: Record<TrackId, Track>` and `trackById(id: string | null | undefined): Track`, where unknown or null falls back to `oval`.
   - Keep `TRACK = TRACKS.oval` as an alias.
2. **`oval`.** Geometry unchanged: today's `oval(1200, 300, 2.5)`.
3. **`speedway`.** The same stadium construction with `straight = 420`: a longer straight with tighter bends.
4. **`kidney`.** A general sampled closed path. Write `sampledTrack(centre: (u: number) => Point, lap, laneWidth, ...)`, where `centre(u)` for u in [0, 1) gives the inner rail. It must:
   - sample the rail finely (e.g. 2000 points);
   - build a cumulative arc-length table, scaled so the total equals `lap`;
   - make `point(s, offset)` interpolate the rail position and push it out along the outward unit normal;
   - start s = 0 so that `finishS` (the finish line) sits on the bottom, the home stretch, in front of the stands.

   **Shape:** a bean, a stadium whose top (back) straight is pushed inward by a smooth dent.

   **Constraint:** the dent's radius of curvature must exceed the widest lane offset (22 lanes × 2.5 m = 55 m), or the outer lanes self-intersect.
5. **Stands placement.** Move the stands from the hard-coded `track.straight/2` / `track.radius` maths in `Pixel2DRenderer.ts` (~line 104) to `track.stands`, computed per shape below the home straight.
6. **Tests** in `track.test.ts`. For every track in `TRACKS`:
   - the inner-rail length ≈ `lap` (±0.5%);
   - `point` is continuous: adjacent 1 m samples ≤ 1.1 m apart at offset 0, and a bounded jump at offset 55;
   - the outer lane (offset 55) never crosses itself: no segment intersections on a 4 m sampling, O(n²) is fine in a test;
   - `trackById('nope')` returns oval.

   The existing oval tests must still pass unchanged.
7. **Callers.**
   - `RaceView` and `MiniOval` take an optional `track: Track` prop, defaulting to `TRACK`.
   - The Sandbox gets a small select (Oval / Speedway / Kidney) to check shapes by eye.
   - **Check by eye:** a long race on each shape, watching the bends, the stands, the finish line, the camera and the sprite poses.

Commit: `feat(render): speedway and kidney track shapes`.

---

### Task 3: Track choice per race

**Files:**
- new migration `20261104000014_tracks.sql`
- `src/net/rooms.ts`, `src/net/database.types.ts`
- `src/track/TrackPage.tsx` (host settings and RaceView)
- `src/play/PlayPage.tsx` (MiniOval)
- `src/history/StatsPage.tsx` (replays)
- `tests/db/*`

1. **Migration.**
   - `alter table public.rooms add column track text not null default 'oval' check (track in ('oval','speedway','kidney','random'));`
   - `alter table public.races add column track text not null default 'oval' check (track in ('oval','speedway','kidney'));`
   - `update_room_settings` vN gains `p_track text default null`, where null means keep. Keep all its existing checks; it stays host-locked and LOBBY only.
     - Drop the old signature first, so the client can't hit an ambiguous overload.
     - Re-apply the same revoke and grant as the old version.
   - `set_phase` vN: the race insert sets `track = case when v_room.track = 'random' then (array['oval','speedway','kidney'])[1 + floor(random()*3)::int] else v_room.track end`.
     - Copy the latest `set_phase` body (`_0012`) verbatim and change only the insert.
2. **DB tests.**
   - The host can set the track; a non-host can't.
   - The race copies the room's track.
   - `random` yields one of the three concrete values.
3. **Client.**
   - Host settings get a "Track" radio group (Oval / Speedway / Kidney / Random) next to the length radios, using the same pattern.
   - Big screen, phone MiniOval and stats replays use `trackById(race.track)`.
   - The big screen shows "Track: Kidney" (etc.) once the race exists.

Commit: `feat: host picks the track per race (oval, speedway, kidney or random)`.

---

### Task 4: Cosmetic shop — database

**Files:** new migration `20261104000015_cosmetics.sql`, `src/net/database.types.ts`, `tests/db/cosmetics.test.ts`.

**Catalog** (members start with 100 coins; a Speed box costs 60):

| code | slot | price |
|---|---|---|
| `pattern:hoops` | pattern | 150 |
| `pattern:sash` | pattern | 150 |
| `pattern:stars` | pattern | 200 |
| `trail:dust` | trail | 250 |
| `trail:sparkle` | trail | 400 |

1. **Migration.**
   - Ledger:
     - Extend the `coin_ledger` type check with `'cosmetic'`, and the raceless check so `cosmetic` rows may have a null `race_id`. Drop and re-add both constraints by name (see `_0008_office.sql:36-40`).
     - Make sure `private.balance` and `room_balances` count raceless `cosmetic` rows for office members, the same way they count `topup` / `admin_adjust`. Read their bodies, extend them if they filter by type, and test it either way.
   - `public.player_cosmetics`:
     - Columns: `player_id uuid references public.room_players(id) on delete cascade`, `code text not null`, `bought_at timestamptz not null default now()`, `primary key (player_id, code)`.
     - RLS on. Room members can select, following the existing `room_players` read policy. No direct insert, update or delete.
   - `room_players` gains `pattern text` and `trail text`, nullable, with checks that values start with `pattern:` / `trail:`.
   - `private.cosmetic_price(p_code text) returns int`: an immutable `case` over the catalog; null when unknown.
   - `public.buy_cosmetic(p_room uuid, p_code text) returns int`, the new balance:
     1. office room member only, using the same guards as `set_my_horse` (`_0009:204`);
     2. lock the caller's player row;
     3. the room must not be RUNNING, so wallets don't change mid-race;
     4. an unknown code raises `unknown_cosmetic`;
     5. already owned raises `already_owned`; this is the idempotency guard, backed by the primary key;
     6. a balance below the price raises `not_enough_coins`;
     7. insert `player_cosmetics` and a ledger row (`type 'cosmetic'`, `amount -price`, `race_id null`).
   - `public.equip_cosmetic(p_room uuid, p_slot text, p_code text)`:
     - `p_slot` is `pattern` or `trail`;
     - a null `p_code` unequips;
     - otherwise the code must be owned by the caller and match the slot;
     - it updates the caller's `room_players` row.
   - Grants match the other member RPCs.
2. **DB tests** (`tests/db/cosmetics.test.ts`, using `officeFixtures`):
   - buying debits the price and records ownership;
   - buying twice fails `already_owned` without a second debit;
   - not enough coins fails without a debit;
   - an unknown code fails;
   - a private (non-office) room fails;
   - buying while RUNNING fails;
   - equipping an unowned code fails;
   - equipping a wrong-slot code fails;
   - equipping and unequipping work;
   - another member sees the equipped `pattern` / `trail`;
   - balances (the `room_balances` RPC) are right after a purchase.

Commit: `feat(db): cosmetic shop (patterns and trails bought with coins)`.

---

### Task 5: Cosmetic shop — phone UI and rendering

**Files:**
- new `src/shop/cosmetics.ts` (catalog mirror: code, slot, name, price)
- `src/net/rooms.ts` (`buyCosmetic`, `equipCosmetic`, owned codes for the caller)
- `src/play/HorsePanel.tsx` (or a new `src/play/LooksShop.tsx` rendered from it)
- `src/render/palette.ts` (`HorseColors` gains optional `pattern`, `trail`)
- `src/render/sprites.ts`, `src/render/Pixel2DRenderer.ts`
- tests next to them

1. **Phone UI.**
   - An office member's horse panel gets a "Looks shop" section: catalog name, price, and a Buy / Wear / Remove state.
   - Buying needs a confirm tap showing the price, and is disabled while in flight.
   - Errors use the existing `role="alert"` pattern.
   - The shop is hidden in private rooms.
2. **Rendering.**
   - `colorsByPlayer` passes `pattern` / `trail` through.
   - Patterns draw over the jockey silk pixels in all 4 poses using a contrasting colour:
     - hoops: horizontal bands;
     - sash: a diagonal;
     - stars: 1–2 bright pixels.
   - Trails: a per-horse ring buffer of the last ~8 screen positions while moving, drawn as fading pixels behind the horse:
     - dust: brown-grey;
     - sparkle: gold/white flicker.

     No trail at the gate or after the horse has coasted out. No per-frame allocations beyond the ring buffer writes.
3. **Tests.**
   - The TS catalog prices equal the SQL `private.cosmetic_price` values. Assert them in a DB test via the service-role client if reachable; otherwise a literal table with a comment pointing at the migration.
   - `colorsByPlayer` passes the new fields through.
4. **Check by eye:** a `/sandbox` toggle gives lane 0 each pattern and trail.

Commit: `feat: looks shop on the phone; silk patterns and trails on the track`.

---

### Task 6: Accessibility

**Files:** `src/app/app.css`, `src/play/PlayPage.tsx`, `src/track/TrackPage.tsx`, `src/admin/AdminPage.tsx`, `src/render/RaceView.tsx`, `src/play/MiniOval.tsx`.

1. **Phone live region.** One visually-hidden `role="status" aria-live="polite"` region announces phase changes, e.g. "Shop is open", "Betting is open", "Race started", "You finished 3rd and won 40 coins".
   - It announces on change only, never per second.
   - Add a `.visually-hidden` utility class.
2. **Big screen.** The race canvas gets `role="img"` and an `aria-label` naming the race. A visually-hidden live region gives the top 3 at most every 10 s, and the result once.
3. **Contrast.**
   - Make the error red (`#c62828`) lighter under `prefers-color-scheme: dark`.
   - Darken white-on-`#3d7a3a` text backgrounds to ≥ 4.5:1.
   - Give white/yellow swatches a 1 px outline.
4. **Keyboard.** All actions are reachable, with a visible `:focus-visible` ring that is never removed. Native radio groups keep arrow-key behaviour.
5. **Motion.** With `prefers-reduced-motion: reduce`, floating cheers don't animate and the camera snaps instead of easing. The race itself still plays.

Commit: `feat(a11y): live announcements, canvas labels, contrast and focus`.

---

### Task 7: E2E tests (Playwright + axe)

**Files:**
- `package.json` (devDeps `@playwright/test`, `@axe-core/playwright`; script `test:e2e`)
- `playwright.config.ts`
- `tests/e2e/*.spec.ts`, `tests/e2e/helpers.ts`
- `.gitignore` (`test-results/`, `playwright-report/`)
- README

1. **Config.**
   - Chromium only, installed with `npx playwright install chromium`.
   - `webServer` runs `npm run dev -- --port 5180 --strictPort` with `reuseExistingServer: false`, and `baseURL` is `http://localhost:5180`.
   - It requires the local Supabase stack, and `.env.local` already points at it.
   - Make sure vitest's default run doesn't pick up `tests/e2e`.
2. **Helpers.**
   - Load keys the way `tests/db/helpers.ts` does (`npx supabase status -o env`) for service-role setup and cleanup.
   - Each phone is its own `browser.newContext()`, so each gets its own anonymous user.
   - Use the short race length. Generous per-test timeouts are fine (a race takes minutes).
3. **Specs.**
   - **`private-race.spec.ts`**
     1. The host creates a private room on `/`.
     2. 3 phone contexts join via `/play?code=…`, buy a box, and bet.
     3. The host moves through to the race.
     4. Mid-race the big screen reloads and resumes the same race (same race id, the race view keeps playing).
     5. The podium shows the same top 3 as the phones' results.
   - **`office.spec.ts`**
     - Admin login with the password from `supabase/functions/.env` (read it in code, never log it).
     - Create a member, log in on a phone with a PIN.
     - Buy and wear a cosmetic.
     - The host picks Kidney, a race starts, and the big screen shows "Track: Kidney".
     - Clean up the created members and races with the service role.
   - **`a11y.spec.ts`:** `AxeBuilder` on `/`, `/play` (joined), `/track` (lobby), `/admin` (logged in) and `/stats`. Expect no `serious` or `critical` violations. Fix small real ones in app code within this task, and report anything bigger.
4. **README:** an E2E bullet saying it needs Docker and the local stack, then `npm run test:e2e`.

Commit: `test(e2e): Playwright race, office and axe checks`.

---

### Task 8: Smoke test, docs, deploy

1. **Browser smoke test** (local):
   - a race on each shape;
   - a phone buys and wears a pattern and a trail;
   - the trail shows on the big screen;
   - the live regions update.
2. **`PROJECT_STATUS.md`:** add a Phase 9 section with:
   - task checkboxes;
   - a 2026-11-04 entry covering decisions, review fixes, checks with counts, before/after frame cost, and what's not verified.

   **README:** document the track setting, the looks shop and E2E.
3. **Deploy** (after merge, with the owner's go-ahead):
   1. `npx supabase db push --linked` (2 migrations);
   2. no Edge Function changes are expected; if a function file changed, `npx supabase functions deploy <name>`;
   3. push `master` (Vercel auto-deploys).
