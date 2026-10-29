export type HeldDefense = 'defense:block1' | 'defense:reflect';

export interface Defenses {
  /** Tick at which immunity ends (exclusive). */
  readonly immuneUntil: number;
  readonly held: HeldDefense | null;
}

export type HitOutcome = 'immune' | 'shield' | 'reflect' | 'hit';

/**
 * How an attack lands. Immunity beats a held Shield, which beats a held Mirror.
 * The caller spends the held item on 'shield' and 'reflect'.
 */
export function resolveHit(target: Defenses, tick: number, allowReflect: boolean): HitOutcome {
  if (tick < target.immuneUntil) return 'immune';
  if (target.held === 'defense:block1') return 'shield';
  if (target.held === 'defense:reflect' && allowReflect) return 'reflect';
  return 'hit';
}
