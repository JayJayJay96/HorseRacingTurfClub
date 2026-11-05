import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TRAIT_CODES } from '../sim/config.ts';
import { TraitPicker } from './TraitPicker.tsx';

type Props = Record<string, unknown> & { children?: ReactNode };

/** Every <button> element in a rendered tree (no DOM library in this repo, so walk the elements). */
function buttons(node: ReactNode, out: ReactElement<Props>[] = []) {
  if (Array.isArray(node)) node.forEach((n) => buttons(n, out));
  else if (isValidElement<Props>(node)) {
    if (node.type === 'button') out.push(node);
    buttons(node.props.children, out);
  }
  return out;
}

describe('TraitPicker', () => {
  it('six buttons, the current pick pressed, effect text in each', () => {
    const html = renderToStaticMarkup(
      <TraitPicker current="tough" disabled={false} onPick={() => {}} />,
    );
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Tough.*hits hurt less, boosts help less/);
    expect(html).toContain('Your trait');
  });

  it('tapping a button picks that trait', () => {
    const onPick = vi.fn();
    const bs = buttons(TraitPicker({ current: 'normal', disabled: false, onPick }));
    expect(bs).toHaveLength(6);
    bs.forEach((b) => (b.props.onClick as () => void)());
    expect(onPick.mock.calls.map((c) => c[0])).toEqual([...TRAIT_CODES]);
    expect(bs.map((b) => b.props['aria-pressed'])).toEqual(TRAIT_CODES.map((t) => t === 'normal'));
  });

  it('disabled disables all six', () => {
    const bs = buttons(TraitPicker({ current: 'normal', disabled: true, onPick: () => {} }));
    expect(bs.every((b) => b.props.disabled === true)).toBe(true);
  });
});
