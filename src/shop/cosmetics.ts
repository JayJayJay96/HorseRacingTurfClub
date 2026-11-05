export type CosmeticSlot = 'pattern' | 'trail' | 'cap' | 'celebration';
export const SLOTS: readonly CosmeticSlot[] = ['pattern', 'trail', 'cap', 'celebration'];
export type Cosmetic = {
  readonly code: string;
  readonly slot: CosmeticSlot;
  readonly name: string;
  readonly price: number;
};

/**
 * Mirrors `private.cosmetic_catalog` in supabase/migrations/20261105000022_cosmetics_shop.sql, in the
 * same order (src/shop/cosmetics.test.ts compares them). The server is the source of truth.
 */
export const COSMETICS: readonly Cosmetic[] = [
  { code: 'pattern:hoops', slot: 'pattern', name: 'Hoops silks', price: 150 },
  { code: 'pattern:sash', slot: 'pattern', name: 'Sash silks', price: 150 },
  { code: 'pattern:stars', slot: 'pattern', name: 'Star silks', price: 200 },
  { code: 'pattern:chevrons', slot: 'pattern', name: 'Chevron silks', price: 150 },
  { code: 'pattern:quarters', slot: 'pattern', name: 'Quartered silks', price: 150 },
  { code: 'pattern:dots', slot: 'pattern', name: 'Polka-dot silks', price: 200 },
  { code: 'pattern:lightning', slot: 'pattern', name: 'Lightning silks', price: 250 },
  { code: 'trail:dust', slot: 'trail', name: 'Dust trail', price: 250 },
  { code: 'trail:sparkle', slot: 'trail', name: 'Sparkle trail', price: 400 },
  { code: 'trail:hearts', slot: 'trail', name: 'Heart trail', price: 300 },
  { code: 'trail:fire', slot: 'trail', name: 'Fire trail', price: 400 },
  { code: 'trail:rainbow', slot: 'trail', name: 'Rainbow trail', price: 500 },
  { code: 'trail:bubbles', slot: 'trail', name: 'Bubble trail', price: 300 },
  { code: 'cap:pompom', slot: 'cap', name: 'Pompom cap', price: 200 },
  { code: 'cap:horns', slot: 'cap', name: 'Devil horns', price: 250 },
  { code: 'cap:halo', slot: 'cap', name: 'Halo', price: 300 },
  { code: 'cap:crown', slot: 'cap', name: 'Crown', price: 400 },
  { code: 'celebration:spin', slot: 'celebration', name: 'Spin', price: 500 },
  { code: 'celebration:fireworks', slot: 'celebration', name: 'Fireworks', price: 650 },
  { code: 'celebration:moonwalk', slot: 'celebration', name: 'Moonwalk', price: 650 },
  { code: 'celebration:cannon', slot: 'celebration', name: 'Confetti cannon', price: 800 },
];

/** Mirrors the literal in `public.open_crate` (same migration). */
export const CRATE_PRICE = 250;
