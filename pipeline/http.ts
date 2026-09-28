// Polite HTTP access to the upstream services: requests are serialized per host,
// spaced out, and retried, so a sync run never hammers h4a or handball.net.

const lastRequest = new Map<string, Promise<unknown>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttled<T>(host: string, gapMs: number, task: () => Promise<T>): Promise<T> {
  const previous = lastRequest.get(host) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    try {
      return await task();
    } finally {
      await sleep(gapMs);
    }
  });
  lastRequest.set(host, run);
  return run;
}

export class RateLimitedError extends Error {
  constructor(url: string) {
    super(`Rate limited by ${new URL(url).host}`);
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  gapMs?: number;
  retries?: number;
}

export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const { headers = {}, gapMs = 200, retries = 4 } = options;
  const host = new URL(url).host;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await throttled(host, gapMs, () =>
        fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (HandballResults)', ...headers },
          signal: AbortSignal.timeout(20_000),
        }),
      );
      // Being rate limited means we asked too much: stop instead of retrying.
      if (res.status === 429) throw new RateLimitedError(url);
      if (res.status >= 500) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      if (err instanceof RateLimitedError) throw err;
      lastError = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { retries = 3 } = options;
  // Some upstreams answer transient failures with an HTML page and status 200,
  // so a body that is not JSON counts as a failed attempt too.
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchWithRetry(url, { ...options, retries: 0 }).catch((err) => err as Error);
    if (res instanceof RateLimitedError) throw res;
    if (res instanceof Error) {
      lastError = res;
    } else {
      const text = await res.text();
      if (/too many requests/i.test(text.slice(0, 200))) throw new RateLimitedError(url);
      try {
        return JSON.parse(text) as T;
      } catch {
        lastError = new Error(`Invalid JSON from ${url}: ${text.slice(0, 80)}`);
      }
    }
    await sleep(500 * 2 ** attempt);
  }
  throw lastError;
}
