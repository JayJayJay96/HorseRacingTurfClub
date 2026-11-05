import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../sim/config.ts';
import type { ItemCode } from '../sim/types.ts';
import { ITEM_INFO, popupOf } from './items.ts';

describe('items', () => {
  it('names and icons every item code', () => {
    for (const code of Object.keys(EFFECTS) as ItemCode[]) {
      expect(ITEM_INFO[code].name.length).toBeGreaterThan(0);
      expect(ITEM_INFO[code].icon.length).toBeGreaterThan(0);
      expect(ITEM_INFO[code].desc).toMatch(/^[^\d]+\.$/);
    }
    expect(ITEM_INFO['attack:leader'].name).toBe('Golden Lasso');
  });

  it('words each event as a short popup', () => {
    expect(popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' })).toBe(
      '🥕 Carrot',
    );
    expect(popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'attack', item: null })).toBe(
      '💨 Fizzled',
    );
    expect(popupOf({ t: 1, type: 'hit', horse: 'a', by: 'b', item: 'attack:top3' })).toBe(
      '🐝 Hit!',
    );
    expect(
      popupOf({
        t: 1,
        type: 'blocked',
        horse: 'a',
        by: 'b',
        item: 'attack:front1',
        reason: 'immune',
      }),
    ).toBe('🔮 Immune');
    expect(
      popupOf({
        t: 1,
        type: 'blocked',
        horse: 'a',
        by: 'b',
        item: 'attack:front1',
        reason: 'shield',
      }),
    ).toBe('🛡️ Blocked');
    expect(popupOf({ t: 1, type: 'reflected', horse: 'a', by: 'b', item: 'attack:front1' })).toBe(
      '🔁 Reflected!',
    );
    expect(popupOf({ t: 1, type: 'finish', horse: 'a', place: 2 })).toBe('🏁 2nd');
  });
});

describe('popupOf weather', () => {
  it('labels slips and bumps', () => {
    expect(popupOf({ t: 1, type: 'slip', horse: 'a' })).toBe('💦 Slip!');
    expect(popupOf({ t: 1, type: 'bump', horse: 'a', with: 'b' })).toBe('💥 Bump!');
  });
});

describe('popupOf hot items', () => {
  it('marks a hot pickup with a flame', () => {
    expect(
      popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1', hot: 'lucky' }),
    ).toBe('🔥 🥕 Carrot');
    expect(popupOf({ t: 1, type: 'pickup', horse: 'a', kind: 'speed', item: 'speed:self1' })).toBe(
      '🥕 Carrot',
    );
  });
});
