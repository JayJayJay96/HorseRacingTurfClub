import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balanceOf, member, officeRoom, officeRow } from './officeFixtures.ts';

type Overview = {
  members: {
    id: string;
    name: string;
    balance: number;
    has_pin: boolean;
    phone: boolean;
    archived: boolean;
  }[];
  races: { id: string; current: boolean; finished: boolean }[];
};

describe('admin RPCs', () => {
  it('are not callable by clients', async () => {
    const phone = await anonClient();
    const zero = '00000000-0000-0000-0000-000000000000';
    for (const call of [
      phone.rpc('admin_overview'),
      phone.rpc('admin_add_member', { p_name: 'Hack' }),
      phone.rpc('admin_claim_host', { p_uid: '00000000-0000-0000-0000-000000000000' }),
      phone.rpc('admin_adjust', { p_player: zero, p_amount: 1, p_reason: 'x' }),
      phone.rpc('admin_rename', { p_player: zero, p_name: 'x' }),
      phone.rpc('admin_archive', { p_player: zero }),
      phone.rpc('admin_reset_pin', { p_player: zero }),
      phone.rpc('admin_delete_race', { p_race: zero }),
      phone.rpc('admin_gate', { p_ok: true }),
      phone.rpc('admin_gate_reset'),
    ]) {
      expect(await fails(call)).toMatch(/permission denied/);
    }
  });

  it('admin_gate locks after 10 wrong passwords, even for the right one', async () => {
    const admin = adminClient();
    const gate = (p_ok: boolean) => ok(admin.rpc('admin_gate', { p_ok }));
    await ok(admin.rpc('admin_gate_reset'));
    try {
      for (let i = 0; i < 9; i++) expect(await gate(false)).toBe('bad_password');
      expect(await gate(true)).toBe('ok'); // resets the count
      for (let i = 0; i < 10; i++) expect(await gate(false)).toBe('bad_password');
      expect(await gate(true)).toBe('admin_locked');
      expect(await gate(false)).toBe('admin_locked');
    } finally {
      await ok(admin.rpc('admin_gate_reset')); // the admin function tests use the real password
    }
    expect(await gate(true)).toBe('ok');
  });

  it('overview lists members with balance, PIN and phone status', async () => {
    const m = await member('V');
    const o = (await ok(adminClient().rpc('admin_overview'))) as Overview;
    expect(o.members).toContainEqual(
      expect.objectContaining({
        id: m.player.id,
        name: m.name,
        balance: 100,
        has_pin: true,
        phone: true,
        archived: false,
      }),
    );
  });

  it('renames, resets a PIN, adjusts coins with a reason', async () => {
    const admin = adminClient();
    const room = await officeRow();
    const m = await member('N');
    const renamed = `${m.name}x`;
    expect(
      (await ok(admin.rpc('admin_rename', { p_player: m.player.id, p_name: renamed }))).name,
    ).toBe(renamed);
    await ok(admin.rpc('admin_reset_pin', { p_player: m.player.id }));
    const phone = await anonClient();
    // After a reset, the next login sets a new PIN.
    expect(
      await ok(phone.rpc('office_login', { p_player: m.player.id, p_pin: '7777' })),
    ).not.toBeNull();
    expect(
      await fails(
        admin.rpc('admin_adjust', { p_player: m.player.id, p_amount: 50, p_reason: ' ' }),
      ),
    ).toBe('bad_reason');
    expect(
      await fails(admin.rpc('admin_adjust', { p_player: m.player.id, p_amount: 0, p_reason: 'x' })),
    ).toBe('bad_amount');
    await ok(
      admin.rpc('admin_adjust', { p_player: m.player.id, p_amount: -30, p_reason: 'Lunch IOU' }),
    );
    expect(await balanceOf(phone, room.id, m.player.id)).toBe(70);
  });

  it('archives in the LOBBY only; the member disappears but the ledger stays', async () => {
    const { admin, host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b])
      await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await fails(admin.rpc('admin_archive', { p_player: a.player.id }))).toBe('wrong_phase');
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    await ok(admin.rpc('admin_archive', { p_player: a.player.id }));
    const roster = (await ok(b.client.rpc('office_roster'))) as { id: string }[];
    expect(roster.map((r) => r.id)).not.toContain(a.player.id);
    expect(
      await fails(a.client.rpc('office_login', { p_player: a.player.id, p_pin: '1234' })),
    ).toBe('player_not_found');
    expect(
      await ok(admin.from('coin_ledger').select('id').eq('player_id', a.player.id)),
    ).not.toEqual([]);
  });

  it('never deletes the race in progress; deletes a finished one and reverses its coins', async () => {
    const { admin, host, room } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b])
      await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await fails(admin.rpc('admin_delete_race', { p_race: shop.race_id }))).toBe(
      'race_in_use',
    );
    // Make it "finished" and leave it (PODIUM -> LOBBY keeps the race).
    await ok(
      admin
        .from('races')
        .update({ finish_order: [a.player.id, b.player.id] })
        .eq('id', shop.race_id),
    );
    await ok(admin.from('rooms').update({ phase: 'PODIUM' }).eq('id', room.id));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(200);
    await ok(admin.rpc('admin_delete_race', { p_race: shop.race_id }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(100);
    const o = (await ok(admin.rpc('admin_overview'))) as Overview;
    expect(o.races.map((r) => r.id)).not.toContain(shop.race_id);
  });

  it('claim_host moves the office to a new big screen', async () => {
    const { admin, host, room } = await officeRoom();
    const screen = await anonClient();
    const { data } = await screen.auth.getUser();
    await ok(admin.rpc('admin_claim_host', { p_uid: data.user!.id }));
    expect(await ok(screen.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
    expect(await fails(host.rpc('update_room_settings', { p_room: room.id, p_prize: 'x' }))).toBe(
      'not_host',
    );
  });
});
