# Third-party notices

## Bundled audio recordings

These files ship in the repository, the build and the deployed site:

- `src/assets/music/lobby/shoplobby1.mp3`, `shoplobby2.mp3`: lobby and shop music.
- `src/assets/music/race/race1.mp3` … `race6.mp3`: race music (one picked at random).
- `src/assets/music/background/horseracing.mp3`: crowd-and-hooves bed looped under the race music.

Source: royalty-free music library (owner, 2026-11-04). **The site and licence for each file are
not recorded yet:** add them here, and keep any attribution the licence requires.

## Original to this project (no third-party rights)

- **Fallback music:** when a music folder is empty, the lobby/shop and race loops are original
  compositions in `src/audio/chiptune.ts`, synthesised at runtime with Web Audio. They do not
  transcribe any existing music.
- **Sound effects:** synthesised at runtime in `src/audio/soundEngine.ts`, adapted from the owner's
  own King of Fate project.
- **Race commentary:** spoken at runtime by the browser's built-in text-to-speech; no voice
  recording is bundled.
- **Pixel art:** horses, jockeys and the track are drawn in code (`src/render/`).
- **Font:** Pixelify Sans, SIL Open Font License 1.1, self-hosted.
