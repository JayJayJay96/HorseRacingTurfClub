/** Spec §4/§5: phones cheer during the race; only the big screen listens. */
export const CHEERS = ['📣', '👏', '🔥', '🐎'] as const;
export type CheerEmoji = (typeof CHEERS)[number];
export const CHEER_GAP_MS = 2000;

export type Cheer = { player: string; emoji: CheerEmoji };

export function isCheer(p: unknown): p is Cheer {
  if (typeof p !== 'object' || p === null) return false;
  const c = p as Record<string, unknown>;
  return (
    typeof c.player === 'string' &&
    c.player.length <= 64 &&
    (CHEERS as readonly unknown[]).includes(c.emoji)
  );
}

/** Per-sender rate limit; the big screen applies it too (a phone could be modified). */
export function createCheerGate(gapMs = CHEER_GAP_MS) {
  const lastAt = new Map<string, number>();
  return (sender: string, now: number) => {
    const prev = lastAt.get(sender);
    if (prev !== undefined && now - prev < gapMs) return false;
    lastAt.set(sender, now);
    return true;
  };
}
