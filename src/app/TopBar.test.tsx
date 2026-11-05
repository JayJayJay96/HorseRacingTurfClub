import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TopBar } from './TopBar.tsx';

describe('TopBar', () => {
  it('a title replaces the brand (phone header)', () => {
    const html = renderToStaticMarkup(<TopBar coins={12} title={<h1>Ann</h1>} />);
    expect(html).toContain('<div class="topbar-title"><h1>Ann</h1></div>');
    expect(html).not.toContain('TURF CLUB');
    expect(html).not.toContain('Room ');
    expect(html).toContain('💰 12 coins');
  });
  it('brand links home only outside a room', () => {
    expect(renderToStaticMarkup(<TopBar />)).toContain('<a class="brand" href="/">TURF CLUB</a>');
    const inRoom = renderToStaticMarkup(<TopBar code="ABCD" />);
    expect(inRoom).toContain('<span class="brand">TURF CLUB</span>');
    expect(inRoom).toContain('Room ABCD');
  });
});
