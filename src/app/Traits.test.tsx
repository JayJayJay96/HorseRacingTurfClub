import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TRAIT_CODES } from '../sim/config.ts';
import { TRAIT_INFO, TRAIT_LEGEND, TraitIcon, asTrait, traitLabel, traitOf } from './Traits.tsx';

describe('traits UI', () => {
  it('labels every trait with icon, name and a one-line effect', () => {
    for (const t of TRAIT_CODES) {
      expect(TRAIT_INFO[t].effect.length).toBeGreaterThan(0);
      expect(TRAIT_INFO[t].effect).not.toMatch(/\d/);
    }
    expect(traitLabel('tough')).toBe('🛡️ Tough · hits hurt less, boosts help less');
    expect(TRAIT_LEGEND).toBe(
      '⚖️ Normal · 🧿 Charmed · 🛡️ Tough · ⚡ Sprinter · 🐢 Stayer · 🌧️ Mudder',
    );
  });

  it('reads unknown or missing traits as Normal', () => {
    expect(asTrait('mudder')).toBe('mudder');
    expect(asTrait('lucky')).toBe('normal');
    expect(asTrait(undefined)).toBe('normal');
    expect(traitOf({ a: 'stayer' }, 'a')).toBe('stayer');
    expect(traitOf({ a: 'stayer' }, 'b')).toBe('normal');
    expect(traitOf(null, 'a')).toBe('normal');
  });

  it('the icon carries the name for screen readers', () => {
    const html = renderToStaticMarkup(<TraitIcon trait="sprinter" />);
    expect(html).toContain('⚡');
    expect(html).toContain('Sprinter');
  });
});
