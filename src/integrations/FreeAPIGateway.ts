// ASTRA AI — FREE API GATEWAY
// Single entry point for all free external APIs used by plugins:
// route selection -> rate limiting -> caching -> external call -> result.
// No fake statuses: every call either succeeds against a real endpoint or fails.

import { ExternalAdapter, ExternalAdapterInstance, FREE_ROUTES, type ExternalCallResult } from "./ExternalAdapter";
import { RateLimiter } from "./RateLimitManager";
import { ApiCache, CacheManager } from "./CacheManager";
import { RouteSelector, type CandidateRoute } from "./BestRouteSelector";

export interface GatewayCallOptions {
  routeId: string;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  cacheTtlMs?: number;
  skipCache?: boolean;
  rateLimitKey?: string;
}

export interface GatewayCallResult extends ExternalCallResult {
  fromCache: boolean;
  rateLimited: boolean;
}

export interface GatewayStatus {
  routes: Record<string, { reachable: boolean; latencyMs?: number; error?: string }>;
  rateLimits: Record<string, { remaining: number; capacity: number }>;
  cacheEntries: number;
}

export class FreeAPIGateway {
  constructor(
    private readonly adapter: ExternalAdapter = ExternalAdapterInstance,
    private readonly cache: CacheManager = ApiCache,
  ) {}

  async call(options: GatewayCallOptions): Promise<GatewayCallResult> {
    const base: GatewayCallResult = {
      ok: false,
      status: 0,
      data: null,
      routeId: options.routeId,
      latencyMs: 0,
      error: undefined,
      fromCache: false,
      rateLimited: false,
    };

    if (!this.adapter.hasRoute(options.routeId)) {
      return { ...base, error: `unknown route: ${options.routeId}` };
    }

    const rateKey = options.rateLimitKey ?? options.routeId;
    if (!RateLimiter.acquire(rateKey)) {
      return { ...base, rateLimited: true, error: "rate limited" };
    }

    const cacheKey = options.skipCache
      ? undefined
      : `${options.routeId}:${JSON.stringify(options.query ?? {})}:${JSON.stringify(options.body ?? null)}`;

    if (cacheKey) {
      const cached = this.cache.get<Omit<GatewayCallResult, "fromCache" | "rateLimited">>(cacheKey);
      if (cached) {
        return { ...cached, fromCache: true, rateLimited: false };
      }
    }

    const result = await this.adapter.call({
      routeId: options.routeId,
      query: options.query,
      body: options.body,
      timeoutMs: options.timeoutMs,
    });

    if (result.ok) {
      RouteSelector.recordSuccess(options.routeId, result.latencyMs);
      if (cacheKey) {
        this.cache.set(cacheKey, { ...result, fromCache: false, rateLimited: false }, options.cacheTtlMs);
      }
    } else {
      RouteSelector.recordFailure(options.routeId);
    }

    return { ...result, fromCache: false, rateLimited: false };
  }

  async getStatus(): Promise<GatewayStatus> {
    const routes: GatewayStatus["routes"] = {};
    for (const routeId of Object.keys(FREE_ROUTES)) {
      const started = Date.now();
      const ping = await this.adapter.ping(routeId, 4000);
      routes[routeId] = {
        reachable: ping,
        latencyMs: Date.now() - started,
        ...(ping ? {} : { error: "unreachable" }),
      };
    }
    return {
      routes,
      rateLimits: RateLimiter.snapshot(),
      cacheEntries: this.cache.size(),
    };
  }

  healthProbe(routeId: string, timeoutMs = 4000): Promise<boolean> {
    return this.adapter.ping(routeId, timeoutMs);
  }

  candidatesFor(routeIds: string[]): CandidateRoute[] {
    return routeIds.map((routeId, idx) => ({
      id: routeId,
      routeId,
      priority: routeIds.length - idx,
      weight: 1,
      healthy: true,
    }));
  }
}

export const FreeApiGateway = new FreeAPIGateway();