import { useCallback, useEffect, useRef, useState } from 'react';
import { coalesce } from './coalesce.ts';
import { errorText, fetchRoom, type RoomState } from './rooms.ts';
import { supabase } from './supabase.ts';

/**
 * Live room state. Refetches the whole room on Postgres changes (rooms are tiny; a burst of
 * changes coalesces into one fetch) and right away on (re)subscribe, so missed events heal
 * themselves. `presenceKey` (a phone's player id) marks that phone online; the big screen passes
 * none and only listens.
 */
export function useRoom(code: string, presenceKey?: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    // Refetches can overlap (subscribe, events, after an action); only the newest one may apply.
    const seq = ++latest.current;
    try {
      const next = await fetchRoom(code);
      if (seq !== latest.current) return;
      if (next) {
        loaded.current = true;
        setState(next);
        setError(null);
      } else setError(errorText('room_not_found'));
    } catch (e) {
      if (seq !== latest.current) return;
      // After the first load a failed refetch (network blip, phone asleep) keeps the last state;
      // the next change event or resubscribe retries.
      if (!loaded.current) setError(errorText(e));
    }
  }, [code]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const roomId = state?.room.id;
  useEffect(() => {
    if (!roomId) return;
    const changed = coalesce(refresh);
    const channel = supabase.channel(
      `room:${roomId}`,
      presenceKey ? { config: { presence: { key: presenceKey } } } : undefined,
    );
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        changed.schedule,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        changed.schedule,
      )
      // Unfiltered on purpose: a removed phone is no longer a member, so RLS hides everything else from it.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'room_players' },
        (payload) => {
          if (presenceKey && payload.old.id === presenceKey) changed.schedule();
        },
      )
      // /admin removed this phone or reset its PIN: refetch to find out (RLS now hides the room).
      .on('broadcast', { event: 'signed_out' }, ({ payload }) => {
        if (presenceKey && payload?.player === presenceKey) changed.schedule();
      })
      .on('presence', { event: 'sync' }, () =>
        setOnline(new Set(Object.keys(channel.presenceState()))),
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (presenceKey) void channel.track({});
        void refresh();
      });
    return () => {
      changed.cancel();
      void supabase.removeChannel(channel);
    };
  }, [roomId, presenceKey, refresh]);

  return { state, online, error, refresh };
}
