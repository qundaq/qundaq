// Minimal in-memory Cache Storage for unit tests. Keys are resolved against a base URL
// the way the browser resolves them against the page or service-worker URL.
type Key = string | { url: string };

interface Stored {
  body: ArrayBuffer;
  status: number;
  headers: [string, string][];
}

export class FakeCache {
  readonly entries = new Map<string, Stored>();
  failPut = false;

  constructor(private readonly base: string) {}

  resolve(key: Key): string {
    return new URL(typeof key === 'string' ? key : key.url, this.base).href;
  }

  async match(key: Key, _options?: unknown): Promise<Response | undefined> {
    const stored = this.entries.get(this.resolve(key));
    return stored && new Response(stored.body.slice(0), { status: stored.status, headers: stored.headers });
  }

  async put(key: Key, response: Response): Promise<void> {
    if (this.failPut) throw new Error('QuotaExceededError (fake)');
    const body = await response.arrayBuffer();
    this.entries.set(this.resolve(key), { body, status: response.status, headers: [...response.headers] });
  }

  async delete(key: Key): Promise<boolean> {
    return this.entries.delete(this.resolve(key));
  }

  async keys(): Promise<{ url: string }[]> {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
}

export class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>();
  /** Set on a cache the moment it is created, e.g. to make its put() fail. */
  onCreate: ((name: string, cache: FakeCache) => void) | undefined;

  constructor(private readonly base: string) {}

  async open(name: string): Promise<FakeCache> {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new FakeCache(this.base);
      this.stores.set(name, cache);
      this.onCreate?.(name, cache);
    }
    return cache;
  }

  async has(name: string): Promise<boolean> {
    return this.stores.has(name);
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
}
