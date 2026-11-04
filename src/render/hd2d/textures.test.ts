import { describe, expect, it } from 'vitest';
import { PALETTES, gradient, pixelTexture, scenerySprite } from './textures.ts';

const colours = (data: Uint8ClampedArray) => {
  const set = new Set<string>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    set.add(
      '#' +
        [data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join(''),
    );
  }
  return set;
};

describe('textures', () => {
  it('ground tiles are deterministic, opaque and use only their palette', () => {
    for (const kind of ['grass', 'dirt', 'wood'] as const) {
      const a = pixelTexture(kind, 7);
      expect(a.width).toBe(32);
      expect(a.data.length).toBe(32 * 32 * 4);
      expect(pixelTexture(kind, 7).data).toEqual(a.data);
      expect(pixelTexture(kind, 8).data).not.toEqual(a.data);
      for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(255);
      for (const c of colours(a.data)) expect(PALETTES[kind]).toContain(c);
    }
  });

  it('crowd tiles are 32 x 16', () => {
    const c = pixelTexture('crowd', 1, 32, 16);
    expect(c.height).toBe(16);
    expect(c.data.length).toBe(32 * 16 * 4);
  });

  it('scenery sprites have transparent corners and an opaque middle', () => {
    for (const kind of ['tree', 'bush', 'flag'] as const) {
      const s = scenerySprite(kind, 3);
      expect(s.data[3]).toBe(0); // bottom-left corner
      const opaque = [...s.data].filter((v, i) => i % 4 === 3 && v === 255).length;
      expect(opaque).toBeGreaterThan(10);
    }
  });

  it('gradients store the bottom colour in the first row', () => {
    // gradient(top, bottom, height)
    const g = gradient('#000000', '#ffffff', 4);
    expect([...g.data.slice(0, 3)]).toEqual([255, 255, 255]);
    expect([...g.data.slice(12, 15)]).toEqual([0, 0, 0]);
  });
});
