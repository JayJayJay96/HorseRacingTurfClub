import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionBar } from './ActionBar.tsx';

describe('ActionBar', () => {
  it('shop: just the ready toggle', () => {
    const html = renderToStaticMarkup(<ActionBar ready={false} busy={false} onReady={() => {}} />);
    expect(html).toMatch(/^<div class="action-bar">/);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('I&#x27;m ready');
  });
  it('betting: Bet submits the bet slip, then the ready toggle', () => {
    const html = renderToStaticMarkup(
      <ActionBar ready busy={false} onReady={() => {}} bet={{ disabled: true }} />,
    );
    expect(html).toMatch(
      /<button type="submit" form="bet-slip" class="primary" disabled="">Bet<\/button>/,
    );
    expect(html.indexOf('>Bet<')).toBeLessThan(html.indexOf('Ready ✅ (tap to undo)'));
  });
  it('busy disables the ready toggle', () => {
    const html = renderToStaticMarkup(<ActionBar ready={false} busy onReady={() => {}} />);
    expect(html).toMatch(/<button type="button"[^>]*disabled=""/);
  });
});
