import { useEffect, useState } from 'react';

/** Seconds since the gun at `startAtMs` (negative during the countdown), updated 4 times a second. */
export function useRaceTime(startAtMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return (now - startAtMs) / 1000;
}
