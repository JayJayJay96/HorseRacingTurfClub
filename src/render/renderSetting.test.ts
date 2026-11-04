import { describe, expect, it } from 'vitest';
import { RENDER_KEY, loadRenderMode, pickRenderer, saveRenderMode } from './renderSetting.ts';

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

const blocked = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
} as unknown as Storage;

describe('render setting', () => {
  it('defaults to HD', () => {
    expect(loadRenderMode(memory())).toBe('hd');
    expect(loadRenderMode(null)).toBe('hd');
    expect(loadRenderMode(blocked)).toBe('hd');
  });

  it('round-trips and ignores bad values', () => {
    const s = memory();
    expect(saveRenderMode('2d', s)).toBe(true);
    expect(loadRenderMode(s)).toBe('2d');
    s.setItem(RENDER_KEY, 'ultra');
    expect(loadRenderMode(s)).toBe('hd');
    expect(saveRenderMode('2d', blocked)).toBe(false);
    expect(saveRenderMode('2d', null)).toBe(false);
  });

  it('picks HD only when wanted, available and not failed', () => {
    expect(pickRenderer('hd', true, false)).toBe('hd');
    expect(pickRenderer('2d', true, false)).toBe('2d');
    expect(pickRenderer('hd', false, false)).toBe('2d');
    expect(pickRenderer('hd', true, true)).toBe('2d');
  });
});
