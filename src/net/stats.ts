import { useCallback, useEffect, useRef, useState } from 'react';
import { BADGES, type BadgeCode } from '../history/badges.ts';
import { errorText } from './rooms.ts';
import { supabase } from './supabase.ts';

export type StatMember = {
  id: string;
  name: string;
  horse_name: string | null;
  coat: number | null;
  silk: number | null;
};
export type Ranked = { id: string; value: number; at?: string };
export type HorseRecord = {
  id: string;
  races: number;
  wins: number;
  places: number;
  last5: number[];
};
export type OfficeStats = {
  members: StatMember[];
  richest: Ranked[];
  biggest_payout: Ranked[];
  biggest_loss: Ranked[];
  best_profit: Ranked[];
  horses: HorseRecord[];
  badges: { id: string; badge: BadgeCode; at: string }[];
  recent: {
    race: string;
    at: string;
    prize: string;
    length: string;
    podium: string[];
    replay: boolean;
    track: string;
  }[];
};

/** Null when this device isn't in the office (sign in on a phone, or unlock the big screen). */
export async function fetchOfficeStats(): Promise<OfficeStats | null> {
  const { data, error } = await supabase.rpc('office_stats');
  if (error) throw new Error(error.message);
  const stats = (data ?? null) as unknown as OfficeStats | null; // jsonb built in SQL (office_stats)
  // A badge added by a newer migration than this client knows is skipped, not crashed on.
  return stats && { ...stats, badges: stats.badges.filter((b) => b.badge in BADGES) };
}

/** Loads stats when `enabled`, again whenever `key` changes (e.g. the room phase). */
export function useOfficeStats(key: unknown = 0, enabled = true) {
  const [stats, setStats] = useState<OfficeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(0);
  const load = useCallback(() => {
    // Only the newest request may update state (phase changes can overlap).
    const ticket = ++latest.current;
    fetchOfficeStats().then(
      (s) => {
        if (ticket !== latest.current) return;
        setStats(s);
        setError(null);
        setLoaded(true);
      },
      (e: unknown) => {
        if (ticket !== latest.current) return;
        setError(errorText(e));
        setLoaded(true);
      },
    );
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [load, key, enabled]);
  return { stats, error, loaded, reload: load };
}
