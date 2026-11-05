# Cosmetics Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the office Looks shop into a real shop: a live preview of your own horse with try-on, four new patterns, four new trails, two new slots (caps drawn on the jockey, victory celebrations on the podium) and a 250-coin mystery crate rolled on the server.

**Architecture:** One migration (`20261105000022_cosmetics_shop.sql`) moves the price list into `private.cosmetic_catalog()` (the single SQL source; `private.cosmetic_price` reads it), adds `room_players.cap` / `.celebration`, lets `equip_cosmetic` fill them, and adds `open_crate` (weighted 1/price with an exponential race over the unowned codes). The client mirrors the catalogue in `src/shop/cosmetics.ts` (a unit test parses the migration, a DB test buys every item). Cosmetics stay display-only: `HorseColors` gains `cap` and `celebration`; `drawHorse` draws patterns and caps (so the race, HD-2D sheet, cut-ins and `HorseSprite` all get them); a new `src/render/trails.ts` style table feeds both renderers; a `Celebration` wrapper in `src/track/Podium.tsx` animates the podium winner with CSS. The shop UI is split into testable files (`src/play/ShopParts.tsx`, `src/play/CrateTab.tsx`) wired by `LooksShop.tsx`, which imports `src/net/rooms.ts` and so can't be imported in Vitest. The sim never reads any of it, so race determinism is untouched.

**Tech Stack:** React 19, TypeScript strict (`.ts`/`.tsx` imports, `noUncheckedIndexedAccess`), Vite, Vitest in `node` (no jsdom/testing-library: tests use `renderToStaticMarkup` or call components and walk the element tree; effects never run in tests), Canvas 2D, three.js (HD-2D), Supabase Postgres (migrations, `tests/db` Vitest suite against the local stack), Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-05-cosmetics-shop-design.md`.

**Commands:** `npm test` (unit), `npx vitest run <file>` (one file), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:db` (needs `npx supabase start`; one file: `npm run test:db -- tests/db/cosmetics.test.ts`), `npm run test:e2e` (needs `npx supabase start`; it starts its own dev server on port 5180). Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not `prettier --write` whole folders (it rewrites line endings on unrelated files); format only files you touched (`npx prettier --write <files>`). No emoji newer than Emoji 12 (`src/app/emojiSupport.test.ts`); the only emoji this plan adds is 🎁 (U+1F381, Emoji 1.0). **No deploy in this plan:** the owner reviews the screenshots from Task 12 first.

**Conventions used below:** `SSR` = `renderToStaticMarkup` (it inserts `<!-- -->` between adjacent JSX text nodes, so components that tests read build text with one template string). Cosmetic codes are `slot:name`. The jockey's body rect in `drawHorse` is `(bx, by, bw, bh)`; this plan adds the cap's top-left `(cx, cy)` (2×2 px) next to it. A sprite cell is `CELL` = 24×22 with hooves at (12, 21) (`src/render/hd2d/sheet.ts`).

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261105000022_cosmetics_shop.sql` (create) | `private.cosmetic_catalog`, `private.cosmetic_price` (reads it), `room_players.cap/.celebration`, `equip_cosmetic` (4 slots), `open_crate` |
| `src/net/database.types.ts` (regenerate) | new columns and `open_crate` |
| `tests/db/cosmetics.test.ts` (modify) | new slots, crate rules, crate distribution |
| `src/shop/cosmetics.ts` (modify) | `CosmeticSlot` (+cap, celebration), `SLOTS`, full `COSMETICS`, `CRATE_PRICE` |
| `src/shop/cosmetics.test.ts` (create) | catalogue shape; client == SQL (parses the migration) |
| `src/render/palette.ts` (modify) | `HorseColors.cap/.celebration`; `colorsFor` passes them |
| `src/render/HorseSprite.tsx` (modify) | `sameColors` compares `cap` |
| `src/render/sprites.ts` (modify) | 4 new patterns, 4 caps (all poses) |
| `src/render/sprites.test.ts` (modify) | patterns and caps draw, differ, and stay in the cell |
| `src/render/trails.ts` (create) | `TRAIL_STYLES` (2D shape/lift/colour, HD size/glow/lift), `drawMark` |
| `src/render/Pixel2DRenderer.ts`, `src/render/hd2d/HD2DRenderer.ts` (modify) | trails from `TRAIL_STYLES` |
| `src/track/Podium.tsx` (modify) | `CELEBRATIONS`, `celebrationClass`, `Celebration` |
| `src/track/TrackPage.tsx` (modify) | podium winner wrapped in `Celebration` |
| `src/net/rooms.ts` (modify) | `openCrate`, `nothing_left` text |
| `src/play/ShopParts.tsx` (create) | `TABS`, `ShopTabs`, `cardState`, `wearing`, `TrailMarks`, `ShopPreview`, `ShopCard` |
| `src/play/CrateTab.tsx` (create) | crate price, Open + confirm, reveal, "You own everything!" |
| `src/play/LooksShop.tsx` (rewrite), `src/play/HorsePanel.tsx`, `src/play/PlayPage.tsx` (modify) | wiring; `colors` prop for the preview |
| `src/app/Sandbox.tsx` (modify) | lane-1 cap/celebration pickers, podium preview |
| `src/app/app.css` (modify) | celebrations, shop tabs/cards/preview, crate reveal; reduced motion |
| `tests/e2e/a11y.spec.ts` (modify) | axe on every shop tab |
| `PROJECT_STATUS.md` (modify) | status section |

---

### Task 1: Catalogue on both ends (migration, DB tests, types, client list)

**Files:**
- Create: `supabase/migrations/20261105000022_cosmetics_shop.sql`, `src/shop/cosmetics.test.ts`
- Modify: `src/shop/cosmetics.ts`, `tests/db/cosmetics.test.ts`, `src/net/database.types.ts` (regenerated), `src/app/Sandbox.tsx` (one line)

- [ ] **Step 1: Write the failing unit test** `src/shop/cosmetics.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COSMETICS, CRATE_PRICE, SLOTS } from './cosmetics.ts';

const sql = readFileSync(
  new URL('../../supabase/migrations/20261105000022_cosmetics_shop.sql', import.meta.url),
  'utf8',
);

describe('catalogue', () => {
  it('is the approved price list (spec 2026-11-05 cosmetics shop)', () => {
    expect(Object.fromEntries(COSMETICS.map((c) => [c.code, c.price]))).toEqual({
      'pattern:hoops': 150,
      'pattern:sash': 150,
      'pattern:stars': 200,
      'pattern:chevrons': 150,
      'pattern:quarters': 150,
      'pattern:dots': 200,
      'pattern:lightning': 250,
      'trail:dust': 250,
      'trail:sparkle': 400,
      'trail:hearts': 300,
      'trail:fire': 400,
      'trail:rainbow': 500,
      'trail:bubbles': 300,
      'cap:pompom': 200,
      'cap:horns': 250,
      'cap:halo': 300,
      'cap:crown': 400,
      'celebration:spin': 500,
      'celebration:fireworks': 650,
      'celebration:moonwalk': 650,
      'celebration:cannon': 800,
    });
    expect(CRATE_PRICE).toBe(250);
  });
  it('codes are unique, start with their slot, and every slot sells something', () => {
    expect(new Set(COSMETICS.map((c) => c.code)).size).toBe(COSMETICS.length);
    for (const c of COSMETICS) expect(c.code.startsWith(`${c.slot}:`), c.code).toBe(true);
    expect(SLOTS).toEqual(['pattern', 'trail', 'cap', 'celebration']);
    for (const s of SLOTS) expect(COSMETICS.some((c) => c.slot === s), s).toBe(true);
  });
  it('mirrors private.cosmetic_catalog and the crate price in the migration', () => {
    const start = sql.indexOf('create function private.cosmetic_catalog');
    const body = sql.slice(start, sql.indexOf('$$;', start));
    const rows = [...body.matchAll(/\('([a-z]+:[a-z]+)'(?:::text)?, (\d+)\)/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]);
    expect(rows).toEqual(COSMETICS.map((c) => [c.code, c.price]));
    expect(sql).toContain(`v_balance < ${CRATE_PRICE}`);
    expect(sql).toContain(`'cosmetic', -${CRATE_PRICE})`);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/shop/cosmetics.test.ts`
Expected: FAIL (`CRATE_PRICE`/`SLOTS` are not exported; the migration file does not exist).

- [ ] **Step 3: Client catalogue.** Replace all of `src/shop/cosmetics.ts` with:

```ts
export type CosmeticSlot = 'pattern' | 'trail' | 'cap' | 'celebration';
export const SLOTS: readonly CosmeticSlot[] = ['pattern', 'trail', 'cap', 'celebration'];
export type Cosmetic = {
  readonly code: string;
  readonly slot: CosmeticSlot;
  readonly name: string;
  readonly price: number;
};

/**
 * Mirrors `private.cosmetic_catalog` in supabase/migrations/20261105000022_cosmetics_shop.sql, in the
 * same order (src/shop/cosmetics.test.ts compares them). The server is the source of truth.
 */
export const COSMETICS: readonly Cosmetic[] = [
  { code: 'pattern:hoops', slot: 'pattern', name: 'Hoops silks', price: 150 },
  { code: 'pattern:sash', slot: 'pattern', name: 'Sash silks', price: 150 },
  { code: 'pattern:stars', slot: 'pattern', name: 'Star silks', price: 200 },
  { code: 'pattern:chevrons', slot: 'pattern', name: 'Chevron silks', price: 150 },
  { code: 'pattern:quarters', slot: 'pattern', name: 'Quartered silks', price: 150 },
  { code: 'pattern:dots', slot: 'pattern', name: 'Polka-dot silks', price: 200 },
  { code: 'pattern:lightning', slot: 'pattern', name: 'Lightning silks', price: 250 },
  { code: 'trail:dust', slot: 'trail', name: 'Dust trail', price: 250 },
  { code: 'trail:sparkle', slot: 'trail', name: 'Sparkle trail', price: 400 },
  { code: 'trail:hearts', slot: 'trail', name: 'Heart trail', price: 300 },
  { code: 'trail:fire', slot: 'trail', name: 'Fire trail', price: 400 },
  { code: 'trail:rainbow', slot: 'trail', name: 'Rainbow trail', price: 500 },
  { code: 'trail:bubbles', slot: 'trail', name: 'Bubble trail', price: 300 },
  { code: 'cap:pompom', slot: 'cap', name: 'Pompom cap', price: 200 },
  { code: 'cap:horns', slot: 'cap', name: 'Devil horns', price: 250 },
  { code: 'cap:halo', slot: 'cap', name: 'Halo', price: 300 },
  { code: 'cap:crown', slot: 'cap', name: 'Crown', price: 400 },
  { code: 'celebration:spin', slot: 'celebration', name: 'Spin', price: 500 },
  { code: 'celebration:fireworks', slot: 'celebration', name: 'Fireworks', price: 650 },
  { code: 'celebration:moonwalk', slot: 'celebration', name: 'Moonwalk', price: 650 },
  { code: 'celebration:cannon', slot: 'celebration', name: 'Confetti cannon', price: 800 },
];

/** Mirrors the literal in `public.open_crate` (same migration). */
export const CRATE_PRICE = 250;
```

In `src/app/Sandbox.tsx`, function `Sandbox`, change
`useState<Record<CosmeticSlot, string>>({ pattern: '', trail: '' })` to
`useState<Record<CosmeticSlot, string>>({ pattern: '', trail: '', cap: '', celebration: '' })` (the pickers for the new slots come in Task 10).

- [ ] **Step 4: The migration** `supabase/migrations/20261105000022_cosmetics_shop.sql`:

```sql
-- Cosmetics shop (spec 2026-11-05-cosmetics-shop-design): more patterns and trails, caps and victory
-- celebrations (new slots), and a 250-coin mystery crate. The catalogue is mirrored by COSMETICS and
-- CRATE_PRICE in src/shop/cosmetics.ts (src/shop/cosmetics.test.ts parses this file). Display only:
-- the race engine never reads these columns.

-- One list for prices and the crate. Keep the client order.
create function private.cosmetic_catalog()
returns table (code text, price integer)
language sql
immutable
set search_path = ''
as $$
  values
    ('pattern:hoops'::text, 150),
    ('pattern:sash', 150),
    ('pattern:stars', 200),
    ('pattern:chevrons', 150),
    ('pattern:quarters', 150),
    ('pattern:dots', 200),
    ('pattern:lightning', 250),
    ('trail:dust', 250),
    ('trail:sparkle', 400),
    ('trail:hearts', 300),
    ('trail:fire', 400),
    ('trail:rainbow', 500),
    ('trail:bubbles', 300),
    ('cap:pompom', 200),
    ('cap:horns', 250),
    ('cap:halo', 300),
    ('cap:crown', 400),
    ('celebration:spin', 500),
    ('celebration:fireworks', 650),
    ('celebration:moonwalk', 650),
    ('celebration:cannon', 800)
$$;
revoke execute on function private.cosmetic_catalog() from public;

-- Same signature as _0015, so buy_cosmetic picks up the new codes; privileges are kept.
create or replace function private.cosmetic_price(p_code text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select c.price from private.cosmetic_catalog() c where c.code = p_code;
$$;

-- Equipped cap and celebration (null = none), checked by prefix like pattern/trail (_0015).
alter table public.room_players
  add column cap text check (cap like 'cap:%'),
  add column celebration text check (celebration like 'celebration:%');

-- _0015's equip_cosmetic with the two new slots.
create or replace function public.equip_cosmetic(p_room uuid, p_slot text, p_code text)
returns public.room_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_office_member(p_room);
begin
  if p_slot is null or p_slot not in ('pattern', 'trail', 'cap', 'celebration')
     or (p_code is not null and p_code not like p_slot || ':%') then
    raise exception 'wrong_slot';
  end if;
  if p_code is not null
     and not exists (select 1 from public.player_cosmetics where player_id = v_player.id and code = p_code) then
    raise exception 'not_owned';
  end if;
  update public.room_players
    set pattern = case when p_slot = 'pattern' then p_code else pattern end,
        trail = case when p_slot = 'trail' then p_code else trail end,
        cap = case when p_slot = 'cap' then p_code else cap end,
        celebration = case when p_slot = 'celebration' then p_code else celebration end
    where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;

-- Mystery crate: 250 coins for a random item the caller doesn't own, chance proportional to 1/price.
-- Exponential race: each candidate draws Exp(1) * price and the smallest wins, which picks code i with
-- probability (1/price_i) / sum(1/price). Same locking as buy_cosmetic; LOBBY only.
create function public.open_crate(p_room uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.room_players := private.lock_office_member(p_room);
  v_code text;
  v_balance integer;
begin
  if (select phase from public.rooms where id = p_room) <> 'LOBBY' then
    raise exception 'wrong_phase';
  end if;
  select c.code into v_code
    from private.cosmetic_catalog() c
    where not exists (
      select 1 from public.player_cosmetics o where o.player_id = v_player.id and o.code = c.code
    )
    order by -ln(1 - random()) * c.price
    limit 1;
  if v_code is null then
    raise exception 'nothing_left';
  end if;
  v_balance := private.balance((select race_id from public.rooms where id = p_room), v_player.id);
  if v_balance < 250 then
    raise exception 'not_enough_coins';
  end if;
  insert into public.player_cosmetics (player_id, code) values (v_player.id, v_code);
  insert into public.coin_ledger (room_id, player_id, type, amount)
  values (p_room, v_player.id, 'cosmetic', -250);
  return v_code;
end;
$$;
revoke execute on function public.open_crate(uuid) from public, anon;
grant execute on function public.open_crate(uuid) to authenticated;
```

- [ ] **Step 5: Run the unit test**

Run: `npx vitest run src/shop/cosmetics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing DB tests.** In `tests/db/cosmetics.test.ts`, replace the import line `import { COSMETICS } from '../../src/shop/cosmetics.ts';` with

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { COSMETICS, CRATE_PRICE } from '../../src/shop/cosmetics.ts';
```

and append at the end of the file:

```ts
describe('caps and celebrations', () => {
  it('equip, unequip and show to other members', async () => {
    const { room } = await officeRoom();
    const m = await richMember(1000);
    const other = await member('O');
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'cap:crown' }));
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'celebration:spin' }));
    await ok(
      m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: 'cap', p_code: 'cap:crown' }),
    );
    await ok(
      m.client.rpc('equip_cosmetic', {
        p_room: room.id,
        p_slot: 'celebration',
        p_code: 'celebration:spin',
      }),
    );
    const seen = async () =>
      (
        (await ok(
          other.client
            .from('room_players')
            .select('pattern, trail, cap, celebration')
            .eq('id', m.player.id),
        )) as Record<string, string | null>[]
      )[0];
    expect(await seen()).toEqual({
      pattern: null,
      trail: null,
      cap: 'cap:crown',
      celebration: 'celebration:spin',
    });
    await ok(m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: 'cap', p_code: null }));
    expect(await seen()).toEqual({
      pattern: null,
      trail: null,
      cap: null,
      celebration: 'celebration:spin',
    });
  });

  it('reject unowned, unknown and wrong-slot codes', async () => {
    const { room } = await officeRoom();
    const m = await richMember(1000);
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'celebration:cannon' }));
    const equip = (slot: string, code: string) =>
      fails(m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: slot, p_code: code }));
    expect(await equip('cap', 'cap:halo')).toBe('not_owned');
    expect(await equip('cap', 'cap:wizard')).toBe('not_owned');
    expect(await equip('cap', 'celebration:cannon')).toBe('wrong_slot');
    expect(
      await fails(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'cap:wizard' })),
    ).toBe('unknown_cosmetic');
  });

  it('the columns only hold their own slot', async () => {
    await officeRoom();
    const m = await member('K');
    const set = (row: Record<string, string>) =>
      fails(adminClient().from('room_players').update(row).eq('id', m.player.id));
    expect(await set({ cap: 'pattern:hoops' })).toMatch(/check constraint/);
    expect(await set({ celebration: 'cap:crown' })).toMatch(/check constraint/);
  });
});

describe('open_crate', () => {
  const open = (m: { client: SupabaseClient }, roomId: string) =>
    m.client.rpc('open_crate', { p_room: roomId });

  it('gives an item you do not own for exactly the crate price, once', async () => {
    const { room } = await officeRoom();
    const m = await richMember(400);
    const code = (await ok(open(m, room.id))) as string;
    expect(COSMETICS.map((c) => c.code)).toContain(code);
    expect(await owned(m.player.id)).toEqual([code]);
    expect(await ledger(m.player.id)).toEqual([
      { type: 'cosmetic', amount: -CRATE_PRICE, race_id: null },
    ]);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(500 - CRATE_PRICE);
  });

  it('never returns an owned item; with nothing left it fails without a debit', async () => {
    const { room } = await officeRoom();
    const m = await richMember(1000);
    const last = 'celebration:cannon'; // the rarest, so only "not owned" explains the pick
    await ok(
      adminClient()
        .from('player_cosmetics')
        .insert(
          COSMETICS.filter((c) => c.code !== last).map((c) => ({
            player_id: m.player.id,
            code: c.code,
          })),
        ),
    );
    expect(await ok(open(m, room.id))).toBe(last);
    expect(await fails(open(m, room.id))).toBe('nothing_left');
    expect(await ledger(m.player.id)).toHaveLength(1);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(1100 - CRATE_PRICE);
  });

  it('not enough coins fails without a debit or an item', async () => {
    const { room } = await officeRoom();
    const m = await richMember(CRATE_PRICE - 101); // CRATE_PRICE - 1 in all
    expect(await fails(open(m, room.id))).toBe('not_enough_coins');
    expect(await owned(m.player.id)).toEqual([]);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(CRATE_PRICE - 1);
  });

  it('only in the LOBBY', async () => {
    const r = await officeRoom();
    const m = await richMember(500);
    const b = await member('B');
    await officeRace(r, [m, b], [m.player.id, b.player.id], {
      shop: async () => expect(await fails(open(m, r.room.id))).toBe('wrong_phase'),
    });
    expect(await owned(m.player.id)).toEqual([]);
    expect(await ledger(m.player.id)).toEqual([]);
  });

  it('a private room fails; non-members cannot open', async () => {
    const host = await anonClient();
    const room = await ok(host.rpc('create_room', {}));
    const phone = await anonClient();
    await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    expect(await fails(phone.rpc('open_crate', { p_room: room.id }))).toBe('office_only');
    const office = await officeRoom();
    const stranger = await anonClient();
    expect(await fails(stranger.rpc('open_crate', { p_room: office.room.id }))).toBe(
      'not_in_room',
    );
  });

  it('over many opens the pick follows 1/price (loose chi-square)', async () => {
    const { room } = await officeRoom();
    const OPENS = 400;
    const m = await richMember(OPENS * CRATE_PRICE - 100); // exactly OPENS crates with the starting 100
    const counts = new Map<string, number>();
    for (let n = 0; n < OPENS; n++) {
      const code = (await ok(open(m, room.id))) as string;
      counts.set(code, (counts.get(code) ?? 0) + 1);
      // Forget it again, so every open draws from the whole catalogue.
      await ok(
        adminClient().from('player_cosmetics').delete().eq('player_id', m.player.id).select(),
      );
    }
    const total = COSMETICS.reduce((s, c) => s + 1 / c.price, 0);
    let chi = 0;
    for (const c of COSMETICS) {
      const expected = (OPENS * (1 / c.price)) / total;
      chi += ((counts.get(c.code) ?? 0) - expected) ** 2 / expected;
    }
    // 20 degrees of freedom: p = 0.001 sits at 45.3, so 60 only trips on a broken weighting
    // (a uniform pick scores well over 100 here), not on bad luck.
    expect(chi).toBeLessThan(60);
    const celebrations = COSMETICS.filter((c) => c.slot === 'celebration').reduce(
      (s, c) => s + (counts.get(c.code) ?? 0),
      0,
    );
    expect(celebrations / OPENS).toBeGreaterThan(0.02); // expected ~8%
    expect(celebrations / OPENS).toBeLessThan(0.16);
  }, 180_000);
});
```

- [ ] **Step 7: Apply the migration and run the DB tests**

First run `npm run test:db -- tests/db/cosmetics.test.ts` against the old schema.
Expected: FAIL (`Could not find the function public.open_crate`, `column room_players.cap does not exist`, `unknown_cosmetic` for `cap:crown`).

Run: `npx supabase start` (if not running), `npx supabase db reset`, then (Git Bash) `npx supabase gen types typescript --local > src/net/database.types.ts`
Expected: `src/net/database.types.ts` now has `cap: string | null`, `celebration: string | null` in `room_players` and an `open_crate` function (`Args: { p_room: string }`, `Returns: string`).

Run: `npm run test:db -- tests/db/cosmetics.test.ts`
Expected: PASS, including the existing `catalog parity` test, which now buys all 21 items and checks every debit against `COSMETICS`.

- [ ] **Step 8: Typecheck and the rest**

Run: `npm run typecheck; npm run lint; npm test; npm run test:db`
Expected: all pass. `LooksShop`'s `mine[c.slot]` compiles because the regenerated `RoomPlayer` has `cap`/`celebration`; the shop lists the new items in its flat list until Task 8.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261105000022_cosmetics_shop.sql src/net/database.types.ts src/shop/cosmetics.ts src/shop/cosmetics.test.ts tests/db/cosmetics.test.ts src/app/Sandbox.tsx
git commit -m "feat(shop): catalogue with caps, celebrations and the mystery crate (server)"
```

---

### Task 2: `HorseColors.cap` and `.celebration`

**Files:**
- Modify: `src/render/palette.ts`, `src/render/palette.test.ts`, `src/render/HorseSprite.tsx`, `src/render/HorseSprite.test.tsx`

- [ ] **Step 1: Write the failing tests.** In `src/render/palette.test.ts`, inside `describe('colorsByPlayer', ...)`, add:

```ts
  it('passes the worn cap and celebration through', () => {
    const colors = colorsByPlayer([
      { id: 'a', coat: 1, silk: 2, cap: 'cap:crown', celebration: 'celebration:spin' },
      { id: 'b', coat: null, silk: null, cap: null, celebration: null },
    ]);
    expect(colors('a', 0)).toMatchObject({ cap: 'cap:crown', celebration: 'celebration:spin' });
    expect(colors('b', 1)).toMatchObject({ cap: null, celebration: null });
    expect(horseColors([{ id: 'a', coat: null, silk: null, cap: 'cap:halo' }], [], 'a').cap).toBe(
      'cap:halo',
    );
  });
```

In `src/render/HorseSprite.test.tsx`, inside `describe('sameColors', ...)`, add:

```ts
  it('a different cap redraws; a celebration does not (it is not drawn on the sprite)', () => {
    const c = colorsOf(0);
    expect(sameColors(c, { ...c, cap: 'cap:crown' })).toBe(false);
    expect(sameColors({ ...c, cap: null }, c)).toBe(true);
    expect(sameColors(c, { ...c, celebration: 'celebration:spin' })).toBe(true);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/render/palette.test.ts src/render/HorseSprite.test.tsx`
Expected: FAIL (`colorsFor` drops `cap`/`celebration`, so `toMatchObject` fails; `sameColors` ignores `cap`).

- [ ] **Step 3: Implement.** In `src/render/palette.ts`:

`interface HorseColors` — after `readonly trail?: string | null;` add:

```ts
  /** Drawn on the jockey's head by drawHorse (`cap:crown`, ...). */
  readonly cap?: string | null;
  /** Podium winner animation only (`celebration:spin`, ...); never drawn on a sprite. */
  readonly celebration?: string | null;
```

`type Choice` — after `trail?: string | null;` add `cap?: string | null;` and `celebration?: string | null;`.

`colorsFor` — in the returned object, after `trail: choice.trail,` add:

```ts
    cap: choice.cap,
    celebration: choice.celebration,
```

and change its doc comment to "A member's chosen coat/silk (null = lane default) and worn looks."

In `src/render/HorseSprite.tsx`, `sameColors`: change the comment to "Colours that change what is drawn. `trail` and `celebration` are not drawn on a sprite, so they are ignored." and append `&& (a.cap ?? null) === (b.cap ?? null)` after the pattern comparison.

- [ ] **Step 4: Run them**

Run: `npx vitest run src/render/palette.test.ts src/render/HorseSprite.test.tsx; npm run typecheck`
Expected: PASS; typecheck clean (`RoomPlayer` rows already carry `cap`/`celebration` from Task 1, so every `horseColors(players, ...)` / `colorsByPlayer(players)` caller passes them with no change).

- [ ] **Step 5: Commit**

```bash
git add src/render/palette.ts src/render/palette.test.ts src/render/HorseSprite.tsx src/render/HorseSprite.test.tsx
git commit -m "feat(render): horse colours carry cap and celebration"
```

---

### Task 3: Four new silk patterns in `drawHorse`

**Files:**
- Modify: `src/render/sprites.ts`, `src/render/sprites.test.ts`

- [ ] **Step 1: Write the failing test.** Replace the two import lines of `src/render/sprites.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { COSMETICS } from '../shop/cosmetics.ts';
import { CELL, FRAMES, POSES } from './hd2d/sheet.ts';
import { colorsOf, type HorseColors } from './palette.ts';
import { drawHorse, poseOf } from './sprites.ts';
```

and append:

```ts
type Rect = { fill: string; x: number; y: number; w: number; h: number };

/** Records each fillRect in canvas pixels, with drawHorse's translate + scale applied. */
function recorder() {
  const rects: Rect[] = [];
  let fill = '';
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
    },
    save() {},
    restore() {
      tx = ty = 0;
      sx = sy = 1;
    },
    translate(x: number, y: number) {
      tx = x;
      ty = y;
    },
    scale(x: number, y: number) {
      sx = x;
      sy = y;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const x0 = tx + sx * x;
      const x1 = tx + sx * (x + w);
      rects.push({ fill, x: Math.min(x0, x1), y: ty + sy * y, w: Math.abs(x1 - x0), h: sy * h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

/** What drawHorse paints in one CELL (hooves at the cell foot), at size 1. */
function paint(colors: HorseColors, frame: number, pose: (typeof POSES)[number]) {
  const r = recorder();
  drawHorse(r.ctx, CELL.footX, CELL.footY, colors, frame, pose, 1);
  return r.rects;
}

const codes = (slot: string) => COSMETICS.filter((c) => c.slot === slot).map((c) => c.code);

describe('drawHorse patterns', () => {
  it('every pattern adds pixels in every pose and frame, and no two look the same', () => {
    for (const pose of POSES) {
      for (let f = 0; f < FRAMES; f++) {
        const plain = paint(colorsOf(0), f, pose).length;
        const looks = new Set<string>();
        for (const code of codes('pattern')) {
          const extra = paint({ ...colorsOf(0), pattern: code }, f, pose).slice(plain);
          expect(extra.length, `${code} ${pose} ${f}`).toBeGreaterThan(0);
          looks.add(JSON.stringify(extra));
        }
        expect(looks.size, `${pose} ${f}`).toBe(codes('pattern').length);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/render/sprites.test.ts`
Expected: FAIL (`pattern:chevrons side-right 0`: `extra.length` is 0, unknown patterns draw nothing).

- [ ] **Step 3: Implement.** In `src/render/sprites.ts`, function `drawHorse`, inside `if (colors.pattern) { ... }`, the `else if` chain ends with the `pattern:stars` branch (`px(bx, by + 1, 1, 1, ink);` / `px(bx + bw - 1, by + bh - 1, 1, 1, ink);`). Between that branch's last statement and the chain's closing `}`, add:

```ts
    } else if (colors.pattern === 'pattern:chevrons') {
      for (let i = 0; i < bw; i++) px(bx + i, by + 1 + Math.min(i, bw - 1 - i), 1, 1, ink);
    } else if (colors.pattern === 'pattern:quarters') {
      const hw = Math.ceil(bw / 2);
      const hh = Math.ceil(bh / 2);
      px(bx, by, hw, hh, ink);
      px(bx + hw, by + hh, bw - hw, bh - hh, ink);
    } else if (colors.pattern === 'pattern:dots') {
      for (let r = 1; r < bh; r += 2) {
        for (let c = (r >> 1) % 2; c < bw; c += 2) px(bx + c, by + r, 1, 1, ink);
      }
    } else if (colors.pattern === 'pattern:lightning') {
      // Gold bolt on dark silks, the contrast ink on light ones (gold would vanish on yellow).
      const bolt = ink === '#ffffff' ? '#ffd54f' : ink;
      px(bx + bw - 1, by, 1, 1, bolt);
      px(bx + 1, by + 1, bw - 1, 1, bolt);
      px(bx, by + 2, bw - 1, 1, bolt);
      if (bh > 3) px(bx, by + 3, 1, 1, bolt);
```

(Hoops, sash and stars are unchanged, so owned patterns look as before.)

- [ ] **Step 4: Run it**

Run: `npx vitest run src/render/sprites.test.ts src/render/HorseSprite.test.tsx src/render/hd2d/sheet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/sprites.ts src/render/sprites.test.ts
git commit -m "feat(render): chevron, quartered, polka-dot and lightning silks"
```

---

### Task 4: Caps on the jockey (all poses, size 1)

**Files:**
- Modify: `src/render/sprites.ts`, `src/render/sprites.test.ts`

- [ ] **Step 1: Write the failing test.** `src/render/sprites.test.ts` already has `Rect`, `recorder`, `paint` and `codes` (Task 3). Append:

```ts
describe('drawHorse caps', () => {
  const inCell = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= CELL.w && r.y + r.h <= CELL.h;

  it('every cap adds at least 2 px, differs from the others, and stays inside the cell', () => {
    for (const pose of POSES) {
      for (let f = 0; f < FRAMES; f++) {
        const plain = paint(colorsOf(0), f, pose).length;
        const looks = new Set<string>();
        for (const code of codes('cap')) {
          const all = paint({ ...colorsOf(0), cap: code }, f, pose);
          const extra = all.slice(plain);
          expect(
            extra.reduce((a, r) => a + r.w * r.h, 0),
            `${code} ${pose} ${f}`,
          ).toBeGreaterThanOrEqual(2);
          // The HD sheet and HorseSprite draw one CELL per frame: a pixel outside would bleed.
          expect(all.filter((r) => !inCell(r)), `${code} ${pose} ${f}`).toEqual([]);
          looks.add(JSON.stringify(extra));
        }
        expect(looks.size).toBe(codes('cap').length);
      }
    }
  });

  it('a cap and a pattern together still draw both', () => {
    const pattern = paint({ ...colorsOf(0), pattern: 'pattern:hoops' }, 1, 'side-right');
    const both = paint(
      { ...colorsOf(0), pattern: 'pattern:hoops', cap: 'cap:crown' },
      1,
      'side-right',
    );
    expect(both.length).toBeGreaterThan(pattern.length);
    expect(both.some((r) => r.fill === '#ffd54f')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/render/sprites.test.ts`
Expected: FAIL (`cap:pompom side-right 0`: area 0).

- [ ] **Step 3: Implement.** In `src/render/sprites.ts`, function `drawHorse`:

1. After `let bh = 4;` add:

```ts
  // Top-left of the jockey's 2×2 cap in this pose, which a bought cap decorates.
  let cx = 0;
  let cy = -14;
```

2. In the `pose === 'away'` branch, after `px(-1, -15, 2, 2, silk); // cap` add `cx = -1;` and `cy = -15;`.
3. In the `pose === 'toward'` branch, after `px(-4, -15, 2, 2, silk); // cap` add `cx = -4;` and `cy = -15;`.
   (The side views keep the defaults: their cap is `px(0, -14, 2, 2, silk)`.)
4. After the whole `if (colors.pattern) { ... }` block and before `ctx.restore();` add:

```ts
  if (colors.cap) {
    // Highest pixel is cy - 2 (-17 in the away view): with the gallop lift it stays in the 22 px cell.
    const gold = '#ffd54f';
    if (colors.cap === 'cap:pompom') {
      px(cx, cy - 2, 2, 2, contrastOf(silk)); // bobble
    } else if (colors.cap === 'cap:horns') {
      px(cx - 1, cy - 2, 1, 2, '#c62828');
      px(cx + 2, cy - 2, 1, 2, '#c62828');
    } else if (colors.cap === 'cap:halo') {
      px(cx - 1, cy - 2, 4, 1, gold); // floats one pixel above the cap
    } else if (colors.cap === 'cap:crown') {
      px(cx - 1, cy - 1, 4, 1, gold);
      px(cx - 1, cy - 2, 1, 1, gold);
      px(cx + 2, cy - 2, 1, 1, gold);
      px(cx, cy - 2, 2, 1, '#e53935'); // jewel between the points
    }
  }
```

Caps are drawn by `drawHorse`, so the 2D race, the HD-2D sheet (`drawSheet` draws every lane, pose and frame through `drawHorse` at the cell foot when a race starts), cut-in portraits, every `HorseSprite` and the podium show them with no further change.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/render; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/sprites.ts src/render/sprites.test.ts
git commit -m "feat(render): pompom, horns, halo and crown caps"
```

---

### Task 5: Trail styles for both renderers

**Files:**
- Create: `src/render/trails.ts`, `src/render/trails.test.ts`
- Modify: `src/render/Pixel2DRenderer.ts`, `src/render/hd2d/HD2DRenderer.ts`

- [ ] **Step 1: Write the failing test** `src/render/trails.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COSMETICS } from '../shop/cosmetics.ts';
import { TRAIL_STYLES, drawMark, type TrailShape } from './trails.ts';

describe('TRAIL_STYLES', () => {
  it('styles every trail in the shop, with #rrggbb colours and lifts for every sample', () => {
    for (const c of COSMETICS.filter((x) => x.slot === 'trail')) {
      const s = TRAIL_STYLES[c.code];
      expect(s, c.code).toBeDefined();
      for (let i = 0; i <= 8; i++) {
        for (const t of [0, 0.37, 12.5, 90]) {
          expect(s!.color(i, t), c.code).toMatch(/^#[0-9a-f]{6}$/);
        }
        expect(s!.lift(i)).toBeGreaterThanOrEqual(0);
        expect(s!.hd.lift(i)).toBeGreaterThan(0);
      }
      expect(s!.hd.size).toBeGreaterThan(0);
    }
  });
  it('dust and sparkle keep their old 2D look', () => {
    const dust = TRAIL_STYLES['trail:dust']!;
    const sparkle = TRAIL_STYLES['trail:sparkle']!;
    expect([dust.shape, dust.color(3, 5), dust.lift(3)]).toEqual(['dash', '#a39382', 0]);
    expect(sparkle.shape).toBe('dot');
    expect([0, 1, 2, 3].map((i) => sparkle.lift(i))).toEqual([6, 8, 10, 6]);
    expect([sparkle.color(0, 0), sparkle.color(1, 0)]).toEqual(['#ffd54f', '#ffffff']);
  });
});

describe('drawMark', () => {
  const rects = (shape: TrailShape) => {
    const out: number[][] = [];
    const ctx = { fillRect: (...a: number[]) => void out.push(a) };
    drawMark(ctx as unknown as CanvasRenderingContext2D, shape, 10, 20, 2);
    return out;
  };
  it('dash and dot are the old dust and sparkle pixels', () => {
    expect(rects('dash')).toEqual([[8, 18, 4, 2]]);
    expect(rects('dot')).toEqual([[10, 20, 2, 2]]);
  });
  it('heart and ring are 4 rects each, scaled by size', () => {
    expect(rects('heart')).toEqual([
      [8, 18, 2, 2],
      [12, 18, 2, 2],
      [8, 20, 6, 2],
      [10, 22, 2, 2],
    ]);
    expect(rects('ring')).toEqual([
      [10, 18, 2, 2],
      [8, 20, 2, 2],
      [12, 20, 2, 2],
      [10, 22, 2, 2],
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/render/trails.test.ts`
Expected: FAIL (`./trails.ts` does not exist).

- [ ] **Step 3: Implement** `src/render/trails.ts`:

```ts
/** How each bought trail looks behind a horse in both renderers (display only). */
export type TrailShape = 'dash' | 'dot' | 'heart' | 'ring';
export type TrailStyle = {
  /** 2D: the mark drawn at each sample. */
  readonly shape: TrailShape;
  /** 2D: height of sample i (0 = newest) above the hooves, in sprite pixels. */
  readonly lift: (i: number) => number;
  /** Colour (#rrggbb) of sample i (0 = newest) at race time t. Constant strings only. */
  readonly color: (i: number, t: number) => string;
  /** HD-2D point cloud: point size (m), opacity, additive glow (bloom), lift (m) of sample i (1 = newest). */
  readonly hd: {
    readonly size: number;
    readonly opacity: number;
    readonly glow: boolean;
    readonly lift: (i: number) => number;
  };
};

const GOLD = '#ffd54f';
const FIRE = ['#fff176', '#ff9800', '#f4511e'] as const;
const RAINBOW = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'] as const;
function cycle(list: readonly string[], n: number): string {
  return list[((n % list.length) + list.length) % list.length]!;
}

export const TRAIL_STYLES: Readonly<Record<string, TrailStyle>> = {
  'trail:dust': {
    shape: 'dash',
    lift: () => 0,
    color: () => '#a39382',
    hd: { size: 0.35, opacity: 0.6, glow: false, lift: () => 0.15 },
  },
  'trail:sparkle': {
    shape: 'dot',
    lift: (i) => 6 + (i % 3) * 2, // lifted to the jockey's height
    color: (i, t) => ((Math.floor(t * 12) + i) % 2 ? '#ffffff' : GOLD),
    hd: { size: 0.25, opacity: 1, glow: true, lift: (i) => 1.5 + (i % 3) * 0.3 },
  },
  'trail:hearts': {
    shape: 'heart',
    lift: (i) => 6 + (i % 2) * 3,
    color: (i) => (i % 2 ? '#f48fb1' : '#e91e63'),
    hd: { size: 0.4, opacity: 0.9, glow: false, lift: (i) => 1.4 + (i % 2) * 0.4 },
  },
  'trail:fire': {
    shape: 'dot',
    lift: (i) => 1 + i, // flames rise as they fade
    color: (i, t) => cycle(FIRE, i + Math.floor(t * 10)),
    hd: { size: 0.3, opacity: 1, glow: true, lift: (i) => 0.2 + i * 0.15 },
  },
  'trail:rainbow': {
    shape: 'dash',
    lift: () => 4,
    color: (i) => cycle(RAINBOW, i),
    hd: { size: 0.35, opacity: 1, glow: true, lift: () => 0.8 },
  },
  'trail:bubbles': {
    shape: 'ring',
    lift: (i) => 3 + i,
    color: () => '#b3e5fc',
    hd: { size: 0.3, opacity: 0.7, glow: false, lift: (i) => 0.4 + i * 0.2 },
  },
};

/** One 2D trail mark at (x, y), `s` = sprite size. Up to 4 rects, no allocation. */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  shape: TrailShape,
  x: number,
  y: number,
  s: number,
) {
  if (shape === 'dash') ctx.fillRect(x - s, y - s, 2 * s, s);
  else if (shape === 'dot') ctx.fillRect(x, y, s, s);
  else if (shape === 'heart') {
    ctx.fillRect(x - s, y - s, s, s);
    ctx.fillRect(x + s, y - s, s, s);
    ctx.fillRect(x - s, y, 3 * s, s);
    ctx.fillRect(x, y + s, s, s);
  } else {
    ctx.fillRect(x, y - s, s, s);
    ctx.fillRect(x - s, y, s, s);
    ctx.fillRect(x + s, y, s, s);
    ctx.fillRect(x, y + s, s, s);
  }
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/render/trails.test.ts`
Expected: PASS.

- [ ] **Step 5: 2D renderer.** In `src/render/Pixel2DRenderer.ts`:

1. Delete the line `const TRAIL_COLOR = { 'trail:dust': '#a39382', 'trail:sparkle': '#ffd54f' } as const;`.
2. Add `import { TRAIL_STYLES, drawMark } from './trails.ts';` after the `./track.ts` import.
3. In `draw`, replace the whole loop under the comment `// Trails under every horse, in world points mapped like screen() but without allocating.` (the `for (const h of drawn) { const kind = h.colors.trail; ... ctx.globalAlpha = 1; }` block, comment included) with:

```ts
    // Trails under every horse, in world points mapped like screen() but without allocating.
    for (const h of drawn) {
      const style = h.colors.trail ? TRAIL_STYLES[h.colors.trail] : undefined;
      const count = this.trailCount[h.lane] ?? 0;
      if (!count || !style) continue;
      const ring = this.trails[h.lane]!;
      const head = this.trailHead[h.lane]!;
      for (let i = 0; i < count; i++) {
        const k = ((head - 1 - i + TRAIL) % TRAIL) * 2; // newest first
        const x = (ring[k]! - this.camera.x) * scale + VIEW.width / 2;
        const y = (ring[k + 1]! - this.camera.y) * scale * VIEW.tilt + VIEW.height / 2;
        ctx.globalAlpha = 1 - (i + 1) / (TRAIL + 1);
        ctx.fillStyle = style.color(i, t);
        drawMark(ctx, style.shape, Math.round(x), Math.round(y) - style.lift(i) * size, size);
      }
      ctx.globalAlpha = 1;
    }
```

Cost: at most 22 horses × 8 samples × 4 rects per frame, no allocation (the style functions return constant strings).

- [ ] **Step 6: HD-2D renderer.** In `src/render/hd2d/HD2DRenderer.ts`:

1. Add `import { TRAIL_STYLES, type TrailStyle } from '../trails.ts';` after the `../track.ts` import.
2. Above `export class HD2DRenderer` (module level) add:

```ts
/** Parsed trail colours: THREE.Color parses a string on every set, and trails reuse a handful. */
const trailColors = new Map<string, THREE.Color>();
function trailColor(hex: string) {
  let c = trailColors.get(hex);
  if (!c) trailColors.set(hex, (c = new THREE.Color(hex)));
  return c;
}
type TrailCloud = {
  style: TrailStyle;
  points: THREE.Points;
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  n: number;
};
```

3. Replace the field `private trails: { dust: THREE.Points; sparkle: THREE.Points } | null = null;` with `private readonly trails = new Map<string, TrailCloud>();`.
4. In the start method, replace the block from `// Trails: past positions from the timeline itself (no ring buffer needed).` through `scene.add(this.trails.dust, this.trails.sparkle);` with:

```ts
    // Trails: past positions from the timeline itself (no ring buffer needed). One cloud per trail
    // somebody in this race wears, so unworn trails cost nothing per frame.
    this.trails.clear();
    for (const code of new Set(timeline.horses.map((h, lane) => this.colors(h, lane).trail))) {
      const style = code ? TRAIL_STYLES[code] : undefined;
      if (!code || !style) continue;
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(lanes * TRAIL * 3), 3);
      const col = new THREE.BufferAttribute(new Float32Array(lanes * TRAIL * 3), 3);
      g.setAttribute('position', pos);
      g.setAttribute('color', col);
      const k = style.hd.glow ? 2 : 1; // over 1, so the bloom pass catches glowing trails
      const points = new THREE.Points(
        g,
        new THREE.PointsMaterial({
          size: style.hd.size,
          vertexColors: true,
          color: new THREE.Color(k, k, k),
          transparent: true,
          opacity: style.hd.opacity,
          ...(style.hd.glow ? { blending: THREE.AdditiveBlending, depthWrite: false } : {}),
        }),
      );
      points.frustumCulled = false;
      scene.add(points);
      this.trails.set(code, { style, points, pos, col, n: 0 });
    }
```

5. In `draw`, replace the block from `// Trails from the horse's own past positions.` through the closing `}` of `if (this.trails) { ... }` (the block ending with the two `fill(...)` calls) with:

```ts
    // Trails from the horse's own past positions: one pass over the field for every worn trail.
    if (this.trails.size) {
      for (const tr of this.trails.values()) tr.n = 0;
      timeline.horses.forEach((horse, lane) => {
        const code = this.colors(horse, lane).trail;
        const tr = code ? this.trails.get(code) : undefined;
        const finished = timeline.finishTimes[horse] ?? Infinity;
        if (!tr || t <= 0 || t >= finished) return;
        for (let i = 1; i <= TRAIL; i++) {
          const m = progressAt(timeline, horse, Math.max(0, t - i * 0.08));
          const tp = horsePoint(track, d, m, lane);
          const c = trailColor(tr.style.color(i - 1, t));
          tr.pos.setXYZ(tr.n, tp.x, tr.style.hd.lift(i), tp.y);
          tr.col.setXYZ(tr.n++, c.r, c.g, c.b);
        }
      });
      for (const tr of this.trails.values()) {
        tr.points.geometry.setDrawRange(0, tr.n);
        tr.pos.needsUpdate = tr.col.needsUpdate = true;
      }
    }
```

6. In `stop`, replace `this.trails = null;` with `this.trails.clear(); // disposeTree(scene) frees their geometry`.

Per frame this is the same 22 × 8 `progressAt` samples as before (one pass instead of one per kind), plus one cached colour lookup per sample.

- [ ] **Step 7: Run checks**

Run: `npm run typecheck; npm run lint; npx vitest run src/render`
Expected: all pass. (The by-eye check of every trail in both renderers is in Task 10, which adds nothing the race needs.)

- [ ] **Step 8: Commit**

```bash
git add src/render/trails.ts src/render/trails.test.ts src/render/Pixel2DRenderer.ts src/render/hd2d/HD2DRenderer.ts
git commit -m "feat(render): heart, fire, rainbow and bubble trails in both renderers"
```

---

### Task 6: Victory celebrations on the podium

**Files:**
- Modify: `src/track/Podium.tsx`, `src/track/Podium.test.tsx`, `src/track/TrackPage.tsx`, `src/app/app.css`

- [ ] **Step 1: Write the failing tests.** In `src/track/Podium.test.tsx`, change the `./Podium.tsx` import to

```tsx
import {
  CELEBRATIONS,
  Celebration,
  Confetti,
  Payouts,
  celebrationClass,
  payoutLines,
} from './Podium.tsx';
import { COSMETICS } from '../shop/cosmetics.ts';
```

and append:

```tsx
describe('celebrationClass', () => {
  it('maps each celebration to its podium class; none or unknown keeps the hop', () => {
    expect(celebrationClass('celebration:spin')).toBe('celebrate-spin');
    expect(celebrationClass('celebration:fireworks')).toBe('celebrate-fireworks');
    expect(celebrationClass('celebration:moonwalk')).toBe('celebrate-moonwalk');
    expect(celebrationClass('celebration:cannon')).toBe('celebrate-cannon');
    expect(celebrationClass(null)).toBe('podium-hop');
    expect(celebrationClass(undefined)).toBe('podium-hop');
    expect(celebrationClass('celebration:disco')).toBe('podium-hop');
  });
  it('every celebration in the shop has one', () => {
    for (const c of COSMETICS.filter((x) => x.slot === 'celebration')) {
      expect(CELEBRATIONS[c.code], c.code).toBeDefined();
    }
  });
});

describe('Celebration', () => {
  it('wraps the sprite; fireworks and cannon add decorative particles', () => {
    const fw = renderToStaticMarkup(
      <Celebration code="celebration:fireworks">
        <b>horse</b>
      </Celebration>,
    );
    expect(fw).toMatch(
      /^<span class="celebration celebrate-fireworks"><b>horse<\/b><span class="celebration-fx" aria-hidden="true">/,
    );
    expect(fw.match(/<i /g)).toHaveLength(16);
    const cannon = renderToStaticMarkup(
      <Celebration code="celebration:cannon">
        <b />
      </Celebration>,
    );
    expect(cannon.match(/<i /g)).toHaveLength(14);
    expect(
      renderToStaticMarkup(
        <Celebration code="celebration:spin">
          <b />
        </Celebration>,
      ),
    ).toBe('<span class="celebration celebrate-spin"><b></b></span>');
  });
  it("none keeps today's hop; once plays a single time", () => {
    expect(
      renderToStaticMarkup(
        <Celebration code={null}>
          <b />
        </Celebration>,
      ),
    ).toBe('<span class="celebration podium-hop"><b></b></span>');
    expect(
      renderToStaticMarkup(
        <Celebration code="celebration:moonwalk" once>
          <b />
        </Celebration>,
      ),
    ).toContain('class="celebration celebrate-moonwalk is-once"');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/track/Podium.test.tsx`
Expected: FAIL (`celebrationClass` is not exported).

- [ ] **Step 3: Implement.** In `src/track/Podium.tsx`, add `import type { CSSProperties, ReactNode } from 'react';` at the top, and add `cap?: string | null;` and `celebration?: string | null;` to `type Person`. Append:

```tsx
/** Podium class per celebration (app.css). None or an unknown code keeps today's hop. */
export const CELEBRATIONS: Readonly<Record<string, string>> = {
  'celebration:spin': 'celebrate-spin',
  'celebration:fireworks': 'celebrate-fireworks',
  'celebration:moonwalk': 'celebrate-moonwalk',
  'celebration:cannon': 'celebrate-cannon',
};
export const celebrationClass = (code?: string | null) =>
  (code && CELEBRATIONS[code]) || 'podium-hop';

const FX_COLORS = ['#ffd54f', '#e53935', '#29b6f6', '#66bb6a', '#ffffff', '#d81b60'];

/** Particle start/offset: two firework bursts of 8, or a cannon fan of 14 to the upper right. */
function particles(code: string): CSSProperties[] {
  if (code === 'celebration:fireworks') {
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i % 8) * (Math.PI / 4);
      return {
        left: i < 8 ? '25%' : '75%',
        top: i < 8 ? '10%' : '0%',
        '--dx': `${Math.round(Math.cos(a) * 40)}px`,
        '--dy': `${Math.round(Math.sin(a) * 40)}px`,
        background: FX_COLORS[i % FX_COLORS.length],
        animationDelay: i < 8 ? '0.3s' : '0.8s',
      } as CSSProperties;
    });
  }
  if (code === 'celebration:cannon') {
    return Array.from({ length: 14 }, (_, i) => {
      const a = ((-20 - i * 5) * Math.PI) / 180;
      const r = 80 + (i % 4) * 25;
      return {
        '--dx': `${Math.round(Math.cos(a) * r)}px`,
        '--dy': `${Math.round(Math.sin(a) * r)}px`,
        background: FX_COLORS[i % FX_COLORS.length],
        animationDelay: `${(i % 3) * 0.05}s`,
      } as CSSProperties;
    });
  }
  return [];
}

/**
 * The podium winner's celebration around its sprite (CSS only; spec 2026-11-05 cosmetics shop).
 * Reduced motion: no movement, no particles. `once` plays it a single time (the shop preview).
 */
export function Celebration(props: { code?: string | null; once?: boolean; children: ReactNode }) {
  const fx = props.code ? particles(props.code) : [];
  return (
    <span className={`celebration ${celebrationClass(props.code)}${props.once ? ' is-once' : ''}`}>
      {props.children}
      {fx.length > 0 && (
        <span className="celebration-fx" aria-hidden="true">
          {fx.map((style, i) => (
            <i key={i} style={style} />
          ))}
        </span>
      )}
    </span>
  );
}
```

In `src/track/TrackPage.tsx`: change `import { Confetti, Payouts } from './Podium.tsx';` to `import { Celebration, Confetti, Payouts } from './Podium.tsx';`. In the podium list (`{top3.map((id, i) => (`), replace

```tsx
            <span className={i === 0 ? 'podium-horse podium-hop' : 'podium-horse'}>
              <HorseSprite colors={horseColors(players, horses, id)} size="lg" animated={i === 0} />
            </span>
```

with

```tsx
            <span className="podium-horse">
              {i === 0 ? (
                <Celebration code={horseColors(players, horses, id).celebration}>
                  <HorseSprite colors={horseColors(players, horses, id)} size="lg" animated />
                </Celebration>
              ) : (
                <HorseSprite colors={horseColors(players, horses, id)} size="lg" />
              )}
            </span>
```

(Only the winner celebrates; the `li` text stays "name · time" for the private-race E2E. Private rooms have no cosmetics, so they keep the hop.)

In `src/app/app.css`, directly after the `@keyframes podium-hop { ... }` block, add:

```css
/* Winner celebrations (spec 2026-11-05 cosmetics shop); none keeps .podium-hop. */
.celebration {
  position: relative;
  display: inline-block;
  transform-origin: 50% 100%;
}
.celebrate-spin {
  animation: celebrate-spin 1.6s ease-in-out infinite;
}
@keyframes celebrate-spin {
  0%,
  30% {
    transform: none;
  }
  65% {
    transform: translateY(-24px) rotateY(180deg);
  }
  100% {
    transform: rotateY(360deg);
  }
}
.celebrate-fireworks {
  transform-origin: 20% 100%;
  animation: celebrate-rear 1.6s ease-in-out infinite;
}
@keyframes celebrate-rear {
  0%,
  60%,
  100% {
    transform: none;
  }
  25%,
  40% {
    transform: rotate(-18deg);
  }
}
/* Faces right and gallops while sliding left: a moonwalk. */
.celebrate-moonwalk {
  animation: celebrate-moonwalk 2.4s linear infinite;
}
@keyframes celebrate-moonwalk {
  0%,
  100% {
    transform: translateX(40%);
  }
  90% {
    transform: translateX(-40%);
  }
}
.celebrate-cannon {
  animation: podium-hop 1.2s ease-in-out infinite;
}
.celebration-fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.celebration-fx i {
  position: absolute;
  left: 50%;
  top: 20%;
  width: 8px;
  height: 8px;
  opacity: 0;
}
.celebrate-fireworks .celebration-fx i {
  animation: firework-burst 1.6s ease-out infinite;
}
@keyframes firework-burst {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy));
  }
}
.celebrate-cannon .celebration-fx i {
  left: 0;
  top: 70%;
  animation: cannon-shot 1.2s ease-out infinite;
}
@keyframes cannon-shot {
  0% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy)) rotate(360deg);
  }
}
.celebration.is-once,
.celebration.is-once > .celebration-fx i {
  animation-iteration-count: 1;
}
@media (prefers-reduced-motion: reduce) {
  .celebration {
    animation: none;
  }
  .celebration-fx {
    display: none;
  }
}
```

(The existing reduced-motion rule `.podium-hop { animation: none; }` still covers the default.)

- [ ] **Step 4: Run them**

Run: `npx vitest run src/track/Podium.test.tsx; npm run typecheck; npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/track/Podium.tsx src/track/Podium.test.tsx src/track/TrackPage.tsx src/app/app.css
git commit -m "feat(podium): spin, fireworks, moonwalk and confetti-cannon celebrations"
```

---

### Task 7: `openCrate` and its error text

**Files:**
- Modify: `src/net/rooms.ts`

`rooms.ts` imports `src/net/supabase.ts`, which throws without env vars, so it has no unit test; the DB tests (Task 1) cover `open_crate`, and the typecheck proves the call matches the regenerated types.

- [ ] **Step 1: Implement.** In `src/net/rooms.ts`, after `fetchOwnedCosmetics`, add:

```ts
/** Mystery crate (office LOBBY): the server picks an unowned item, charges CRATE_PRICE, returns its code. */
export const openCrate = (roomId: string) =>
  call(supabase.rpc('open_crate', { p_room: roomId }));
```

In `ERROR_TEXT`, after `wrong_slot: "That item doesn't go there.",` add:

```ts
  nothing_left: 'You already own every item!',
```

(`not_enough_coins` and `wrong_phase` already have texts.)

- [ ] **Step 2: Run checks**

Run: `npm run typecheck; npm run lint`
Expected: clean (`openCrate` returns `Promise<string>`).

- [ ] **Step 3: Commit**

```bash
git add src/net/rooms.ts
git commit -m "feat(net): openCrate RPC and its error text"
```

---

### Task 8: Looks shop: preview with try-on, tabs and cards

**Files:**
- Create: `src/play/ShopParts.tsx`, `src/play/ShopParts.test.tsx`
- Modify: `src/play/LooksShop.tsx` (rewrite), `src/play/HorsePanel.tsx`, `src/play/PlayPage.tsx`, `src/app/app.css`

`LooksShop` imports `rooms.ts` (untestable in Vitest), so everything with logic or markup worth testing lives in `ShopParts.tsx`.

- [ ] **Step 1: Write the failing tests** `src/play/ShopParts.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { colorsOf } from '../render/palette.ts';
import { COSMETICS } from '../shop/cosmetics.ts';
import {
  ShopCard,
  ShopPreview,
  ShopTabs,
  TABS,
  TrailMarks,
  cardState,
  wearing,
} from './ShopParts.tsx';

const item = (code: string) => COSMETICS.find((c) => c.code === code)!;
const worn = { ...colorsOf(0), pattern: 'pattern:hoops' };

describe('cardState', () => {
  it('Buy when not owned, Remove when worn, else Wear', () => {
    expect(cardState(item('cap:crown'), [], worn)).toBe('buy');
    expect(cardState(item('pattern:hoops'), ['pattern:hoops'], worn)).toBe('remove');
    expect(cardState(item('pattern:sash'), ['pattern:sash'], worn)).toBe('wear');
  });
});

describe('wearing', () => {
  it('puts the item in its slot and keeps the rest', () => {
    expect(wearing(worn, item('cap:halo'))).toEqual({ ...worn, cap: 'cap:halo' });
    expect(wearing(worn, item('pattern:dots')).pattern).toBe('pattern:dots');
  });
});

describe('ShopTabs', () => {
  it('a labelled group of toggle buttons, the open one pressed', () => {
    const html = renderToStaticMarkup(<ShopTabs tab="cap" onTab={() => {}} />);
    expect(html).toMatch(/^<div class="shop-tabs" role="group" aria-label="Shop sections">/);
    expect(TABS.map((t) => t.label)).toEqual(['Patterns', 'Trails', 'Caps', 'Celebrations']);
    expect(html.match(/<button/g)).toHaveLength(TABS.length);
    expect(html).toContain('<button type="button" aria-pressed="true">Caps</button>');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(TABS.length - 1);
  });
  it('tapping a tab reports it', () => {
    const picked: string[] = [];
    const el = ShopTabs({ tab: 'pattern', onTab: (t) => void picked.push(t) });
    (el.props.children as { props: { onClick: () => void } }[])[3]!.props.onClick();
    expect(picked).toEqual(['celebration']);
  });
});

describe('ShopCard', () => {
  const card = (state: 'buy' | 'wear' | 'remove', over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      <ShopCard
        item={item('pattern:hoops')}
        state={state}
        colors={colorsOf(0)}
        trying={false}
        busy={false}
        balance={1000}
        onTry={() => {}}
        onBuy={() => {}}
        onWear={() => {}}
        onRemove={() => {}}
        {...over}
      />,
    );
  it('Buy / Wear / Remove keep the "<verb> <name>" labels the E2E uses', () => {
    expect(card('buy')).toContain('aria-label="Buy Hoops silks"');
    expect(card('wear')).toContain('aria-label="Wear Hoops silks"');
    expect(card('remove')).toContain('aria-label="Remove Hoops silks"');
  });
  it('Buy is disabled without the coins or while busy', () => {
    expect(card('buy', { balance: 149 })).toContain('aria-label="Buy Hoops silks" disabled=""');
    expect(card('buy', { busy: true })).toContain('aria-label="Buy Hoops silks" disabled=""');
    expect(card('buy', { balance: 150 })).not.toContain('disabled=""');
  });
  it('the try-on button: sprite wearing the item, name, price; pressed while tried on', () => {
    const html = card('buy', { trying: true });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Try on Hoops silks, 150 coins"');
    expect(html).toContain('<canvas');
    expect(html).toContain('<span>Hoops silks</span>');
    expect(html).toContain('150 coins');
  });
  it('trail cards show the trail marks', () => {
    const html = renderToStaticMarkup(
      <ShopCard
        item={item('trail:rainbow')}
        state="buy"
        colors={colorsOf(0)}
        trying={false}
        busy={false}
        balance={0}
        onTry={() => {}}
        onBuy={() => {}}
        onWear={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html.match(/<i /g)).toHaveLength(8);
  });
});

describe('TrailMarks', () => {
  it('8 fading marks in the trail colours; nothing for an unknown trail', () => {
    const html = renderToStaticMarkup(<TrailMarks code="trail:dust" />);
    expect(html).toMatch(/^<span class="trail-marks" aria-hidden="true">/);
    expect(html.match(/background:#a39382/g)).toHaveLength(8);
    expect(renderToStaticMarkup(<TrailMarks code="trail:nope" />)).toBe('');
  });
});

describe('ShopPreview', () => {
  it('a big galloping horse; a tried-on celebration plays once', () => {
    const html = renderToStaticMarkup(
      <ShopPreview colors={colorsOf(0)} celebrate={null} replay={0} />,
    );
    expect(html).toMatch(
      /^<div class="shop-preview" aria-hidden="true"><span class="horse-sprite horse-sprite-lg is-animated"/,
    );
    const c = renderToStaticMarkup(
      <ShopPreview colors={colorsOf(0)} celebrate="celebration:spin" replay={2} />,
    );
    expect(c).toContain('class="celebration celebrate-spin is-once"');
  });
  it('shows the worn or tried-on trail behind the horse', () => {
    const html = renderToStaticMarkup(
      <ShopPreview colors={{ ...colorsOf(0), trail: 'trail:fire' }} celebrate={null} replay={0} />,
    );
    expect(html).toContain('class="trail-marks"');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/play/ShopParts.test.tsx`
Expected: FAIL (`./ShopParts.tsx` does not exist).

- [ ] **Step 3: Implement** `src/play/ShopParts.tsx`:

```tsx
import { HorseSprite } from '../render/HorseSprite.tsx';
import type { HorseColors } from '../render/palette.ts';
import { TRAIL_STYLES } from '../render/trails.ts';
import type { Cosmetic, CosmeticSlot } from '../shop/cosmetics.ts';
import { Celebration } from '../track/Podium.tsx';

export type ShopTab = CosmeticSlot;
export const TABS: readonly { readonly id: ShopTab; readonly label: string }[] = [
  { id: 'pattern', label: 'Patterns' },
  { id: 'trail', label: 'Trails' },
  { id: 'cap', label: 'Caps' },
  { id: 'celebration', label: 'Celebrations' },
];

/** The horse wearing `item` on top of what it already wears. */
export const wearing = (colors: HorseColors, item: Cosmetic): HorseColors => ({
  ...colors,
  [item.slot]: item.code,
});

export type CardState = 'buy' | 'wear' | 'remove';
/** `worn` = the horse's saved colours, whose slot fields are the equipped codes. */
export function cardState(item: Cosmetic, owned: readonly string[], worn: HorseColors): CardState {
  if (!owned.includes(item.code)) return 'buy';
  return worn[item.slot] === item.code ? 'remove' : 'wear';
}

/** Section switcher: toggle buttons (aria-pressed) in a labelled group; ≥ 44 px in app.css. */
export function ShopTabs({ tab, onTab }: { tab: ShopTab; onTab: (t: ShopTab) => void }) {
  return (
    <div className="shop-tabs" role="group" aria-label="Shop sections">
      {TABS.map((t) => (
        <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => onTab(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Eight fading marks in a trail's colours (trails aren't drawn on sprites). Decorative. */
export function TrailMarks({ code }: { code: string }) {
  const style = TRAIL_STYLES[code];
  if (!style) return null;
  return (
    <span className="trail-marks" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ background: style.color(i, 0), opacity: 1 - i / 9 }} />
      ))}
    </span>
  );
}

/**
 * The phone's own horse, big and galloping, in its saved looks plus whatever is being tried on.
 * Decorative (the cards carry the names). A tried-on celebration plays once; `replay` restarts it.
 */
export function ShopPreview(props: { colors: HorseColors; celebrate: string | null; replay: number }) {
  const horse = <HorseSprite colors={props.colors} size="lg" animated />;
  return (
    <div className="shop-preview" aria-hidden="true">
      {props.colors.trail && <TrailMarks code={props.colors.trail} />}
      {props.celebrate ? (
        <Celebration key={props.replay} code={props.celebrate} once>
          {horse}
        </Celebration>
      ) : (
        horse
      )}
    </div>
  );
}

type CardProps = {
  item: Cosmetic;
  state: CardState;
  /** Saved colours; the card's sprite wears the item on top. */
  colors: HorseColors;
  trying: boolean;
  busy: boolean;
  balance: number;
  onTry: () => void;
  onBuy: () => void;
  onWear: () => void;
  onRemove: () => void;
};

/** One item: a try-on button (sprite, name, price) and Buy / Wear / Remove. */
export function ShopCard(p: CardProps) {
  const { item } = p;
  return (
    <li className="shop-card">
      <button
        type="button"
        className="card shop-try"
        aria-pressed={p.trying}
        aria-label={`Try on ${item.name}, ${item.price} coins`}
        onClick={p.onTry}
      >
        {item.slot === 'trail' && <TrailMarks code={item.code} />}
        <HorseSprite colors={wearing(p.colors, item)} size="md" />
        <span>{item.name}</span>
        <span className="pixel">{`${item.price} coins`}</span>
      </button>
      {p.state === 'buy' ? (
        <button
          type="button"
          aria-label={`Buy ${item.name}`}
          disabled={p.busy || p.balance < item.price}
          onClick={p.onBuy}
        >
          Buy
        </button>
      ) : p.state === 'remove' ? (
        <button type="button" aria-label={`Remove ${item.name}`} disabled={p.busy} onClick={p.onRemove}>
          Remove
        </button>
      ) : (
        <button type="button" aria-label={`Wear ${item.name}`} disabled={p.busy} onClick={p.onWear}>
          Wear
        </button>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/play/ShopParts.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire it up.** Replace all of `src/play/LooksShop.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { buyCosmetic, equipCosmetic, fetchOwnedCosmetics, type RoomPlayer } from '../net/rooms.ts';
import type { HorseColors } from '../render/palette.ts';
import { COSMETICS, type Cosmetic } from '../shop/cosmetics.ts';
import { ShopCard, ShopPreview, ShopTabs, cardState, wearing, type ShopTab } from './ShopParts.tsx';

type Act = (fn: () => Promise<unknown>) => void;
type Props = {
  roomId: string;
  mine: RoomPlayer;
  /** The horse's saved colours (the phone header's), equipped looks included. */
  colors: HorseColors;
  balance: number;
  act: Act;
  busy: boolean;
};

/** Office LOBBY: preview your horse, try looks on, buy them with coins, then wear or remove them. */
export function LooksShop({ roomId, mine, colors, balance, act, busy }: Props) {
  const [owned, setOwned] = useState<readonly string[]>([]);
  const [tab, setTab] = useState<ShopTab>('pattern');
  const [trying, setTrying] = useState<Cosmetic | null>(null);
  const [replay, setReplay] = useState(0);
  const [confirming, setConfirming] = useState<Cosmetic | null>(null);
  useEffect(() => {
    fetchOwnedCosmetics(mine.id).then(setOwned, () => {}); // a failed load only hides Wear
  }, [mine.id]);

  const gained = (code: string) => {
    // The buy went through; a failed refetch of the owned list must not report it as failed.
    setOwned((prev) => [...prev, code]);
    fetchOwnedCosmetics(mine.id).then(setOwned, () => {});
  };
  const buy = (c: Cosmetic) => {
    setConfirming(null);
    act(async () => {
      await buyCosmetic(roomId, c.code);
      gained(c.code);
    });
  };
  const pickTab = (t: ShopTab) => {
    setTab(t);
    setTrying(null);
    setConfirming(null);
  };

  return (
    <section className="shop looks-shop" aria-labelledby="looks-shop">
      <h2 id="looks-shop">Looks shop</h2>
      <ShopPreview
        colors={trying ? wearing(colors, trying) : colors}
        celebrate={trying?.slot === 'celebration' ? trying.code : null}
        replay={replay}
      />
      <ShopTabs tab={tab} onTab={pickTab} />
      <ul className="shop-cards">
        {COSMETICS.filter((c) => c.slot === tab).map((c) => (
          <ShopCard
            key={c.code}
            item={c}
            state={cardState(c, owned, colors)}
            colors={colors}
            trying={trying?.code === c.code}
            busy={busy}
            balance={balance}
            onTry={() => {
              setTrying(c);
              setReplay((n) => n + 1); // tapping a celebration again plays it again
            }}
            onBuy={() => setConfirming(c)}
            onWear={() => act(() => equipCosmetic(roomId, c.slot, c.code))}
            onRemove={() => act(() => equipCosmetic(roomId, c.slot, null))}
          />
        ))}
      </ul>
      {confirming && (
        <p>
          {`Buy ${confirming.name} for ${confirming.price} coins? `}
          <button type="button" className="primary" disabled={busy} onClick={() => buy(confirming)}>
            {`Pay ${confirming.price}`}
          </button>{' '}
          <button type="button" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </p>
      )}
    </section>
  );
}
```

In `src/play/HorsePanel.tsx`: change the palette import to `import { COAT_COLORS, SILK_COLORS, type HorseColors } from '../render/palette.ts';`; change `type Props` to
`type Props = { roomId: string; mine: RoomPlayer; colors: HorseColors; balance: number; act: Act; busy: boolean };`;
change the signature to `export function HorsePanel({ roomId, mine, colors, balance, act, busy }: Props)`; and the shop line to
`<LooksShop roomId={roomId} mine={mine} colors={colors} balance={balance} act={act} busy={busy} />`.

In `src/play/PlayPage.tsx`, replace
`<HorsePanel roomId={room.id} mine={mine} balance={props.balance} act={act} busy={busy} />`
with

```tsx
          <HorsePanel
            roomId={room.id}
            mine={mine}
            colors={horseColors(state.players, state.race?.horses ?? [], mine.id)}
            balance={props.balance}
            act={act}
            busy={busy}
          />
```

(`horseColors` is already imported there; these are the same colours as the phone header sprite.)

In `src/app/app.css`, after the `.shop { ... }` rule, add:

```css
/* Looks shop (spec 2026-11-05 cosmetics shop). */
.shop-preview {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 4px;
  min-height: calc(22px * 4 + 16px);
  padding: 8px;
  background: var(--raised);
}
.shop-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.shop-tabs button {
  flex: 1 1 auto;
  min-height: 44px;
}
.shop-tabs button[aria-pressed='true'] {
  color: var(--bg);
  background: var(--gold);
}
.shop-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.shop-card {
  display: grid;
  gap: 4px;
}
.shop-card button {
  min-height: 44px;
}
.shop-try {
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.trail-marks {
  display: inline-flex;
  flex-direction: row-reverse; /* newest mark next to the horse, which faces right */
  align-items: center;
  gap: 2px;
}
.trail-marks i {
  width: 4px;
  height: 4px;
}
```

- [ ] **Step 6: Run checks**

Run: `npm run typecheck; npm run lint; npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/play/ShopParts.tsx src/play/ShopParts.test.tsx src/play/LooksShop.tsx src/play/HorsePanel.tsx src/play/PlayPage.tsx src/app/app.css
git commit -m "feat(shop): live preview with try-on, tabs and item cards"
```

---

### Task 9: Crate tab and reveal

**Files:**
- Create: `src/play/CrateTab.tsx`, `src/play/CrateTab.test.tsx`
- Modify: `src/play/ShopParts.tsx`, `src/play/ShopParts.test.tsx`, `src/play/LooksShop.tsx`, `src/app/app.css`

- [ ] **Step 1: Write the failing tests** `src/play/CrateTab.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { colorsOf } from '../render/palette.ts';
import { COSMETICS, CRATE_PRICE } from '../shop/cosmetics.ts';
import { CrateTab } from './CrateTab.tsx';

const crown = COSMETICS.find((c) => c.code === 'cap:crown')!;
const view = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <CrateTab
      left={5}
      balance={1000}
      busy={false}
      confirming={false}
      prize={null}
      colors={colorsOf(0)}
      onAsk={() => {}}
      onCancel={() => {}}
      onOpen={() => {}}
      onWear={() => {}}
      {...over}
    />,
  );

describe('CrateTab', () => {
  it('price, odds note, an Open button and an empty status line', () => {
    const html = view();
    expect(html).toContain(`Mystery crate · ${CRATE_PRICE} coins`);
    expect(html).toContain('Pricier items are rarer.');
    expect(html).toContain('<button type="button">Open crate</button>');
    expect(html).toContain('<p role="status" class="crate-result"></p>');
  });
  it('Open is disabled without the coins or while busy', () => {
    const off = '<button type="button" disabled="">Open crate</button>';
    expect(view({ balance: CRATE_PRICE - 1 })).toContain(off);
    expect(view({ busy: true })).toContain(off);
  });
  it('asks to confirm the payment', () => {
    const html = view({ confirming: true });
    expect(html).toContain(`Open a crate for ${CRATE_PRICE} coins?`);
    expect(html).toContain(`Pay ${CRATE_PRICE}`);
    expect(html).toContain('Cancel');
    expect(html).not.toContain('Open crate</button>');
  });
  it('hides the crate when nothing is left', () => {
    const html = view({ left: 0 });
    expect(html).toContain('You own everything!');
    expect(html).not.toContain('Open crate');
  });
  it('reveals the prize on the horse, says it, and offers to wear it', () => {
    const html = view({ prize: crown });
    expect(html).toContain('class="crate-reveal"');
    expect(html).toContain('<span class="crate-box" aria-hidden="true">🎁</span>');
    expect(html).toContain('<p role="status" class="crate-result">You got Crown!</p>');
    expect(html).toContain('<canvas');
    expect(html).toContain('Wear it');
  });
  it('a prize already worn says so instead', () => {
    const html = view({ prize: crown, colors: { ...colorsOf(0), cap: 'cap:crown' } });
    expect(html).toContain('Wearing it.');
    expect(html).not.toContain('Wear it</button>');
  });
});
```

In `src/play/ShopParts.test.tsx`, test `'a labelled group of toggle buttons, the open one pressed'`: change the expected labels to `['Patterns', 'Trails', 'Caps', 'Celebrations', '🎁 Crate']`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/play/CrateTab.test.tsx src/play/ShopParts.test.tsx`
Expected: FAIL (`./CrateTab.tsx` does not exist; `TABS` has 4 labels).

- [ ] **Step 3: Implement** `src/play/CrateTab.tsx`:

```tsx
import { HorseSprite } from '../render/HorseSprite.tsx';
import type { HorseColors } from '../render/palette.ts';
import { CRATE_PRICE, type Cosmetic } from '../shop/cosmetics.ts';
import { wearing } from './ShopParts.tsx';

type Props = {
  /** Items the player doesn't own yet. */
  left: number;
  balance: number;
  busy: boolean;
  confirming: boolean;
  /** The last crate's item, revealed until the tab changes. */
  prize: Cosmetic | null;
  /** Saved colours (equipped looks included). */
  colors: HorseColors;
  onAsk: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onWear: (prize: Cosmetic) => void;
};

/**
 * The mystery crate: price, Open with a confirm, and the reveal (crate shakes, opens, the horse wears
 * the prize; CSS only, no shake under reduced motion). The status line is always mounted so screen
 * readers announce the prize.
 */
export function CrateTab(p: Props) {
  const prize = p.prize;
  return (
    <div className="crate">
      <p role="status" className="crate-result">
        {prize ? `You got ${prize.name}!` : ''}
      </p>
      {prize && (
        <div className="crate-reveal" key={prize.code}>
          <span className="crate-box" aria-hidden="true">
            🎁
          </span>
          <div className="crate-prize">
            <HorseSprite colors={wearing(p.colors, prize)} size="lg" animated />
            {p.colors[prize.slot] === prize.code ? (
              <p>Wearing it.</p>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={p.busy}
                onClick={() => p.onWear(prize)}
              >
                Wear it
              </button>
            )}
          </div>
        </div>
      )}
      {p.left === 0 ? (
        <p>You own everything!</p>
      ) : (
        <>
          <p className="pixel">{`Mystery crate · ${CRATE_PRICE} coins`}</p>
          <p>Gives one item you don't own yet. Pricier items are rarer.</p>
          {p.confirming ? (
            <p>
              {`Open a crate for ${CRATE_PRICE} coins? `}
              <button type="button" className="primary" disabled={p.busy} onClick={p.onOpen}>
                {`Pay ${CRATE_PRICE}`}
              </button>{' '}
              <button type="button" onClick={p.onCancel}>
                Cancel
              </button>
            </p>
          ) : (
            <button type="button" disabled={p.busy || p.balance < CRATE_PRICE} onClick={p.onAsk}>
              Open crate
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

(SSR renders the apostrophe in "don't" as `&#x27;`; the test only reads "Pricier items are rarer.")

In `src/play/ShopParts.tsx`: change `export type ShopTab = CosmeticSlot;` to `export type ShopTab = CosmeticSlot | 'crate';` and append `{ id: 'crate', label: '🎁 Crate' },` as the last entry of `TABS`.

Replace all of `src/play/LooksShop.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import {
  buyCosmetic,
  equipCosmetic,
  fetchOwnedCosmetics,
  openCrate,
  type RoomPlayer,
} from '../net/rooms.ts';
import type { HorseColors } from '../render/palette.ts';
import { COSMETICS, type Cosmetic } from '../shop/cosmetics.ts';
import { CrateTab } from './CrateTab.tsx';
import { ShopCard, ShopPreview, ShopTabs, cardState, wearing, type ShopTab } from './ShopParts.tsx';

type Act = (fn: () => Promise<unknown>) => void;
type Props = {
  roomId: string;
  mine: RoomPlayer;
  /** The horse's saved colours (the phone header's), equipped looks included. */
  colors: HorseColors;
  balance: number;
  act: Act;
  busy: boolean;
};

/** Office LOBBY: preview your horse, try looks on, buy them or open a crate, then wear or remove them. */
export function LooksShop({ roomId, mine, colors, balance, act, busy }: Props) {
  const [owned, setOwned] = useState<readonly string[]>([]);
  const [tab, setTab] = useState<ShopTab>('pattern');
  const [trying, setTrying] = useState<Cosmetic | null>(null);
  const [replay, setReplay] = useState(0);
  const [confirming, setConfirming] = useState<Cosmetic | null>(null);
  const [crateAsk, setCrateAsk] = useState(false);
  const [prize, setPrize] = useState<Cosmetic | null>(null);
  useEffect(() => {
    fetchOwnedCosmetics(mine.id).then(setOwned, () => {}); // a failed load only hides Wear
  }, [mine.id]);

  const gained = (code: string) => {
    // The purchase went through; a failed refetch of the owned list must not report it as failed.
    setOwned((prev) => [...prev, code]);
    fetchOwnedCosmetics(mine.id).then(setOwned, () => {});
  };
  const buy = (c: Cosmetic) => {
    setConfirming(null);
    act(async () => {
      await buyCosmetic(roomId, c.code);
      gained(c.code);
    });
  };
  const open = () => {
    setCrateAsk(false);
    act(async () => {
      const code = await openCrate(roomId);
      gained(code);
      setPrize(COSMETICS.find((c) => c.code === code) ?? null);
    });
  };
  const pickTab = (t: ShopTab) => {
    setTab(t);
    setTrying(null);
    setConfirming(null);
    setCrateAsk(false);
    setPrize(null);
  };

  return (
    <section className="shop looks-shop" aria-labelledby="looks-shop">
      <h2 id="looks-shop">Looks shop</h2>
      <ShopPreview
        colors={trying ? wearing(colors, trying) : colors}
        celebrate={trying?.slot === 'celebration' ? trying.code : null}
        replay={replay}
      />
      <ShopTabs tab={tab} onTab={pickTab} />
      {tab === 'crate' ? (
        <CrateTab
          left={COSMETICS.filter((c) => !owned.includes(c.code)).length}
          balance={balance}
          busy={busy}
          confirming={crateAsk}
          prize={prize}
          colors={colors}
          onAsk={() => setCrateAsk(true)}
          onCancel={() => setCrateAsk(false)}
          onOpen={open}
          onWear={(c) => act(() => equipCosmetic(roomId, c.slot, c.code))}
        />
      ) : (
        <ul className="shop-cards">
          {COSMETICS.filter((c) => c.slot === tab).map((c) => (
            <ShopCard
              key={c.code}
              item={c}
              state={cardState(c, owned, colors)}
              colors={colors}
              trying={trying?.code === c.code}
              busy={busy}
              balance={balance}
              onTry={() => {
                setTrying(c);
                setReplay((n) => n + 1); // tapping a celebration again plays it again
              }}
              onBuy={() => setConfirming(c)}
              onWear={() => act(() => equipCosmetic(roomId, c.slot, c.code))}
              onRemove={() => act(() => equipCosmetic(roomId, c.slot, null))}
            />
          ))}
        </ul>
      )}
      {confirming && (
        <p>
          {`Buy ${confirming.name} for ${confirming.price} coins? `}
          <button type="button" className="primary" disabled={busy} onClick={() => buy(confirming)}>
            {`Pay ${confirming.price}`}
          </button>{' '}
          <button type="button" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </p>
      )}
    </section>
  );
}
```

In `src/app/app.css`, after the `.trail-marks i { ... }` rule (Task 8), add:

```css
/* Crate reveal: shakes twice, pops open, then the horse wearing the prize appears. */
.crate {
  display: grid;
  gap: 8px;
  justify-items: start;
}
.crate button {
  min-height: 44px;
}
.crate-reveal {
  display: grid;
  justify-items: center;
  justify-self: stretch;
}
.crate-box,
.crate-prize {
  grid-area: 1 / 1;
}
.crate-box {
  font-size: 4rem;
  line-height: 1;
  animation:
    crate-shake 0.6s ease-in-out 2,
    crate-open 0.3s ease-in 1.2s forwards;
}
@keyframes crate-shake {
  25% {
    transform: rotate(-12deg);
  }
  75% {
    transform: rotate(12deg);
  }
}
@keyframes crate-open {
  to {
    opacity: 0;
    transform: scale(1.6) translateY(-16px);
  }
}
.crate-prize {
  display: grid;
  gap: 8px;
  justify-items: center;
  animation: crate-prize 0.4s ease-out 1.3s both;
}
@keyframes crate-prize {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .crate-box {
    display: none;
  }
  .crate-prize {
    animation: none;
  }
}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/play src/app/emojiSupport.test.ts; npm run typecheck; npm run lint`
Expected: PASS (🎁 is Emoji 1.0).

- [ ] **Step 5: Commit**

```bash
git add src/play/CrateTab.tsx src/play/CrateTab.test.tsx src/play/ShopParts.tsx src/play/ShopParts.test.tsx src/play/LooksShop.tsx src/app/app.css
git commit -m "feat(shop): mystery crate tab with reveal"
```

---

### Task 10: Sandbox pickers for caps and celebrations, podium preview

**Files:**
- Modify: `src/app/Sandbox.tsx`

The Sandbox is a dev page with no unit test; the screenshots in Task 12 use it.

- [ ] **Step 1: Implement.** In `src/app/Sandbox.tsx`:

1. Change `import { COSMETICS, type CosmeticSlot } from '../shop/cosmetics.ts';` to `import { COSMETICS, SLOTS, type CosmeticSlot } from '../shop/cosmetics.ts';` and add `import { HorseSprite } from '../render/HorseSprite.tsx';` and `import { Celebration } from '../track/Podium.tsx';`.
2. Replace `{(['pattern', 'trail'] as const).map((slot) => (` with `{SLOTS.map((slot) => (` (the picker body stays; it now renders "Lane 1 pattern / trail / cap / celebration").
3. Change the comment `// Lane 0 wears the picked looks, so each pattern and trail can be checked by eye.` to `// Lane 0 wears the picked looks, so each pattern, trail and cap can be checked by eye.`
4. Directly after the closing `</p>` of the controls paragraph (just before `{shown && <HotStrip hot={shown.timeline.hot} />}`), add:

```tsx
      {/* Lane 1 as the podium winner, wearing the picked cap and celebration. */}
      <section className="podium-stage sandbox-podium" aria-label="Podium preview">
        <ol className="podium">
          <li>
            <span className="podium-horse">
              <Celebration code={looks.celebration || null}>
                <HorseSprite colors={{ ...colorsOf(0), ...looks }} size="lg" animated />
              </Celebration>
            </span>
            {SAMPLE_HORSES[0]}
          </li>
        </ol>
      </section>
```

- [ ] **Step 2: Check by eye**

Run: `npm run typecheck; npm run lint`, then `npm run dev` and open `http://localhost:5173/sandbox`.
Expected: four "Lane 1 …" pickers; the podium preview hops with "None", and spins / rears with bursts / moonwalks / hops with a cannon fan for the four celebrations; caps and patterns show on the preview and in the race; every trail shows behind lane 1 after "Run short race", in both renderers (toggle "HD graphics"); with "22" horses and a trail picked, the "ms/frame" readout is within noise of no trail.

- [ ] **Step 3: Commit**

```bash
git add src/app/Sandbox.tsx
git commit -m "feat(sandbox): cap and celebration pickers with a podium preview"
```

---

### Task 11: Full checks, a11y and status

**Files:**
- Modify: `tests/e2e/a11y.spec.ts`, `PROJECT_STATUS.md`

- [ ] **Step 1: axe on every shop tab.** In `tests/e2e/a11y.spec.ts`, add `uniqueName` to the `./helpers.ts` import and append:

```ts
test('office phone looks shop, every tab', async ({ browser }) => {
  await resetOffice();
  const name = uniqueName('Shop');
  const player = (await ok(
    adminClient().rpc('admin_add_member', { p_name: name, p_pin: '4321' }),
  )) as { id: string };
  try {
    const phone = await (await browser.newContext()).newPage();
    await phone.goto('/play?code=TURF');
    await phone.getByLabel('Who are you?').selectOption({ label: name });
    await phone.getByLabel('Your PIN').fill('4321');
    await phone.getByRole('button', { name: 'Sign in' }).click();
    await expect(phone.getByRole('heading', { name: 'Looks shop' })).toBeVisible();
    for (const tab of ['Patterns', 'Trails', 'Caps', 'Celebrations', '🎁 Crate']) {
      const button = phone.getByRole('button', { name: tab, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(await serious(phone), tab).toEqual([]);
    }
  } finally {
    await ok(adminClient().rpc('admin_archive', { p_player: player.id }));
  }
});
```

Run: `npx supabase start` (if not running), then `npx playwright test tests/e2e/a11y.spec.ts -g "looks shop"`
Expected: 1 passed (a serious axe finding fails it with the rule id and node; fix the markup, not the test).

- [ ] **Step 2: Display-only check.** Run (Git Bash): `grep -rnE "cosmetic|\.(pattern|trail|cap|celebration)\b" src/sim supabase/functions`
Expected: no output (the engine and the Edge Function never read cosmetics, so seeds replay identically).

- [ ] **Step 3: Full checks**

Run: `npm run typecheck; npm run lint; npm test; npm run test:db; npm run build; npm run test:e2e`
Expected: all pass (the a11y track-lobby E2E test is a known flake; rerun it alone if it fails). `tests/e2e/office.spec.ts` still buys and wears Hoops silks through "Buy Hoops silks" / "Pay 150" / "Wear Hoops silks" / "Remove Hoops silks" on the default Patterns tab; if a selector broke, restore those names in the markup rather than changing the spec.

- [ ] **Step 4: PROJECT_STATUS.md** — after the "## Visual polish (master, 2026-11-05)" section add the section below, with the real counts from Step 3 in the "Checks" line:

```markdown
## Cosmetics shop (master, 2026-11-05)

- Spec `docs/superpowers/specs/2026-11-05-cosmetics-shop-design.md`, plan `docs/superpowers/plans/2026-11-05-cosmetics-shop.md`.
- Catalogue (21 items): patterns hoops/sash/stars + chevrons, quartered, polka-dot, lightning; trails dust/sparkle + hearts, fire, rainbow, bubbles; caps pompom, horns, halo, crown (new slot, drawn on the jockey in every pose, so race, HD sheet, cut-ins, sprites and podium show them); celebrations spin, fireworks, moonwalk, confetti cannon (new slot, podium winner only; none keeps the hop; reduced motion: still, no particles).
- Server: migration `20261105000022_cosmetics_shop.sql` — `private.cosmetic_catalog()` is the one SQL price list (`cosmetic_price` reads it), `room_players.cap/.celebration`, `equip_cosmetic` takes the 4 slots, `open_crate` (250 coins, LOBBY only, an unowned item weighted 1/price — celebrations ~8% of crates — `nothing_left` / `not_enough_coins`, one `cosmetic` ledger row). Client mirror `src/shop/cosmetics.ts`, checked by a unit test that parses the migration and a DB test that buys every item; a DB test checks the crate distribution (chi-square, loose bound).
- Phone Looks shop: preview of your own horse (try-on is local until you buy and wear), tabs Patterns · Trails · Caps · Celebrations · 🎁 Crate, cards with sprite/name/price and Buy (confirm) / Wear / Remove, crate reveal with "Wear it". Trails come from `src/render/trails.ts` in both renderers (one HD point cloud per worn trail).
- Display only: the race engine never reads cosmetics; private rooms are unchanged.
- Checks: `npm test` N pass, `npm run test:db` N pass, typecheck, lint, build clean, `npm run test:e2e` N/N.
- Deploy (push + `npx supabase db push` for the migration) waits for the owner's screenshot review.
```

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/a11y.spec.ts PROJECT_STATUS.md
git commit -m "docs: cosmetics shop status; axe on the looks shop"
```

---

### Task 12: Screenshots for the owner (no deploy)

**Files:**
- Create (temporary, never committed): `tests/e2e/cosmetics-shots.spec.ts`

- [ ] **Step 1: Write the spec.** It reuses the E2E config (headless Chromium, its own `npm run dev` on 5180 against local Supabase). The phone signs into the office like `tests/e2e/office.spec.ts`: the admin adds a member with a PIN (`admin_add_member` through the service-role client), `admin_adjust` gives coins, the phone picks its name and PIN.

```ts
import { expect, test, type Page } from '@playwright/test';
import { adminClient, ok, resetOffice, uniqueName } from './helpers.ts';

const OUT =
  'C:/Users/jieha/AppData/Local/Temp/claude/98d0a7cb616bcfc0/254daba3-f305-42f9-8699-6d445f78a3da/scratchpad';
const PIN = '4321';
let playerId = '';
test.afterAll(async () => {
  if (playerId) await ok(adminClient().rpc('admin_archive', { p_player: playerId }));
});

async function buyAndWear(phone: Page, name: string, price: number) {
  await phone.getByRole('button', { name: `Buy ${name}` }).click();
  await phone.getByRole('button', { name: `Pay ${price}` }).click();
  await phone.getByRole('button', { name: `Wear ${name}` }).click();
  await expect(phone.getByRole('button', { name: `Remove ${name}` })).toBeVisible();
}

test('cosmetics shop screenshots', async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  await resetOffice();
  const name = uniqueName('Shop');
  const player = (await ok(
    adminClient().rpc('admin_add_member', { p_name: name, p_pin: PIN }),
  )) as { id: string };
  playerId = player.id;
  await ok(
    adminClient().rpc('admin_adjust', { p_player: playerId, p_amount: 5000, p_reason: 'shots' }),
  );

  const phone = await (
    await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await phone.goto('/play?code=TURF');
  await phone.getByLabel('Who are you?').selectOption({ label: name });
  await phone.getByLabel('Your PIN').fill(PIN);
  await phone.getByRole('button', { name: 'Sign in' }).click();
  await expect(phone.getByRole('heading', { name: 'Looks shop' })).toBeVisible();
  const shop = phone.locator('section.looks-shop');
  const shot = (n: string) => shop.screenshot({ path: `${OUT}/cosmetics-${n}.png` });
  const tab = (label: string) => phone.getByRole('button', { name: label, exact: true }).click();

  await buyAndWear(phone, 'Lightning silks', 250);
  await shot('patterns');
  await tab('Trails');
  await buyAndWear(phone, 'Rainbow trail', 500);
  await shot('trails');
  await tab('Caps');
  await buyAndWear(phone, 'Crown', 400);
  await phone.getByRole('button', { name: /^Try on Halo/ }).click();
  await shot('caps-tryon');
  await tab('Celebrations');
  await phone.getByRole('button', { name: /^Try on Fireworks/ }).click();
  await phone.waitForTimeout(700);
  await shot('celebrations-tryon');
  await phone.getByRole('button', { name: 'Buy Spin' }).click();
  await shot('confirm');
  await phone.getByRole('button', { name: 'Cancel', exact: true }).click();

  await tab('🎁 Crate');
  await shot('crate');
  await phone.getByRole('button', { name: 'Open crate' }).click();
  await phone.getByRole('button', { name: 'Pay 250' }).click();
  await expect(phone.getByRole('status').filter({ hasText: /^You got / })).toBeVisible();
  await phone.waitForTimeout(400);
  await shot('crate-shake');
  await phone.waitForTimeout(1600);
  await shot('crate-reveal');
  await phone.screenshot({ path: `${OUT}/cosmetics-phone-full.png`, fullPage: true });

  // Podium celebrations and in-race looks: the sandbox (no Supabase needed).
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto('/sandbox');
  await page.getByLabel('Lane 1 cap').selectOption('cap:crown');
  for (const code of [
    '',
    'celebration:spin',
    'celebration:fireworks',
    'celebration:moonwalk',
    'celebration:cannon',
  ]) {
    await page.getByLabel('Lane 1 celebration').selectOption(code);
    await page.waitForTimeout(700);
    await page
      .locator('.sandbox-podium')
      .screenshot({ path: `${OUT}/cosmetics-podium-${code.split(':')[1] ?? 'hop'}.png` });
  }
  await page.getByLabel('Lane 1 pattern').selectOption('pattern:lightning');
  await page.getByLabel('Lane 1 trail').selectOption('trail:fire');
  await page.getByRole('button', { name: 'Run short race' }).click();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/cosmetics-race-hd.png` });
  await page.getByRole('button', { name: 'HD graphics' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/cosmetics-race-2d.png` });
});
```

- [ ] **Step 2: Run it**

Run: `npx supabase start` (if not running), then `npx playwright test tests/e2e/cosmetics-shots.spec.ts`
Expected: 1 passed; in `C:\Users\jieha\AppData\Local\Temp\claude\98d0a7cb616bcfc0\254daba3-f305-42f9-8699-6d445f78a3da\scratchpad\`: `cosmetics-{patterns,trails,caps-tryon,celebrations-tryon,confirm,crate,crate-shake,crate-reveal}.png`, `cosmetics-phone-full.png`, `cosmetics-podium-{hop,spin,fireworks,moonwalk,cannon}.png`, `cosmetics-race-hd.png`, `cosmetics-race-2d.png`. (If headless WebGL is missing, the sandbox falls back to 2D and both race shots are 2D; tell the owner.)

- [ ] **Step 3: Look at every screenshot** (Read tool): the preview wears lightning silks, rainbow trail marks and the crown, and the halo when tried on; tabs are a full-width row with the open one gold; cards are 2 per row with readable names and prices; the crate shows the 🎁 mid-shake and then the horse wearing the prize with "Wear it"; each podium shot shows its celebration (fireworks/cannon particles visible); caps and the lightning pattern are readable at race size in both renderers; the fire trail rises behind lane 1. Fix and re-run if anything is off (commit fixes with their exact paths).

- [ ] **Step 4: Remove the temporary spec** — `rm tests/e2e/cosmetics-shots.spec.ts`; `git status` shows no change under `tests/`. Hand the screenshot paths to the owner. **Do not deploy or push**; the owner decides after reviewing.

---

## Self-review notes

- Spec coverage: catalogue and prices (T1); `cosmetic_price` extended, `cap`/`celebration` columns with checks, `equip_cosmetic` new slots, `open_crate` (definer, `search_path = ''`, authenticated, office, LOBBY, own player via `lock_office_member`, 1/price, `nothing_left`, `not_enough_coins` via `private.balance`, `player_cosmetics` insert, −250 `cosmetic` ledger row, returns the code), types regenerated, no Edge Function change (T1); `HorseColors.cap/.celebration` through `colorsByPlayer`/`horseColors` (T2); patterns (T3) and caps (T4) in `drawHorse`, so both renderers, the HD sheet, cut-ins, `HorseSprite` and the podium get them; trails in both renderers (T5); celebrations, winner only, default hop, reduced motion (T6); `openCrate` (T7); preview with try-on, tabs, cards, confirm, Buy/Wear/Remove, celebration plays once in the preview (T8); crate tab, reveal, "Wear it", hidden when nothing is left, no shake under reduced motion (T9); sandbox pickers (T10). Testing section: client == SQL (T1 unit + DB parity), new slots equip/reject (T1), crate never owned / charges once / rejects outside LOBBY, non-office, poor, nothing left (T1), distribution chi-square (T1), every pattern/trail/cap draws in all poses (T3–T5), celebration → class (T6), card states (T8), emoji guard (T9, T11), axe (T11), screenshots (T12).
- Decisions made while planning (the spec was silent or did not match the code):
  - **Order:** the server lands first (Task 1) together with the client list, not the client list alone: widening `CosmeticSlot` makes `LooksShop`'s `mine[c.slot]` fail to typecheck until `database.types.ts` has the new columns, and every task must end green.
  - **One SQL price list:** `private.cosmetic_catalog()` (code, price) replaces the `case` in `cosmetic_price`, which now reads it, so `open_crate` lists candidates without a second copy. The unit test parses that function in the migration; the existing DB parity test buys every item. No later migration redefines `cosmetic_price`, `buy_cosmetic`, `equip_cosmetic` or `lock_office_member` (checked `_0016`–`_0021`).
  - **Column checks** use the prefix (`cap like 'cap:%'`) like `pattern`/`trail` in `_0015`, not the price function; unknown codes can't be worn anyway because `equip_cosmetic` requires ownership and `buy_cosmetic` rejects unknown codes.
  - **Weighting:** an exponential race (`order by -ln(1 - random()) * price limit 1`) gives exactly 1/price. With the listed prices celebrations come out at ~8% of crates (about 1 in 12.5), not the spec's "≈ 1 in 10"; the spec marks prices as tunable, so they stay as listed. The chi-square bound is 60 at 20 degrees of freedom over 400 opens (p = 0.001 sits at 45.3; a uniform pick scores over 100).
  - **Crate check order:** `wrong_phase` (not LOBBY) → `nothing_left` → `not_enough_coins`, so a player who owns everything is told that even when broke. Buying single items still works in every phase but RUNNING, as before.
  - **Try-on** is local React state; a tapped card stays tried on until another card or tab is tapped (tapping the same celebration replays it). The preview is `aria-hidden` and the try-on buttons are labelled "Try on <name>, <price> coins", so screen readers hear names and prices, not canvases.
  - **Tabs** are toggle buttons with `aria-pressed` in a labelled `role="group"`, not an ARIA tablist (a tablist needs arrow-key roving focus; plain buttons stay simple and pass axe).
  - **Preview colours** come from the same `horseColors(players, horses, id)` as the phone header (new `colors` prop through `HorsePanel`), so unsaved coat/silk edits in "Your horse" don't show until saved.
  - **Trails:** `src/render/trails.ts` keeps dust and sparkle pixel-identical in 2D. In HD, sparkle now flickers gold/white like its 2D version (vertex colours), a small visible change; dust and sparkle keep their HD size and height. HD builds point clouds only for trails worn in that race.
  - **Caps** keep their highest pixel at `cy − 2`, so with the gallop lift they never leave the 24×22 cell (tested), which matters for the HD sheet and `HorseSprite`.
  - **Celebrations** are CSS on a wrapper around the winner's sprite (`Celebration` in `Podium.tsx`), so the TrackPage podium, the shop preview and the sandbox share them; unknown or missing codes fall back to `podium-hop`.
  - **Crate copy:** the spec's "Each item you don't own; rarer items are pricier" becomes "Gives one item you don't own yet. Pricier items are rarer." The prize is announced through an always-mounted `role="status"` line.
  - **Deploy** needs `npx supabase db push` for the migration as well as the push; both wait for the owner's screenshot review.
