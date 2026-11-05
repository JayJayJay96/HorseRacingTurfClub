---
name: supabase-feature-rollout
description: Use when a feature needs a Supabase migration, RPC changes, Edge Functions and a Vercel front end together. Covers migration patterns, tests, local stack quirks and safe deploy order.
---

# Rolling out a Supabase-backed feature

Learnt shipping weather, hot items, traits and the cosmetics shop on Turf Club.

## Migrations

- Before replacing a function, **diff its body against the latest definition** (grep every
  migration for `function <name>`) — older copies exist; only the intended lines may change.
- Adding a parameter: `drop function f(old args)` then `create function f(..., p_new text default 'x')`.
  The default keeps every existing 2-arg caller (tests, fixtures, deployed functions) working and
  avoids overload ambiguity.
- Every new RPC: `security definer`, `set search_path = ''`, explicit `revoke ... from public, anon,
  authenticated` and `grant` only to who needs it (service_role for admin/finish RPCs).
- Money/inventory RPCs: lock the room row then the player row (same helper as existing buys) so
  concurrent calls serialize; add a test firing two calls with `Promise.allSettled` and assert
  exactly one charge, one ledger row, one item.
- Keep one SQL source of truth for catalogues (`private.cosmetic_catalog()`) and a unit test that
  parses the migration and compares it with the client mirror.
- Office-wide switches: a column on the office room + an `admin_set_*` RPC + `admin_overview`
  field; tests that flip a global switch must restore it in `finally` and `afterAll`.

## Local stack

- `npx supabase db reset` wipes local data. Then regenerate types
  (`npx supabase gen types typescript --local > src/net/database.types.ts`, Git Bash) and prettier
  only that file so the diff stays minimal.
- Edge Functions only see files that existed at `supabase start`: after a function imports a new
  file (or after a reset), `npx supabase stop && npx supabase start`.
- Tests asserting exact RPC output (`toEqual` on `race_input`) need the new keys added.
- The realtime DB test flakes once after a reset; rerun alone.

## Deploy order (hosted)

1. `npx supabase migration list --linked` — confirm only the new migration is pending.
2. `npx supabase db push --linked` (DB first: new functions would call RPC signatures that don't
   exist yet; old functions keep working against the new DB thanks to defaults/extra ignored keys).
3. `npx supabase functions deploy <changed functions>` (only if they changed).
4. `git push origin master` (Vercel). Then poll the live bundle for a string unique to the change:
   `curl` the index, grep the asset name, grep the asset for the marker.
5. During the rolling window a race could be priced without the new feature — avoid racing mid-deploy.

## Values decided server-side

- Anything that affects money/outcomes (weather, crate roll) is rolled on the server (Edge Function
  crypto RNG or SQL `random()` for public, non-secret things) and stored; clients only read it.
