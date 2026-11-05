import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COSMETICS, CRATE_PRICE, SLOTS } from './cosmetics.ts';

const sql = readFileSync(
  new URL('../../supabase/migrations/20261105000022_cosmetics_shop.sql', import.meta.url),
  'utf8',
);

describe('catalogue', () => {
  it('is the approved price list (spec 2026-11-05 cosmetics shop)', () => {
    expect(Object.fromEntries(COSMETICS.map((c) => [c.code, c.price]))).toEqual({
      'pattern:hoops': 150,
      'pattern:sash': 150,
      'pattern:stars': 200,
      'pattern:chevrons': 150,
      'pattern:quarters': 150,
      'pattern:dots': 200,
      'pattern:lightning': 250,
      'trail:dust': 250,
      'trail:sparkle': 400,
      'trail:hearts': 300,
      'trail:fire': 400,
      'trail:rainbow': 500,
      'trail:bubbles': 300,
      'cap:pompom': 200,
      'cap:horns': 250,
      'cap:halo': 300,
      'cap:crown': 400,
      'celebration:spin': 500,
      'celebration:fireworks': 650,
      'celebration:moonwalk': 650,
      'celebration:cannon': 800,
    });
    expect(CRATE_PRICE).toBe(250);
  });
  it('codes are unique, start with their slot, and every slot sells something', () => {
    expect(new Set(COSMETICS.map((c) => c.code)).size).toBe(COSMETICS.length);
    for (const c of COSMETICS) expect(c.code.startsWith(`${c.slot}:`), c.code).toBe(true);
    expect(SLOTS).toEqual(['pattern', 'trail', 'cap', 'celebration']);
    for (const s of SLOTS)
      expect(
        COSMETICS.some((c) => c.slot === s),
        s,
      ).toBe(true);
  });
  it('mirrors private.cosmetic_catalog and the crate price in the migration', () => {
    const start = sql.indexOf('create function private.cosmetic_catalog');
    const body = sql.slice(start, sql.indexOf('$$;', start));
    const rows = [...body.matchAll(/\('([a-z]+:[a-z]+)'(?:::text)?, (\d+)\)/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]);
    expect(rows).toEqual(COSMETICS.map((c) => [c.code, c.price]));
    expect(sql).toContain(`v_balance < ${CRATE_PRICE}`);
    expect(sql).toContain(`'cosmetic', -${CRATE_PRICE})`);
  });
});
