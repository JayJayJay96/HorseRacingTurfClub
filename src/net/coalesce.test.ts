import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalesce } from './coalesce.ts';

/** A run() whose promise we settle by hand, to hold a fetch "in flight". */
function deferredRun() {
  const pending: (() => void)[] = [];
  const run = vi.fn(() => new Promise<void>((resolve) => pending.push(resolve)));
  const finish = async () => {
    pending.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { run, finish };
}

describe('coalesce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns a burst into one trailing run after the delay', async () => {
    const { run } = deferredRun();
    const c = coalesce(run, 150);
    for (let i = 0; i < 10; i++) c.schedule();
    await vi.advanceTimersByTimeAsync(149);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps one run in flight and runs once more for changes during it', async () => {
    const { run, finish } = deferredRun();
    const c = coalesce(run, 150);
    c.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(run).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) {
      c.schedule();
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(run).toHaveBeenCalledTimes(1);
    await finish();
    await vi.advanceTimersByTimeAsync(150);
    expect(run).toHaveBeenCalledTimes(2);
    await finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not run again when nothing changed during the flight', async () => {
    const { run, finish } = deferredRun();
    const c = coalesce(run, 150);
    c.schedule();
    await vi.advanceTimersByTimeAsync(150);
    await finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancel drops a pending run', async () => {
    const { run } = deferredRun();
    const c = coalesce(run, 150);
    c.schedule();
    c.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).not.toHaveBeenCalled();
  });
});
