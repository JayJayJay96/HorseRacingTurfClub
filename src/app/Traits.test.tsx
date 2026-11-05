import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TRAIT_CODES } from '../sim/config.ts';
import { TRAIT_INFO, TRAIT_LEGEND, TraitIcon, asTrait, traitLabel, traitOf } from './Traits.tsx';

describe('traits UI', () => {
  it('labels every trait with icon, name, an upside and a downside', () => {
    for (const t of TRAIT_CODES) {
      for (const text of [TRAIT_INFO[t].plus, TRAIT_INFO[t].minus]) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/\d/);
      }
    }
    expect(traitLabel('tough')).toBe(
      '🛡️ Tough · ✅ Attacks, bad items and bumps slow you less · ⚠️ Speed items boost you less',
    );
    expect(TRAIT_LEGEND).toBe(
      '⚖️ Normal · 🧿 Charmed · 🛡️ Tough · ⚡ Sprinter · 🐢 Stayer · 🌧️ Mudder · 🏹 Closer · 🚩 Front-runner · 🎲 Gambler · 🥊 Brawler',
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
