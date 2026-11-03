# Horse Racing Turf Club

Office horse race: everyone joins on their phone, buys powerup boxes, bets coins, and the big screen shows the race.
Spec: [`docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md`](docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md) · progress: [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | `tsc -b` only |
| `npm run lint` | oxlint |
| `npm test` | Fast unit tests |
| `npm run test:balance` | 10,000-race balance suite (takes minutes) |

## Layout

```
src/
  sim/      pure TypeScript race engine + playback maths (no DOM/React/Node; `.ts` imports so Deno can use it)
  render/   track geometry, camera, pixel 2D canvas renderer (RaceView)
  net/      Supabase client, room state, timeline loading
  track/    big screen (/track)        play/  phone (/play)        app/  shell, home, sandbox
```

## Local development

1. Install Docker Desktop and start it.
2. `npm install`
3. `npx supabase start` (first run downloads images)
4. Copy `.env.example` to `.env.local`; fill it from `npx supabase status -o env` (`API_URL`, `ANON_KEY`).
5. `npm run dev` — open `/` to host or join; `/sandbox` simulates and plays a race locally (no Supabase needed).

Tests:

- `npm test` — unit tests (no Docker)
- `npm run test:db` — database/RPC/RLS tests against the local stack. The realtime test can fail on the first run right after `db reset`; rerun once.
- `npm run test:balance` — 10,000-race balance suite (minutes)

Edge Functions:

- `npx supabase start` also serves the Edge Functions in `supabase/functions` (`lock-odds`, `start-race`), with hot reload.
- Hot reload only sees files that existed at `supabase start`: after adding a new file a function imports (e.g. a new `src/sim/*.ts`), run `npx supabase stop && npx supabase start` (data is kept). If functions return 503 right after Docker boots, restart the `supabase_edge_runtime_HorseRacingTurfClub` container.
- After editing `supabase/config.toml`, run `npx supabase stop && npx supabase start`.
- Function logs: `docker logs -f supabase_edge_runtime_HorseRacingTurfClub`.

After changing a migration: `npx supabase db reset`, then regenerate types (Git Bash):
`npx supabase gen types typescript --local > src/net/database.types.ts`

Testing with several devices:

- Real phones on the LAN: set `VITE_SUPABASE_URL=http://<pc-lan-ip>:54321` in `.env.local`, run `npm run dev -- --host`, and open the host page via `http://<pc-lan-ip>:5173`. `127.0.0.1` on a phone is the phone itself, and the QR code uses the host page's origin.
- Several "devices" on one PC: use separate origins (`localhost`, `127.0.0.1`, `a.localhost`, `b.localhost`). Each has its own storage and anonymous user.
