// ASTRA AI — CACHE MANAGER
// TTL cache with size cap, used by the free-API gateway and MCP servers.

interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

export class CacheManager {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(defaultTtlMs = 60_000, maxEntries = 500) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAtMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAtMs: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  getOrSet<T>(key: string, factory: () => T | Promise<T>, ttlMs?: number): T | Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = factory();
    if (value instanceof Promise) {
      return value.then((resolved) => {
        this.set(key, resolved, ttlMs);
        return resolved;
      });
    }
    this.set(key, value, ttlMs);
    return value;
  }

  async getOrSetAsync<T>(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAtMs) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  size(): number {
    return this.store.size;
  }
}

export const ApiCache = new CacheManager(60_000, 500);