import { describe, expect, it } from 'vitest';
import { fakeTimeline } from '../sim/testTimeline.ts';
import { phoneAnnouncement, raceAnnouncement } from './announce.ts';

describe('phoneAnnouncement', () => {
  it('names the phase', () => {
    expect(phoneAnnouncement('SHOP', -1, 0)).toBe('Shop is open');
    expect(phoneAnnouncement('BETTING', -1, 0)).toBe('Betting is open');
    expect(phoneAnnouncement('RUNNING', 2, 40)).toBe('Race started');
    expect(phoneAnnouncement('NOPE', -1, 0)).toBe('');
  });

  it('gives the own result at the podium', () => {
    expect(phoneAnnouncement('PODIUM', 2, 40)).toBe('You finished 3rd and won 40 coins');
    expect(phoneAnnouncement('PODIUM', 0, 0)).toBe('You finished 1st');
    expect(phoneAnnouncement('PODIUM', -1, 15)).toBe('You won 15 coins');
    expect(phoneAnnouncement('PODIUM', -1, 0)).toBe('Results are in');
  });
});

describe('raceAnnouncement', () => {
  // Finishes: a 20 s, b 25 s, c 33.3 s, d 50 s.
  const tl = fakeTimeline({ d: 2, c: 3, b: 4, a: 5 });
  const names = { a: 'Ace', b: 'Bolt', c: 'Comet', d: 'Dot' };

  it('is silent before the first 10 s', () => {
    expect(raceAnnouncement(tl, -3, names)).toBe('');
    expect(raceAnnouncement(tl, 9.9, names)).toBe('');
  });

  it('only changes every 10 s', () => {
    const at10 = raceAnnouncement(tl, 10, names);
    expect(at10).toBe('Leading: 1st Ace, 2nd Bolt, 3rd Comet');
    expect(raceAnnouncement(tl, 19.75, names)).toBe(at10);
  });

  it('gives the result once everyone is home', () => {
    expect(raceAnnouncement(tl, 50, names)).toBe('Result: 1st Ace, 2nd Bolt, 3rd Comet');
    expect(raceAnnouncement(tl, 70, names)).toBe('Result: 1st Ace, 2nd Bolt, 3rd Comet');
  });
});
