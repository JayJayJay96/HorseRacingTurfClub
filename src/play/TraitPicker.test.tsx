import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TraitPicker } from './TraitPicker.tsx';

describe('TraitPicker', () => {
  it('six buttons, the current pick pressed', () => {
    const html = renderToStaticMarkup(
      <TraitPicker current="tough" disabled={false} onPick={() => {}} />,
    );
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>🛡️ Tough · hits hurt less, boosts help less</);
    expect(html).toContain('Your trait');
  });
});
