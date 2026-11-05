---
name: web-game-ui-gotchas
description: Use when building or polishing a browser game UI (React + Canvas 2D + Three.js) that is shown on shared screens and phones. Collects concrete rendering, CSS, emoji and verification pitfalls.
---

# Web game UI gotchas

Learnt on the Turf Club race views, phone screens and shared Discord-streamed monitor.

## Emoji

- **Emoji 13+ characters (2020+) render as empty boxes on older Windows 10 PCs** (e.g. 🔁 was
  🪞, ➰ was 🪢; avoid U+1FA70–U+1FAFF). Use older emoji and keep a unit test that scans `src/`
  for code points in the Emoji 13+ ranges.
- Decorative emoji next to text: wrap in `aria-hidden` spans so screen readers read the words.

## CSS

- A shared `.chip` class with `white-space: nowrap` makes long strips overflow phones — override
  with `white-space: normal` where content is long.
- A sticky bottom action bar floats mid-screen on short pages: make the page a flex column with
  `min-height: 100dvh` and give the bar `margin-top: auto`.
- Global selectors like `.race canvas` leak into new canvases (sprites stretched with turf
  backgrounds); scope them (`.race-frame > canvas`).
- `position: fixed` overlays don't show while an element is fullscreen — portal them into
  `document.fullscreenElement` when set.
- Tabs that wrap unevenly: use a CSS grid with explicit rows.

## Canvas / Three.js

- Three's `EffectComposer` default render target has **no stencil buffer**; pass your own
  `WebGLRenderTarget({ stencilBuffer: true })` or stencil clipping silently fails.
- Stencil reflections: masks draw first (lower `renderOrder`), occluders write 0, mirrored sprites
  test `Equal`; `stencilWrite: true` is required for three to apply `stencilFunc` at all.
- Flat decals at the same height as the ground z-fight in top-down views; raise them and use
  `polygonOffsetUnits`, not only `polygonOffsetFactor`.
- `alphaTest` compares texel alpha × opacity: faded sprites need a low alphaTest.
- Time can be negative (countdown): use a positive modulo for looping animations.
- Keep hot draw loops allocation-free; memoise sprite canvases on their colours.
- Effects only read on a compressed stream if they're big: particles of 12–18 px with glow, not
  2–4 px.

## Verifying visuals

- Add a **sandbox** route with pickers (weather, items, traits, moments) and a "freeze at moment"
  option; headless screenshots are slow and a fake clock may not sync with lazy imports.
- If the in-app browser pane is hidden, rAF/CSS animations pause — use headless Playwright.
- Headless Chromium has WebGL (SwiftShader) — timings are meaningless, visuals are fine.
- Default colours must be derived the same way before and during a race (lane = order the server
  will assign), or horses change colour between screens.
