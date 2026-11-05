import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { colorsOf } from '../render/palette.ts';
import { COSMETICS, CRATE_PRICE } from '../shop/cosmetics.ts';
import { CrateTab } from './CrateTab.tsx';

const crown = COSMETICS.find((c) => c.code === 'cap:crown')!;
const view = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <CrateTab
      left={5}
      balance={1000}
      busy={false}
      confirming={false}
      prize={null}
      colors={colorsOf(0)}
      onAsk={() => {}}
      onCancel={() => {}}
      onOpen={() => {}}
      onWear={() => {}}
      {...over}
    />,
  );

describe('CrateTab', () => {
  it('price, odds note, an Open button and an empty status line', () => {
    const html = view();
    expect(html).toContain(`Mystery crate · ${CRATE_PRICE} coins`);
    expect(html).toContain('Pricier items are rarer.');
    expect(html).toContain('<button type="button">Open crate</button>');
    expect(html).toContain('<p role="status" class="crate-result"></p>');
  });
  it('Open is disabled without the coins or while busy', () => {
    const off = '<button type="button" disabled="">Open crate</button>';
    expect(view({ balance: CRATE_PRICE - 1 })).toContain(off);
    expect(view({ busy: true })).toContain(off);
  });
  it('asks to confirm the payment', () => {
    const html = view({ confirming: true });
    expect(html).toContain(`Open a crate for ${CRATE_PRICE} coins?`);
    expect(html).toContain(`Pay ${CRATE_PRICE}`);
    expect(html).toContain('Cancel');
    expect(html).not.toContain('Open crate</button>');
  });
  it('hides the crate when nothing is left', () => {
    const html = view({ left: 0 });
    expect(html).toContain('You own everything!');
    expect(html).not.toContain('Open crate');
  });
  it('reveals the prize on the horse, says it, and offers to wear it', () => {
    const html = view({ prize: crown });
    expect(html).toContain('class="crate-reveal"');
    expect(html).toContain('<span class="crate-box" aria-hidden="true">🎁</span>');
    expect(html).toContain('<p role="status" class="crate-result">You got Crown!</p>');
    expect(html).toContain('<canvas');
    expect(html).toContain('Wear it');
  });
  it('a prize already worn says so instead', () => {
    const html = view({ prize: crown, colors: { ...colorsOf(0), cap: 'cap:crown' } });
    expect(html).toContain('Wearing it.');
    expect(html).not.toContain('Wear it</button>');
  });
});
