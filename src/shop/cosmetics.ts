export type CosmeticSlot = 'pattern' | 'trail';
export type Cosmetic = {
  readonly code: string;
  readonly slot: CosmeticSlot;
  readonly name: string;
  readonly price: number;
};

/** Mirrors `private.cosmetic_price` in supabase/migrations/20261104000015_cosmetics.sql. */
export const COSMETICS: readonly Cosmetic[] = [
  { code: 'pattern:hoops', slot: 'pattern', name: 'Hoops silks', price: 150 },
  { code: 'pattern:sash', slot: 'pattern', name: 'Sash silks', price: 150 },
  { code: 'pattern:stars', slot: 'pattern', name: 'Star silks', price: 200 },
  { code: 'trail:dust', slot: 'trail', name: 'Dust trail', price: 250 },
  { code: 'trail:sparkle', slot: 'trail', name: 'Sparkle trail', price: 400 },
];
