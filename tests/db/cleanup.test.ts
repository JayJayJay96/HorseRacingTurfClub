import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';

describe('cleanup_rooms', () => {
  it('deletes rooms idle for over 24 h with their roster, and keeps fresh ones', async () => {
    const admin = adminClient();
    const host = await anonClient();
    const stale = await ok(host.rpc('create_room', {}));
    const fresh = await ok(host.rpc('create_room', {}));
    await ok(host.rpc('add_player', { p_room: stale.id, p_name: 'Siti' }));
    const dayAgo = new Date(Date.now() - 25 * 3600_000).toISOString();
    await ok(admin.from('rooms').update({ last_activity_at: dayAgo }).eq('id', stale.id).select());

    await ok(admin.rpc('cleanup_rooms'));

    const rooms = await ok(admin.from('rooms').select('id').in('id', [stale.id, fresh.id]));
    expect(rooms.map((r: { id: string }) => r.id)).toEqual([fresh.id]);
    expect(await ok(admin.from('room_players').select('id').eq('room_id', stale.id))).toHaveLength(0);
  });

  it('cannot be called by players', async () => {
    const host = await anonClient();
    expect(await fails(host.rpc('cleanup_rooms'))).toMatch(/permission denied/);
  });
});
