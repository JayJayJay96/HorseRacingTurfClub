import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { colorsOf } from '../render/palette.ts';
import { COSMETICS } from '../shop/cosmetics.ts';
import {
  ShopCard,
  ShopPreview,
  ShopTabs,
  TABS,
  TrailMarks,
  cardState,
  wearing,
} from './ShopParts.tsx';

const item = (code: string) => COSMETICS.find((c) => c.code === code)!;
const worn = { ...colorsOf(0), pattern: 'pattern:hoops' };

describe('cardState', () => {
  it('Buy when not owned, Remove when worn, else Wear', () => {
    expect(cardState(item('cap:crown'), [], worn)).toBe('buy');
    expect(cardState(item('pattern:hoops'), ['pattern:hoops'], worn)).toBe('remove');
    expect(cardState(item('pattern:sash'), ['pattern:sash'], worn)).toBe('wear');
  });
});

describe('wearing', () => {
  it('puts the item in its slot and keeps the rest', () => {
    expect(wearing(worn, item('cap:halo'))).toEqual({ ...worn, cap: 'cap:halo' });
    expect(wearing(worn, item('pattern:dots')).pattern).toBe('pattern:dots');
  });
});

describe('ShopTabs', () => {
  it('a labelled group of toggle buttons, the open one pressed', () => {
    const html = renderToStaticMarkup(<ShopTabs tab="cap" onTab={() => {}} />);
    expect(html).toMatch(/^<div class="shop-tabs" role="group" aria-label="Shop sections">/);
    expect(TABS.map((t) => t.label)).toEqual([
      'Patterns',
      'Trails',
      'Caps',
      'Celebrations',
      '🎁 Crate',
    ]);
    expect(html.match(/<button/g)).toHaveLength(TABS.length);
    expect(html).toContain('<button type="button" aria-pressed="true">Caps</button>');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(TABS.length - 1);
  });
  it('tapping a tab reports it', () => {
    const picked: string[] = [];
    const el = ShopTabs({ tab: 'pattern', onTab: (t) => void picked.push(t) });
    (el.props.children as { props: { onClick: () => void } }[])[3]!.props.onClick();
    expect(picked).toEqual(['celebration']);
  });
});

describe('ShopCard', () => {
  const card = (state: 'buy' | 'wear' | 'remove', over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      <ShopCard
        item={item('pattern:hoops')}
        state={state}
        colors={colorsOf(0)}
        trying={false}
        busy={false}
        balance={1000}
        onTry={() => {}}
        onBuy={() => {}}
        onWear={() => {}}
        onRemove={() => {}}
        {...over}
      />,
    );
  it('Buy / Wear / Remove keep the "<verb> <name>" labels the E2E uses', () => {
    expect(card('buy')).toContain('aria-label="Buy Hoops silks"');
    expect(card('wear')).toContain('aria-label="Wear Hoops silks"');
    expect(card('remove')).toContain('aria-label="Remove Hoops silks"');
  });
  it('Buy is disabled without the coins or while busy', () => {
    expect(card('buy', { balance: 149 })).toContain('aria-label="Buy Hoops silks" disabled=""');
    expect(card('buy', { busy: true })).toContain('aria-label="Buy Hoops silks" disabled=""');
    expect(card('buy', { balance: 150 })).not.toContain('disabled=""');
  });
  it('the try-on button: sprite wearing the item, name, price; pressed while tried on', () => {
    const html = card('buy', { trying: true });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Try on Hoops silks, 150 coins"');
    expect(html).toContain('<canvas');
    expect(html).toContain('<span>Hoops silks</span>');
    expect(html).toContain('150 coins');
  });
  it('trail cards show the trail marks', () => {
    const html = renderToStaticMarkup(
      <ShopCard
        item={item('trail:rainbow')}
        state="buy"
        colors={colorsOf(0)}
        trying={false}
        busy={false}
        balance={0}
        onTry={() => {}}
        onBuy={() => {}}
        onWear={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html.match(/<i /g)).toHaveLength(8);
  });
});

describe('TrailMarks', () => {
  it('8 fading marks in the trail colours; nothing for an unknown trail', () => {
    const html = renderToStaticMarkup(<TrailMarks code="trail:dust" />);
    expect(html).toMatch(/^<span class="trail-marks" aria-hidden="true">/);
    expect(html.match(/background:#a39382/g)).toHaveLength(8);
    expect(renderToStaticMarkup(<TrailMarks code="trail:nope" />)).toBe('');
  });
});

describe('ShopPreview', () => {
  it('a big galloping horse; a tried-on celebration plays once', () => {
    const html = renderToStaticMarkup(
      <ShopPreview colors={colorsOf(0)} celebrate={null} replay={0} />,
    );
    expect(html).toMatch(
      /^<div class="shop-preview" aria-hidden="true"><span class="horse-sprite horse-sprite-lg is-animated"/,
    );
    const c = renderToStaticMarkup(
      <ShopPreview colors={colorsOf(0)} celebrate="celebration:spin" replay={2} />,
    );
    expect(c).toContain('class="celebration celebrate-spin is-once"');
  });
  it('shows the worn or tried-on trail behind the horse', () => {
    const html = renderToStaticMarkup(
      <ShopPreview colors={{ ...colorsOf(0), trail: 'trail:fire' }} celebrate={null} replay={0} />,
    );
    expect(html).toContain('class="trail-marks"');
  });
});
