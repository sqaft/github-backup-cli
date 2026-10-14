import { sleep as defaultSleep } from "./time.js";

export interface RetryOptions {
  /** Wait before each retry; the number of entries is the number of retries. */
  delaysMs: readonly number[];
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  onRetry?: (error: unknown, attempt: number) => void;
}

/** Runs `fn`, retrying after each configured delay. Aborting stops further attempts. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = options.delaysMs[attempt];
      if (delay === undefined || options.signal?.aborted) throw err;
      options.onRetry?.(err, attempt + 1);
      await sleep(delay, options.signal);
    }
  }
}

/**
 * Runs `fn` over `items` with at most `limit` in flight. Results keep the input order.
 * After `signal` aborts no new item starts, and only started items appear in the result.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const done: Array<{ index: number; result: R }> = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const index = next++;
      done.push({ index, result: await fn(items[index] as T) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return done.sort((a, b) => a.index - b.index).map((entry) => entry.result);
}
