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
    expect(loadAudioSettings('screen', s)).toMatchObject({
      music: 1,
      voice: 1,
      commentator: false,
    });
    s.setItem('hrtc.audio.screen', '{not json');
    expect(loadAudioSettings('screen', s)).toEqual(DEFAULTS.screen);
  });

  it('works without storage', () => {
    expect(loadAudioSettings('screen', null)).toEqual(DEFAULTS.screen);
    expect(saveAudioSettings('screen', DEFAULTS.screen, null)).toBe(false);
  });
});
