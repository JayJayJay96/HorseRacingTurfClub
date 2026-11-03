import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';
import { officeRow } from './officeFixtures.ts';
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
