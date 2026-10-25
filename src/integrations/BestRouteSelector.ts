// ASTRA AI — BEST ROUTE SELECTOR
// Picks the healthiest route for a logical service based on live latency,
// priority and recent success/failure history.

export interface CandidateRoute {
  id: string;
  priority: number;
  weight: number;
  routeId: string;
  healthy: boolean;
}

export interface RouteStats {
  lastLatencyMs?: number;
  failures: number;
  successes: number;
  lastCheckedAtMs?: number;
}

export class BestRouteSelector {
  private stats = new Map<string, RouteStats>();

  addStats(routeId: string): void {
    if (!this.stats.has(routeId)) {
      this.stats.set(routeId, { failures: 0, successes: 0 });
    }
  }

  recordSuccess(routeId: string, latencyMs?: number): void {
    this.addStats(routeId);
    const s = this.stats.get(routeId)!;
    s.successes++;
    s.lastLatencyMs = latencyMs;
    s.lastCheckedAtMs = Date.now();
  }

  recordFailure(routeId: string): void {
    this.addStats(routeId);
    const s = this.stats.get(routeId)!;
    s.failures++;
    s.lastCheckedAtMs = Date.now();
  }

  isHealthy(routeId: string, maxFailures = 3): boolean {
    const s = this.stats.get(routeId);
    if (!s) return true;
    return s.failures < maxFailures;
  }

  select(candidates: CandidateRoute[]): CandidateRoute | undefined {
    const sorted = [...candidates].sort((a, b) => {
      const aOk = a.healthy && this.isHealthy(a.routeId);
      const bOk = b.healthy && this.isHealthy(b.routeId);
      if (aOk !== bOk) return aOk ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const aLat = this.stats.get(a.routeId)?.lastLatencyMs ?? Infinity;
      const bLat = this.stats.get(b.routeId)?.lastLatencyMs ?? Infinity;
      if (aLat !== bLat) return aLat - bLat;
      return b.weight - a.weight;
    });
    return sorted[0];
  }

  getStats(): Record<string, RouteStats> {
    return Object.fromEntries(this.stats);
  }
}

export const RouteSelector = new BestRouteSelector();