import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { colorsOf } from '../render/palette.ts';
import { ResultCard } from './ResultCard.tsx';

describe('ResultCard', () => {
  it('your sprite, your place and your winnings, big', () => {
    const html = renderToStaticMarkup(<ResultCard colors={colorsOf(0)} place={1} won={45} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<p class="result-place">You finished <strong>2nd</strong></p>');
    expect(html).toContain('<p class="result-coins win">+45 coins</p>');
  });
  it('not racing and nothing won', () => {
    const html = renderToStaticMarkup(<ResultCard colors={colorsOf(0)} place={-1} won={0} />);
    expect(html).not.toContain('You finished');
    expect(html).toContain('<p class="result-coins">No winnings this time</p>');
  });
});
