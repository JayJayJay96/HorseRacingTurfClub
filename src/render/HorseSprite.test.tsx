import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HorseSprite, paintHorse, sameColors } from './HorseSprite.tsx';
import { colorsOf, contrastOf } from './palette.ts';

/** Records what drawHorse paints: fill colours and each draw's x offset. */
function fakeCtx() {
  const fills: string[] = [];
  const xs: number[] = [];
  let fill = '';
  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
    },
    fillRect: () => void fills.push(fill),
    translate: (x: number) => void xs.push(x),
    save() {},
    restore() {},
    scale() {},
    clearRect() {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, xs };
}

describe('paintHorse', () => {
  it('draws one side-view horse in the given coat and silk', () => {
    const c = colorsOf(0);
    const { ctx, fills, xs } = fakeCtx();
    paintHorse(ctx, c, 1);
    expect(fills).toContain(c.coat);
    expect(fills).toContain(c.silk);
    expect(xs).toEqual([12]);
  });
  it('draws the pattern in the silk contrast colour', () => {
    const c = { ...colorsOf(1), pattern: 'pattern:hoops' };
    const { ctx, fills } = fakeCtx();
    paintHorse(ctx, c, 1);
    expect(fills).toContain(contrastOf(c.silk));
  });
  it('an animated strip is 4 frames, one 24 px cell each', () => {
    const { ctx, xs } = fakeCtx();
    paintHorse(ctx, colorsOf(2), 4);
    expect(xs).toEqual([12, 36, 60, 84]);
  });
});

describe('HorseSprite', () => {
  it('is an aria-hidden one-cell canvas, scaled by its size class', () => {
    const html = renderToStaticMarkup(<HorseSprite colors={colorsOf(0)} size="md" />);
    expect(html).toMatch(/^<canvas[^>]*>/);
    expect(html).toContain('width="24"');
    expect(html).toContain('height="22"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('horse-sprite horse-sprite-md');
  });
  it('animated: a 4-frame strip inside an aria-hidden window', () => {
    const html = renderToStaticMarkup(<HorseSprite colors={colorsOf(0)} size="lg" animated />);
    expect(html).toMatch(
      /^<span class="horse-sprite horse-sprite-lg is-animated" aria-hidden="true">/,
    );
    expect(html).toContain('width="96"');
  });
  it('passes an extra class through (the cut-in portrait)', () => {
    const html = renderToStaticMarkup(
      <HorseSprite colors={colorsOf(0)} size="lg" className="cutin-portrait" />,
    );
    expect(html).toContain('class="horse-sprite horse-sprite-lg cutin-portrait"');
  });
});

describe('sameColors', () => {
  const c = colorsOf(0);
  it('equal colours, with null and undefined pattern alike', () => {
    expect(sameColors(c, { ...c })).toBe(true);
    expect(sameColors({ ...c, pattern: null }, c)).toBe(true);
  });
  it('a different coat, mane, silk or pattern is a change', () => {
    expect(sameColors(c, { ...c, coat: '#000000' })).toBe(false);
    expect(sameColors(c, { ...c, mane: '#000000' })).toBe(false);
    expect(sameColors(c, { ...c, silk: '#000000' })).toBe(false);
    expect(sameColors(c, { ...c, pattern: 'pattern:hoops' })).toBe(false);
  });
  it('the trail is not drawn, so it never triggers a redraw', () => {
    expect(sameColors(c, { ...c, trail: 'trail:dust' })).toBe(true);
  });
  it('a different cap redraws; a celebration does not (it is not drawn on the sprite)', () => {
    expect(sameColors(c, { ...c, cap: 'cap:crown' })).toBe(false);
    expect(sameColors({ ...c, cap: null }, c)).toBe(true);
    expect(sameColors(c, { ...c, celebration: 'celebration:spin' })).toBe(true);
  });
});
