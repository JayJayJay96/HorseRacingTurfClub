import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhaseBanner, bannerText } from './PhaseBanner.tsx';

describe('bannerText', () => {
  it('names each phase it changes to', () => {
    expect(bannerText('LOBBY', 'SHOP')).toBe('🛒 SHOP OPEN!');
    expect(bannerText('SHOP', 'ODDS_LOCKED')).toBe('🔒 ODDS LOCKED');
    expect(bannerText('ODDS_LOCKED', 'BETTING')).toBe('💰 PLACE YOUR BETS!');
    expect(bannerText('BETTING', 'RUNNING')).toBe('🏁 RACE TIME!');
    expect(bannerText('RUNNING', 'PODIUM')).toBe('🏆 RESULTS!');
  });
  it('nothing for the lobby or a refetch with the same phase', () => {
    expect(bannerText('PODIUM', 'LOBBY')).toBeNull();
    expect(bannerText('SHOP', 'SHOP')).toBeNull();
  });
});

describe('PhaseBanner', () => {
  it('shows nothing on mount', () => {
    expect(renderToStaticMarkup(<PhaseBanner phase="BETTING" />)).toBe('');
  });
});
