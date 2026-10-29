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
  sim/   pure TypeScript race engine (no DOM/React/Node; `.ts` imports so Deno can use it)
  app/   React app shell
```
