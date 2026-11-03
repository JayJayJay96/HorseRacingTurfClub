/**
 * Chiptune notation and ORIGINAL loops composed for Horse Racing Turf Club (not transcriptions of
 * any existing music). Each theme is 4 bars of 16 sixteenth-note steps; the sound engine schedules
 * them. Notation helpers adapted from King of Fate.
 */
export type DrumHit = 'K' | 'S' | 'H' | 'T';

export interface Theme {
  readonly bpm: number;
  /** One entry per 16th step: a note name ("A4", "G#5") or null for silence. */
  readonly lead: readonly (string | null)[];
  readonly bass: readonly (string | null)[];
  /** One entry per step: K kick, S snare, H hat, T tom, or null. */
  readonly drums: readonly (DrumHit | null)[];
}

export const STEPS_PER_LOOP = 64;

/** Parses a compact bar string: tokens separated by spaces; "." = rest. */
export function bars(...barStrings: string[]): (string | null)[] {
  const steps = barStrings.flatMap((b) => b.trim().split(/\s+/));
  return steps.map((t) => (t === '.' ? null : t));
}

export function drums(...barStrings: string[]): (DrumHit | null)[] {
  return barStrings
    .join('')
    .split('')
    .map((c) => (c === '.' ? null : (c as DrumHit)));
}

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

const NOTE_INDEX: Readonly<Record<string, number>> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

/** "A4" → 440 Hz (equal temperament). */
export function noteToFrequency(note: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Bad note "${note}"`);
  const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]!]!;
  return 440 * 2 ** ((midi - 69) / 12);
}

export function stepSeconds(theme: Theme): number {
  return 60 / theme.bpm / 4;
}
