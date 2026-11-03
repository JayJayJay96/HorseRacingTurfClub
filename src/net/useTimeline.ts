import { useEffect, useState } from 'react';
import type { Timeline } from '../sim/types.ts';
import { errorText, fetchTimeline } from './rooms.ts';

const RETRY_MS = 2000;

/** Loads a race's Timeline once (pass null to skip). Retries while it fails or isn't written yet. */
export function useTimeline(raceId: string | null) {
  const [loaded, setLoaded] = useState<{ raceId: string; timeline: Timeline } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!raceId) return;
    let live = true;
    let timer = 0;
    const load = () =>
      fetchTimeline(raceId).then(
        (timeline) => {
          if (!live) return;
          if (timeline) setLoaded({ raceId, timeline });
          else timer = window.setTimeout(load, RETRY_MS);
        },
        (e: unknown) => {
          if (!live) return;
          setError(errorText(e));
          timer = window.setTimeout(load, RETRY_MS);
        },
      );
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [raceId]);
  const timeline = loaded?.raceId === raceId ? loaded.timeline : null;
  return { timeline, error: timeline ? null : error };
}
