import { describe, expect, it } from 'vitest';
import { anonClient, fails, ok } from './helpers.ts';

/** Room with two ticked horses: phone-owned "Ali" and host-typed "Siti". */
async function readyRoom() {
  const host = await anonClient();
  const room = await ok(host.rpc('create_room', {}));
  const phone = await anonClient();
  const ali = await ok(phone.rpc('join_room', { p_code: room.code, p_name: 'Ali' }));
  const siti = await ok(host.rpc('add_player', { p_room: room.id, p_name: 'Siti' }));
  return { host, phone, room, ali, siti };
}

describe('set_phase', () => {
  it('opens the shop only with at least 2 ticked horses', async () => {
    const { host, room, ali, siti } = await readyRoom();
    await ok(host.rpc('set_ticked', { p_player: ali.id, p_ticked: true }));
    expect(await fails(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }))).toBe(
      'need_two_horses',
    );
    await ok(host.rpc('set_ticked', { p_player: siti.id, p_ticked: true }));
    const shop = await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(shop.phase).toBe('SHOP');
  });

  it('allows only the Phase 2 transitions', async () => {
    const { host, room } = await readyRoom();
    for (const phase of ['LOBBY', 'ODDS_LOCKED', 'BETTING', 'RUNNING', 'PODIUM', 'NOPE']) {
      expect(await fails(host.rpc('set_phase', { p_room: room.id, p_phase: phase }))).toBe(
        'bad_transition',
      );
    }
  });

  it('refuses non-hosts', async () => {
    const { phone, room } = await readyRoom();
    expect(await fails(phone.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }))).toBe(
      'not_host',
    );
  });

  it('freezes lobby actions while the shop is open', async () => {
    const { host, room, ali, siti } = await readyRoom();
    await ok(host.rpc('set_ticked', { p_player: ali.id, p_ticked: true }));
    await ok(host.rpc('set_ticked', { p_player: siti.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    expect(await fails(host.rpc('set_ticked', { p_player: ali.id, p_ticked: false }))).toBe(
      'wrong_phase',
    );
    expect(await fails(host.rpc('add_player', { p_room: room.id, p_name: 'Bob' }))).toBe(
      'wrong_phase',
    );
    expect(await fails(host.rpc('remove_player', { p_player: siti.id }))).toBe('wrong_phase');
    expect(
      await fails(
        host.rpc('update_room_settings', { p_room: room.id, p_length: 'long', p_prize: '' }),
      ),
    ).toBe('wrong_phase');
  });
});

describe('set_ready', () => {
  it('works only in SHOP, and phase changes clear it', async () => {
    const { host, phone, room, ali, siti } = await readyRoom();
    expect(await fails(phone.rpc('set_ready', { p_room: room.id, p_ready: true }))).toBe(
      'wrong_phase',
    );

    await ok(host.rpc('set_ticked', { p_player: ali.id, p_ticked: true }));
    await ok(host.rpc('set_ticked', { p_player: siti.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    await ok(phone.rpc('set_ready', { p_room: room.id, p_ready: true }));
    const [row] = await ok(phone.from('room_players').select('ready').eq('id', ali.id));
    expect(row.ready).toBe(true);

    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'LOBBY' }));
    const [after] = await ok(phone.from('room_players').select('ready').eq('id', ali.id));
    expect(after.ready).toBe(false);
  });

  it('rejects devices not in the room', async () => {
    const { host, room, ali, siti } = await readyRoom();
    await ok(host.rpc('set_ticked', { p_player: ali.id, p_ticked: true }));
    await ok(host.rpc('set_ticked', { p_player: siti.id, p_ticked: true }));
    await ok(host.rpc('set_phase', { p_room: room.id, p_phase: 'SHOP' }));
    const stranger = await anonClient();
    expect(await fails(stranger.rpc('set_ready', { p_room: room.id, p_ready: true }))).toBe(
      'not_in_room',
    );
  });
});

describe('join_room outside the lobby', () => {
  async function shopRoom() {
    const r = await readyRoom();
    await ok(r.host.rpc('set_ticked', { p_player: r.ali.id, p_ticked: true }));
    await ok(r.host.rpc('set_ticked', { p_player: r.siti.id, p_ticked: true }));
    await ok(r.host.rpc('set_phase', { p_room: r.room.id, p_phase: 'SHOP' }));
    return r;
  }

  it('refuses new names after the lobby but lets a phone claim a pre-entered horse', async () => {
    const { room, siti } = await shopRoom();
    const late = await anonClient();
    expect(await fails(late.rpc('join_room', { p_code: room.code, p_name: 'Bob' }))).toBe(
      'wrong_phase',
    );
    const claimed = await ok(late.rpc('join_room', { p_code: room.code, p_name: 'siti' }));
    expect(claimed.id).toBe(siti.id);
  });

  it('still lets a known device rejoin', async () => {
    const { phone, room, ali } = await shopRoom();
    const again = await ok(phone.rpc('join_room', { p_code: room.code, p_name: '' }));
    expect(again.id).toBe(ali.id);
  });
});
