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

  match(key: Key): Promise<Response | undefined> {
    const stored = this.entries.get(this.resolve(key));
    return Promise.resolve(
      stored &&
        new Response(stored.body.slice(0), { status: stored.status, headers: stored.headers }),
    );
  }

  async put(key: Key, response: Response): Promise<void> {
    if (this.failPut) throw new Error('QuotaExceededError (fake)');
    const body = await response.arrayBuffer();
    this.entries.set(this.resolve(key), {
      body,
      status: response.status,
      headers: [...response.headers],
    });
  }

  delete(key: Key): Promise<boolean> {
    return Promise.resolve(this.entries.delete(this.resolve(key)));
  }

  keys(): Promise<{ url: string }[]> {
    return Promise.resolve([...this.entries.keys()].map((url) => ({ url })));
  }
}

export class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>();
  /** Set on a cache the moment it is created, e.g. to make its put() fail. */
  onCreate: ((name: string, cache: FakeCache) => void) | undefined;

  constructor(private readonly base: string) {}

  open(name: string): Promise<FakeCache> {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new FakeCache(this.base);
      this.stores.set(name, cache);
      this.onCreate?.(name, cache);
    }
    return Promise.resolve(cache);
  }

  has(name: string): Promise<boolean> {
    return Promise.resolve(this.stores.has(name));
  }

  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.stores.delete(name));
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.stores.keys()]);
  }
}
