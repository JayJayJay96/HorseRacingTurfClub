import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TRAIT_INFO } from '../app/Traits.tsx';
import { BADGES } from '../history/badges.ts';
import { ITEM_INFO } from '../render/items.ts';
import { TRACKS } from '../render/track.ts';
import { GuideButton, GuideContent } from './Guide.tsx';

describe('Guide', () => {
  it('lists every power-up, trait, track and badge from the game tables', () => {
    const html = renderToStaticMarkup(<GuideContent />);
    for (const i of Object.values(ITEM_INFO))
      expect(html).toContain(i.desc.replace(/'/g, '&#x27;'));
    for (const t of Object.values(TRAIT_INFO)) expect(html).toContain(t.minus);
    for (const t of Object.values(TRACKS)) expect(html).toContain(t.blurb.replace(/'/g, '&#x27;'));
    for (const b of Object.values(BADGES)) expect(html).toContain(b.name);
  });

  it('is a button plus a closed dialog', () => {
    const html = renderToStaticMarkup(<GuideButton />);
    expect(html).toContain('aria-label="Guide"');
    expect(html).toMatch(/<dialog class="guide"(?![^>]*open)/);
  });
});
