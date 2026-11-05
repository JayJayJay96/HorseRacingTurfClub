# Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game look like one game everywhere: a pixel horse sprite beside every horse name, a podium celebration on the shared screen, a big result card on phones, phase banners with a soft sting, and a tidier phone (compact header, sticky action bar, trait grid).

**Architecture:** One new `HorseSprite` canvas component (the cut-in `Portrait` extracted, memoised on its colour values so the 4 Hz standings and 22-row boards draw once per colour change), fed by a new `horseColors(players, horses, id)` palette helper (race lane, else roster position). New small presentational files hold everything that needs a unit test, because `TrackPage.tsx`/`PlayPage.tsx` import `src/net/supabase.ts`, which throws without env vars: `src/track/Podium.tsx`, `src/play/ResultCard.tsx`, `src/play/ActionBar.tsx`, `src/app/PhaseBanner.tsx`. One new SFX `phase`. No game logic, database or Edge Function change.

**Tech Stack:** React 19, TypeScript strict (`.ts`/`.tsx` imports, `noUncheckedIndexedAccess`), Vite, Vitest in `node` (no jsdom/testing-library: tests use `renderToStaticMarkup` or call components and walk the element tree; effects never run in tests), Canvas 2D, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-05-visual-polish-design.md`.

**Commands:** `npm test` (unit), `npx vitest run <file>` (one file), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e` (needs `npx supabase start`; it starts its own dev server on port 5180). Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not `prettier --write` whole folders (it rewrites line endings on unrelated files); format only files you touched. No emoji newer than Emoji 12 (`src/app/emojiSupport.test.ts`); every emoji in this plan is older. **No deploy in this plan:** the owner reviews the screenshots from Task 9 first.

**Conventions used below:** `SSR` = `renderToStaticMarkup` (it inserts `<!-- -->` between adjacent JSX text nodes, so components that tests read build text with one template string). Sprite sizes are whole-pixel CSS scales of one 24×22 `CELL`: `sm` 1× (dense lists: standings, stats, payouts, field list, bet slip), `md` 2× (shared-screen boards, phone header), `lg` 4× (podium, phone result card, cut-in); the podium winner is 6× via CSS.

---

## File structure

| File | Responsibility |
|---|---|
| `src/render/HorseSprite.tsx` (create) | `paintHorse` (pure draw), `HorseSprite` (memoised canvas, `sm`/`md`/`lg`, optional 4-frame gallop strip) |
| `src/render/palette.ts` (modify) | `horseColors(players, horses, id)` |
| `src/render/CutInOverlay.tsx` (modify) | `Portrait` replaced by `HorseSprite` |
| `src/render/RaceView.tsx` (modify) | standings sprites; `Silk` deleted |
| `src/track/TrackPage.tsx` (modify) | board sprites, podium celebration, phase banner |
| `src/track/Podium.tsx` (create) | `payoutLines`, `Payouts`, `Confetti` |
| `src/history/StatsPage.tsx` (modify) | leaderboard and horse-table sprites |
| `src/play/PlayPage.tsx` (modify) | bet-slip sprites, result card, phase banner, compact header, sticky bar |
| `src/play/ResultCard.tsx` (create) | phone podium card |
| `src/play/ActionBar.tsx` (create) | sticky Bet / I'm ready bar |
| `src/play/TraitPicker.tsx` (modify), `src/app/Traits.tsx` (modify) | 2×3 icon + name grid; `TraitLabel` deleted |
| `src/app/PhaseBanner.tsx` (create) | `PHASE_BANNER`, `bannerText`, `PhaseBanner` |
| `src/audio/raceCues.ts`, `src/audio/soundEngine.ts` (modify) | SFX `phase` |
| `src/app/TopBar.tsx`, `src/audio/SoundToggle.tsx` (modify) | `title` slot; icon-only sound button |
| `src/app/app.css` (modify) | sprite, podium, banner, header, bar, trait-grid styles; `.race canvas` scoped to the race canvas |
| `tests/e2e/private-race.spec.ts` (modify) | reads the new phone result card |
| `PROJECT_STATUS.md` (modify) | status section |

---

### Task 1: `HorseSprite` and `horseColors`, used by the cut-in

**Files:**
- Create: `src/render/HorseSprite.tsx`, `src/render/HorseSprite.test.tsx`
- Modify: `src/render/palette.ts`, `src/render/palette.test.ts`, `src/render/CutInOverlay.tsx`, `src/app/app.css`

- [ ] **Step 1: Write the failing tests.**

`src/render/HorseSprite.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HorseSprite, paintHorse } from './HorseSprite.tsx';
import { colorsOf, contrastOf } from './palette.ts';

/** Records what drawHorse paints: fill colours and each draw's x offset. */
function fakeCtx() {
  const fills: string[] = [];
  const xs: number[] = [];
  let fill = '';
  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
    },
    fillRect: () => void fills.push(fill),
    translate: (x: number) => void xs.push(x),
    save() {},
    restore() {},
    scale() {},
    clearRect() {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, xs };
}

describe('paintHorse', () => {
  it('draws one side-view horse in the given coat and silk', () => {
    const c = colorsOf(0);
    const { ctx, fills, xs } = fakeCtx();
    paintHorse(ctx, c, 1);
    expect(fills).toContain(c.coat);
    expect(fills).toContain(c.silk);
    expect(xs).toEqual([12]);
  });
  it('draws the pattern in the silk contrast colour', () => {
    const c = { ...colorsOf(1), pattern: 'pattern:hoops' };
    const { ctx, fills } = fakeCtx();
    paintHorse(ctx, c, 1);
    expect(fills).toContain(contrastOf(c.silk));
  });
  it('an animated strip is 4 frames, one 24 px cell each', () => {
    const { ctx, xs } = fakeCtx();
    paintHorse(ctx, colorsOf(2), 4);
    expect(xs).toEqual([12, 36, 60, 84]);
  });
});

describe('HorseSprite', () => {
  it('is an aria-hidden one-cell canvas, scaled by its size class', () => {
    const html = renderToStaticMarkup(<HorseSprite colors={colorsOf(0)} size="md" />);
    expect(html).toMatch(/^<canvas[^>]*>/);
    expect(html).toContain('width="24"');
    expect(html).toContain('height="22"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('horse-sprite horse-sprite-md');
  });
  it('animated: a 4-frame strip inside an aria-hidden window', () => {
    const html = renderToStaticMarkup(<HorseSprite colors={colorsOf(0)} size="lg" animated />);
    expect(html).toMatch(/^<span class="horse-sprite horse-sprite-lg is-animated" aria-hidden="true">/);
    expect(html).toContain('width="96"');
  });
  it('passes an extra class through (the cut-in portrait)', () => {
    const html = renderToStaticMarkup(
      <HorseSprite colors={colorsOf(0)} size="lg" className="cutin-portrait" />,
    );
    expect(html).toContain('class="horse-sprite horse-sprite-lg cutin-portrait"');
  });
});
```

Append to `src/render/palette.test.ts` (add `horseColors` to its `./palette.ts` import):

```ts
describe('horseColors', () => {
  const players = [
    { id: 'a', coat: null, silk: null },
    { id: 'b', coat: 2, silk: 3, pattern: 'pattern:hoops' },
  ];
  it('uses the race lane when the horse is in the race', () => {
    expect(horseColors(players, ['b', 'a'], 'a')).toEqual(colorsOf(1));
    expect(horseColors(players, ['b', 'a'], 'b')).toEqual(colorsByPlayer(players)('b', 0));
  });
  it('off the race: the roster position; an unknown id gets lane 0', () => {
    expect(horseColors(players, [], 'a')).toEqual(colorsOf(0));
    expect(horseColors([{ id: 'z', coat: null, silk: null }, ...players], [], 'a')).toEqual(
      colorsOf(1),
    );
    expect(horseColors(players, [], 'x')).toEqual(colorsOf(0));
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/render/HorseSprite.test.tsx src/render/palette.test.ts`
Expected: FAIL (`./HorseSprite.tsx` does not exist; `horseColors` is not a function).

- [ ] **Step 3: Implement.**

`src/render/HorseSprite.tsx`:

```tsx
import { memo, useEffect, useRef } from 'react';
import { CELL, FRAMES, outlineCell } from './hd2d/sheet.ts';
import type { HorseColors } from './palette.ts';
import { drawHorse } from './sprites.ts';

/**
 * Side-view horse(s) facing right, one CELL per frame left to right, each outlined like the HD
 * sheet. A still sprite (frames = 1) uses gallop frame 1, the pose the cut-in always showed.
 */
export function paintHorse(ctx: CanvasRenderingContext2D, colors: HorseColors, frames: number) {
  const w = CELL.w * frames;
  ctx.clearRect(0, 0, w, CELL.h);
  for (let f = 0; f < frames; f++) {
    drawHorse(ctx, f * CELL.w + CELL.footX, CELL.footY, colors, frames === 1 ? 1 : f, 'side-right', 1);
  }
  const img = ctx.getImageData(0, 0, w, CELL.h);
  for (let f = 0; f < frames; f++) outlineCell(img.data, w, f * CELL.w, 0, CELL.w, CELL.h);
  ctx.putImageData(img, 0, 0);
}

type Props = {
  colors: HorseColors;
  /** Whole-pixel CSS scale: sm 1×, md 2×, lg 4× (app.css `.horse-sprite-*`). */
  size: 'sm' | 'md' | 'lg';
  /** 4-frame gallop (CSS steps over a strip); podium winner only. */
  animated?: boolean;
  className?: string;
};

function Sprite({ colors, size, animated = false, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frames = animated ? FRAMES : 1;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paintHorse(ctx, colors, frames);
  }, [colors, frames]);
  const cls = `horse-sprite horse-sprite-${size}${className ? ` ${className}` : ''}`;
  const canvas = (
    <canvas
      ref={ref}
      className={animated ? undefined : cls}
      width={CELL.w * frames}
      height={CELL.h}
      aria-hidden="true"
    />
  );
  return animated ? (
    <span className={`${cls} is-animated`} aria-hidden="true">
      {canvas}
    </span>
  ) : (
    canvas
  );
}

const sameColors = (a: HorseColors, b: HorseColors) =>
  a.coat === b.coat &&
  a.mane === b.mane &&
  a.silk === b.silk &&
  (a.pattern ?? null) === (b.pattern ?? null);

/**
 * The 2D pixel horse beside a horse's name (spec 2026-11-05 polish §1). Decorative: the name is
 * always next to it. Memoised on the colour values because callers build a new colours object
 * every render (the standings re-render at 4 Hz), so a canvas only redraws when a colour changes.
 */
export const HorseSprite = memo(
  Sprite,
  (a, b) =>
    a.size === b.size &&
    a.animated === b.animated &&
    a.className === b.className &&
    sameColors(a.colors, b.colors),
);
```

In `src/render/palette.ts`, after `colorsByPlayer` add:

```ts
/**
 * A horse's colours anywhere outside the race renderer: its lane in `horses` (the race order),
 * else its position in `players` (lobby, shop, stats, bettors who don't race), else lane 0.
 */
export function horseColors(
  players: readonly ({ id: string } & Choice)[],
  horses: readonly string[],
  id: string,
): HorseColors {
  const lane = horses.indexOf(id);
  return colorsByPlayer(players)(
    id,
    lane >= 0 ? lane : Math.max(0, players.findIndex((p) => p.id === id)),
  );
}
```

In `src/render/CutInOverlay.tsx`:
- Replace the imports `import { useEffect, useRef, useState, type CSSProperties } from 'react';` with `import { useState, type CSSProperties } from 'react';`, delete `import { CELL, outlineCell } from './hd2d/sheet.ts';` and `import { drawHorse } from './sprites.ts';`, and add `import { HorseSprite } from './HorseSprite.tsx';`.
- Delete the whole `Portrait` function and its doc comment (`/** The horse's side sprite, outlined like the HD sheet, scaled up crisply by CSS. */` … `}`).
- In `Band`, replace `<Portrait colors={colors} />` with `<HorseSprite colors={colors} size="lg" className="cutin-portrait" />`.

In `src/app/app.css`, scope the race-canvas rules to the race canvas only (sprites inside `.race`, e.g. the standings, must not get `width: 100%` and the turf background):
- `.race:fullscreen canvas {` → `.race:fullscreen .race-frame > canvas {`
- `.race canvas {` (the block with `display: block; width: 100%; image-rendering: pixelated; background: var(--turf);`) → `.race-frame > canvas {`
- `.race canvas.hd {` → `.race-frame > canvas.hd {`

Then append to `src/app/app.css`:

```css
/* HorseSprite: one 24×22 CELL canvas (src/render/hd2d/sheet.ts) scaled by whole pixels (--px). */
.horse-sprite {
  display: inline-block;
  width: calc(24px * var(--px));
  height: auto;
  vertical-align: middle;
  image-rendering: pixelated;
}
.horse-sprite-sm {
  --px: 1;
}
.horse-sprite-md {
  --px: 2;
}
.horse-sprite-lg {
  --px: 4;
}
/* Animated: a 4-frame strip behind a one-frame window, stepped by CSS (no JS timer). */
.horse-sprite.is-animated {
  overflow: hidden;
  aspect-ratio: 24 / 22;
}
.horse-sprite.is-animated canvas {
  display: block;
  width: 400%;
  height: auto;
  image-rendering: pixelated;
  animation: sprite-gallop 0.4s steps(4) infinite;
}
@keyframes sprite-gallop {
  to {
    transform: translateX(-100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .horse-sprite.is-animated canvas {
    animation: none;
  }
}
```

(The cut-in keeps its look: `.race .cutin-portrait { height: 90%; width: auto; … }` outranks `.horse-sprite`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/render/HorseSprite.test.tsx src/render/palette.test.ts; npm run typecheck; npm run lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/HorseSprite.tsx src/render/HorseSprite.test.tsx src/render/palette.ts src/render/palette.test.ts src/render/CutInOverlay.tsx src/app/app.css
git commit -m "feat(render): HorseSprite component, used by the cut-in"
```

---

### Task 2: Sprites on the boards, race standings, stats and bet slip

**Files:**
- Modify: `src/track/TrackPage.tsx`, `src/render/RaceView.tsx`, `src/history/StatsPage.tsx`, `src/play/PlayPage.tsx`, `src/app/app.css`

No new unit test: these pages import `src/net/supabase.ts` (throws without env) or touch `document` while rendering. `HorseSprite`/`horseColors` are tested in Task 1; E2E (Task 8) covers the pages.

- [ ] **Step 1: `src/track/TrackPage.tsx`.**
- Imports: `import { colorsByPlayer } from '../render/palette.ts';` → `import { colorsByPlayer, horseColors, type HorseColors } from '../render/palette.ts';`; `import { RaceView, Silk } from '../render/RaceView.tsx';` → `import { HorseSprite } from '../render/HorseSprite.tsx';` and `import { RaceView } from '../render/RaceView.tsx';`.
- `LobbyBoard` roster: replace

```tsx
                />{' '}
                {p.name}
              </label>
```

with

```tsx
                />{' '}
                <HorseSprite colors={horseColors(players, [], p.id)} size="md" /> {p.name}
              </label>
```

- Replace the whole `HorseMark` function (doc comment `/** A resting horse, or a galloping one once that phone has pressed Ready. */` through its closing `}`) with:

```tsx
/** The horse's sprite, plus a ✅ once that phone has pressed Ready. */
function HorseMark({ colors, ready }: { colors: HorseColors; ready: boolean }) {
  return (
    <>
      <HorseSprite colors={colors} size="md" />
      {ready && (
        <>
          {' '}
          <span aria-hidden="true">✅</span>
          <span className="visually-hidden">(ready)</span>
        </>
      )}
    </>
  );
}
```

- `ShopBoard`: `<HorseMark ready={p.ready} /> <TraitIcon trait={asTrait(p.trait)} />{' '}` → `<HorseMark colors={horseColors(players, ids, p.id)} ready={p.ready} />{' '}` followed by `<TraitIcon trait={asTrait(p.trait)} />{' '}`.
- `BettingBoard`: delete the line `  const colors = colorsByPlayer(players);` (the one just above `<h1>Place your bets · room {room.code}</h1>`), and replace

```tsx
                  <HorseMark ready={players.find((p) => p.id === id)?.ready ?? false} />{' '}
                  <Silk color={colors(id, lane).silk} /> {horseNameOf(players, id)}
```

with

```tsx
                  <HorseMark
                    colors={horseColors(players, horses, id)}
                    ready={players.find((p) => p.id === id)?.ready ?? false}
                  />{' '}
                  {horseNameOf(players, id)}
```

- `PodiumBoard` still uses `Silk`: replace `<Silk color={colorsByPlayer(players)(id, (race?.horses ?? []).indexOf(id)).silk} />{' '}` with `<HorseSprite colors={horseColors(players, race?.horses ?? [], id)} size="lg" />{' '}` (Task 3 rewrites this board).

- [ ] **Step 2: `src/render/RaceView.tsx`.** Add `import { HorseSprite } from './HorseSprite.tsx';`. Delete the `Silk` component and its comment (`/** A horse's silk colour as a small square. */ export function Silk …`). In the standings replace `<Silk color={(colors ?? defaultColors)(h, lane).silk} /> #{lane + 1}{' '}` with `<HorseSprite colors={(colors ?? defaultColors)(h, lane)} size="sm" /> #{lane + 1}{' '}` (memoised, so the 4 Hz re-render doesn't redraw).

- [ ] **Step 3: `src/history/StatsPage.tsx`.** Imports: `import { colorsByPlayer } from '../render/palette.ts';` → `import { colorsByPlayer, horseColors } from '../render/palette.ts';`, add `import { HorseSprite } from '../render/HorseSprite.tsx';`. In `Overview`, after the `horse` helper add `const tint = (id: string) => horseColors(stats.members, [], id);`. Replace `{who(r.id)} · {r.value} coins` with `<HorseSprite colors={tint(r.id)} size="sm" /> {who(r.id)} · {r.value} coins`, and `<td>{horse(h.id)}</td>` with:

```tsx
                    <td>
                      <HorseSprite colors={tint(h.id)} size="sm" /> {horse(h.id)}
                    </td>
```

- [ ] **Step 4: `src/play/PlayPage.tsx`.** Replace `import { Silk } from '../render/RaceView.tsx';` with `import { HorseSprite } from '../render/HorseSprite.tsx';`. In `BetPanel`'s horse pick replace `<Silk color={colors(id, lane).silk} />` with `<HorseSprite colors={colors(id, lane)} size="sm" />`.

- [ ] **Step 5: CSS.** In `src/app/app.css` delete the `.face-right` block (with its comment `/* The horse emoji faces left; the race runs to the right. */`), the `.gallop` block with its comment, and `@keyframes gallop`; in the reduced-motion block that follows, replace

```css
  .cheers li,
  .gallop {
    animation: none;
  }
```

with

```css
  .cheers li {
    animation: none;
  }
```

Keep `.silk` (the HorsePanel swatches use the class).

- [ ] **Step 6: Verify**

Run: `npm run typecheck; npm run lint; npm test`
Expected: clean / PASS; `grep -rn "Silk\b\|face-right\|gallop" src --include=*.tsx` finds no component use (only `setSilk`/`SILK_COLORS`).

- [ ] **Step 7: Commit**

```bash
git add src/track/TrackPage.tsx src/render/RaceView.tsx src/history/StatsPage.tsx src/play/PlayPage.tsx src/app/app.css
git commit -m "feat(ui): horse sprites beside every horse name"
```

---

### Task 3: Podium celebration on the shared screen

**Files:**
- Create: `src/track/Podium.tsx`, `src/track/Podium.test.tsx`
- Modify: `src/track/TrackPage.tsx`, `src/app/app.css`

- [ ] **Step 1: Write the failing tests** — `src/track/Podium.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Confetti, Payouts, payoutLines } from './Podium.tsx';

const players = [
  { id: 'a', name: 'Ann', coat: null, silk: null },
  { id: 'b', name: 'Ben', coat: 1, silk: 2 },
  { id: 'c', name: 'Cat', coat: null, silk: null },
];

describe('payoutLines', () => {
  it('one line per winning player, summed, high to low; the top total is best', () => {
    const lines = payoutLines([
      { player_id: 'a', payout: 20 },
      { player_id: 'b', payout: 50 },
      { player_id: 'a', payout: 15 },
      { player_id: 'c', payout: 0 },
      { player_id: 'c', payout: null },
    ]);
    expect(lines).toEqual([
      { player: 'b', total: 50, best: true },
      { player: 'a', total: 35, best: false },
    ]);
  });
  it('ties at the top are all best', () => {
    const lines = payoutLines([
      { player_id: 'a', payout: 30 },
      { player_id: 'b', payout: 30 },
    ]);
    expect(lines.map((l) => l.best)).toEqual([true, true]);
  });
});

describe('Payouts', () => {
  it('sprite + name + "+N coins", biggest first and gold', () => {
    const html = renderToStaticMarkup(
      <Payouts
        bets={[
          { player_id: 'a', payout: 20 },
          { player_id: 'b', payout: 50 },
        ]}
        players={players}
        horses={['a', 'b']}
      />,
    );
    expect(html.indexOf('Ben')).toBeLessThan(html.indexOf('Ann'));
    expect(html.match(/class="best"/g)).toHaveLength(1);
    expect(html).toMatch(/<li class="best"><canvas[^>]*aria-hidden="true"[^>]*><\/canvas> Ben/);
    expect(html).toContain('+50 coins');
    expect(html).toContain('+20 coins');
  });
  it('no winners', () => {
    expect(renderToStaticMarkup(<Payouts bets={[]} players={players} horses={[]} />)).toBe(
      '<p>No winning bets.</p>',
    );
  });
});

describe('Confetti', () => {
  it('is decorative pixel squares', () => {
    const html = renderToStaticMarkup(<Confetti colors={['#e53935']} />);
    expect(html).toMatch(/^<div class="confetti" aria-hidden="true">/);
    expect(html.match(/<i /g)).toHaveLength(40);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/track/Podium.test.tsx`
Expected: FAIL (`./Podium.tsx` does not exist).

- [ ] **Step 3: Implement** `src/track/Podium.tsx`:

```tsx
import { nameOf } from '../betting/betting.ts';
import { HorseSprite } from '../render/HorseSprite.tsx';
import { horseColors, SILK_COLORS } from '../render/palette.ts';

type Person = {
  id: string;
  name: string;
  coat: number | null;
  silk: number | null;
  pattern?: string | null;
};
type Paid = { player_id: string; payout: number | null };

/** Winning players, one line each (payouts summed), high to low; every line at the top total is best. */
export function payoutLines(bets: readonly Paid[]) {
  const totals = new Map<string, number>();
  for (const b of bets) {
    if ((b.payout ?? 0) > 0) totals.set(b.player_id, (totals.get(b.player_id) ?? 0) + b.payout!);
  }
  const lines = [...totals]
    .map(([player, total]) => ({ player, total }))
    .sort((a, b) => b.total - a.total);
  const top = lines[0]?.total;
  return lines.map((l) => ({ ...l, best: l.total === top }));
}

/** Podium payout lines: sprite, bettor, "+N coins"; the biggest in gold. */
export function Payouts(props: {
  bets: readonly Paid[];
  players: readonly Person[];
  horses: readonly string[];
}) {
  const lines = payoutLines(props.bets);
  if (lines.length === 0) return <p>No winning bets.</p>;
  return (
    <ul className="payout-lines">
      {lines.map((l) => (
        <li key={l.player} className={l.best ? 'best' : undefined}>
          <HorseSprite colors={horseColors(props.players, props.horses, l.player)} size="sm" />
          {` ${nameOf(props.players, l.player)} `}
          <span className="pixel">{`+${l.total} coins`}</span>
        </li>
      ))}
    </ul>
  );
}

/** A one-off ~3 s burst of pixel squares in the podium silks (CSS only; none under reduced motion). */
export function Confetti({ colors }: { colors: readonly string[] }) {
  const palette = colors.length > 0 ? colors : SILK_COLORS;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 40 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: palette[i % palette.length],
            animationDelay: `${(i % 8) * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
```

In `src/track/TrackPage.tsx`: add `import { Confetti, Payouts } from './Podium.tsx';`, remove `betOn,` from the `../betting/betting.ts` import (nothing else in the file uses it once the old payout list is gone), and replace the whole `PodiumBoard` function with:

```tsx
function PodiumBoard({ room, players, race, bets, act, busy }: BoardProps) {
  const { timeline } = useTimeline(race?.id ?? null);
  const horses = race?.horses ?? [];
  const order = race?.finish_order ?? [];
  const top3 = order.slice(0, 3);
  const winners = bets
    .filter((b) => (b.payout ?? 0) > 0)
    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0));
  const raceId = race?.id;
  const banter = useRef('');
  useEffect(() => {
    banter.current = podiumLine(
      winners.map((b) => ({ name: nameOf(players, b.player_id), payout: b.payout ?? 0 })),
      bets.length,
    );
  });
  useEffect(() => {
    if (!raceId) return;
    const timer = setTimeout(() => soundEngine().say(banter.current), PODIUM_BANTER_MS);
    return () => clearTimeout(timer);
  }, [raceId]);
  const timeOf = (id: string) =>
    timeline ? ` · ${timeline.finishTimes[id]?.toFixed(2)} s` : '';
  return (
    <section className="podium-stage">
      <h1>Results</h1>
      <Confetti colors={top3.map((id) => horseColors(players, horses, id).silk)} />
      {/* li text stays "name · time" (the private-race E2E reads it). */}
      <ol className="podium">
        {top3.map((id, i) => (
          <li key={id}>
            <span className={i === 0 ? 'podium-horse podium-hop' : 'podium-horse'}>
              <HorseSprite colors={horseColors(players, horses, id)} size="lg" animated={i === 0} />
            </span>
            {horseNameOf(players, id)}
            {timeOf(id)}
          </li>
        ))}
      </ol>
      {race?.prize && top3.length > 0 && (
        <p className="prize-banner">
          🏆 {horseNameOf(players, top3[0])}: {race.prize}
        </p>
      )}
      <section className="panel">
        <h2>Payouts</h2>
        <Payouts bets={bets} players={players} horses={horses} />
      </section>
      {order.length > 3 && (
        <ol className="field-list" start={4}>
          {order.slice(3).map((id) => (
            <li key={id}>
              <HorseSprite colors={horseColors(players, horses, id)} size="sm" />{' '}
              {horseNameOf(players, id)}
              {timeOf(id)}
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => act(() => setPhase(room.id, 'LOBBY'))}
      >
        Next race
      </button>
    </section>
  );
}
```

In `src/app/app.css`, in the `.podium` block change `margin: 24px auto;` to `margin: 160px auto 24px;` (room for the horses above the steps), then append:

```css
/* Podium celebration (spec 2026-11-05 polish §2). */
.podium-stage {
  position: relative;
}
/* Horses stand on the steps: above the "1st" label, hooves on the step's top edge. */
.podium-horse {
  order: -1;
  line-height: 0;
  margin-top: -104px; /* lg sprite 88px + the step's 16px padding */
}
.podium li:nth-child(1) .podium-horse {
  margin-top: -148px; /* winner at 6x: 132px + 16px */
}
.podium li:nth-child(1) .horse-sprite {
  --px: 6;
}
.podium-hop {
  transform-origin: 50% 100%;
  animation: podium-hop 1.2s ease-in-out infinite;
}
@keyframes podium-hop {
  0%,
  55%,
  100% {
    transform: none;
  }
  20% {
    transform: translateY(-18px) rotate(-10deg);
  }
  35% {
    transform: translateY(0) rotate(-4deg);
  }
}
.confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.confetti i {
  position: absolute;
  top: -12px;
  width: 10px;
  height: 10px;
  animation: confetti-fall 2.4s ease-in both;
}
@keyframes confetti-fall {
  from {
    opacity: 1;
    transform: translateY(0) rotate(0);
  }
  to {
    opacity: 0;
    transform: translateY(80vh) rotate(540deg);
  }
}
.prize-banner {
  margin: 0 auto 24px;
  font-family: var(--font-pixel);
  font-size: 2rem;
  text-align: center;
  color: var(--gold);
  text-shadow: 0 2px 0 var(--edge);
}
.payout-lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  font-size: 1.5rem;
}
.payout-lines .best {
  color: var(--gold);
  font-weight: 700;
}
.field-list {
  columns: 2;
  font-size: 1.1rem;
}
@media (prefers-reduced-motion: reduce) {
  .podium-hop {
    animation: none;
  }
  .confetti {
    display: none;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/track/Podium.test.tsx; npm run typecheck; npm run lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/track/Podium.tsx src/track/Podium.test.tsx src/track/TrackPage.tsx src/app/app.css
git commit -m "feat(track): podium celebration with sprites, confetti and payout lines"
```

---

### Task 4: Phone result card

**Files:**
- Create: `src/play/ResultCard.tsx`, `src/play/ResultCard.test.tsx`
- Modify: `src/play/PlayPage.tsx`, `src/app/app.css`, `tests/e2e/private-race.spec.ts`

- [ ] **Step 1: Write the failing test** — `src/play/ResultCard.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { colorsOf } from '../render/palette.ts';
import { ResultCard } from './ResultCard.tsx';

describe('ResultCard', () => {
  it('your sprite, your place and your winnings, big', () => {
    const html = renderToStaticMarkup(<ResultCard colors={colorsOf(0)} place={1} won={45} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<p class="result-place">You finished <strong>2nd</strong></p>');
    expect(html).toContain('<p class="result-coins win">+45 coins</p>');
  });
  it('not racing and nothing won', () => {
    const html = renderToStaticMarkup(<ResultCard colors={colorsOf(0)} place={-1} won={0} />);
    expect(html).not.toContain('You finished');
    expect(html).toContain('<p class="result-coins">No winnings this time</p>');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/play/ResultCard.test.tsx`
Expected: FAIL (`./ResultCard.tsx` does not exist).

- [ ] **Step 3: Implement** `src/play/ResultCard.tsx`:

```tsx
import { ordinal } from '../betting/betting.ts';
import { HorseSprite } from '../render/HorseSprite.tsx';
import type { HorseColors } from '../render/palette.ts';

/** Top of the phone podium: your horse, your place (0-based, -1 = not racing) and winnings. */
export function ResultCard({ colors, place, won }: { colors: HorseColors; place: number; won: number }) {
  return (
    <section className="panel result-card">
      <HorseSprite colors={colors} size="lg" />
      {place >= 0 && (
        <p className="result-place">
          You finished <strong>{ordinal(place + 1)}</strong>
        </p>
      )}
      <p className={won > 0 ? 'result-coins win' : 'result-coins'}>
        {won > 0 ? `+${won} coins` : 'No winnings this time'}
      </p>
    </section>
  );
}
```

In `src/play/PlayPage.tsx`: `import { BOX_COLOR, colorsByPlayer } from '../render/palette.ts';` → `import { BOX_COLOR, colorsByPlayer, horseColors } from '../render/palette.ts';`; add `import { ResultCard } from './ResultCard.tsx';`. In `ResultPanel` replace

```tsx
  const myBets = bets.filter((b) => b.player_id === mine.id);
  return (
    <>
      {place >= 0 && (
        <p className="panel place-card">
          Your horse finished <strong>{ordinal(place + 1)}.</strong>
        </p>
      )}
```

with

```tsx
  const myBets = bets.filter((b) => b.player_id === mine.id);
  const won = myBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);
  return (
    <>
      <ResultCard colors={horseColors(players, race?.horses ?? [], mine.id)} place={place} won={won} />
```

(The live-region `phoneAnnouncement` in `PlayRoom` is unchanged.)

In `src/app/app.css` replace the `.place-card { … }` and `.place-card strong { … }` blocks with:

```css
.result-card {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
  font-family: var(--font-pixel);
}
.result-place {
  margin: 0;
  font-size: 1.5rem;
}
.result-place strong {
  display: block;
  font-size: 4rem;
  color: var(--gold);
}
.result-coins {
  margin: 0;
  font-size: 1.5rem;
}
.result-coins.win {
  font-size: 2rem;
  color: var(--gold);
}
```

In `tests/e2e/private-race.spec.ts` replace

```ts
    const text = await p.getByText(/Your horse finished/).textContent({ timeout: 30_000 });
    const place = ORDINAL[/finished (\w+)\./.exec(text ?? '')![1]!]!;
```

with

```ts
    // .result-place, not getByText: the live region also says "You finished …".
    const text = await p.locator('.result-place').textContent({ timeout: 30_000 });
    const place = ORDINAL[/finished (\w+)/.exec(text ?? '')![1]!]!;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/play/ResultCard.test.tsx; npm run typecheck; npm run lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/play/ResultCard.tsx src/play/ResultCard.test.tsx src/play/PlayPage.tsx src/app/app.css tests/e2e/private-race.spec.ts
git commit -m "feat(play): big result card on the phone podium"
```

---

### Task 5: Phase banners and the `phase` sting

**Files:**
- Create: `src/app/PhaseBanner.tsx`, `src/app/PhaseBanner.test.tsx`
- Modify: `src/audio/raceCues.ts`, `src/audio/soundEngine.ts`, `src/audio/soundEngine.test.ts`, `src/track/TrackPage.tsx`, `src/play/PlayPage.tsx`, `src/app/app.css`

- [ ] **Step 1: Write the failing tests** — `src/app/PhaseBanner.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhaseBanner, bannerText } from './PhaseBanner.tsx';

describe('bannerText', () => {
  it('names each phase it changes to', () => {
    expect(bannerText('LOBBY', 'SHOP')).toBe('🛒 SHOP OPEN!');
    expect(bannerText('SHOP', 'ODDS_LOCKED')).toBe('🔒 ODDS LOCKED');
    expect(bannerText('ODDS_LOCKED', 'BETTING')).toBe('💰 PLACE YOUR BETS!');
    expect(bannerText('BETTING', 'RUNNING')).toBe('🏁 RACE TIME!');
    expect(bannerText('RUNNING', 'PODIUM')).toBe('🏆 RESULTS!');
  });
  it('nothing for the lobby or a refetch with the same phase', () => {
    expect(bannerText('PODIUM', 'LOBBY')).toBeNull();
    expect(bannerText('SHOP', 'SHOP')).toBeNull();
  });
});

describe('PhaseBanner', () => {
  it('shows nothing on mount', () => {
    expect(renderToStaticMarkup(<PhaseBanner phase="BETTING" />)).toBe('');
  });
});
```

In `src/audio/soundEngine.test.ts`, inside the "is a safe no-op" block add `e.sfx('phase');` after `e.sfx('bell');`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/app/PhaseBanner.test.tsx; npm run typecheck`
Expected: FAIL (`./PhaseBanner.tsx` does not exist); typecheck errors on `'phase'` not being an `SfxName`.

- [ ] **Step 3: Implement.**

In `src/audio/raceCues.ts` add `| 'phase'` to the `SfxName` union after `| 'cutin'`. In `src/audio/soundEngine.ts` `playSfx`, after the `case 'cutin':` block add:

```ts
      case 'phase': // soft two-note sting under the phase banner (a quieter cousin of cutin)
        [659, 988].forEach((f, i) => osc(c, bus, 'triangle', f, f, now + i * 0.08, 0.16, 0.14));
        break;
```

(It goes through `sfxBus`, so mute and the effects level apply; a muted phone plays nothing.)

`src/app/PhaseBanner.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/sound.ts';

export const PHASE_BANNER: Readonly<Record<string, string>> = {
  SHOP: '🛒 SHOP OPEN!',
  ODDS_LOCKED: '🔒 ODDS LOCKED',
  BETTING: '💰 PLACE YOUR BETS!',
  RUNNING: '🏁 RACE TIME!',
  PODIUM: '🏆 RESULTS!',
};
const SHOW_MS = 1200;

/** Banner text for a phase change; null when nothing changed or for the lobby. */
export const bannerText = (prev: string, next: string): string | null =>
  prev === next ? null : (PHASE_BANNER[next] ?? null);

/**
 * A pixel band across the screen when `phase` changes after mount (spec 2026-11-05 polish §3),
 * with the `phase` sting. aria-hidden: the live regions already announce phase changes.
 */
export function PhaseBanner({ phase }: { phase: string }) {
  const prev = useRef(phase);
  const [shown, setShown] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    const text = bannerText(prev.current, phase);
    prev.current = phase;
    if (!text) return;
    setShown((s) => ({ text, n: (s?.n ?? 0) + 1 }));
    try {
      soundEngine().sfx('phase');
    } catch {
      // sound is best effort
    }
  }, [phase]);
  // Its own effect, so a change to the lobby mid-banner can't leave the band stuck on screen.
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  return (
    <div className="phase-layer" aria-hidden="true">
      <div key={shown.n} className="phase-banner">
        <span>{shown.text}</span>
      </div>
    </div>
  );
}
```

`src/track/TrackPage.tsx`: add `import { PhaseBanner } from '../app/PhaseBanner.tsx';` and replace

```tsx
        <SoundToggle settings={settings} update={update} full />
      </TopBar>
```

with

```tsx
        <SoundToggle settings={settings} update={update} full />
      </TopBar>
      <PhaseBanner phase={state.room.phase} />
```

`src/play/PlayPage.tsx`: add `import { PhaseBanner } from '../app/PhaseBanner.tsx';` and in `PlayRoom` replace

```tsx
        {announcement}
      </p>
```

with

```tsx
        {announcement}
      </p>
      <PhaseBanner phase={room.phase} />
```

Append to `src/app/app.css`:

```css
/* Phase banner (spec 2026-11-05 polish §3). The layer clips the sweep, so it never scrolls the page. */
.phase-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  pointer-events: none;
}
.phase-banner {
  position: absolute;
  top: 38%;
  left: 0;
  right: 0;
  padding: 16px 0;
  text-align: center;
  background: linear-gradient(90deg, transparent, var(--panel) 12% 88%, transparent);
  box-shadow:
    0 -3px 0 var(--gold),
    0 3px 0 var(--gold);
  animation: phase-sweep 1.2s linear both;
}
.phase-banner span {
  font-family: var(--font-pixel);
  font-size: clamp(2rem, 7vw, 5rem);
  font-weight: 700;
  color: var(--gold);
  text-shadow: 0 3px 0 var(--edge);
  white-space: nowrap;
}
@keyframes phase-sweep {
  0% {
    transform: translateX(-100%);
  }
  20%,
  80% {
    transform: none;
  }
  100% {
    transform: translateX(100%);
  }
}
@keyframes phase-fade {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .phase-banner {
    animation: phase-fade 0.4s ease-out both;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/PhaseBanner.test.tsx src/audio; npm run typecheck; npm run lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/PhaseBanner.tsx src/app/PhaseBanner.test.tsx src/audio/raceCues.ts src/audio/soundEngine.ts src/audio/soundEngine.test.ts src/track/TrackPage.tsx src/play/PlayPage.tsx src/app/app.css
git commit -m "feat(ui): phase banners with a soft sting"
```

---

### Task 6: Compact phone header

**Files:**
- Create: `src/app/TopBar.test.tsx`, `src/audio/SoundToggle.test.tsx`
- Modify: `src/app/TopBar.tsx`, `src/audio/SoundToggle.tsx`, `src/play/PlayPage.tsx`, `src/app/app.css`

- [ ] **Step 1: Write the failing tests.**

`src/app/TopBar.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TopBar } from './TopBar.tsx';

describe('TopBar', () => {
  it('a title replaces the brand (phone header)', () => {
    const html = renderToStaticMarkup(<TopBar coins={12} title={<h1>Ann</h1>} />);
    expect(html).toContain('<div class="topbar-title"><h1>Ann</h1></div>');
    expect(html).not.toContain('TURF CLUB');
    expect(html).not.toContain('Room ');
    expect(html).toContain('💰 12 coins');
  });
  it('brand links home only outside a room', () => {
    expect(renderToStaticMarkup(<TopBar />)).toContain('<a class="brand" href="/">TURF CLUB</a>');
    const inRoom = renderToStaticMarkup(<TopBar code="ABCD" />);
    expect(inRoom).toContain('<span class="brand">TURF CLUB</span>');
    expect(inRoom).toContain('Room ABCD');
  });
});
```

`src/audio/SoundToggle.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './audioSettings.ts';
import { SoundToggle } from './SoundToggle.tsx';

const on = { ...DEFAULTS.phone, muted: false };

describe('SoundToggle', () => {
  it('icon-only keeps the accessible name', () => {
    const html = renderToStaticMarkup(<SoundToggle settings={on} update={() => {}} icon />);
    expect(html).toMatch(/<button type="button" class="icon" aria-label="Sound" aria-pressed="true">🔊<\/button>/);
    const muted = renderToStaticMarkup(
      <SoundToggle settings={{ ...on, muted: true }} update={() => {}} icon />,
    );
    expect(muted).toMatch(/aria-pressed="false">🔇<\/button>/);
  });
  it('the default still reads "Sound"', () => {
    expect(renderToStaticMarkup(<SoundToggle settings={on} update={() => {}} />)).toMatch(
      /🔊(<!-- -->)? Sound<\/button>/,
    );
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/app/TopBar.test.tsx src/audio/SoundToggle.test.tsx`
Expected: FAIL (no `topbar-title`; the icon button still reads "🔊 Sound").

- [ ] **Step 3: Implement.**

`src/app/TopBar.tsx`: add to `Props`

```ts
  /** Replaces the brand (phone: sprite + player name). */
  title?: ReactNode;
```

destructure `title` (`export function TopBar({ code, coins, title, children }: Props)`), and replace the brand expression

```tsx
      {code ? (
        <span className="brand">TURF CLUB</span>
      ) : (
        <a className="brand" href="/">
          TURF CLUB
        </a>
      )}
```

with

```tsx
      {title ? (
        <div className="topbar-title">{title}</div>
      ) : code ? (
        <span className="brand">TURF CLUB</span>
      ) : (
        <a className="brand" href="/">
          TURF CLUB
        </a>
      )}
```

`src/audio/SoundToggle.tsx`: add to `Props`

```ts
  /** Phone header: just 🔊/🔇 (the accessible name stays "Sound"). */
  icon?: boolean;
```

destructure `icon = false`, and replace the mute button

```tsx
      <button
        type="button"
        aria-label="Sound"
        aria-pressed={!settings.muted}
        onClick={() => update({ muted: !settings.muted })}
      >
        {settings.muted ? '🔇 Sound' : '🔊 Sound'}
      </button>
```

with

```tsx
      <button
        type="button"
        className={icon ? 'icon' : undefined}
        aria-label="Sound"
        aria-pressed={!settings.muted}
        onClick={() => update({ muted: !settings.muted })}
      >
        {settings.muted ? '🔇' : '🔊'}
        {!icon && ' Sound'}
      </button>
```

`src/play/PlayPage.tsx` (`HorseSprite` and `horseColors` are already imported by Tasks 2 and 4), in `PlayRoom` replace

```tsx
      <TopBar code={room.code} coins={props.balance}>
        <SoundToggle settings={settings} update={update} />
      </TopBar>
      <h1>{mine.name}</h1>
      <p>
```

with

```tsx
      <TopBar
        coins={props.balance}
        title={
          <>
            <HorseSprite
              colors={horseColors(state.players, state.race?.horses ?? [], mine.id)}
              size="md"
            />
            <h1>{mine.name}</h1>
          </>
        }
      >
        <SoundToggle settings={settings} update={update} icon />
      </TopBar>
      <p className="room-line">
```

(The room code now lives in that line: `Room {room.code} · …` is unchanged below it.)

Append to `src/app/app.css`:

```css
/* Phone header: one row of sprite + name, coins, sound. */
.play .topbar {
  flex-wrap: nowrap;
  margin-bottom: 4px;
}
.topbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.topbar-title h1 {
  margin: 0;
  font-size: 1.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.room-line {
  margin: 0 0 12px;
  font-size: 0.875rem;
  color: var(--muted);
}
.sound button.icon {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font-size: 1.25rem;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/TopBar.test.tsx src/audio/SoundToggle.test.tsx; npm run typecheck; npm run lint`
Expected: PASS / clean. (The E2E `getByRole('heading', { name })` still finds the `<h1>`.)

- [ ] **Step 5: Commit**

```bash
git add src/app/TopBar.tsx src/app/TopBar.test.tsx src/audio/SoundToggle.tsx src/audio/SoundToggle.test.tsx src/play/PlayPage.tsx src/app/app.css
git commit -m "feat(play): compact phone header with sprite and icon sound button"
```

---

### Task 7: Sticky action bar, shop layout and trait grid

**Files:**
- Create: `src/play/ActionBar.tsx`, `src/play/ActionBar.test.tsx`
- Modify: `src/play/PlayPage.tsx`, `src/play/TraitPicker.tsx`, `src/play/TraitPicker.test.tsx`, `src/app/Traits.tsx`, `src/app/app.css`

- [ ] **Step 1: Write the failing tests.**

`src/play/ActionBar.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionBar } from './ActionBar.tsx';

describe('ActionBar', () => {
  it('shop: just the ready toggle', () => {
    const html = renderToStaticMarkup(<ActionBar ready={false} busy={false} onReady={() => {}} />);
    expect(html).toMatch(/^<div class="action-bar">/);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('I&#x27;m ready');
  });
  it('betting: Bet submits the bet slip, then the ready toggle', () => {
    const html = renderToStaticMarkup(
      <ActionBar ready busy={false} onReady={() => {}} bet={{ disabled: true }} />,
    );
    expect(html).toMatch(/<button type="submit" form="bet-slip" class="primary" disabled="">Bet<\/button>/);
    expect(html.indexOf('>Bet<')).toBeLessThan(html.indexOf('Ready ✅ (tap to undo)'));
  });
  it('busy disables the ready toggle', () => {
    const html = renderToStaticMarkup(<ActionBar ready={false} busy onReady={() => {}} />);
    expect(html).toMatch(/<button type="button"[^>]*disabled=""/);
  });
});
```

In `src/play/TraitPicker.test.tsx` replace the first test (`'six buttons, the current pick pressed, effect text in each'`) with:

```tsx
  it('a grid of six icon + name buttons; the chosen effect under it', () => {
    const html = renderToStaticMarkup(
      <TraitPicker current="tough" disabled={false} onPick={() => {}} />,
    );
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"><span aria-hidden="true">[^<]+<\/span> Tough</);
    expect(html).toContain('<p class="trait-effect" aria-hidden="true">hits hurt less, boosts help less</p>');
    // Screen readers still hear every effect, on its button.
    expect(html.match(/class="visually-hidden"> · /g)).toHaveLength(6);
    expect(html).not.toContain('<br');
    expect(html).toContain('Your trait');
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/play/ActionBar.test.tsx src/play/TraitPicker.test.tsx`
Expected: FAIL (`./ActionBar.tsx` does not exist; no `trait-effect`).

- [ ] **Step 3: Implement.**

`src/play/ActionBar.tsx`:

```tsx
/** Id of the bet slip form, so the bar's Bet button can submit it from outside. */
export const BET_FORM = 'bet-slip';

/**
 * The phase's main phone actions pinned to the bottom (spec 2026-11-05 polish §4): I'm ready in
 * the shop; Bet and I'm ready while betting. Sticky in the flow, so nothing ends up under it.
 */
export function ActionBar(props: {
  ready: boolean;
  busy: boolean;
  onReady: () => void;
  bet?: { disabled: boolean };
}) {
  return (
    <div className="action-bar">
      {props.bet && (
        <button type="submit" form={BET_FORM} className="primary" disabled={props.bet.disabled}>
          Bet
        </button>
      )}
      <button
        type="button"
        className={props.bet ? undefined : 'primary'}
        disabled={props.busy}
        onClick={props.onReady}
      >
        {props.ready ? 'Ready ✅ (tap to undo)' : "I'm ready"}
      </button>
    </div>
  );
}
```

`src/play/PlayPage.tsx` (add `import { ActionBar, BET_FORM } from './ActionBar.tsx';`):
- In `PlayRoom` delete the whole ready block:

```tsx
      {(room.phase === 'SHOP' || room.phase === 'BETTING') && (
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => setReady(room.id, !mine.ready))}
          >
            {mine.ready ? 'Ready ✅ (tap to undo)' : "I'm ready"}
          </button>
        </p>
      )}
```

- In `ShopPanel` replace

```tsx
  if (!mine.ticked) {
    return <p>💰 {balance} coins. You're not racing, but you can bet once the odds lock.</p>;
  }
```

with

```tsx
  const bar = (
    <ActionBar
      ready={mine.ready}
      busy={busy}
      onReady={() => act(() => setReady(room.id, !mine.ready))}
    />
  );
  if (!mine.ticked) {
    return (
      <>
        <p>💰 {balance} coins. You're not racing, but you can bet once the odds lock.</p>
        {bar}
      </>
    );
  }
```

and at the end of `ShopPanel` replace

```tsx
      <p>Boxes go in your own lane and open automatically. No refunds.</p>
    </>
```

with

```tsx
      <p>Boxes go in your own lane and open automatically. No refunds.</p>
      {bar}
    </>
```

(Shop order stays: hot strip (in `PlayRoom`) → your boxes → three box cards → trait grid → note → bar.)
- In `BetPanel`: change `<form className="shop" onSubmit={submit}>` to `<form id={BET_FORM} className="shop" onSubmit={submit}>`. Delete the submit button inside the form (the `<button type="submit" className="primary" disabled={…}>Bet</button>` block just before `</form>`), and move its `disabled` condition into a const just before `return (`:

```tsx
  const betDisabled =
    busy ||
    !horse ||
    typeof chosenOdds !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > balance;
```

Then end the panel with the bar: replace the `BetPanel` ending

```tsx
        </ul>
      )}
    </>
  );
}

function RunningPanel(
```

with

```tsx
        </ul>
      )}
      <ActionBar
        ready={mine.ready}
        busy={busy}
        onReady={() => act(() => setReady(room.id, !mine.ready))}
        bet={{ disabled: betDisabled }}
      />
    </>
  );
}

function RunningPanel(
```

(Enter in the stake field still submits: a `form=` button is the form's default button. The E2E `getByRole('button', { name: 'Bet', exact: true })` finds it in the bar.)

`src/play/TraitPicker.tsx`: replace the import `import { TraitLabel } from '../app/Traits.tsx';` with `import { TRAIT_INFO } from '../app/Traits.tsx';`, and the button content `<TraitLabel trait={t} />` with

```tsx
          <span aria-hidden="true">{TRAIT_INFO[t].icon}</span>
          {` ${TRAIT_INFO[t].name}`}
          <span className="visually-hidden">{` · ${TRAIT_INFO[t].effect}`}</span>
```

and after the `TRAIT_CODES.map(…)` (before `</fieldset>`) add

```tsx
      {/* Sighted users see the chosen effect here; screen readers hear each one on its button. */}
      <p className="trait-effect" aria-hidden="true">
        {TRAIT_INFO[props.current].effect}
      </p>
```

`src/app/Traits.tsx`: delete `TraitLabel` and its comment (`/** Picker button content: decorative icon, name, effect on its own line. */` … `);`); nothing else uses it.

`src/app/app.css`: replace

```css
.trait-pick {
  display: grid;
  gap: 8px;
}
.trait-pick button {
  min-height: 44px;
  text-align: left;
}
```

with

```css
/* 2×3 grid of icon + name; the chosen trait's effect underneath. */
.trait-pick {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.trait-pick button {
  min-height: 44px;
  justify-content: center;
  text-align: center;
}
.trait-effect {
  grid-column: 1 / -1;
  margin: 0;
  text-align: center;
  color: var(--muted);
}
```

and append:

```css
/* Sticky phone action bar; full-bleed over main's 16px padding, clear of the home indicator. */
.action-bar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  gap: 8px;
  margin: 16px -16px 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--bg);
  box-shadow:
    0 -1px 0 var(--gold-dim),
    0 -2px 0 var(--edge),
    0 -3px 0 var(--gold);
}
.action-bar button {
  flex: 1;
  min-height: 44px;
}
/* Tabbing to a field scrolls it clear of the bar (focus not obscured). */
:root:has(.action-bar) {
  scroll-padding-bottom: 96px;
}
.play h2 {
  margin: 16px 0 8px;
  font-size: 1.25rem;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/play src/app; npm run typecheck; npm run lint`
Expected: PASS / clean (the emoji test included).

- [ ] **Step 5: Commit**

```bash
git add src/play/ActionBar.tsx src/play/ActionBar.test.tsx src/play/PlayPage.tsx src/play/TraitPicker.tsx src/play/TraitPicker.test.tsx src/app/Traits.tsx src/app/app.css
git commit -m "feat(play): sticky action bar and trait grid"
```

---

### Task 8: Full checks and status

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Full checks**

Run: `npx supabase start` (if not running), then `npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e`
Expected: all pass (the a11y track-lobby E2E test is a known flake; rerun it alone if it fails). If an E2E selector broke on new markup, fix the selector in the spec, not the markup's accessible names (the plan keeps: phone `<h1>` name, "Bet", "I'm ready", roster checkbox names, `ol.podium > li` text "name · time", heading "Results").

- [ ] **Step 2: PROJECT_STATUS.md** — after the "## Hot items and horse traits (master, 2026-11-05)" section add "## Visual polish (master, 2026-11-05)": spec and this plan; `HorseSprite` (sm/md/lg, memoised, cut-in reuses it) beside every horse name (boards, standings, stats, bet slip, phone header, podium); podium steps with the hopping animated winner, confetti, prize banner, payout lines per player (gold for the top total) and the rest of the field; phone result card; phase banners + `phase` SFX (aria-hidden; live regions unchanged); compact phone header, icon sound button, sticky Bet / I'm ready bar, 2×3 trait grid; reduced motion: no hop, confetti or gallop, banner fades; test counts; "Deploy (a plain `git push origin master`, no DB or function change) waits for the owner's screenshot review."

- [ ] **Step 3: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: visual polish status"
```

---

### Task 9: Screenshots for the owner (no deploy)

**Files:**
- Create (temporary, never committed): `tests/e2e/polish-shots.spec.ts`

- [ ] **Step 1: Write the spec.** It reuses the E2E config (dev server on 5180 against local Supabase) and the private-race flow, with the shared screen at 1920×1080 and the first phone at 390×844:

```ts
import { expect, test, type Page } from '@playwright/test';
import { adminClient, ok } from './helpers.ts';

const OUT =
  'C:/Users/jieha/AppData/Local/Temp/claude/98d0a7cb616bcfc0/254daba3-f305-42f9-8699-6d445f78a3da/scratchpad';
let code = '';
test.afterAll(async () => {
  if (code) await ok(adminClient().from('rooms').delete().eq('code', code).select());
});

test('visual polish screenshots', async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const screen = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await screen.goto('/');
  await screen.getByRole('button', { name: 'Host a race (big screen)' }).click();
  await expect(screen).toHaveURL(/\/track\?code=/);
  code = new URL(screen.url()).searchParams.get('code')!;

  const phones: Page[] = [];
  for (const [i, name] of ['Ann', 'Ben', 'Cat'].entries()) {
    const ctx = await browser.newContext(
      i === 0
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : {},
    );
    const p = await ctx.newPage();
    await p.goto(`/play?code=${code}`);
    await p.getByLabel('Your name').fill(name);
    await p.getByRole('button', { name: 'Join' }).click();
    await expect(p.getByRole('heading', { name })).toBeVisible();
    await screen.getByRole('checkbox', { name, exact: true }).click();
    await expect(screen.getByRole('checkbox', { name, exact: true })).toBeChecked();
    phones.push(p);
  }
  const phone = phones[0]!;
  const shot = async (name: string) => {
    await screen.screenshot({ path: `${OUT}/polish-board-${name}.png` });
    await phone.screenshot({ path: `${OUT}/polish-phone-${name}.png` });
  };

  await shot('lobby');
  await screen.getByRole('button', { name: 'Open shop' }).click();
  await expect(screen.getByRole('heading', { name: /Shop open/ })).toBeVisible();
  await screen.waitForTimeout(400);
  await shot('banner');
  for (const p of phones) {
    await p.getByRole('button', { name: /Attack/ }).click();
    await expect(p.getByText(/Your boxes: 💥/)).toBeVisible();
  }
  await phone.getByRole('button', { name: /Sprinter/ }).click();
  await screen.waitForTimeout(1500);
  await shot('shop');

  await screen.getByRole('button', { name: 'Lock odds' }).click();
  await expect(screen.getByRole('heading', { name: /Place your bets/ })).toBeVisible();
  for (const p of phones) {
    await p.getByRole('button', { name: 'Bet', exact: true }).click();
    await expect(p.getByRole('button', { name: /^Cancel 10 bet on/ })).toBeVisible();
  }
  await screen.waitForTimeout(1500);
  await shot('betting');

  await screen.getByRole('button', { name: 'Start race' }).click();
  await expect(screen.getByRole('img', { name: /race, 3 horses/ })).toBeVisible();
  await screen.waitForTimeout(20_000);
  await shot('race');

  await expect(screen.getByRole('heading', { name: 'Results' })).toBeVisible({
    timeout: 4 * 60_000,
  });
  await screen.waitForTimeout(800);
  await shot('podium-entry'); // confetti mid-fall
  await screen.waitForTimeout(3000);
  await shot('podium');
  await phone.screenshot({ path: `${OUT}/polish-phone-podium-full.png`, fullPage: true });
});
```

- [ ] **Step 2: Run it**

Run: `npx supabase start` (if not running), then `npx playwright test tests/e2e/polish-shots.spec.ts`
Expected: 1 passed; `polish-board-{lobby,banner,shop,betting,race,podium-entry,podium}.png`, `polish-phone-{same}.png` and `polish-phone-podium-full.png` in `C:\Users\jieha\AppData\Local\Temp\claude\98d0a7cb616bcfc0\254daba3-f305-42f9-8699-6d445f78a3da\scratchpad\`.

- [ ] **Step 3: Look at every screenshot** (Read tool): sprites crisp (not blurred) and beside each name; the podium winner hops above the gold step; payout lines sorted with the top one gold; the phone header is one row; the sticky bar sits at the bottom of the phone viewport without covering the last field; the trait grid is 2×3. Fix and re-run if anything is off (commit fixes with their exact paths).

- [ ] **Step 4: Remove the temporary spec** — `rm tests/e2e/polish-shots.spec.ts`; `git status` shows no change under `tests/`. Hand the screenshot paths to the owner. **Do not deploy or push**; the owner decides after reviewing.

---

## Self-review notes

- Spec coverage: §1 `HorseSprite` with colours from `colorsByPlayer`, sizes, `animated`, aria-hidden, cut-in reuse (T1); boards, standings, stats, bet slip (T2), phone header (T6), podium (T3); `Silk` (T2). §2 steps, winner bigger and hopping, confetti, 🏆 banner, payout lines high → low with gold, "No winning bets.", rest of the field (T3); phone card (T4); reduced motion (T1, T3). §3 banner texts, change-after-mount only, 1.2 s sweep, aria-hidden, reduced-motion fade, both screens, `phase` SFX through the engine (T5). §4 header, sticky bar with safe-area padding, shop order, 2×3 trait grid ≥ 44 px, theme tokens, emoji-safe, a11y E2E (T6, T7, T8). Testing section: unit tests per task, E2E (T8), screenshots (T9).
- Decisions made while planning (the spec was silent or did not match the code):
  - Testable parts live in new files (`Podium.tsx`, `ResultCard.tsx`, `ActionBar.tsx`, `PhaseBanner.tsx`): importing `TrackPage`/`PlayPage` in Vitest throws in `src/net/supabase.ts` without env vars. `PhaseBanner`'s on-change behaviour is tested through the pure `bannerText` plus "empty on mount" (effects don't run without a DOM).
  - Off-race lanes: `horseColors` uses the race lane, else the roster position, else lane 0, so bettors who don't race and stats members get valid colours (`colorsOf(-1)` would be `undefined`). In the lobby/shop a horse without cosmetics can therefore show different default colours than its race lane once odds lock.
  - Sizes: `sm` 1×, `md` 2×, `lg` 4×, winner 6× (whole-pixel scales stay sharp). Boards use `md` (a 22-horse board grows to ~1.1k px; check in the screenshots), dense lists use `sm`.
  - "Replaces 🐎": the shop/betting boards' 🐎/🏇 ready gallop becomes sprite + ✅ (sprites animate only on the podium); the visually-hidden "(ready)" stays. `Silk` ends up unused and is deleted (the `.silk` class stays for the HorsePanel swatches).
  - Payout lines are one per player with payouts summed ("+N coins"); every line at the top total is gold; the old "🎉 Biggest win" line is dropped (the gold line replaces it). Commentator banter still uses per-bet payouts.
  - The bet slip's button stays labelled "Bet" (the spec says "Place bet"; E2E and players know "Bet"); it moves to the bar and submits via `form="bet-slip"`. The bar is rendered by `ShopPanel`/`BetPanel` (they own the bet's disabled state); `PlayRoom`'s old ready button is removed. No other phase has a primary phone action today.
  - `env(safe-area-inset-bottom)` is used, but `index.html` keeps its viewport meta without `viewport-fit=cover` (adding it would put content under the notch in landscape), so the inset is 0 in most browsers today.
  - `.race canvas` CSS is scoped to `.race-frame > canvas`, or every sprite in the standings would stretch to full width on turf.
  - The phone result text changes to "You finished 2nd"; the private-race E2E reads `.result-place` (the live region says "You finished …" too, so `getByText` would match twice).
  - The phase banner isn't visible while the race is fullscreen (it is outside the fullscreen element); the live region and the race itself already mark the start.
  - Trait effects: shown for the chosen trait under the grid (aria-hidden) and as visually-hidden text on every button, so screen readers lose nothing; `TraitLabel` is deleted.
