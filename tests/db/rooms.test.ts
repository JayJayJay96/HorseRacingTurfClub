import { describe, expect, it } from 'vitest';
import { anonClient, fails, guestClient, ok } from './helpers.ts';

async function newRoom() {
  const host = await anonClient();
  const room = await ok(host.rpc('create_room', {}));
  return { host, room };
}

describe('create_room', () => {
  it('creates a LOBBY room with a 4-character code owned by the caller', async () => {
    const host = await anonClient();
    const room = await ok(host.rpc('create_room', { p_length: 'long', p_prize: '  Lunch pick ' }));
    const { data } = await host.auth.getUser();
    expect(room.code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/);
    expect(room).toMatchObject({
      phase: 'LOBBY',
      race_length: 'long',
      prize: 'Lunch pick',
      host_uid: data.user!.id,
    });
  });

  it('defaults to a short race with no prize', async () => {
    const { room } = await newRoom();
    expect(room).toMatchObject({ race_length: 'short', prize: '' });
  });

  it('rejects a bad length and a long prize', async () => {
    const host = await anonClient();
    expect(await fails(host.rpc('create_room', { p_length: 'medium' }))).toBe('bad_length');
    expect(await fails(host.rpc('create_room', { p_prize: 'x'.repeat(61) }))).toBe('prize_too_long');
  });

  it('refuses devices that are not signed in', async () => {
    expect(await fails(guestClient().rpc('create_room', {}))).toMatch(/permission denied/);
  });
});

describe('join_room', () => {
  it('joins by code in any case and trims the name', async () => {
    const { room } = await newRoom();
    const phone = await anonClient();
    const me = await ok(
      phone.rpc('join_room', { p_code: ` ${room.code.toLowerCase()} `, p_name: ' Ali ' }),
    );
    expect(me).toMatchObject({ room_id: room.id, name: 'Ali', ticked: false, ready: false });
  });

  it('returns the existing entry when the same device joins again', async () => {
    const { room } = await newRoom();
    const phone = await anonClient();
    const first = await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    const again = await ok(phone.rpc('join_room', { p_code: room.code, p_name: '' }));
    expect(again.id).toBe(first.id);
  });

  it('rejects unknown codes, bad names and taken names', async () => {
    const { room } = await newRoom();
    const a = await anonClient();
    const b = await anonClient();
    expect(await fails(a.rpc('join_room', { p_code: '0000', p_name: 'Ali' }))).toBe('room_not_found');
    expect(await fails(a.rpc('join_room', { p_code: room.code, p_name: '  ' }))).toBe('bad_name');
    expect(await fails(a.rpc('join_room', { p_code: room.code, p_name: 'x'.repeat(25) }))).toBe(
      'bad_name',
    );
    await ok(a.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
    expect(await fails(b.rpc('join_room', { p_code: room.code, p_name: 'ALI' }))).toBe('name_taken');
  });
});

describe('room visibility (RLS)', () => {
  it('shows a room and its roster to members only', async () => {
    const { host, room } = await newRoom();
    const phone = await anonClient();
    const outsider = await anonClient();
    await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));

    for (const member of [host, phone]) {
      expect(await ok(member.from('rooms').select('id').eq('id', room.id))).toHaveLength(1);
      expect(await ok(member.from('room_players').select('id').eq('room_id', room.id))).toHaveLength(1);
    }
    expect(await ok(outsider.from('rooms').select('id').eq('id', room.id))).toHaveLength(0);
    expect(await ok(outsider.from('room_players').select('id').eq('room_id', room.id))).toHaveLength(0);
  });

  it('blocks direct writes', async () => {
    const { host, room } = await newRoom();
    await host.from('rooms').update({ phase: 'PODIUM' }).eq('id', room.id);
    const [row] = await ok(host.from('rooms').select('phase').eq('id', room.id));
    expect(row.phase).toBe('LOBBY');
    expect(
      await fails(host.from('room_players').insert({ room_id: room.id, name: 'Sneaky' })),
    ).toMatch(/permission denied|row-level security/);
  });
});
