// ASTRA AI — RATE LIMIT MANAGER
// Token-bucket rate limiting keyed by route / plugin / tool.

export interface RateLimitConfig {
  capacity: number;
  refillPerSec: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  config: RateLimitConfig;
}

const DEFAULT_CONFIG: RateLimitConfig = { capacity: 60, refillPerSec: 10 };

export class RateLimitManager {
  private buckets = new Map<string, Bucket>();
  private configs = new Map<string, RateLimitConfig>();

  configure(key: string, config: RateLimitConfig): void {
    this.configs.set(key, config);
    const existing = this.buckets.get(key);
    if (existing) existing.config = config;
  }

  acquire(key: string, cost = 1): boolean {
    const bucket = this.getBucket(key);
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true;
    }
    return false;
  }

  tryAcquireWithWait(key: string, cost = 1, maxWaitMs = 0): boolean {
    if (this.acquire(key, cost)) return true;
    if (maxWaitMs <= 0) return false;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (this.acquire(key, cost)) return true;
    }
    return false;
  }

  remaining(key: string): number {
    return Math.floor(this.getBucket(key).tokens);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  resetAll(): void {
    this.buckets.clear();
  }

  snapshot(): Record<string, { remaining: number; capacity: number }> {
    const out: Record<string, { remaining: number; capacity: number }> = {};
    for (const [key, bucket] of this.buckets) {
      out[key] = { remaining: Math.floor(bucket.tokens), capacity: bucket.config.capacity };
    }
    return out;
  }

  private getBucket(key: string): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.configs.get(key)?.capacity ?? DEFAULT_CONFIG.capacity, lastRefillMs: Date.now(), config: this.configs.get(key) ?? DEFAULT_CONFIG };
      this.buckets.set(key, bucket);
      return bucket;
    }
    const now = Date.now();
    const elapsedSec = (now - bucket.lastRefillMs) / 1000;
    const refill = elapsedSec * bucket.config.refillPerSec;
    if (refill >= 1) {
      bucket.tokens = Math.min(bucket.config.capacity, bucket.tokens + refill);
      bucket.lastRefillMs = now;
    }
    return bucket;
  }
}

export const RateLimiter = new RateLimitManager();