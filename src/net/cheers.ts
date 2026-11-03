import { useEffect, useRef, useState } from 'react';
import { createCheerGate, isCheer, type Cheer } from './cheerRules.ts';
import { supabase } from './supabase.ts';

export * from './cheerRules.ts';

const FLOAT_MS = 3000;
const MAX_ON_SCREEN = 12;
export type ShownCheer = Cheer & { id: number; at: number };

const channelName = (roomId: string) => `cheers:${roomId}`;

/** Phone side: fire-and-forget over HTTP. */
export async function sendCheer(roomId: string, cheer: Cheer): Promise<void> {
  const name = channelName(roomId);
  // channel() hands back the live channel when this device already listens (a racing phone):
  // only a channel made just for this send may be removed.
  const owned = !supabase.getChannels().some((c) => c.topic === `realtime:${name}`);
  const channel = supabase.channel(name);
  try {
    await channel.httpSend('cheer', cheer);
  } finally {
    if (owned) void supabase.removeChannel(channel);
  }
}

/** Big screen and racing phones: recent valid cheers from players in the room. */
export function useCheers(
  roomId: string | null,
  playerIds: ReadonlySet<string>,
  onCheer?: () => void,
) {
  const [shown, setShown] = useState<ShownCheer[]>([]);
  // Read live inside the handler, so a roster refetch doesn't resubscribe.
  const live = useRef({ playerIds, onCheer });
  useEffect(() => {
    live.current = { playerIds, onCheer };
  });
  useEffect(() => {
    if (!roomId) return;
    const gate = createCheerGate();
    // Room-wide cap: spoofed ids could otherwise flood the screen (at most 5 cheers a second).
    const roomGate = createCheerGate(200);
    let seq = 0;
    const channel = supabase
      .channel(channelName(roomId))
      .on('broadcast', { event: 'cheer' }, ({ payload }) => {
        if (!isCheer(payload) || !live.current.playerIds.has(payload.player)) return;
        const now = Date.now();
        if (!gate(payload.player, now) || !roomGate('*', now)) return;
        seq += 1;
        const id = seq;
        // Copy only the validated fields; extra payload keys are never kept.
        const cheer = { player: payload.player, emoji: payload.emoji, id, at: now };
        setShown((list) =>
          [...list.filter((c) => now - c.at < FLOAT_MS), cheer].slice(-MAX_ON_SCREEN),
        );
        live.current.onCheer?.();
      })
      .subscribe();
    const sweep = setInterval(() => {
      const now = Date.now();
      setShown((list) =>
        list.some((c) => now - c.at >= FLOAT_MS) ? list.filter((c) => now - c.at < FLOAT_MS) : list,
      );
    }, 500);
    return () => {
      clearInterval(sweep);
      void supabase.removeChannel(channel);
    };
  }, [roomId]);
  return shown;
}
