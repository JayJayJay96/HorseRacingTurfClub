import { useCallback, useEffect, useState } from 'react';
import {
  loadAudioSettings,
  saveAudioSettings,
  type AudioScope,
  type AudioSettings,
} from './audioSettings.ts';
import { createSoundEngine, type SoundEngine } from './soundEngine.ts';
import { BEDS, SONGS } from './songs.ts';

let engine: SoundEngine | null = null;
/** One engine per page, created on first use (tests and plain imports never touch Web Audio). */
export function soundEngine(): SoundEngine {
  engine ??= createSoundEngine(SONGS, BEDS);
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
