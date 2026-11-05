# Visual polish — design

**Status:** approved by the owner 2026-11-05 (brainstorm). The game is feature-complete; this pass
makes it look like one game everywhere. The "big screen" is a monitor shared over Discord, so bold
sprites and large headings matter more than fine text; a full-screen TV layout is out of scope.

## Decisions (owner)

1. **Horse sprites wherever a horse is named** (static), animated only on the podium.
2. **Podium celebration:** horses on the steps, winner bigger with a rear/hop loop, confetti on
   entry, 🏆 prize banner, payout lines with sprites; phone shows your place and winnings big.
3. **Phase banners** on the shared screen and phones with a soft sting.
4. **Phone tidy-up:** compact header, sticky bottom action bar, cleaner shop layout.

No game logic, database or Edge Function change: a normal Vercel deploy.

## 1. `HorseSprite` (shared component)

- `src/render/HorseSprite.tsx`: a small `<canvas>` drawing the existing 2D pixel horse
  (`drawHorse` from `src/render/sprites.ts`, side pose, plus the sheet outline `outlineCell` from
  `src/render/hd2d/sheet.ts`, as the cut-in `Portrait` in `src/render/CutInOverlay.tsx` already
  does). Colours from the same `colors(horse, lane)` / `colorsByPlayer` the race uses (silks,
  pattern; trail not drawn).
- Props: `colors`, `size: 'sm' | 'md' | 'lg'` (CSS scale of the pixel canvas, `image-rendering:
  pixelated`), `animated?: boolean` (4-frame gallop; podium only). `aria-hidden`; the name is always
  beside it.
- Extract the cut-in `Portrait` drawing into this component and reuse it there (one implementation).
- **Replaces** 🐎 and colour squares (`Silk`) next to horse names on: lobby/shop/betting boards
  (`src/track/TrackPage.tsx`), race standings (`src/render/RaceView.tsx`), stats leaderboards and
  horse lists (`src/history/StatsPage.tsx`), the phone header (`src/play/PlayPage.tsx`), and the
  podium. `Silk` stays only where a bare colour is meant.

## 2. Podium

- Shared screen (`PodiumBoard` in TrackPage):
  - Three steps (2nd · 1st · 3rd) with `HorseSprite size="lg"` standing on each; the winner larger
    and `animated` with a rear/hop loop (CSS keyframes on the wrapper, ~1.2 s period).
  - Pixel confetti burst on entry (~3 s, CSS or a small canvas; a few dozen squares in silk colours).
  - 🏆 prize banner when a prize is set ("🏆 {winner}: {prize}").
  - Payout lines: sprite + name + "+N coins", sorted high → low, the biggest highlighted gold;
    "No winning bets." when none. The rest of the field in a compact list below (place · sprite ·
    name · time).
- Phone results: a big card at the top: your sprite, "You finished {ordinal}", "+N coins" (or
  "No winnings this time"), then the existing details.
- Reduced motion: no hop, no confetti.

## 3. Phase banners

- `src/app/PhaseBanner.tsx`: shown when `room.phase` changes **after** mount (a ref holds the
  previous phase; the first render and refetches that keep the same phase show nothing).
- Texts: SHOP "🛒 SHOP OPEN!", ODDS_LOCKED "🔒 ODDS LOCKED", BETTING "💰 PLACE YOUR BETS!",
  RUNNING "🏁 RACE TIME!", PODIUM "🏆 RESULTS!". LOBBY shows nothing.
- A pixel band sweeping across the viewport for 1.2 s (fixed position, `pointer-events: none`,
  `aria-hidden`: phase changes are already announced by the live regions). Reduced motion: a 0.4 s
  fade in place.
- Used on the shared screen (TrackPage) and phones (PlayPage).
- Sound: new SFX `phase` (a softer, shorter cousin of `cutin`) played with the banner through the
  existing sound engine (respects mute/levels). Phones play it only if their sound is on.

## 4. Phone tidy-up (`src/play/PlayPage.tsx`, `src/app/TopBar.tsx`, CSS)

- **Header:** one compact row: `HorseSprite size="md"` + name, coins chip, sound icon button
  (the existing SoundToggle, icon-only with an accessible label). The room code moves into the small
  line under it.
- **Sticky bottom bar:** the phase's main action pinned to the bottom (`position: sticky`,
  safe-area padding `env(safe-area-inset-bottom)`): "I'm ready" (shop), the bet slip's
  "Place bet" (betting), and any other existing primary action. Content gets bottom padding so
  nothing hides under it. Only actions that exist today move; no new actions.
- **Shop order:** hot strip → three box cards → trait picker as a 2×3 grid of icon + name buttons
  (≥ 44 px), the chosen trait's one-line effect shown under the grid.
- Consistent spacing/typography using the existing theme tokens (`src/app/theme.css`).
- Must stay emoji-safe (the `emojiSupport` test) and keep the a11y E2E passing.

## Testing

- Unit: `HorseSprite` renders an `aria-hidden` canvas and draws with the given colours;
  `PhaseBanner` shows only on a phase change, not on mount, with the right text; podium payout
  ordering and gold highlight; phone header and sticky bar show the right action per phase.
- Existing E2E + axe a11y pass (update selectors if markup changes).
- Screenshots of every phase on the shared screen (1920×1080) and a phone (390×844), from the real
  flow against local Supabase, shown to the owner before deploy.
