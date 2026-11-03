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
