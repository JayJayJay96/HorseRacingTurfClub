# HD-2D race renderer (Phase 8) — design

Owner decisions 2026-11-04. Builds on the main spec (`2026-10-29-horse-racing-turf-club-design.md` §4, §11, §12) and the UI theme (`2026-11-04-ui-theme-design.md`).

## Goals

- A Three.js renderer that plays the same `Timeline` on the same `Track` as `Pixel2DRenderer`, in an HD-2D look: flat pixel sprites in a lit 3D diorama with tilt-shift blur and bloom.
- HD by default on every screen that uses `RaceView` (big screen `/track`, `/stats` replays, `/sandbox`); 2D stays as a fallback and a manual choice.
- No database, Edge Function or sim changes.

## Non-goals

- Phones: `MiniOval` stays as it is; phones never download Three.js.
- New hand-made art: sprites come from the existing code-drawn `drawHorse`.
- A unique effect per item, a scoreboard, birds, crowd reactions, a host-picked time of day, automatic quality scaling.

## Look targets

The owner wants the race to read as "HD-2D, like Octopath Traveler" at a glance: a resemblance in style, with no copied assets, characters or UI. These rules carry that look and win over any looser wording below.

1. **Pixel-art world, not flat colour.** Ground, dirt, stands, rail, crowd and scenery use pixel-art textures generated in code, nearest-neighbour filtered, no mipmaps, at one fixed texel density that matches the sprites.
2. **Big, chunky pixels.** One sprite pixel covers 4–5 screen pixels at 1080p on the chase shot; camera distance is fitted to hit that. Textures use the same pixel size on screen.
3. **High, narrow camera.** Every shot looks down from above with a narrow lens (vertical FOV ~20–30°); no shot drops to ground level.
4. **Sprites take the scene's light.** Horse and scenery billboards use a lit material, so sunset and floodlights colour them. The sun casts real, soft, low-resolution shadows (one shadow map) for horses and scenery; the blob shadow is the fallback when shadows are off.
5. **Full post stack.** Tilt-shift blur, bloom, a strong vignette and a per-preset colour grade (warm by default); floating dust motes by day, fireflies at night; sunset light shafts faked with additive glow sprites.
6. **Look test first.** Before shots, effects and the other presets are built, `/sandbox` shows one still frame: the home straight with 6 horses, in Afternoon and Night. The owner approves it, and the values it settles (FOV, pitch, blur band, bloom, vignette, grade, texel size) are written into this spec and frozen.
   Approved 2026-11-04 (owner, from `docs/hd2d-screens/look-*.png`): PIXEL_M 0.15, PIXEL_SCALE 4.5, FOV_DEG 25, PITCH_DEG wide 50 / chase 50 / finish 28, FOLLOW_DISTANCE_SCALE 1.6 (chase sits 1.6 × the pixel-target distance), TILT_BLUR_PX wide 4 / chase 2 / finish 2, TILT_FOCUS 0.45, LOOK_PAST_M 12 (the finish shot aims 12 m past the line, away from the camera; the chase has no offset); the chase is fixed-orientation from the north; every sun comes from the infield (camera) side; presets as in `src/render/hd2d/lighting.ts` at commit 51bd953.

## 1. Architecture

- `RaceRenderer` (`play(timeline, track, startAtMs)`, `stop()`) moves from `Pixel2DRenderer.ts` to `src/render/renderer.ts`; `Pixel2DRenderer` is unchanged otherwise.
- New folder `src/render/hd2d/`:
  - `HD2DRenderer.ts` — implements `RaceRenderer`; owns the Three.js renderer, scene, composer and frame loop.
  - `scene.ts` — ground, dirt ribbon, rail, infield, stands, crowd, finish post, scenery; built from `track.point(s, offset)` so all three shapes work.
  - `sprites.ts` — draws each horse's frames once per race into a texture sheet with the existing `drawHorse` (coat, silk, pattern; 4 poses × gallop frames); number badges, popup labels and spinning item icons as canvas-text sprites.
  - `shots.ts` — pure camera: `shotAt(track, timeline, t)`.
  - `lighting.ts` — three presets, picked by `timeline.seed % 3`.
  - `effects.ts` — six particle effects, each a pure function of the event and time since it.
- Three.js is a new dependency, loaded only through a dynamic `import()` of `HD2DRenderer` when the HD view starts. The 2D path and phones never load it.
- `RaceView` picks the renderer from a per-browser setting and shows a "2D / HD" chip next to the fullscreen button. Standings, the live region, cheers (children) and fullscreen are unchanged.
- Shared display rules come from the existing modules, not copies: `BOX_REVEAL`, `ITEM_HOLD_SECONDS`, coast speed, `TRAIL`, `popupOf`, `ITEM_INFO`, `poseOf`, `progressAt`, `eventsBetween`, `standingsAt`, `horsePoint`. Constants still private to `Pixel2DRenderer.ts` that HD needs (coast speed, popup seconds) are exported from it.

## 2. Rendering

### World

- Track metres map to Three.js as x → x, y → z, height on y (up).
- Meshes: grass ground, dirt ribbon across all lanes, white rail on the inner edge, grass infield, stands as a lit box (pushed out by the field's width like the 2D renderer) with a crowd on top, a finish post at `finishS`.
- Scenery: pixel trees, bushes and flags as billboards, placed from the seed outside `trackBounds` plus a margin; the crowd bobs (instanced sprites).
- Confetti bursts at the first finish.

### Sprites

- Cylindrical billboards (turn around the vertical axis only), nearest-neighbour filtering, no mipmaps.
- Pose: the existing `poseOf` on the horse's direction projected into camera space; gallop frame from race time.
- Shadows: real sun shadows per Look target 4; a soft blob under each horse when shadows are off.
- Item display matches 2D: boxes appear within `BOX_REVEAL` of the race before their horse, are drawn where the horse was `ITEM_HOLD_SECONDS` before the sim opened them, and the item spins over the horse until then; finished horses coast past the line.
- Trails (`trail:dust`, `trail:sparkle`) and silk patterns follow the horse's cosmetics as in 2D.

### Camera shots (`shots.ts`)

Same timing as today's `cameraAt`:

| Race time                                | Shot                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| first 2 s                                | **Wide:** high diorama over the whole track                                                                                                                                                                                                                                                                                              |
| until the leader is 60 m from the finish | **Chase:** a fixed-orientation follow shot like the 2D view: always from the north (yaw π, toward −y), pitched down 50°, aimed at the plain centroid of the top 3 (no LOOK_PAST offset) from 1.6 × the Look target 2 distance; it never rotates, so the horses visibly go around the oval; eases within the shot (never at ground level) |
| from then on                             | **Finish:** side-on at the finish line, looking across the track at the stands, aimed LOOK_PAST_M past the line; its yaw is also π, so the orientation never flips at the cut                                                                                                                                                            |

Owner 2026-11-04: wanted to see horses go around the track like the 2D view.

Every shot looks from the north (the infield side of the home straight), so the stands, crowd and scenery are the backdrop. Cuts between shots are hard. Reduced motion holds the wide shot (no cuts, no crowd bob).

### Post-processing

Render pass → tilt-shift blur on the top and bottom bands (strong on wide, lighter on chase and finish) → bloom on bright things (boxes, trails, sun, floodlights) → vignette and colour grade (one shader pass, values per preset) → output pass. Pixel ratio capped at 1.

### Lighting (`lighting.ts`)

`timeline.seed % 3` picks the preset, so the big screen and replays agree:

| #   | Preset    | Look                                                                  |
| --- | --------- | --------------------------------------------------------------------- |
| 0   | Afternoon | warm gold sun, soft blue sky                                          |
| 1   | Sunset    | low orange-pink sun, long warm light                                  |
| 2   | Night     | dark blue sky, four glowing floodlight towers plus a few point lights |

Each preset sets sky gradient, sun colour and direction, ambient (hemisphere) light, fog colour and bloom strength.

### Effects (`effects.ts`)

Six effects from small pixel particles. Each is a pure function of `(event, t − event.t)`, with no simulated state, so a reload or replay shows the same frame.

| Effect                  | Trigger                         |
| ----------------------- | ------------------------------- |
| Speed: streaks and dust | `pickup` of a `speed:*` item    |
| Hit: flash and stars    | `hit`                           |
| Shield: bubble          | `blocked`                       |
| Reflect: spark          | `reflected`                     |
| Dud: dizzy swirl        | `pickup` of a `dud:*` item      |
| Box open: puff          | any `pickup` (shown at the box) |

Popup labels (`popupOf`) stay, as sprites.

## 3. Setting, fallback and errors

- Setting: localStorage key `hrtc.render`, `'hd' | '2d'`, default `'hd'`, read and written with try/catch like `audioSettings.ts`; blocked storage means the default.
- `pickRenderer(setting, webgl2Available)` (pure) chooses the renderer.
- Fall back to 2D, with one console warning and the chip reading "2D (HD unavailable)", when:
  - the browser has no WebGL2;
  - the dynamic import fails (e.g. a stale chunk after a deploy);
  - `play()` throws;
  - the WebGL context is lost mid-race. `RaceView` swaps in a fresh `<canvas>` (a canvas with a WebGL context can't get a 2D one) and starts the 2D renderer from the same `startAtMs`, so it resumes at the same race time.
- `stop()` disposes geometries, materials, textures, render targets and the renderer, and removes listeners (the big screen runs many races without a reload).
- A `ResizeObserver` on the race frame resizes the renderer and composer; the view stays 16:9 inside `.race-frame`.
- Accessibility is unchanged: canvas `aria-label`, the live standings region, reduced motion as above.

## 4. Testing

- Vitest, pure modules only (no WebGL in tests):
  - `shots.ts`: shot per race time; chase target near the top 3; finish shot within 60 m.
  - `lighting.ts`: preset from `seed % 3`, stable per seed.
  - `effects.ts`: active only within its duration; output a pure function of time since the event.
  - Render setting load/save, including blocked storage and bad values.
  - Scenery placement: deterministic per seed, never inside `trackBounds` plus the margin.
  - `pickRenderer`.
- E2E: the existing races also assert the race canvas renders and no page errors fire (headless Chromium uses its software WebGL; if WebGL2 is missing there, the test asserts the 2D fallback instead).
- Look test (Look target 6): owner approves the still frame before the rest is built.
- Manual: `/sandbox` on 3 tracks × 3 presets; screenshots in `docs/hd2d-screens/`.
- Performance target: 60 fps at 1080p on integrated graphics, 22 horses, long race; checked with a dev-only frame-time readout in `/sandbox`. On a slow TV the 2D chip is the escape hatch.
