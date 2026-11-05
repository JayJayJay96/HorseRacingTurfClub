import { TRACK_IDS } from '../../src/sim/track.ts';
import { describe, expect, it } from 'vitest';
import { adminClient, anonClient, fails, ok } from './helpers.ts';

/** Lobby room with two ticked host-typed horses, ready to open the shop. */
async function lobbyRoom() {
  const host = await anonClient();
  const room = await ok(host.rpc('create_room', {}));
  for (const name of ['Siti', 'Dan']) {
    const p = await ok(host.rpc('add_player', { p_room: room.id, p_name: name }));
    await ok(host.rpc('set_ticked', { p_player: p.id, p_ticked: true }));
  }
  return { host, room };
}

async function raceTrack(raceId: string) {
  const rows = await ok(adminClient().from('races').select('track').eq('id', raceId));
  return (rows as { track: string }[])[0]?.track;
}

describe('track choice', () => {
  it('defaults to oval; the host can set it and null keeps it', async () => {
    const { host, room } = await lobbyRoom();
    expect(room.track).toBe('oval');
    // Terrain tracks (migration 0024) are accepted too.
    await ok(host.rpc('update_room_settings', { p_room: room.id, p_track: 'ice' }));
    const a = await ok(host.rpc('update_room_settings', { p_room: room.id, p_track: 'kidney' }));
    expect(a.track).toBe('kidney');
    const b = await ok(host.rpc('update_room_settings', { p_room: room.id, p_prize: 'Kopi' }));
    expect(b).toMatchObject({ track: 'kidney', prize: 'Kopi' });
  });

  it('refuses bad tracks, non-hosts and non-lobby phases', async () => {
    const { host, room } = await lobbyRoom();
    const phone = await anonClient();
    await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    expect(
      await fails(host.rpc('update_room_settings', { p_room: room.id, p_track: 'moon' })),
    ).toBe('bad_track');
    expect(
      await fails(phone.rpc('update_room_settings', { p_room: room.id, p_track: 'speedway' })),
    ).toBe('not_host');
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(
      await fails(host.rpc('update_room_settings', { p_room: room.id, p_track: 'speedway' })),
    ).toBe('wrong_phase');
  });

  it("the race copies the room's track", async () => {
    const { host, room } = await lobbyRoom();
    await ok(host.rpc('update_room_settings', { p_room: room.id, p_track: 'speedway' }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await raceTrack(shop.race_id)).toBe('speedway');
  });

  it('random picks a concrete track for each race', async () => {
    const { host, room } = await lobbyRoom();
    await ok(host.rpc('update_room_settings', { p_room: room.id, p_track: 'random' }));
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 20; i++) {
      const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
      seen.add(await raceTrack(shop.race_id));
      await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    }
    for (const t of seen) expect(TRACK_IDS).toContain(t);
    expect(seen.size).toBeGreaterThan(3); // 20 draws from 10 tracks: 3 or fewer is ~1 in 10 million
  });
});
