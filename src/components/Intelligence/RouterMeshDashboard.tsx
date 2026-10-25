import React, { useEffect, useState } from "react";
import {
  RouterHealthSnapshot,
  SubRouterId,
  startHealthMonitor,
  getHealthSnapshot,
  getRoutingLog,
  getRoutingStats,
  pluginRegistry,
  getSubRouterConfig,
} from "../../lib/router";
import {
  Server as ServerIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
  AlertTriangle as ExclamationTriangleIcon,
  RefreshCw as ArrowPathIcon,
  MinusCircle as MinusCircleIcon,
  BarChart as ChartBarIcon,
} from "lucide-react";

export const RouterMeshDashboard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<RouterHealthSnapshot | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Start health monitor if not already running
    startHealthMonitor();

    // Fetch initial data
    const updateData = async () => {
      setSnapshot(getHealthSnapshot());
      setLogs(getRoutingLog());
      setStats(getRoutingStats());
      await pluginRegistry.detectAll();
      setPlugins(pluginRegistry.getAll());
    };

    updateData();

    // Polling for live updates
    const interval = setInterval(updateData, 5000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ONLINE":
      case "READY":
        return "text-green-500";
      case "DEGRADED":
      case "HALF_OPEN":
        return "text-yellow-500";
      case "RETIRED":
        return "text-gray-500";
      case "OFFLINE":
      case "NOT_DETECTED":
      case "ERROR":
      case "OPEN":
      case "RATE_LIMITED":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ONLINE":
      case "READY":
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case "DEGRADED":
      case "HALF_OPEN":
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />;
      case "RETIRED":
        return <MinusCircleIcon className="w-5 h-5 text-gray-500" />;
      case "OFFLINE":
      case "NOT_DETECTED":
      case "ERROR":
      case "OPEN":
      case "RATE_LIMITED":
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      default:
        return <ArrowPathIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen text-gray-800">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ServerIcon className="w-7 h-7 text-indigo-600" />
            ASTRA AI — Unified Router Mesh
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Real-time monitoring for the LLM routing architecture (FreeLLMAPI → OmniRoute → Ollama; LiteLLM/RouteLLM retired).
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <ChartBarIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Total Requests</p>
              <p className="text-2xl font-bold">{stats.totalRequests}</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
              <ArrowPathIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Avg Latency</p>
              <p className="text-2xl font-bold">{stats.avgRoutingLatencyMs} ms</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-red-100 text-red-600 rounded-lg">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Failover Rate</p>
              <p className="text-2xl font-bold">{(stats.failoverRate * 100).toFixed(1)}%</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <ServerIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Active Routers</p>
              <p className="text-2xl font-bold">
                {snapshot
                  ? `${Object.values(snapshot.subrouters).filter((r) => r.status === "ONLINE").length} / ${
                      // Retired routers (LiteLLM, RouteLLM) are history, not part of the active count.
                      Object.values(snapshot.subrouters).filter((r) => r.status !== "RETIRED").length
                    }`
                  : 0}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Router Health Section */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Sub-Router Health</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {snapshot &&
              Object.entries(snapshot.subrouters).map(([id, health]) => {
                const config = getSubRouterConfig(id as SubRouterId);
                return (
                  <div key={id} className="p-6 flex items-start gap-4">
                    <div className="mt-1">{getStatusIcon(health.status)}</div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900">{config?.name || id}</h3>
                          <p className="text-xs text-gray-500 font-mono mt-1">Endpoint: {config?.proxyMount}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full bg-opacity-20 ${getStatusColor(health.status).replace("text-", "bg-")} ${getStatusColor(health.status)}`}>
                          {health.status}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Latency</p>
                          <p className="font-medium">{health.latencyMs >= 0 ? `${health.latencyMs}ms` : "--"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Circuit State</p>
                          <p className={`font-medium ${getStatusColor(health.circuitState)}`}>{health.circuitState}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Models</p>
                          <p className="font-medium">{health.modelCount}</p>
                        </div>
                      </div>
                      {health.error && (
                        <div className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 font-mono">
                          {health.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        {/* Live Routing Log */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
            <h2 className="text-lg font-semibold">Live Routing Log</h2>
            <span className="text-xs font-medium text-gray-500">Last 100 requests</span>
          </div>
          <div className="flex-1 overflow-y-auto p-0">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                No routing events yet.
              </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs">Time</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs">Intent</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs">Router</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs">Model</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 text-xs text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.requestId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <span className="truncate block max-w-[150px]" title={log.intent}>{log.intent}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          log.wasFailover ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {log.selectedRouter}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs truncate max-w-[120px]" title={log.selectedModel}>
                        {log.selectedModel}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">
                        {log.routingLatencyMs}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Plugin Registry Status */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold">Plugin Registry Status</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plugins.map((plugin) => (
              <div key={plugin.id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:shadow-md transition">
                <div>
                  <h3 className="font-semibold text-sm">{plugin.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{plugin.type}</p>
                </div>
                <div className="shrink-0 ml-3">
                  {getStatusIcon(plugin.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
};
