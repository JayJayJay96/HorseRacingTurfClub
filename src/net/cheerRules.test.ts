import { describe, expect, it } from 'vitest';
import { CHEER_GAP_MS, createCheerGate, isCheer } from './cheerRules.ts';

describe('cheers', () => {
  it('validates payloads', () => {
    expect(isCheer({ player: 'p1', emoji: '📣' })).toBe(true);
    expect(isCheer({ player: 'p1', emoji: '💣' })).toBe(false);
    expect(isCheer({ player: 42, emoji: '📣' })).toBe(false);
    expect(isCheer(null)).toBe(false);
    expect(isCheer({ player: 'x'.repeat(100), emoji: '📣' })).toBe(false);
  });

  it('lets one cheer per sender through every 2 s', () => {
    const gate = createCheerGate();
    expect(gate('a', 0)).toBe(true);
    expect(gate('a', CHEER_GAP_MS - 1)).toBe(false);
    expect(gate('b', 10)).toBe(true);
    expect(gate('a', CHEER_GAP_MS)).toBe(true);
  });
});
