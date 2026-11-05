import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HotStrip, hotBoxTypes, hotOf, hotText } from './HotItems.tsx';

const HOT = [
  { item: 'speed:self1', buff: 'lucky' },
  { item: 'attack:leader', buff: 'extended' },
  { item: 'defense:block1', buff: 'lucky' },
] as const;

describe('hot items UI', () => {
  it('reads a race row or timeline list, anything else as none', () => {
    expect(hotOf(HOT)).toEqual(HOT);
    expect(hotOf(null)).toEqual([]);
    expect(hotOf(undefined)).toEqual([]);
    expect(hotOf({})).toEqual([]);
    expect(hotOf([{ item: 'nope', buff: 'lucky' }])).toEqual([]);
  });

  it('writes the strip text', () => {
    expect(hotText(HOT)).toBe(
      '🥕 Carrot 🍀 Lucky · 🪢 Golden Lasso ⏱️ Extended · 🛡️ Horseshoe Shield 🍀 Lucky',
    );
    expect(hotText([])).toBeNull();
  });

  it('flags the box types a bought box can give a hot item from', () => {
    expect([...hotBoxTypes(HOT)].sort()).toEqual(['attack', 'defense', 'speed']);
    expect([...hotBoxTypes([{ item: 'speed:pass3', buff: 'lucky' }])]).toEqual([]);
    expect([...hotBoxTypes([{ item: 'attack:all', buff: 'extended' }])]).toEqual([]);
  });

  it('shows nothing without hot items', () => {
    expect(renderToStaticMarkup(<HotStrip hot={[]} />)).toBe('');
    expect(renderToStaticMarkup(<HotStrip hot={HOT} />)).toContain('Hot items');
  });
});
