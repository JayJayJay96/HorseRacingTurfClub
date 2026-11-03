# UI theme — HD-2D-ready pixel menus (design)

**Date:** 2026-11-04 · **Status:** approved in brainstorming, awaiting spec review
**Scope:** look and light layout fixes for `/track`, `/play`, `/` (Home), `/stats` and `/admin`.
The HD-2D race renderer (Phase 8) is a separate spec that builds on this theme.

## Goals

- Replace browser-default styling with one consistent retro look that already matches the HD-2D
  menus coming in Phase 8 (Octopath / Triangle Strategy style: dark see-through windows with thin
  gold trim and soft glow, pixel headings).
- Fix the few awkward layouts on the TV and the phone. Same features, same flows.
- No new dependencies; no logic, data, sound or sim changes.

## Non-goals

New animations or page transitions, new navigation, quick-stake buttons, a light theme, changes
to the race canvas art (Phase 8 owns that).

## 1. Visual language

### Colours (dark only)

Tokens on `:root` in `theme.css`; `color-scheme: dark`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#141b2d` | page base |
| `--panel` | `rgba(20, 27, 45, 0.88)` | windows, cards |
| `--raised` | `#2a3858` | hover, selected, table stripes |
| `--edge` | `#0a0e18` | gap inside the trim, text shadow |
| `--ink` | `#f4f1e8` | main text |
| `--muted` | `#a9b4cc` | secondary text |
| `--gold` | `#ffcc33` | primary buttons (navy text), trim, emphasis, 1st place |
| `--gold-dim` | `#b8912a` | inner trim line, gold gradient bottom |
| `--turf` | `#3d7a3a` | ready / racing states; background gradient |
| `--danger` | `#ff6b6b` | errors, Remove |
| `--silver` / `--bronze` | `#c9d1dc` / `#cd7f32` | 2nd / 3rd place |

Box colours keep `BOX_COLOR` (`src/render/palette.ts`) for shop-card stripes.

### Type

- **Pixelify Sans** (OFL), self-hosted at `src/assets/fonts/PixelifySans.woff2`, `font-display: swap`:
  headings, buttons, room code, odds, countdowns, places, chips. Never below 16 px.
- Body: `system-ui, sans-serif` (names, rules, tables, inputs).
- Pixel headings get `text-shadow: 0 1px 0 var(--edge)`.

### Windows (`.panel`)

- Background `--panel` with a faint top-to-bottom shade.
- Double trim: 1 px `--gold`, 1 px `--edge` gap, 1 px `--gold-dim` (box-shadow layers, no border image).
- Small square gold corner marks (pseudo-elements).
- Soft shadow `0 8px 24px rgba(0, 0, 0, 0.5)`. Square corners.

### Page background

Dark navy to turf gradient with a soft vignette (`body`, fixed). The race canvas sits in a `.panel`.

### Controls

- `button` (default / secondary): see-through navy with gold trim, pixel label.
- `button.primary`: gold gradient (`--gold` to `--gold-dim`), navy text, faint gold glow on hover and focus.
- Pressed: darker and 1 px lower. Disabled: flat, `--muted` text, no glow.
- Inputs and selects: `--raised` fill, gold trim on focus. Checkboxes, radios, sliders:
  `accent-color: var(--gold)`.
- Focus ring: 3 px `--gold` outline, offset 2 px, on everything focusable (replaces `Highlight`).

### Light accents (`.glow`)

A soft warm radial glow behind the room code, the countdown and the podium winner. Static. Under
`prefers-reduced-motion: reduce` there are no glow or press transitions.

### Small pieces

- `.card`: a tappable choice (real `<button>` or a `<label>` around a radio); `--raised` when hovered or selected, gold trim when selected.
- `.chip`: small pixel label (`#4`, online, coins, box type, win/loss).

## 2. Structure

- New `src/app/theme.css`, imported in `src/main.tsx` before `app.css`: tokens, `@font-face`,
  page background, element base styles (`button`, `input`, `select`, `table`, `h1`–`h3`), and the
  shared classes `.panel`, `.card`, `.chip`, `.glow`, `.topbar`.
- `src/app/app.css` keeps screen layout only (grids, columns, positions); its colours move to tokens.
- The markup is already mostly plain elements, so element styles restyle most screens with no JSX
  change. JSX changes only for the layout fixes in section 3 (wrapping groups in `.panel`, cards).
- The same `.panel` / `.chip` styles frame the race standings, countdown, popups and fullscreen
  button, so the Phase 8 renderer draws behind the same frames.
- Font file: downloaded from the official Pixelify Sans release (ask before downloading).

## 3. Screens

**Everywhere:** a thin top bar (`.topbar`): pixel "TURF CLUB" left; room code chip, coins chip and
the sound button right (whichever apply on that page). Content groups are `.panel`s.

### Big screen `/track`

- **Lobby:** two columns. Left: panel with the glowing room code above the QR. Right: roster as a
  grid of cards (silk, `#n`, name, online and coin chips, tick box). Race length, track and prize in
  one compact panel strip. Large gold **Open shop** bottom right.
- **Shop / Betting:** full-width odds-board panel table: pixel header row, silk and `#n` per horse,
  odds in pixel digits, bought-box icons per row.
- **Race:** canvas in a panel frame, standings in a side panel; fullscreen button and cheers styled
  as chips.
- **Podium:** three steps (2nd, 1st, 3rd) in silver, gold, bronze; glow behind the winner;
  payouts panel below.

### Phone `/play`

- **Box shop:** three large cards (big icon, name, price, box-colour stripe) + a "2/3 boxes" chip.
- **Bet slip:** the horse `<select>` becomes a labelled radio group of cards (silk, `#n`, name,
  Win/Place odds). Win/Place is a two-part toggle (radios styled as segments). Stake input stays.
- **Race:** mini oval in a panel; "You're #4 · 3rd" in large pixel text; cheer buttons as square tiles.
- **Results:** one big place card, then your bets with win/loss chips.
- **Office login / private join:** one centred panel.

### Home `/` and `/stats`

- **Home:** pixel title, two large cards: Private race, Office.
- **Stats:** leaderboards as a grid of small panels (gold/silver/bronze top rows), badges as chips,
  horses table and recent races in the odds-board style.

### Admin `/admin`

Theme only; layout unchanged.

## 4. Accessibility

- Every text/background pair at 4.5:1 or better (cream and muted on panel, navy on gold, danger on
  navy); panels are opaque enough that this holds over the gradient.
- Gold focus ring on all focusable elements.
- Cards stay real buttons or labelled radios: keyboard and screen-reader behaviour unchanged.
- Pixel font only at 16 px and up; body text in the system font.
- Reduced motion: no glow or press transitions.

## 5. Testing

- E2E axe check (6 pages, no serious/critical) must still pass.
- E2E specs that use labels and roles keep passing; any renamed control is updated in the same change.
- Unit and DB suites: unaffected (no logic changes).
- Screenshots of each screen in the browser pane at TV (1920×1080), laptop (1280×800) and phone
  (375×812) widths.
