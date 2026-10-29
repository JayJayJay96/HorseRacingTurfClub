import { describe, expect, it } from 'vitest';
import { anonClient, fails, ok } from './helpers.ts';

async function newRoom() {
  const host = await anonClient();
  const room = await ok(host.rpc('create_room', {}));
  return { host, room };
}

describe('add_player', () => {
  it('adds an unticked name with no phone', async () => {
    const { host, room } = await newRoom();
    const p = await ok(host.rpc('add_player', { p_room: room.id, p_name: ' Siti ' }));
    expect(p).toMatchObject({ room_id: room.id, name: 'Siti', uid: null, ticked: false });
  });

  it('rejects duplicates, bad names and non-hosts', async () => {
    const { host, room } = await newRoom();
    const phone = await anonClient();
    await ok(host.rpc('add_player', { p_room: room.id, p_name: 'Siti' }));
    expect(await fails(host.rpc('add_player', { p_room: room.id, p_name: 'siti' }))).toBe('name_taken');
    expect(await fails(host.rpc('add_player', { p_room: room.id, p_name: '' }))).toBe('bad_name');
    expect(await fails(phone.rpc('add_player', { p_room: room.id, p_name: 'Bob' }))).toBe('not_host');
  });

  it('lets a phone claim a host-typed name', async () => {
    const { host, room } = await newRoom();
    const typed = await ok(host.rpc('add_player', { p_room: room.id, p_name: 'Siti' }));
    const phone = await anonClient();
    const me = await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'SITI' }));
    const { data } = await phone.auth.getUser();
    expect(me.id).toBe(typed.id);
    expect(me.uid).toBe(data.user!.id);
    expect(me.name).toBe('Siti');
  });
});

describe('set_ticked', () => {
  it('lets the host tick and untick', async () => {
    const { host, room } = await newRoom();
    const p = await ok(host.rpc('add_player', { p_room: room.id, p_name: 'Siti' }));
    await ok(host.rpc('set_ticked', { p_player: p.id, p_ticked: true }));
    const [row] = await ok(host.from('room_players').select('ticked').eq('id', p.id));
    expect(row.ticked).toBe(true);
    await ok(host.rpc('set_ticked', { p_player: p.id, p_ticked: false }));
    const [after] = await ok(host.from('room_players').select('ticked').eq('id', p.id));
    expect(after.ticked).toBe(false);
  });

  it('refuses non-hosts, including the player themself', async () => {
    const { room } = await newRoom();
    const phone = await anonClient();
    const me = await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    expect(await fails(phone.rpc('set_ticked', { p_player: me.id, p_ticked: true }))).toBe('not_host');
  });

  it('caps the field at 22 horses', async () => {
    const { host, room } = await newRoom();
    for (let i = 1; i <= 23; i++) {
      const p = await ok(host.rpc('add_player', { p_room: room.id, p_name: `Horse ${i}` }));
      if (i <= 22) await ok(host.rpc('set_ticked', { p_player: p.id, p_ticked: true }));
      else expect(await fails(host.rpc('set_ticked', { p_player: p.id, p_ticked: true }))).toBe('field_full');
    }
  });
});

describe('remove_player', () => {
  it('removes an entry; only the host may', async () => {
    const { host, room } = await newRoom();
    const phone = await anonClient();
    const me = await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    expect(await fails(phone.rpc('remove_player', { p_player: me.id }))).toBe('not_host');
    await ok(host.rpc('remove_player', { p_player: me.id }));
    expect(await ok(host.from('room_players').select('id').eq('room_id', room.id))).toHaveLength(0);
    // The removed phone is no longer a member, so it can't see the room.
    expect(await ok(phone.from('rooms').select('id').eq('id', room.id))).toHaveLength(0);
  });

  it('reports a player removed twice', async () => {
    const { host, room } = await newRoom();
    const p = await ok(host.rpc('add_player', { p_room: room.id, p_name: 'Siti' }));
    await ok(host.rpc('remove_player', { p_player: p.id }));
    expect(await fails(host.rpc('remove_player', { p_player: p.id }))).toBe('player_not_found');
  });

  it('reports unknown players', async () => {
    const { host } = await newRoom();
    expect(
      await fails(host.rpc('remove_player', { p_player: '00000000-0000-0000-0000-000000000000' })),
    ).toBe('player_not_found');
  });
});

describe('update_room_settings', () => {
  it('changes length and prize', async () => {
    const { host, room } = await newRoom();
    const next = await ok(
      host.rpc('update_room_settings', { p_room: room.id, p_length: 'long', p_prize: ' Kopi ' }),
    );
    expect(next).toMatchObject({ race_length: 'long', prize: 'Kopi' });
  });

  it('keeps the current value for a null argument', async () => {
    const { host, room } = await newRoom();
    await ok(host.rpc('update_room_settings', { p_room: room.id, p_length: null, p_prize: 'Kopi' }));
    const a = await ok(host.rpc('update_room_settings', { p_room: room.id, p_length: 'long', p_prize: null }));
    expect(a).toMatchObject({ race_length: 'long', prize: 'Kopi' });
    const b = await ok(host.rpc('update_room_settings', { p_room: room.id, p_length: null, p_prize: 'Teh' }));
    expect(b).toMatchObject({ race_length: 'long', prize: 'Teh' });
  });

  it('validates and refuses non-hosts', async () => {
    const { host, room } = await newRoom();
    const phone = await anonClient();
    await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    const args = { p_room: room.id, p_length: 'short', p_prize: '' };
    expect(await fails(host.rpc('update_room_settings', { ...args, p_length: 'x' }))).toBe('bad_length');
    expect(await fails(host.rpc('update_room_settings', { ...args, p_prize: 'x'.repeat(61) }))).toBe(
      'prize_too_long',
    );
    expect(await fails(phone.rpc('update_room_settings', args))).toBe('not_host');
  });
});
