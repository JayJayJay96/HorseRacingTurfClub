import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './audioSettings.ts';
import { createSoundEngine, nextSong } from './soundEngine.ts';

describe('createSoundEngine without browser audio', () => {
  it('is a safe no-op', () => {
    const e = createSoundEngine();
    expect(e.webAudio).toBe(false);
    expect(() => {
      e.apply(DEFAULTS.screen);
      e.unlock();
      e.setMusic('race');
      e.sfx('bell');
    e.sfx('phase');
      e.say('Hello');
      e.setMusic(null);
      e.dispose();
    }).not.toThrow();
  });
});

describe('nextSong', () => {
  it('picks any song first, then never the same one twice in a row', () => {
    expect(nextSong(1, 0, 0.9)).toBe(0);
    expect([0, 0.5, 0.99].map((r) => nextSong(3, -1, r))).toEqual([0, 1, 2]);
    for (const r of [0, 0.3, 0.6, 0.99]) expect(nextSong(3, 1, r)).not.toBe(1);
    expect([0, 0.99].map((r) => nextSong(3, 1, r))).toEqual([0, 2]);
  });
});
