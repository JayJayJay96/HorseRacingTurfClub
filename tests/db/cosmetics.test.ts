import { describe, expect, it } from 'vitest';
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
