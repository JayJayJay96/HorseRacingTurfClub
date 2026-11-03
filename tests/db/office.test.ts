import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { balanceOf, member, officeRoom, officeRow } from './officeFixtures.ts';
import { balance, shopRoom } from './raceFixtures.ts';

describe('office room', () => {
  it('exists once, code TURF, and survives cleanup', async () => {
    const admin = adminClient();
    const rows = await ok(admin.from('rooms').select('code, kind').eq('kind', 'office'));
    expect(rows).toEqual([{ code: 'TURF', kind: 'office' }]);
    const room = await officeRow();
    await ok(
      admin.from('rooms').update({ last_activity_at: '2000-01-01T00:00:00Z' }).eq('id', room.id),
    );
    await ok(admin.rpc('cleanup_rooms'));
    expect(await ok(admin.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
  });

  it('refuses host actions while it has no host (null host_uid is nobody)', async () => {
    const room = await officeRow();
    await ok(adminClient().from('rooms').update({ host_uid: null }).eq('id', room.id));
    const stranger = await anonClient();
    expect(await fails(stranger.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }))).toBe(
      'not_host',
    );
    expect(
      await fails(stranger.rpc('update_room_settings', { p_room: room.id, p_prize: 'x' })),
    ).toBe('not_host');
  });

  it('accepts ledger rows without a race only as topup or reasoned admin_adjust', async () => {
    const admin = adminClient();
    const room = await officeRow();
    const [p] = await ok(
      admin
        .from('room_players')
        .insert({ room_id: room.id, name: `L${Date.now()}` })
        .select('id'),
    );
    const row = (type: string, reason: string | null) => ({
      room_id: room.id,
      player_id: (p as { id: string }).id,
      type,
      amount: 5,
      reason,
    });
    await ok(admin.from('coin_ledger').insert(row('topup', null)));
    await ok(admin.from('coin_ledger').insert(row('admin_adjust', 'prize money')));
    expect(await fails(admin.from('coin_ledger').insert(row('admin_adjust', null)))).toMatch(
      /check/,
    );
    expect(await fails(admin.from('coin_ledger').insert(row('payout', 'why')))).toMatch(/check/);
  });

  it('room_balances: members see everyone, outsiders see nothing; Private stays per race', async () => {
    const r = await shopRoom();
    const rows = await ok(r.ali.client.rpc('room_balances', { p_room: r.room.id }));
    expect(rows).toContainEqual({ player_id: r.ali.player.id, balance: 100 });
    expect(await balance(r.ali.client, r.raceId, r.ali.player.id)).toBe(100);
    const stranger = await anonClient();
    expect(await ok(stranger.rpc('room_balances', { p_room: r.room.id }))).toEqual([]);
  });
});

describe('office login', () => {
  it('first login sets the PIN; later logins check it', async () => {
    const m = await member('P', '4321');
    const roster = (await ok(m.client.rpc('office_roster'))) as { id: string; has_pin: boolean }[];
    expect(roster).toContainEqual({ id: m.player.id, name: m.name, has_pin: true });
    const other = await anonClient();
    expect(
      await ok(other.rpc('office_login', { p_player: m.player.id, p_pin: '0000' })),
    ).toBeNull();
    const again = await ok(other.rpc('office_login', { p_player: m.player.id, p_pin: '4321' }));
    expect(again.id).toBe(m.player.id);
  });

  it('moves the member to the new phone; the old phone loses the room', async () => {
    const m = await member('D');
    const room = await officeRow();
    const phone2 = await anonClient();
    await ok(phone2.rpc('office_login', { p_player: m.player.id, p_pin: '1234' }));
    expect(await ok(m.client.from('rooms').select('id').eq('id', room.id))).toEqual([]);
    expect(await ok(phone2.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
  });

  it('locks a name for 5 minutes after 5 wrong PINs', async () => {
    const m = await member('K');
    const phone = await anonClient();
    for (let i = 0; i < 5; i++) {
      expect(
        await ok(phone.rpc('office_login', { p_player: m.player.id, p_pin: '9999' })),
      ).toBeNull();
    }
    expect(await fails(phone.rpc('office_login', { p_player: m.player.id, p_pin: '1234' }))).toBe(
      'pin_locked',
    );
  });

  it('rejects malformed PINs and Private-style joins', async () => {
    const m = await member('B');
    const phone = await anonClient();
    expect(await fails(phone.rpc('office_login', { p_player: m.player.id, p_pin: '12a4' }))).toBe(
      'bad_pin',
    );
    expect(await fails(phone.rpc('join_room', { p_code: 'TURF', p_name: 'Someone' }))).toBe(
      'office_room',
    );
    // A signed-in member's rejoin probe still returns their entry.
    expect((await ok(m.client.rpc('join_room', { p_code: 'TURF', p_name: '' }))).id).toBe(
      m.player.id,
    );
  });

  it('logout unlinks the phone', async () => {
    const m = await member('O');
    const room = await officeRow();
    await ok(m.client.rpc('office_logout', { p_room: room.id }));
    expect(await ok(m.client.from('rooms').select('id').eq('id', room.id))).toEqual([]);
  });

  it('members set their own horse in the LOBBY', async () => {
    const { room } = await officeRoom();
    const m = await member('H');
    const horse = await ok(
      m.client.rpc('set_my_horse', {
        p_room: room.id,
        p_coat: 2,
        p_silk: 9,
        p_horse_name: ' Thunder ',
      }),
    );
    expect(horse).toMatchObject({ coat: 2, silk: 9, horse_name: 'Thunder' });
    const cleared = await ok(
      m.client.rpc('set_my_horse', {
        p_room: room.id,
        p_coat: null,
        p_silk: null,
        p_horse_name: '',
      }),
    );
    expect(cleared).toMatchObject({ coat: null, silk: null, horse_name: null });
    expect(
      await fails(
        m.client.rpc('set_my_horse', { p_room: room.id, p_coat: 6, p_silk: 0, p_horse_name: '' }),
      ),
    ).toBe('bad_horse');
  });
});

describe('office race flow', () => {
  it('roster is admin-managed: no add/remove from the big screen, archived can not be ticked', async () => {
    const { host, room, admin } = await officeRoom();
    const m = await member('R');
    expect(await fails(host.rpc('add_player', { p_room: room.id, p_name: 'Zed' }))).toBe(
      'admin_only',
    );
    expect(await fails(host.rpc('remove_player', { p_player: m.player.id }))).toBe('admin_only');
    await ok(
      admin
        .from('room_players')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', m.player.id),
    );
    expect(await fails(host.rpc('set_ticked', { p_player: m.player.id, p_ticked: true }))).toBe(
      'player_not_found',
    );
  });

  it('opening the shop pays +100 to horses in the race and lifts others to 50; cancel undoes it', async () => {
    const { host, room, admin } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    const watcher = await member('W');
    // The watcher has spent down to 10.
    await ok(
      admin.from('coin_ledger').insert({
        room_id: room.id,
        player_id: watcher.player.id,
        type: 'admin_adjust',
        amount: -90,
        reason: 'test',
      }),
    );
    for (const p of [a, b])
      await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(200);
    expect(await balanceOf(a.client, room.id, watcher.player.id)).toBe(50);
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(100);
    expect(await balanceOf(a.client, room.id, watcher.player.id)).toBe(10);
  });

  it('carries coins across races and feeds history into the next race input', async () => {
    const { host, room, admin } = await officeRoom();
    const a = await member('A');
    const b = await member('B');
    for (const p of [a, b])
      await ok(host.rpc('set_ticked', { p_player: p.player.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await ok(a.client.rpc('buy_box', { p_room: room.id, p_box: 'attack' })); // 200 - 20
    const input = await ok(host.rpc('lock_odds_begin', { p_room: room.id }));
    expect(input.history).toEqual({
      [a.player.id]: { races: 0, wins: 0, top3: 0 },
      [b.player.id]: { races: 0, wins: 0, top3: 0 },
    });
    const odds = { [a.player.id]: { win: 2, place: 1.1 }, [b.player.id]: { win: 2, place: 1.1 } };
    await ok(admin.rpc('lock_odds_finish', { p_race: input.race_id, p_odds: odds }));
    await ok(host.rpc('start_race_begin', { p_room: room.id }));
    await ok(
      admin.rpc('start_race_finish', {
        p_race: input.race_id,
        p_timeline: {},
        p_finish: [a.player.id, b.player.id],
        p_seconds: 0.01,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    await ok(host.rpc('finish_race', { p_room: room.id }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(180);

    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await balanceOf(a.client, room.id, a.player.id)).toBe(280);
    const next = await ok(host.rpc('lock_odds_begin', { p_room: room.id }));
    expect(next.history[a.player.id]).toEqual({ races: 1, wins: 1, top3: 1 });
    expect(next.history[b.player.id]).toEqual({ races: 1, wins: 0, top3: 1 });
  });

  it('Private races carry no history', async () => {
    const r = await shopRoom();
    const input = await ok(r.host.rpc('lock_odds_begin', { p_room: r.room.id }));
    expect(input.history).toBeNull();
  });
});
