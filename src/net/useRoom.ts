import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText, fetchRoom, type RoomState } from './rooms.ts';
import { supabase } from './supabase.ts';

/**
 * Live room state. Refetches the whole room on any Postgres change (rooms are tiny) and on
 * (re)subscribe, so missed events heal themselves. `presenceKey` (a phone's player id) marks
 * that phone online; the big screen passes none and only listens.
 */
export function useRoom(code: string, presenceKey?: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchRoom(code);
      if (next) {
        loaded.current = true;
        setState(next);
        setError(null);
      } else setError(errorText('room_not_found'));
    } catch (e) {
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
    const channel = supabase.channel(
      `room:${roomId}`,
      presenceKey ? { config: { presence: { key: presenceKey } } } : undefined,
    );
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => void refresh(),
      )
      // Unfiltered on purpose: a removed phone is no longer a member, so RLS hides everything else from it.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'room_players' },
        (payload) => {
          if (presenceKey && payload.old.id === presenceKey) void refresh();
        },
      )
      .on('presence', { event: 'sync' }, () =>
        setOnline(new Set(Object.keys(channel.presenceState()))),
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (presenceKey) void channel.track({});
        void refresh();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, presenceKey, refresh]);

  return { state, online, error, refresh };
}
