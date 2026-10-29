import { describe, it } from 'vitest';
import { anonClient, ok } from './helpers.ts';

describe('realtime', () => {
  it('pushes roster inserts to the room host', async () => {
    const host = await anonClient();
    const room = await ok(host.rpc('create_room', {}));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no realtime event within 10 s')), 10_000);
      host
        .channel(`test:${room.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'room_players',
            filter: `room_id=eq.${room.id}`,
          },
          () => {
            clearTimeout(timer);
            resolve();
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
          if (status !== 'SUBSCRIBED') return;
          // Postgres Changes can drop events in the first moments after SUBSCRIBED.
          setTimeout(() => {
            ok(host.rpc('add_player', { p_room: room.id, p_name: 'Siti' })).catch(reject);
          }, 500);
        });
    });
    await host.removeAllChannels();
  });
});
