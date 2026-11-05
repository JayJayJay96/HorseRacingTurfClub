# Cosmetics shop — design

**Status:** approved by the owner 2026-11-05 (brainstorm). Expands the office Looks shop (Phase 9:
`src/play/LooksShop.tsx`, `src/shop/cosmetics.ts`, migration `20261104000015_cosmetics.sql`).

## Goal

A real shop with things worth saving for: a live preview of your own horse, more patterns and
trails, two new slots (caps, victory celebrations), and a 250-coin mystery crate.

## Decisions (owner)

- **Items:** more patterns, more trails, caps (new slot), victory celebrations (new slot). No titles.
- **Selling:** a fixed catalogue, always available, priced by visibility; **plus** a mystery crate.
- **Crate:** 250 coins → a random item you don't own; chance ∝ 1 / price (celebrations ≈ 1 in 10
  crates); no duplicates; rolled on the server; hidden when you own everything; short reveal.
- **Where:** the phone Looks shop in the office lobby (office only, as today).

## Catalogue

Codes `slot:name`; prices mirrored by `private.cosmetic_price` (server is the source of truth).

| Slot | Items (price) |
|---|---|
| pattern | hoops 150, sash 150, stars 200 (existing); chevrons 150, quarters 150, dots 200, lightning 250 |
| trail | dust 250, sparkle 400 (existing); hearts 300, fire 400, rainbow 500, bubbles 300 |
| cap (new) | pompom 200, horns 250, halo 300, crown 400 |
| celebration (new) | spin 500, fireworks 650, moonwalk 650, cannon 800 |

Final names/prices may be tuned while building; the client list and the SQL price function must
match (a test compares them).

## Drawing

- **Patterns:** drawn on the jockey's silk rect in `drawHorse` (`src/render/sprites.ts`) like the
  existing hoops/sash/stars, in both renderers (HD-2D uses the same sheet drawing).
- **Trails:** like dust/sparkle in both renderers (2D ring buffer; HD points), new colours/shapes.
- **Caps:** a few pixels on the jockey's head in `drawHorse` (all poses), so they show in the race,
  cut-in portraits, `HorseSprite` and the podium. Must stay readable at size 1.
- **Celebrations:** a podium-only animation for the **winner** (`src/track/Podium.tsx` /
  `HorseSprite` wrapper CSS + small particle effects): spin (sprite flips/rotates), fireworks (rear +
  bursts), moonwalk (slides backwards while galloping), cannon (confetti cannon burst). Default
  (none) keeps today's hop. Reduced motion: static winner, no particles.
- Emoji guard (`src/app/emojiSupport.test.ts`) must keep passing.

## Shop UI (phone, office LOBBY)

- Preview at the top: `HorseSprite size="lg" animated` wearing the current equipment; tapping a
  card **tries it on** in the preview (not saved); a celebration card plays its animation once in
  the preview.
- Tabs: Patterns · Trails · Caps · Celebrations · 🎁 Crate. Cards (≥ 44 px targets): small sprite
  wearing the item, name, price; button Buy (confirm "Pay N?") / Wear / Remove.
- Crate tab: price, "Each item you don't own; rarer items are pricier", Open button (confirm),
  reveal animation (crate shakes → opens → sprite wearing the item → "Wear it" button). Hidden
  (with a "You own everything!" note) when nothing is left. Reduced motion: no shake.

## Server (one migration)

- `private.cosmetic_price(code)` extended with the new codes.
- `room_players.cap text`, `room_players.celebration text` (null = none), with checks via the price
  function like the existing slots.
- `equip_cosmetic(p_room, p_slot, p_code)` accepts `cap` and `celebration`.
- `open_crate(p_room uuid) returns text` (security definer, `search_path = ''`, authenticated,
  office room, LOBBY phase, own player via existing helpers): picks among codes the player doesn't
  own with weight 1/price (Postgres `random()`; cosmetics only), raises `nothing_left` if none,
  `not_enough_coins` if the balance < 250 (`private.balance`), inserts into `player_cosmetics`,
  writes a `cosmetic` ledger row of −250, returns the code. Same locking as `buy_cosmetic`.
- Clients read `cap`/`celebration` with the player rows (used by `colorsByPlayer`/`horseColors`
  → `HorseColors.cap`, `.celebration`).
- `database.types.ts` regenerated. No Edge Function change.

## Testing

- DB: client catalogue == SQL prices; new slots equip and reject unknown/unowned codes; crate never
  returns an owned item, charges exactly 250 once, rejects outside LOBBY / non-office /
  insufficient coins / nothing left; over many opens the distribution follows 1/price
  (chi-square, loose bound).
- Unit: every pattern/trail/cap draws without error in all poses; celebration choice maps to the
  right podium class; shop card states (Buy/Wear/Remove); emoji guard.
- Screenshots: shop tabs with preview, crate reveal, each celebration on the podium; shown to the
  owner before deploy.
