/**
 * Shared in-flight dedup + short-TTL cache for read-only backend queries.
 *
 * Several components on the same screen (Home, nav bars, popovers) instantiate
 * the same hooks, each firing identical queries. This helper makes concurrent
 * identical reads share a single network request and caches the result for a
 * few seconds, so N hook instances cost 1 query.
 *
 * Only use for reads where a few seconds of staleness is acceptable. After a
 * mutation that changes the underlying data, call invalidateSharedFetch with
 * the key (or prefix) before refreshing.
 */

type CacheEntry = { expires: number; value: unknown };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export async function sharedFetch<T>(
  key: string,
  ttlMs: number,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const self: { p?: Promise<T> } = {};
  const promise: Promise<T> = (async () => {
    try {
      const value = await fn();
      // Only cache if not invalidated while in flight.
      if (inflight.get(key) === self.p) cache.set(key, { expires: Date.now() + ttlMs, value });
      return value;
    } finally {
      if (inflight.get(key) === self.p) inflight.delete(key);
    }
  })();

  self.p = promise;
  inflight.set(key, promise);
  // A rejected shared promise must not poison the cache for later callers.
  promise.catch(() => cache.delete(key));
  return promise;
}

/** Drop cached entries whose key starts with the given prefix. */
export function invalidateSharedFetch(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  // Also detach in-flight reads that may predate the change, so the next
  // caller starts a fresh request instead of reusing a stale one.
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}
