import { useEffect, useState } from 'react';

/** Whole seconds until `endsAt` (ISO), ticking twice a second; 0 once passed or when null. */
export function useSecondsLeft(endsAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)) : 0;
}
