import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CELEBRATIONS,
  Celebration,
  Confetti,
  Payouts,
  celebrationClass,
  payoutLines,
} from './Podium.tsx';
import { COSMETICS } from '../shop/cosmetics.ts';

const players = [
  { id: 'a', name: 'Ann', coat: null, silk: null },
  { id: 'b', name: 'Ben', coat: 1, silk: 2 },
  { id: 'c', name: 'Cat', coat: null, silk: null },
];

describe('payoutLines', () => {
  it('one line per winning player, summed, high to low; the top total is best', () => {
    const lines = payoutLines([
      { player_id: 'a', payout: 20 },
      { player_id: 'b', payout: 50 },
      { player_id: 'a', payout: 15 },
      { player_id: 'c', payout: 0 },
      { player_id: 'c', payout: null },
    ]);
    expect(lines).toEqual([
      { player: 'b', total: 50, best: true },
      { player: 'a', total: 35, best: false },
    ]);
  });
  it('ties at the top are all best', () => {
    const lines = payoutLines([
      { player_id: 'a', payout: 30 },
      { player_id: 'b', payout: 30 },
    ]);
    expect(lines.map((l) => l.best)).toEqual([true, true]);
  });
});

describe('Payouts', () => {
  it('sprite + name + "+N coins", biggest first and gold', () => {
    const html = renderToStaticMarkup(
      <Payouts
        bets={[
          { player_id: 'a', payout: 20 },
          { player_id: 'b', payout: 50 },
        ]}
        players={players}
        horses={['a', 'b']}
      />,
    );
    expect(html.indexOf('Ben')).toBeLessThan(html.indexOf('Ann'));
    expect(html.match(/class="best"/g)).toHaveLength(1);
    expect(html).toMatch(/<li class="best"><canvas[^>]*aria-hidden="true"[^>]*><\/canvas> Ben/);
    expect(html).toContain('+50 coins');
    expect(html).toContain('+20 coins');
  });
  it('no winners', () => {
    expect(renderToStaticMarkup(<Payouts bets={[]} players={players} horses={[]} />)).toBe(
      '<p>No winning bets.</p>',
    );
  });
});

describe('Confetti', () => {
  it('is decorative pixel squares', () => {
    const html = renderToStaticMarkup(<Confetti colors={['#e53935']} />);
    expect(html).toMatch(/^<div class="confetti" aria-hidden="true">/);
    expect(html.match(/<i /g)).toHaveLength(40);
  });
});

describe('celebrationClass', () => {
  it('maps each celebration to its podium class; none or unknown keeps the hop', () => {
    expect(celebrationClass('celebration:spin')).toBe('celebrate-spin');
    expect(celebrationClass('celebration:fireworks')).toBe('celebrate-fireworks');
    expect(celebrationClass('celebration:moonwalk')).toBe('celebrate-moonwalk');
    expect(celebrationClass('celebration:cannon')).toBe('celebrate-cannon');
    expect(celebrationClass(null)).toBe('podium-hop');
    expect(celebrationClass(undefined)).toBe('podium-hop');
    expect(celebrationClass('celebration:disco')).toBe('podium-hop');
  });
  it('every celebration in the shop has one', () => {
    for (const c of COSMETICS.filter((x) => x.slot === 'celebration')) {
      expect(CELEBRATIONS[c.code], c.code).toBeDefined();
    }
  });
});

describe('Celebration', () => {
  it('wraps the sprite; fireworks and cannon add decorative particles', () => {
    const fw = renderToStaticMarkup(
      <Celebration code="celebration:fireworks">
        <b>horse</b>
      </Celebration>,
    );
    expect(fw).toMatch(
      /^<span class="celebration celebrate-fireworks"><b>horse<\/b><span class="celebration-fx" aria-hidden="true">/,
    );
    expect(fw.match(/<i /g)).toHaveLength(36);
    const cannon = renderToStaticMarkup(
      <Celebration code="celebration:cannon">
        <b />
      </Celebration>,
    );
    expect(cannon.match(/<i /g)).toHaveLength(36);
    expect(
      renderToStaticMarkup(
        <Celebration code="celebration:spin">
          <b />
        </Celebration>,
      ),
    ).toBe('<span class="celebration celebrate-spin"><b></b></span>');
  });
  it("none keeps today's hop; once plays a single time", () => {
    expect(
      renderToStaticMarkup(
        <Celebration code={null}>
          <b />
        </Celebration>,
      ),
    ).toBe('<span class="celebration podium-hop"><b></b></span>');
    expect(
      renderToStaticMarkup(
        <Celebration code="celebration:moonwalk" once>
          <b />
        </Celebration>,
      ),
    ).toContain('class="celebration celebrate-moonwalk is-once"');
  });
});
