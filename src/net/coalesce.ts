/**
 * Turns bursts of `schedule()` into one trailing `run()` after `ms`. At most one run is in flight;
 * a schedule during a run queues exactly one more after it.
 */
export function coalesce(run: () => Promise<unknown>, ms = 150) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let again = false;

  const fire = async () => {
    timer = undefined;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      await run();
    } finally {
      busy = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    timer ??= setTimeout(() => void fire(), ms);
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    again = false;
  };
  return { schedule, cancel };
}
