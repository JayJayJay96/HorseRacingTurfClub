import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Confetti, Payouts, payoutLines } from './Podium.tsx';

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
