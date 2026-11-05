import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COSMETICS, CRATE_PRICE } from '../../src/shop/cosmetics.ts';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balanceOf, member, officeRace, officeRoom } from './officeFixtures.ts';

/** A member with `coins` extra on top of the starting 100. */
async function richMember(coins: number) {
  const m = await member('C');
  if (coins) {
    await ok(
      adminClient().rpc('admin_adjust', {
        p_player: m.player.id,
        p_amount: coins,
        p_reason: 'test',
      }),
    );
  }
  return m;
}

async function owned(playerId: string) {
  const rows = (await ok(
    adminClient().from('player_cosmetics').select('code').eq('player_id', playerId),
  )) as { code: string }[];
  return rows.map((r) => r.code).sort();
}

async function ledger(playerId: string) {
  return (await ok(
    adminClient()
      .from('coin_ledger')
      .select('type, amount, race_id')
      .eq('player_id', playerId)
      .eq('type', 'cosmetic'),
  )) as { type: string; amount: number; race_id: string | null }[];
}

describe('buy_cosmetic', () => {
  it('debits the price and records ownership; room_balances agree', async () => {
    const { room } = await officeRoom();
    const m = await richMember(500);
    const other = await member('O');
    expect(
      await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:hoops' })),
    ).toBe(450);
    expect(await owned(m.player.id)).toEqual(['pattern:hoops']);
    expect(await ledger(m.player.id)).toEqual([{ type: 'cosmetic', amount: -150, race_id: null }]);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(450);
    expect(await balanceOf(other.client, room.id, m.player.id)).toBe(450);
    expect(
      await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'trail:sparkle' })),
    ).toBe(50);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(50);
  });

  it('buying twice fails already_owned without a second debit', async () => {
    const { room } = await officeRoom();
    const m = await richMember(500);
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:sash' }));
    expect(
      await fails(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:sash' })),
    ).toBe('already_owned');
    expect(await ledger(m.player.id)).toHaveLength(1);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(450);
  });

  it('not enough coins fails without a debit', async () => {
    const { room } = await officeRoom();
    const m = await richMember(0);
    expect(
      await fails(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:hoops' })),
    ).toBe('not_enough_coins');
    expect(await owned(m.player.id)).toEqual([]);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(100);
  });

  it('an unknown code fails', async () => {
    const { room } = await officeRoom();
    const m = await richMember(500);
    expect(
      await fails(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:gold' })),
    ).toBe('unknown_cosmetic');
  });

  it('a private room fails', async () => {
    const host = await anonClient();
    const room = await ok(host.rpc('create_room', {}));
    const phone = await anonClient();
    await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    expect(
      await fails(phone.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:hoops' })),
    ).toBe('office_only');
  });

  it('non-members cannot buy', async () => {
    const { room } = await officeRoom();
    const stranger = await anonClient();
    expect(
      await fails(stranger.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:hoops' })),
    ).toBe('not_in_room');
  });

  it('buying while RUNNING fails', async () => {
    const r = await officeRoom();
    const a = await richMember(500);
    const b = await member('B');
    await officeRace(r, [a, b], [a.player.id, b.player.id], { stopAt: 'RUNNING' });
    expect(
      await fails(a.client.rpc('buy_cosmetic', { p_room: r.room.id, p_code: 'pattern:hoops' })),
    ).toBe('wrong_phase');
    expect(await owned(a.player.id)).toEqual([]);
  });
});

describe('equip_cosmetic', () => {
  it('equipping an unowned code fails', async () => {
    const { room } = await officeRoom();
    const m = await richMember(0);
    expect(
      await fails(
        m.client.rpc('equip_cosmetic', {
          p_room: room.id,
          p_slot: 'pattern',
          p_code: 'pattern:hoops',
        }),
      ),
    ).toBe('not_owned');
  });

  it('equipping a wrong-slot code fails', async () => {
    const { room } = await officeRoom();
    const m = await richMember(500);
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'trail:dust' }));
    expect(
      await fails(
        m.client.rpc('equip_cosmetic', {
          p_room: room.id,
          p_slot: 'pattern',
          p_code: 'trail:dust',
        }),
      ),
    ).toBe('wrong_slot');
    expect(
      await fails(
        m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: 'hat', p_code: 'trail:dust' }),
      ),
    ).toBe('wrong_slot');
  });

  it('equip and unequip work; another member sees them', async () => {
    const { room } = await officeRoom();
    const m = await richMember(1000);
    const other = await member('O');
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:stars' }));
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'trail:dust' }));
    await ok(
      m.client.rpc('equip_cosmetic', {
        p_room: room.id,
        p_slot: 'pattern',
        p_code: 'pattern:stars',
      }),
    );
    await ok(
      m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: 'trail', p_code: 'trail:dust' }),
    );
    const seen = async () =>
      (
        (await ok(
          other.client.from('room_players').select('pattern, trail').eq('id', m.player.id),
        )) as { pattern: string | null; trail: string | null }[]
      )[0];
    expect(await seen()).toEqual({ pattern: 'pattern:stars', trail: 'trail:dust' });
    const mine = (await ok(
      other.client.from('player_cosmetics').select('code').eq('player_id', m.player.id),
    )) as { code: string }[];
    expect(mine.map((c) => c.code).sort()).toEqual(['pattern:stars', 'trail:dust']);

    await ok(m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: 'trail', p_code: null }));
    expect(await seen()).toEqual({ pattern: 'pattern:stars', trail: null });
  });

  it('player_cosmetics: non-members read nothing, nobody writes directly', async () => {
    const { room } = await officeRoom();
    const m = await richMember(500);
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'pattern:hoops' }));
    const stranger = await anonClient();
    expect(
      await ok(stranger.from('player_cosmetics').select('code').eq('player_id', m.player.id)),
    ).toEqual([]);
    await fails(
      m.client.from('player_cosmetics').insert({ player_id: m.player.id, code: 'trail:sparkle' }),
    );
    await m.client.from('player_cosmetics').delete().eq('player_id', m.player.id);
    expect(await owned(m.player.id)).toEqual(['pattern:hoops']);
  });
});

describe('catalog parity', () => {
  it('every TS catalog price is what buy_cosmetic debits', async () => {
    const { room } = await officeRoom();
    const total = COSMETICS.reduce((sum, c) => sum + c.price, 0);
    const m = await richMember(total);
    let balance = 100 + total;
    for (const c of COSMETICS) {
      const next = await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: c.code }));
      expect(balance - (next as number), c.code).toBe(c.price);
      balance = next as number;
    }
    expect(await owned(m.player.id)).toEqual(COSMETICS.map((c) => c.code).sort());
  });
});

describe('caps and celebrations', () => {
  it('equip, unequip and show to other members', async () => {
    const { room } = await officeRoom();
    const m = await richMember(1000);
    const other = await member('O');
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'cap:crown' }));
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'celebration:spin' }));
    await ok(
      m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: 'cap', p_code: 'cap:crown' }),
    );
    await ok(
      m.client.rpc('equip_cosmetic', {
        p_room: room.id,
        p_slot: 'celebration',
        p_code: 'celebration:spin',
      }),
    );
    const seen = async () =>
      (
        (await ok(
          other.client
            .from('room_players')
            .select('pattern, trail, cap, celebration')
            .eq('id', m.player.id),
        )) as Record<string, string | null>[]
      )[0];
    expect(await seen()).toEqual({
      pattern: null,
      trail: null,
      cap: 'cap:crown',
      celebration: 'celebration:spin',
    });
    await ok(m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: 'cap', p_code: null }));
    expect(await seen()).toEqual({
      pattern: null,
      trail: null,
      cap: null,
      celebration: 'celebration:spin',
    });
  });

  it('reject unowned, unknown and wrong-slot codes', async () => {
    const { room } = await officeRoom();
    const m = await richMember(1000);
    await ok(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'celebration:cannon' }));
    const equip = (slot: string, code: string) =>
      fails(m.client.rpc('equip_cosmetic', { p_room: room.id, p_slot: slot, p_code: code }));
    expect(await equip('cap', 'cap:halo')).toBe('not_owned');
    expect(await equip('cap', 'cap:wizard')).toBe('not_owned');
    expect(await equip('cap', 'celebration:cannon')).toBe('wrong_slot');
    expect(
      await fails(m.client.rpc('buy_cosmetic', { p_room: room.id, p_code: 'cap:wizard' })),
    ).toBe('unknown_cosmetic');
  });

  it('the columns only hold their own slot', async () => {
    await officeRoom();
    const m = await member('K');
    const set = (row: Record<string, string>) =>
      fails(adminClient().from('room_players').update(row).eq('id', m.player.id));
    expect(await set({ cap: 'pattern:hoops' })).toMatch(/check constraint/);
    expect(await set({ celebration: 'cap:crown' })).toMatch(/check constraint/);
  });
});

describe('open_crate', () => {
  const open = (m: { client: SupabaseClient }, roomId: string) =>
    m.client.rpc('open_crate', { p_room: roomId });

  it('gives an item you do not own for exactly the crate price, once', async () => {
    const { room } = await officeRoom();
    const m = await richMember(400);
    const code = (await ok(open(m, room.id))) as string;
    expect(COSMETICS.map((c) => c.code)).toContain(code);
    expect(await owned(m.player.id)).toEqual([code]);
    expect(await ledger(m.player.id)).toEqual([
      { type: 'cosmetic', amount: -CRATE_PRICE, race_id: null },
    ]);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(500 - CRATE_PRICE);
  });

  it('never returns an owned item; with nothing left it fails without a debit', async () => {
    const { room } = await officeRoom();
    const m = await richMember(1000);
    const last = 'celebration:cannon'; // the rarest, so only "not owned" explains the pick
    await ok(
      adminClient()
        .from('player_cosmetics')
        .insert(
          COSMETICS.filter((c) => c.code !== last).map((c) => ({
            player_id: m.player.id,
            code: c.code,
          })),
        ),
    );
    expect(await ok(open(m, room.id))).toBe(last);
    expect(await fails(open(m, room.id))).toBe('nothing_left');
    expect(await ledger(m.player.id)).toHaveLength(1);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(1100 - CRATE_PRICE);
  });

  it('not enough coins fails without a debit or an item', async () => {
    const { room } = await officeRoom();
    const m = await richMember(CRATE_PRICE - 101); // CRATE_PRICE - 1 in all
    expect(await fails(open(m, room.id))).toBe('not_enough_coins');
    expect(await owned(m.player.id)).toEqual([]);
    expect(await balanceOf(m.client, room.id, m.player.id)).toBe(CRATE_PRICE - 1);
  });

  it('only in the LOBBY', async () => {
    const r = await officeRoom();
    const m = await richMember(500);
    const b = await member('B');
    await officeRace(r, [m, b], [m.player.id, b.player.id], {
      shop: async () => expect(await fails(open(m, r.room.id))).toBe('wrong_phase'),
    });
    expect(await owned(m.player.id)).toEqual([]);
    expect(await ledger(m.player.id)).toEqual([]);
  });

  it('a private room fails; non-members cannot open', async () => {
    const host = await anonClient();
    const room = await ok(host.rpc('create_room', {}));
    const phone = await anonClient();
    await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    expect(await fails(phone.rpc('open_crate', { p_room: room.id }))).toBe('office_only');
    const office = await officeRoom();
    const stranger = await anonClient();
    expect(await fails(stranger.rpc('open_crate', { p_room: office.room.id }))).toBe('not_in_room');
  });

  it('over many opens the pick follows 1/price (loose chi-square)', async () => {
    const { room } = await officeRoom();
    const OPENS = 400;
    const m = await richMember(OPENS * CRATE_PRICE - 100); // exactly OPENS crates with the starting 100
    const counts = new Map<string, number>();
    for (let n = 0; n < OPENS; n++) {
      const code = (await ok(open(m, room.id))) as string;
      counts.set(code, (counts.get(code) ?? 0) + 1);
      // Forget it again, so every open draws from the whole catalogue.
      await ok(
        adminClient().from('player_cosmetics').delete().eq('player_id', m.player.id).select(),
      );
    }
    const total = COSMETICS.reduce((s, c) => s + 1 / c.price, 0);
    let chi = 0;
    for (const c of COSMETICS) {
      const expected = (OPENS * (1 / c.price)) / total;
      chi += ((counts.get(c.code) ?? 0) - expected) ** 2 / expected;
    }
    // 20 degrees of freedom: p = 0.001 sits at 45.3, so 60 only trips on a broken weighting
    // (a uniform pick scores well over 100 here), not on bad luck.
    expect(chi).toBeLessThan(60);
    const celebrations = COSMETICS.filter((c) => c.slot === 'celebration').reduce(
      (s, c) => s + (counts.get(c.code) ?? 0),
      0,
    );
    expect(celebrations / OPENS).toBeGreaterThan(0.02); // expected ~8%
    expect(celebrations / OPENS).toBeLessThan(0.16);
  }, 180_000);
});
