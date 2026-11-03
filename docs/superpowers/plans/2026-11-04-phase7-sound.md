# Phase 7 — Sound, Commentator & Cheers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the race loud and lively.
- **Big screen:**
  - Two original chiptune loops: one for the lobby and shop, one for the race.
  - Sound effects for the countdown, the start, boxes, each item type, hits, blocks and the finish bell.
  - A race commentator using the browser's English voice.
  - A sound toggle with volume sliders.
- **Phones:**
  - Cheer buttons during the race. Each cheer floats over the big screen with the person's name and swells the crowd noise.
  - Opt-in phone sounds: beeps, start, bell and coin.

**Architecture:**

- **A Web Audio engine adapted from King of Fate** (`C:\AILAB\KOFv1\src\audio\`) synthesises music and effects at runtime, so nothing is bundled.
  - We copy its small helpers: `osc`, `noiseHit`, `drum`, the step sequencer and the `bars`/`drums` notation.
  - We drop everything KOF-specific: voice clips, chants, custom music, fanfares and intensity layers.
- **What plays and when is decided by two pure, tested modules that read the stored race Timeline.**
  - `raceCues(timeline, from, to)` turns timeline events in a time window into effect names.
  - `createCommentator(timeline, name)` turns the race into spoken lines, with a minimum gap between them.
  - A React hook polls both about 10 times a second against the race clock.
- **Cheers travel as Supabase Realtime Broadcast on their own channel, `cheers:<roomId>`.**
  - Phones only *send*, over HTTP, without subscribing (`channel.httpSend`, supabase-js ≥ 2.76; we have 2.118).
  - Only the big screen subscribes, so phones never receive each other's cheers (spec §4 budget).
  - No database changes.

**Tech Stack:** Web Audio API, Web Speech API (`speechSynthesis`), Supabase Realtime Broadcast, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-horse-racing-turf-club-design.md` §4 (cheers budget), §5 (RUNNING row: cheers), §11 (audio), §12 phase 7.

---

## Scope decisions (read first)

- **Owner decisions (2026-11-04):**
  - Commentator, phone cheers and opt-in phone sounds are all in.
  - Two original loops: lobby/shop and race.
- **Autoplay.** Browsers only allow audio after a user gesture.
  - The engine adds one `pointerdown`/`keydown` listener on `document`. The first gesture unlocks audio and removes the listener.
  - So the big screen's first click ("Unlock", "Open shop", …) turns sound on. The toggle also unlocks.
- **Settings are per browser** in `localStorage`, read with try/catch:
  - Big screen, key `hrtc.audio.screen`: on by default. Music 0.5, effects 0.7, voice 1, commentator on.
  - Phones, key `hrtc.audio.phone`: **muted by default**.
- **Music:**
  - The lobby loop plays in LOBBY, SHOP, ODDS_LOCKED and BETTING.
  - The race loop plays in RUNNING.
  - PODIUM is silent apart from the bell and the commentator.
- **Commentator:**
  - "And they're off!" at the gun.
  - "{horse} takes the lead!" on a lead change. Only after 3 s, and at least 4 s after the previous line.
  - Big moments are said regardless of the gap: Golden Lasso hits, Thunderclap and Stampede.
  - "Into the final stretch!" when the leader is 300 m from the finish.
  - "{winner} wins it!", plus "{2nd} second, {3rd} third." when there are 3 or more horses.
  - Names come from the standings' names map, so Office horse names are used.
  - Speech drops stale lines so it never lags.
  - A big screen that reloads mid-race starts from "now": no burst of old lines or sounds.
- **Cheers:**
  - The emoji set is `📣 👏 🔥 🐎`.
  - A phone may send 1 cheer every 2 s; its buttons are disabled during the cooldown.
  - The big screen also drops anything faster than that per sender. It validates the payload: a known emoji and a player id that is in the room.
  - It shows the **name from the room roster**, never a name taken from the payload.
  - Each cheer floats for 3 s, with at most 12 on screen. Each plays a short crowd sound, no more than one every 300 ms.
  - Broadcast channels are public: anyone with the room id could send. That's harmless here, because payloads are validated and only ever shown as cheers.
- **The `/stats` replay stays silent.** It could get sound later.
- **No new assets:** everything is synthesised. Add a `THIRD_PARTY_NOTICES.md` saying so, in KOF's style.

## File structure

```
src/audio/chiptune.ts (+test)        NEW  bars/drums notation, noteToFrequency, stepSeconds; THEMES lobby + race
src/audio/audioSettings.ts (+test)   NEW  AudioSettings, load/save per scope ('screen' | 'phone')
src/audio/raceCues.ts (+test)        NEW  SfxName, raceCues(timeline, from, to)
src/audio/soundEngine.ts (+test)     NEW  createSoundEngine(): unlock, apply, setMusic, sfx, say; gesture unlock
src/audio/commentator.ts (+test)     NEW  createCommentator(timeline, name, startT?, opts?) → linesUpTo(t)
src/audio/sound.ts                   NEW  shared engine singleton + useAudioSettings(scope)
src/audio/SoundToggle.tsx            NEW  🔊/🔇 button + volume panel
src/audio/useRaceAudio.ts            NEW  drives cues + commentary from the race clock
src/net/cheers.ts (+test)            NEW  CHEERS, isCheer, createCheerGate, sendCheer, useCheers
src/track/TrackPage.tsx              MOD  toggle, music by phase, race audio, cheer overlay
src/play/PlayPage.tsx                MOD  phone toggle (opt-in), cheer buttons, phone cues, coin sound
src/app/app.css                      MOD  .sound, .sound-panel, .race-wrap, .cheers
THIRD_PARTY_NOTICES.md, README.md, PROJECT_STATUS.md   NEW/MOD
```

---

### Task 0: Branch

- [ ] Branch `phase7-sound` exists (from `master`). In `PROJECT_STATUS.md`, replace the trailing `Next: Phase 7 …` line with:

```markdown
## Phase 7 — Sound, commentator & cheers (branch `phase7-sound`)

- [x] Task 0: Branch
- [ ] Task 1: Settings and chiptune themes
- [ ] Task 2: Race cue names and sound engine
- [ ] Task 3: Race cues
- [ ] Task 4: Commentator
- [ ] Task 5: Sound hooks and toggle
- [ ] Task 6: Big screen audio
- [ ] Task 7: Cheers
- [ ] Task 8: Phone sounds
- [ ] Task 9: Smoke test, docs, deploy

Next: Phase 7 in progress.
```

- [ ] `git add PROJECT_STATUS.md docs/superpowers/plans/2026-11-04-phase7-sound.md && git commit -m "docs: Phase 7 plan"`

---

### Task 1: Settings and chiptune themes

**Files:** Create `src/audio/audioSettings.ts`, `src/audio/audioSettings.test.ts`, `src/audio/chiptune.ts`, `src/audio/chiptune.test.ts`

- [ ] **Step 1: Failing tests.**

`src/audio/audioSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULTS, loadAudioSettings, saveAudioSettings } from './audioSettings.ts';

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe('audioSettings', () => {
  it('big screen is on by default, phones are muted by default', () => {
    expect(loadAudioSettings('screen', memory())).toEqual(DEFAULTS.screen);
    expect(DEFAULTS.screen.muted).toBe(false);
    expect(loadAudioSettings('phone', memory()).muted).toBe(true);
  });

  it('round-trips per scope and clamps bad values', () => {
    const s = memory();
    saveAudioSettings('phone', { ...DEFAULTS.phone, muted: false, sfx: 0.3 }, s);
    expect(loadAudioSettings('phone', s)).toMatchObject({ muted: false, sfx: 0.3 });
    expect(loadAudioSettings('screen', s)).toEqual(DEFAULTS.screen);
    s.setItem('hrtc.audio.screen', JSON.stringify({ music: 7, voice: 'loud', commentator: false }));
    expect(loadAudioSettings('screen', s)).toMatchObject({ music: 1, voice: 1, commentator: false });
    s.setItem('hrtc.audio.screen', '{not json');
    expect(loadAudioSettings('screen', s)).toEqual(DEFAULTS.screen);
  });

  it('works without storage', () => {
    expect(loadAudioSettings('screen', null)).toEqual(DEFAULTS.screen);
    expect(saveAudioSettings('screen', DEFAULTS.screen, null)).toBe(false);
  });
});
```

`src/audio/chiptune.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { noteToFrequency, STEPS_PER_LOOP, THEMES } from './chiptune.ts';

describe('chiptune', () => {
  it('A4 is 440 Hz', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440);
    expect(noteToFrequency('A5')).toBeCloseTo(880);
  });

  it.each(Object.entries(THEMES))('%s has 64 steps per track and valid notes', (_name, t) => {
    for (const track of [t.lead, t.bass, t.drums]) expect(track).toHaveLength(STEPS_PER_LOOP);
    for (const n of [...t.lead, ...t.bass]) if (n) expect(Number.isFinite(noteToFrequency(n))).toBe(true);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/audio`. It should FAIL.
- [ ] **Step 3: Implement.**

`src/audio/audioSettings.ts`:

```ts
/** Per-browser sound preferences (a convenience, never game state). */
export type AudioScope = 'screen' | 'phone';

export interface AudioSettings {
  readonly muted: boolean;
  /** 0–1 volumes per layer. */
  readonly music: number;
  readonly sfx: number;
  readonly voice: number;
  /** Race commentary on the voice layer (big screen). */
  readonly commentator: boolean;
}

export const DEFAULTS: Readonly<Record<AudioScope, AudioSettings>> = {
  screen: { muted: false, music: 0.5, sfx: 0.7, voice: 1, commentator: true },
  // Phone sounds are opt-in (spec §11).
  phone: { muted: true, music: 0, sfx: 0.7, voice: 0, commentator: false },
};

const key = (scope: AudioScope) => `hrtc.audio.${scope}`;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const volume = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function loadAudioSettings(scope: AudioScope, storage: Storage | null = safeStorage()): AudioSettings {
  const d = DEFAULTS[scope];
  if (!storage) return d;
  let raw: unknown = null;
  try {
    const text = storage.getItem(key(scope));
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown>;
  return {
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
    music: volume(r.music, d.music),
    sfx: volume(r.sfx, d.sfx),
    voice: volume(r.voice, d.voice),
    commentator: typeof r.commentator === 'boolean' ? r.commentator : d.commentator,
  };
}

export function saveAudioSettings(
  scope: AudioScope,
  settings: AudioSettings,
  storage: Storage | null = safeStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key(scope), JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
```

`src/audio/chiptune.ts`:
- Copy verbatim from `C:\AILAB\KOFv1\src\audio\chiptune.ts`: the `DrumHit` type, the `Theme` interface, `STEPS_PER_LOOP`, `bars`, `drums`, `NOTE_INDEX`, `noteToFrequency` and `stepSeconds`.
- Reword the header comment for this project.
- Drop the KOF themes and the `layered`/`arp`/`drumsExtra` fields. `Theme` keeps only `bpm`, `lead`, `bass` and `drums`.
- Then add these **original** themes, composed for this project:

```ts
export type MusicTheme = 'lobby' | 'race';

/** Lobby/shop loop: easy-going paddock stroll, C major, 116 bpm. */
const LOBBY: Theme = {
  bpm: 116,
  lead: bars(
    'C5 . E5 . G5 . E5 . F5 . A5 . G5 . . .',
    'E5 . G5 . C6 . G5 . A5 . G5 . E5 . . .',
    'D5 . F5 . A5 . F5 . G5 . B5 . A5 . G5 .',
    'E5 . D5 . C5 . G4 . C5 . . . . . . .',
  ),
  bass: bars(
    'C3 . G2 . C3 . G2 . F2 . C3 . F2 . C3 .',
    'C3 . G2 . C3 . G2 . F2 . C3 . G2 . C3 .',
    'D3 . A2 . D3 . A2 . G2 . D3 . G2 . D3 .',
    'C3 . G2 . C3 . G2 . C3 . . . C2 . . .',
  ),
  drums: drums('K...S...K.K.S...', 'K...S...K.K.S...', 'K...S...K.K.S...', 'K...S...K.K.S.SS'),
};

/** Race loop: galloping E minor, 176 bpm; the bass rides a da-da-DUM gallop. */
const RACE: Theme = {
  bpm: 176,
  lead: bars(
    'E5 . . B4 E5 . G5 . F#5 . E5 . D5 . B4 .',
    'C5 . . G4 C5 . E5 . D5 . C5 . B4 . G4 .',
    'A4 . . E5 A5 . G5 . F#5 . E5 . F#5 . A5 .',
    'B5 . A5 . G5 . F#5 . G5 . F#5 . E5 . D#5 .',
  ),
  bass: bars(
    'E2 E2 E3 . E2 E2 E3 . E2 E2 E3 . E2 E2 E3 .',
    'C2 C2 C3 . C2 C2 C3 . C2 C2 C3 . C2 C2 C3 .',
    'A1 A1 A2 . A1 A1 A2 . A1 A1 A2 . A1 A1 A2 .',
    'B1 B1 B2 . B1 B1 B2 . B1 B1 B2 . B1 B1 B2 .',
  ),
  drums: drums('K.H.S.H.K.H.S.H.', 'K.H.S.H.K.H.S.H.', 'K.H.S.H.K.H.S.H.', 'K.H.S.H.K.S.SSSS'),
};

export const THEMES: Readonly<Record<MusicTheme, Theme>> = { lobby: LOBBY, race: RACE };
```

- [ ] **Step 4:** Run the tests and confirm they pass. Then `npm run typecheck` and `npm run lint`.
- [ ] **Step 5:** `git add src/audio && git commit -m "feat(audio): settings per screen and two original chiptune loops"`

---

### Task 2: Race cue names and sound engine

**Files:** Create `src/audio/raceCues.ts` (type only for now), `src/audio/soundEngine.ts`, `src/audio/soundEngine.test.ts`

- [ ] **Step 1:** Create `src/audio/raceCues.ts`, holding only the effect names for now (Task 3 adds the function):

```ts
export type SfxName =
  | 'count'
  | 'go'
  | 'bell'
  | 'box'
  | 'speed'
  | 'attack'
  | 'hit'
  | 'shield'
  | 'dud'
  | 'fizzle'
  | 'coin'
  | 'cheer';
```

- [ ] **Step 2: Failing test** `src/audio/soundEngine.test.ts`. Vitest runs in Node, which has no `AudioContext` and no `speechSynthesis`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './audioSettings.ts';
import { createSoundEngine } from './soundEngine.ts';

describe('createSoundEngine without browser audio', () => {
  it('is a safe no-op', () => {
    const e = createSoundEngine();
    expect(e.webAudio).toBe(false);
    expect(() => {
      e.apply(DEFAULTS.screen);
      e.unlock();
      e.setMusic('race');
      e.sfx('bell');
      e.say('Hello');
      e.setMusic(null);
      e.dispose();
    }).not.toThrow();
  });
});
```

- [ ] **Step 3:** Run it. It should FAIL.
- [ ] **Step 4: Implement `src/audio/soundEngine.ts`**, adapting `C:\AILAB\KOFv1\src\audio\soundEngine.ts`.
  - **Keep:**
    - context creation (`Ctor`, `running()`);
    - `ensureGraph` (music, sfx and voice buses, plus a noise buffer);
    - `applyLevels`;
    - `osc`, `noiseHit` and `drum` (K/S/H/T only);
    - `startSequencer` / `stopSequencer` / `syncMusic`, for built-in themes only: lead on `square`, bass on `triangle`, as KOF does. No layers, rate or drops.
  - **Drop:** clips, chants, custom music, fanfares and intensity.
  - The API:

```ts
import type { AudioSettings } from './audioSettings.ts';
import type { MusicTheme } from './chiptune.ts';
import type { SfxName } from './raceCues.ts';

export interface SoundEngine {
  readonly webAudio: boolean;
  /** Resume the AudioContext; call from a user gesture (also done automatically on the first one). */
  unlock(): void;
  apply(settings: AudioSettings): void;
  /** Desired background loop; starts once audio is unlocked. null = silence. */
  setMusic(theme: MusicTheme | null): void;
  sfx(name: SfxName): void;
  /** English text-to-speech on the voice level; stale lines are dropped so speech never lags. */
  say(text: string): void;
  dispose(): void;
}
```

  The effect recipes:

```ts
  function playSfx(name: SfxName) {
    const c = running();
    if (!c || !sfxBus || sfxLevel() <= 0) return;
    const now = c.currentTime;
    const bus = sfxBus;
    switch (name) {
      case 'count': // countdown beep
        osc(c, bus, 'square', 880, 880, now, 0.09, 0.25);
        break;
      case 'go':
        osc(c, bus, 'square', 1320, 1320, now, 0.3, 0.3);
        osc(c, bus, 'square', 660, 660, now, 0.3, 0.2);
        break;
      case 'bell': // finish bell
        osc(c, bus, 'sine', 1568, 1560, now, 1.4, 0.5);
        osc(c, bus, 'sine', 2093, 2080, now, 0.9, 0.25);
        break;
      case 'box':
        osc(c, bus, 'square', 523, 1046, now, 0.12, 0.2);
        break;
      case 'speed': // whoosh up
        osc(c, bus, 'sawtooth', 300, 1200, now, 0.3, 0.15);
        noiseHit(c, bus, now, 0.3, 0.15, 'highpass', 3000);
        break;
      case 'attack':
        noiseHit(c, bus, now, 0.2, 0.4, 'bandpass', 1200);
        osc(c, bus, 'square', 220, 90, now, 0.18, 0.2);
        break;
      case 'hit': // thud
        osc(c, bus, 'sine', 160, 50, now, 0.25, 0.8);
        noiseHit(c, bus, now, 0.15, 0.4, 'lowpass', 1200);
        break;
      case 'shield':
        osc(c, bus, 'sine', 880, 880, now, 0.35, 0.3);
        osc(c, bus, 'sine', 1320, 1320, now + 0.05, 0.35, 0.2);
        break;
      case 'dud': // boing down
        osc(c, bus, 'triangle', 420, 140, now, 0.35, 0.4);
        break;
      case 'fizzle':
        noiseHit(c, bus, now, 0.15, 0.12, 'highpass', 4000);
        break;
      case 'coin':
        osc(c, bus, 'square', 988, 988, now, 0.07, 0.2);
        osc(c, bus, 'square', 1319, 1319, now + 0.07, 0.14, 0.2);
        break;
      case 'cheer': // crowd swell
        noiseHit(c, bus, now, 0.7, 0.35, 'bandpass', 900);
        break;
    }
  }
```

  `say(text)`:
  - Do nothing when `globalThis.speechSynthesis` is missing, when muted, when `voice` is 0, or when `commentator` is off.
  - Keep a `queued` counter: increment it on speak, decrement it in `onend` and `onerror`.
  - If `queued >= 2`, call `speechSynthesis.cancel()` and reset the counter to 0 before speaking.
  - Speak `new SpeechSynthesisUtterance(text)` with `lang = 'en-US'`, `rate = 1.15` and `volume = voice level`. Use the first voice from `speechSynthesis.getVoices()` whose `lang` starts with `en`, if there is one.

  **Gesture unlock:** when `webAudio` is true and `document` exists, `createSoundEngine` adds `pointerdown` and `keydown` listeners on `document`. The handler calls `unlock()` and removes both listeners. `dispose()` also removes them, stops the sequencer and closes the context.

- [ ] **Step 5:** Run `npx vitest run src/audio`, typecheck and lint. All must pass.
- [ ] **Step 6:** `git add src/audio && git commit -m "feat(audio): Web Audio engine adapted from King of Fate"`

---

### Task 3: Race cues

**Files:** Modify `src/audio/raceCues.ts`. Create `src/audio/raceCues.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type { RaceEvent } from '../sim/types.ts';
import { raceCues } from './raceCues.ts';

const events: RaceEvent[] = [
  { t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' },
  { t: 2, type: 'pickup', horse: 'b', kind: 'attack', item: null },
  { t: 3, type: 'hit', horse: 'a', by: 'b', item: 'attack:front1' },
  { t: 4, type: 'blocked', horse: 'a', by: 'b', item: 'attack:front1', reason: 'shield' },
  { t: 5, type: 'pickup', horse: 'a', kind: 'mystery', item: 'dud:trip' },
  { t: 10, type: 'finish', horse: 'a', place: 1 },
  { t: 20, type: 'finish', horse: 'b', place: 2 },
];
const tl = fakeTimeline({ a: 10, b: 5 }, 100, events);

describe('raceCues', () => {
  it('counts down 3-2-1 then go', () => {
    expect(raceCues(tl, -5, -0.5)).toEqual(['count', 'count', 'count']);
    expect(raceCues(tl, -0.5, 0)).toEqual(['go']);
  });

  it('maps events in (from, to] to sounds', () => {
    expect(raceCues(tl, 0, 5)).toEqual(['speed', 'fizzle', 'hit', 'shield', 'dud']);
    expect(raceCues(tl, 5, 25)).toEqual(['bell']);
  });

  it('collapses repeats so a burst stays short', () => {
    const many: RaceEvent[] = [1, 1.1, 1.2].map((t) => ({
      t,
      type: 'hit',
      horse: 'a',
      by: 'b',
      item: 'attack:all',
    }));
    expect(raceCues(fakeTimeline({ a: 10, b: 5 }, 100, many), 0, 2)).toEqual(['hit']);
  });
});
```

- [ ] **Step 2:** Run it. It should FAIL.
- [ ] **Step 3: Implement.** Add the imports at the top of `src/audio/raceCues.ts` and append the function:

```ts
import { eventsBetween } from '../sim/playback.ts';
import type { RaceEvent, Timeline } from '../sim/types.ts';

function cueOf(e: RaceEvent): SfxName | null {
  switch (e.type) {
    case 'pickup':
      if (!e.item) return 'fizzle';
      if (e.item.startsWith('speed:')) return 'speed';
      if (e.item.startsWith('attack:')) return 'attack';
      if (e.item.startsWith('defense:')) return 'shield';
      return 'dud';
    case 'hit':
      return 'hit';
    case 'blocked':
    case 'reflected':
      return 'shield';
    case 'finish':
      return e.place === 1 ? 'bell' : null;
  }
}

/** Sounds for race time (from, to]: the 3-2-1 countdown, "go" at 0, then timeline events. */
export function raceCues(timeline: Timeline, from: number, to: number): SfxName[] {
  const out: SfxName[] = [];
  for (const k of [3, 2, 1]) if (from < -k && -k <= to) out.push('count');
  if (from < 0 && 0 <= to) out.push('go');
  for (const e of eventsBetween(timeline, from, to)) {
    const cue = cueOf(e);
    if (cue && out.at(-1) !== cue) out.push(cue);
  }
  return out;
}
```

- [ ] **Step 4:** Run the tests until they pass. Then `git add src/audio && git commit -m "feat(audio): race events to sound cues"`

---

### Task 4: Commentator

**Files:** Create `src/audio/commentator.ts`, `src/audio/commentator.test.ts`

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import type { RaceEvent, Timeline } from '../sim/types.ts';
import { createCommentator } from './commentator.ts';

const name = (h: string) => h.toUpperCase();
/** A 100 m test track, so the "final stretch" is 30 m from the finish here. */
const opts = { finalStretchMetres: 30 };

/** b leads early, a overtakes at ~6.7 s and wins at 10 s; c trails. */
function overtake(events: RaceEvent[] = []): Timeline {
  const ticks = 251;
  const a = Array.from({ length: ticks }, (_, i) => Math.min(100, i < 50 ? 0.6 * i : 30 + 1.4 * (i - 50)));
  const b = Array.from({ length: ticks }, (_, i) => Math.min(100, 0.8 * i));
  const c = Array.from({ length: ticks }, (_, i) => Math.min(100, 0.4 * i));
  return {
    ...fakeTimeline({ a: 10, b: 8, c: 4 }, 100, events),
    progress: { a, b, c },
    finishOrder: ['a', 'b', 'c'],
    finishTimes: { a: 10, b: 12.5, c: 25 },
  };
}

describe('createCommentator', () => {
  it('opens, calls the lead change, the stretch and the finish, each once', () => {
    const com = createCommentator(overtake(), name, -Infinity, opts);
    expect(com.linesUpTo(-2)).toEqual([]);
    expect(com.linesUpTo(0.1)).toEqual(["And they're off!"]);
    expect(com.linesUpTo(2)).toEqual([]); // b leads early, but lead calls wait for 3 s
    expect(com.linesUpTo(8)).toEqual(['A takes the lead!', 'Into the final stretch!']);
    expect(com.linesUpTo(30)).toEqual(['A wins it! B second, C third.']);
    expect(com.linesUpTo(40)).toEqual([]);
  });

  it('calls big moments regardless of the gap', () => {
    const events: RaceEvent[] = [
      { t: 0.5, type: 'hit', horse: 'b', by: 'c', item: 'attack:leader' },
      { t: 0.6, type: 'pickup', horse: 'c', kind: 'mystery', item: 'attack:all' },
    ];
    const com = createCommentator(overtake(events), name, -Infinity, opts);
    expect(com.linesUpTo(1)).toEqual([
      "And they're off!",
      'Golden Lasso! C stops B!',
      'Thunderclap from C!',
    ]);
  });

  it('starting late (reload) says nothing about the past', () => {
    const com = createCommentator(overtake(), name, 15, opts);
    expect(com.linesUpTo(16)).toEqual([]);
    expect(com.linesUpTo(30)).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run it. It should FAIL.
- [ ] **Step 3: Implement** `src/audio/commentator.ts`:

```ts
import { progressAt, standingsAt } from '../sim/playback.ts';
import type { HorseId, RaceEvent, Timeline } from '../sim/types.ts';

/** Seconds between ordinary lines (big moments ignore it), and when lead calls may start. */
export const COMMENTARY = { minGap: 4, leadAfter: 3, finalStretchMetres: 300 } as const;

export interface Commentator {
  /** New lines for race time up to `t` (call with increasing t). */
  linesUpTo(t: number): string[];
}

function bigMoment(e: RaceEvent, name: (h: HorseId) => string): string | null {
  if (e.type === 'hit' && e.item === 'attack:leader') {
    return `Golden Lasso! ${name(e.by)} stops ${name(e.horse)}!`;
  }
  if (e.type === 'pickup' && e.item === 'attack:all') return `Thunderclap from ${name(e.horse)}!`;
  if (e.type === 'pickup' && e.item === 'speed:pass3') return `${name(e.horse)} stampedes through the field!`;
  return null;
}

/**
 * Race commentary from the Timeline (spec §11, browser voice). `startT` skips everything up to
 * then, so a reloaded big screen doesn't replay old lines.
 */
export function createCommentator(
  timeline: Timeline,
  name: (horse: HorseId) => string,
  startT = -Infinity,
  opts: { finalStretchMetres?: number } = {},
): Commentator {
  const stretchAt = timeline.distance - (opts.finalStretchMetres ?? COMMENTARY.finalStretchMetres);
  const [winner, second, third] = timeline.finishOrder;
  const wonAt = winner === undefined ? Infinity : timeline.finishTimes[winner]!;
  const from = Math.max(0, startT);
  let last = startT;
  let lastLineAt = -Infinity;
  let leader: HorseId | undefined = standingsAt(timeline, from)[0];
  let saidStart = startT >= 0;
  let saidStretch = leader !== undefined && progressAt(timeline, leader, from) >= stretchAt && startT >= 0;
  let saidFinish = wonAt <= startT;

  return {
    linesUpTo(t) {
      const out: string[] = [];
      if (t <= last) return out;
      const say = (line: string) => {
        out.push(line);
        lastLineAt = t;
      };
      if (!saidStart && t >= 0) {
        saidStart = true;
        say("And they're off!");
      }
      for (const e of timeline.events) {
        if (e.t > last && e.t <= t) {
          const line = bigMoment(e, name);
          if (line) say(line);
        }
      }
      const now = standingsAt(timeline, t)[0];
      if (now !== leader) {
        if (now !== undefined && t >= COMMENTARY.leadAfter && t - lastLineAt >= COMMENTARY.minGap) {
          say(`${name(now)} takes the lead!`);
        }
        leader = now;
      }
      if (!saidStretch && t >= 0 && leader !== undefined && progressAt(timeline, leader, t) >= stretchAt) {
        saidStretch = true;
        if (wonAt > t) say('Into the final stretch!');
      }
      if (!saidFinish && wonAt <= t) {
        saidFinish = true;
        const podium =
          second !== undefined && third !== undefined ? ` ${name(second)} second, ${name(third)} third.` : '';
        say(`${name(winner!)} wins it!${podium}`);
      }
      last = t;
      return out;
    },
  };
}
```

  Check the first test's timing:
  - a passes b at about 6.7 s. At t = 8, a is at 72 m, past the 70 m stretch mark, and is leading. The previous line was at 0.1 s.
  - So t = 8 yields the lead call and the stretch call, in that order.
  - a finishes at 10 s, so t = 30 yields only the winner line.
  - If a boundary is off by one tick, fix the test's sample times, not the rules.

- [ ] **Step 4:** Run the tests until they pass, then typecheck and lint. Then `git add src/audio && git commit -m "feat(audio): race commentator from the timeline"`

---

### Task 5: Sound hooks and toggle

**Files:** Create `src/audio/sound.ts`, `src/audio/SoundToggle.tsx`, `src/audio/useRaceAudio.ts`. Modify `src/app/app.css`.

- [ ] **Step 1:** `src/audio/sound.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { loadAudioSettings, saveAudioSettings, type AudioScope, type AudioSettings } from './audioSettings.ts';
import { createSoundEngine, type SoundEngine } from './soundEngine.ts';

let engine: SoundEngine | null = null;
/** One engine per page, created on first use (tests and plain imports never touch Web Audio). */
export function soundEngine(): SoundEngine {
  engine ??= createSoundEngine();
  return engine;
}

/** This browser's settings for `scope`, applied to the engine and saved on change. */
export function useAudioSettings(scope: AudioScope) {
  const [settings, setSettings] = useState<AudioSettings>(() => loadAudioSettings(scope));
  useEffect(() => {
    soundEngine().apply(settings);
  }, [settings]);
  const update = useCallback(
    (patch: Partial<AudioSettings>) => {
      setSettings((s) => {
        const next = { ...s, ...patch };
        saveAudioSettings(scope, next);
        return next;
      });
      soundEngine().unlock();
    },
    [scope],
  );
  return { settings, update };
}
```

- [ ] **Step 2:** `src/audio/SoundToggle.tsx`:

```tsx
import { useState } from 'react';
import type { AudioSettings } from './audioSettings.ts';

type Props = {
  settings: AudioSettings;
  update: (patch: Partial<AudioSettings>) => void;
  /** Phones only get on/off; the big screen also gets volumes and the commentator. */
  full?: boolean;
};

/** 🔊/🔇 plus an optional volume panel. Clicking it also unlocks browser audio. */
export function SoundToggle({ settings, update, full = false }: Props) {
  const [open, setOpen] = useState(false);
  const slider = (label: string, key: 'music' | 'sfx' | 'voice') => (
    <label>
      {label}{' '}
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={settings[key]}
        onChange={(e) => update({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="sound">
      <button type="button" aria-pressed={!settings.muted} onClick={() => update({ muted: !settings.muted })}>
        {settings.muted ? '🔇 Sound off' : '🔊 Sound on'}
      </button>
      {full && (
        <>
          {' '}
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Volume
          </button>
          {open && (
            <div className="sound-panel">
              {slider('Music', 'music')}
              {slider('Effects', 'sfx')}
              {slider('Commentator', 'voice')}
              <label>
                <input
                  type="checkbox"
                  checked={settings.commentator}
                  onChange={(e) => update({ commentator: e.target.checked })}
                />{' '}
                Commentator on
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** `src/audio/useRaceAudio.ts`:

```ts
import { useEffect, useRef } from 'react';
import type { HorseId, Timeline } from '../sim/types.ts';
import { createCommentator } from './commentator.ts';
import { raceCues, type SfxName } from './raceCues.ts';
import { soundEngine } from './sound.ts';

const TICK_MS = 100;
/** At most this many effects per tick, so a pile-up doesn't turn into noise. */
const MAX_CUES = 3;

/**
 * Plays a race's sounds against its clock (gun at `startAtMs`). `cues` filters which effects play
 * (phones only want count/go/bell); `commentary` adds spoken lines. Starting mid-race skips the past.
 */
export function useRaceAudio(
  timeline: Timeline | null,
  startAtMs: number,
  opts: { names?: Readonly<Record<HorseId, string>>; commentary?: boolean; cues?: (c: SfxName) => boolean },
) {
  const { commentary = false } = opts;
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  useEffect(() => {
    if (!timeline) return;
    const clock = () => (Date.now() - startAtMs) / 1000;
    let last = clock();
    const com = commentary
      ? createCommentator(timeline, (h) => optsRef.current.names?.[h] ?? '?', last)
      : null;
    const timer = setInterval(() => {
      const t = clock();
      const engine = soundEngine();
      const keep = optsRef.current.cues;
      for (const c of raceCues(timeline, last, t).filter((x) => !keep || keep(x)).slice(0, MAX_CUES)) {
        engine.sfx(c);
      }
      for (const line of com?.linesUpTo(t) ?? []) engine.say(line);
      last = t;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [timeline, startAtMs, commentary]);
}
```

- [ ] **Step 4:** Append to `app.css`:

```css
.sound {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 10;
}
.sound-panel {
  display: grid;
  gap: 4px;
  margin-top: 4px;
  padding: 8px;
  background: Canvas;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 6px;
}
```

- [ ] **Step 5:** `npm test`, typecheck, lint, build. Then `git add src/audio src/app/app.css && git commit -m "feat(audio): settings hook, sound toggle, race audio hook"`

---

### Task 6: Big screen audio

**Files:** Modify `src/track/TrackPage.tsx`

- [ ] **Step 1: Toggle and music.**
  - In `TrackPage`, alongside the other hooks at the top (before any early return), add:
    - `const { settings, update } = useAudioSettings('screen');`
    - An effect keyed on `state?.room.phase` that sets the music through `soundEngine().setMusic(...)`:
      - `RUNNING` → `'race'`;
      - `PODIUM` → `null`;
      - any other phase → `'lobby'`;
      - no state → `null`.
      - The effect's cleanup sets `null`.
  - Render `<SoundToggle settings={settings} update={update} full />` inside every `<main className="track">` that the page returns once the room is loaded.
- [ ] **Step 2: Race audio.** In `RunningBoard`, call `useRaceAudio(timeline, race?.started_at ? gunMs(race.started_at) : 0, { names, commentary: true })`. Here `names` is the existing horse-name map. `engine.say` already obeys `settings.commentator`.
- [ ] **Step 3:** `npm test`, typecheck, lint, build. Then `git add src/track && git commit -m "feat(track): music, race sounds and commentator on the big screen"`

---

### Task 7: Cheers

**Files:** Create `src/net/cheers.ts`, `src/net/cheers.test.ts`. Modify `src/track/TrackPage.tsx`, `src/play/PlayPage.tsx`, `src/app/app.css`.

- [ ] **Step 1: Failing test** `src/net/cheers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHEER_GAP_MS, createCheerGate, isCheer } from './cheers.ts';

describe('cheers', () => {
  it('validates payloads', () => {
    expect(isCheer({ player: 'p1', emoji: '📣' })).toBe(true);
    expect(isCheer({ player: 'p1', emoji: '💣' })).toBe(false);
    expect(isCheer({ player: 42, emoji: '📣' })).toBe(false);
    expect(isCheer(null)).toBe(false);
    expect(isCheer({ player: 'x'.repeat(100), emoji: '📣' })).toBe(false);
  });

  it('lets one cheer per sender through every 2 s', () => {
    const gate = createCheerGate();
    expect(gate('a', 0)).toBe(true);
    expect(gate('a', CHEER_GAP_MS - 1)).toBe(false);
    expect(gate('b', 10)).toBe(true);
    expect(gate('a', CHEER_GAP_MS)).toBe(true);
  });
});
```

  `src/net/supabase.ts` throws at import time if the Vite env vars are missing, and unit tests have no `.env`. So put the pure parts (`CHEERS`, `CHEER_GAP_MS`, `isCheer`, `createCheerGate`) in `src/net/cheerRules.ts`. Re-export them from `cheers.ts`, and have the test import `./cheerRules.ts`. If importing `supabase.ts` already works in unit tests, keep a single file.

- [ ] **Step 2:** Run it. It should FAIL.
- [ ] **Step 3: Implement.**

```ts
// src/net/cheerRules.ts
/** Spec §4/§5: phones cheer during the race; only the big screen listens. */
export const CHEERS = ['📣', '👏', '🔥', '🐎'] as const;
export type CheerEmoji = (typeof CHEERS)[number];
export const CHEER_GAP_MS = 2000;

export type Cheer = { player: string; emoji: CheerEmoji };

export function isCheer(p: unknown): p is Cheer {
  if (typeof p !== 'object' || p === null) return false;
  const c = p as Record<string, unknown>;
  return typeof c.player === 'string' && c.player.length <= 64 && (CHEERS as readonly unknown[]).includes(c.emoji);
}

/** Per-sender rate limit; the big screen applies it too (a phone could be modified). */
export function createCheerGate(gapMs = CHEER_GAP_MS) {
  const lastAt = new Map<string, number>();
  return (sender: string, now: number) => {
    const prev = lastAt.get(sender);
    if (prev !== undefined && now - prev < gapMs) return false;
    lastAt.set(sender, now);
    return true;
  };
}
```

```ts
// src/net/cheers.ts
import { useEffect, useRef, useState } from 'react';
import { createCheerGate, isCheer, type Cheer } from './cheerRules.ts';
import { supabase } from './supabase.ts';

export * from './cheerRules.ts';

const FLOAT_MS = 3000;
const MAX_ON_SCREEN = 12;
export type ShownCheer = Cheer & { id: number; at: number };

const channelName = (roomId: string) => `cheers:${roomId}`;

/** Phone side: fire-and-forget over HTTP; no subscription, so phones never receive cheers. */
export async function sendCheer(roomId: string, cheer: Cheer): Promise<void> {
  const channel = supabase.channel(channelName(roomId));
  try {
    await channel.httpSend('cheer', cheer);
  } finally {
    void supabase.removeChannel(channel);
  }
}

/** Big-screen side: recent valid cheers from players in the room. */
export function useCheers(roomId: string | null, playerIds: ReadonlySet<string>, onCheer?: () => void) {
  const [shown, setShown] = useState<ShownCheer[]>([]);
  // Read live inside the handler, so a roster refetch doesn't resubscribe.
  const live = useRef({ playerIds, onCheer });
  useEffect(() => {
    live.current = { playerIds, onCheer };
  });
  useEffect(() => {
    if (!roomId) return;
    const gate = createCheerGate();
    let seq = 0;
    const channel = supabase
      .channel(channelName(roomId))
      .on('broadcast', { event: 'cheer' }, ({ payload }) => {
        if (!isCheer(payload) || !live.current.playerIds.has(payload.player)) return;
        const now = Date.now();
        if (!gate(payload.player, now)) return;
        seq += 1;
        const id = seq;
        setShown((list) =>
          [...list.filter((c) => now - c.at < FLOAT_MS), { ...payload, id, at: now }].slice(-MAX_ON_SCREEN),
        );
        live.current.onCheer?.();
      })
      .subscribe();
    const sweep = setInterval(() => {
      const now = Date.now();
      setShown((list) => (list.some((c) => now - c.at >= FLOAT_MS) ? list.filter((c) => now - c.at < FLOAT_MS) : list));
    }, 500);
    return () => {
      clearInterval(sweep);
      void supabase.removeChannel(channel);
    };
  }, [roomId]);
  return shown;
}
```

- [ ] **Step 4: Big screen.** In `RunningBoard`:
  - `const ids = useMemo(() => new Set(players.map((p) => p.id)), [players]);`
  - `const lastCheerSfx = useRef(0);`
  - `const shown = useCheers(room.id, ids, () => { const n = Date.now(); if (n - lastCheerSfx.current >= 300) { lastCheerSfx.current = n; soundEngine().sfx('cheer'); } });`

  Wrap the `RaceView` in `<div className="race-wrap">` and add the layer:

```tsx
<ul className="cheers" aria-live="polite">
  {shown.map((c) => (
    <li key={c.id}>
      {c.emoji} {nameOf(players, c.player)}
    </li>
  ))}
</ul>
```

  CSS:

```css
.race-wrap {
  position: relative;
}
.cheers {
  position: absolute;
  left: 8px;
  bottom: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
  font-size: 1.5rem;
  color: #fff;
  text-shadow: 0 1px 3px #000;
}
.cheers li {
  animation: cheer-float 3s ease-out forwards;
}
@keyframes cheer-float {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-80px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cheers li {
    animation: none;
  }
}
```

- [ ] **Step 5: Phone.** In `RunningPanel`, while the race runs (`t >= 0` and `t` before the last finish), show a "Cheer!" row:
  - One button per emoji in `CHEERS`, each with `aria-label={`Cheer ${emoji}`}`.
  - On click: `sendCheer(room.id, { player: mine.id, emoji }).catch(() => {})`. Cheers are best effort, so errors are ignored.
  - Then disable every cheer button until `Date.now() + CHEER_GAP_MS`, using a `cooldownUntil` state and a timer that clears it.
- [ ] **Step 6:** `npm test`, typecheck, lint, build. Then `git add src/net src/track src/play src/app/app.css && git commit -m "feat: phone cheers float over the big screen"`

---

### Task 8: Phone sounds (opt-in)

**Files:** Modify `src/play/PlayPage.tsx`.

- [ ] **Step 1:** In `PlayRoom`, alongside the other hooks before the early returns, add `const { settings, update } = useAudioSettings('phone');`. Render `<SoundToggle settings={settings} update={update} />` at the top of the `<main className="play">`. There's no `full` panel; the toggle is muted by default.
- [ ] **Step 2:** In `RunningPanel`, call `useRaceAudio(timeline, gun, { cues: (c) => c === 'count' || c === 'go' || c === 'bell' })`. There's no commentary and no music on phones.
- [ ] **Step 3:** Play a coin sound after a successful buy or bet. In `ShopPanel` and `BetPanel`, change `act(() => buyBox(room.id, box))` to `act(() => buyBox(room.id, box).then(() => soundEngine().sfx('coin')))`, and do the same for `placeBet`. The engine stays silent while the phone is muted.
- [ ] **Step 4:** `npm test`, typecheck, lint, build. Then `git add src/play && git commit -m "feat(play): opt-in phone sounds"`

---

### Task 9: Smoke test, docs, deploy

- [ ] **Step 1: Local smoke test.** Use the office room or a Private room, with the big screen, two phones and speakers on.
  - **Big screen:**
    - The lobby loop starts after the first click.
    - At the start: 3-2-1 beeps, then "go", then the race loop.
    - During the race: item sounds, and a thud on hits.
    - The commentator says "And they're off!", lead changes, the final stretch and the winner line.
    - The bell plays at the finish, and the podium is quiet.
  - **Volume panel:** the sliders work, the commentator switches off, and "Sound off" mutes everything.
  - **Phone cheers:**
    - During the race, tapping a cheer floats "🔥 Ali" on the big screen with a crowd swell.
    - The buttons stay disabled for 2 s.
  - **Phone sound on:** beeps, go, the bell, and a coin on buy.
  - **Mid-race reload:** reloading the big screen mid-race gives no burst of old sounds or lines.
  - **Console:** no errors.
- [ ] **Step 2:** All checks: `npm test`, `npm run test:db`, typecheck, lint, build.
- [ ] **Step 3: Docs.**
  - **`THIRD_PARTY_NOTICES.md`** (new) records that:
    - the music loops are original, written in `src/audio/chiptune.ts`;
    - the effects are synthesised in `src/audio/soundEngine.ts`, adapted from the owner's King of Fate project;
    - the commentary uses the browser's built-in text-to-speech;
    - no recordings or copyrighted music are bundled.
  - **`README.md`:** a short "Sound" note covering the toggle, phone opt-in and cheers.
  - **`PROJECT_STATUS.md`:** tick the checklist, add a log entry, decisions and deferred items. Deferred:
    - the silent `/stats` replay;
    - phones not seeing others' cheers;
    - voice quality depends on the browser.
  - **Commit:** `docs: Phase 7 status, notices`.
- [ ] **Step 4: Deploy** (after merge, with the owner's go-ahead). There are no migrations or functions, so `git push origin master` is enough and Vercel publishes it. Then check the live site.
