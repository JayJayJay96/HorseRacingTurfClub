/** Per-browser sound preferences (a convenience, never game state). */
export type AudioScope = 'screen' | 'phone';

export interface AudioSettings {
  readonly muted: boolean;
  /** 0–1 volumes per layer. */
  readonly music: number;
  readonly sfx: number;
  readonly voice: number;
  /** The race's crowd-and-hooves background bed. */
  readonly crowd: number;
  /** Race commentary on the voice layer (big screen). */
  readonly commentator: boolean;
}

export const DEFAULTS: Readonly<Record<AudioScope, AudioSettings>> = {
  screen: { muted: false, music: 0.5, sfx: 0.7, voice: 1, crowd: 0.8, commentator: true },
  // Phone sounds are opt-in (spec §11).
  phone: { muted: true, music: 0, sfx: 0.7, voice: 0, crowd: 0, commentator: false },
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

export function loadAudioSettings(
  scope: AudioScope,
  storage: Storage | null = safeStorage(),
): AudioSettings {
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
    crowd: volume(r.crowd, d.crowd),
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
