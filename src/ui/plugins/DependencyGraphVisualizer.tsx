// ASTRA AI — DEPENDENCY GRAPH VISUALIZER
// Renders the plugin dependency DAG from /api/plugins/graph as a layered SVG graph.

import React, { useEffect, useMemo, useState } from "react";
import { Workflow } from "lucide-react";
import { Badge } from "@/components/ui";

interface Edge {
  from: string;
  to: string;
  type: "required" | "optional";
}

interface GraphProps {
  edges: Edge[];
  statuses?: Record<string, string>;
  catalog?: Array<{ pluginId: string; name: string; tier: string }>;
}

const LAYER_HEIGHT = 150;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 44;

export function DependencyGraphVisualizer({ edges, statuses = {}, catalog = [] }: GraphProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const { nodes, layers, maxPerLayer } = useMemo(() => {
    const nameById = new Map(catalog.map((c) => [c.pluginId, c.name]));
    const nodeIds = new Set<string>();
    edges.forEach((e) => {
      nodeIds.add(e.from);
      nodeIds.add(e.to);
    });
    catalog.forEach((c) => nodeIds.add(c.pluginId));

    // Layered layout: tier by longest dependency chain (topological height).
    const height = new Map<string, number>();
    const children = new Map<string, string[]>();
    edges.forEach((e) => {
      if (!children.has(e.from)) children.set(e.from, []);
      children.get(e.from)!.push(e.to);
    });
    const compute = (id: string): number => {
      if (height.has(id)) return height.get(id)!;
      const deps = edges.filter((e) => e.to === id).map((e) => e.from);
      const h = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(compute));
      height.set(id, h);
      return h;
    };
    nodeIds.forEach(compute);

    const layersMap = new Map<number, string[]>();
    for (const id of nodeIds) {
      const h = height.get(id)!;
      if (!layersMap.has(h)) layersMap.set(h, []);
      layersMap.get(h)!.push(id);
    }
    const layerKeys = [...layersMap.keys()].sort((a, b) => a - b);
    const layersOut = layerKeys.map((k) => layersMap.get(k)!);
    const maxPer = Math.max(1, ...layersOut.map((l) => l.length));
    return {
      nodes: [...nodeIds].map((id) => ({
        id,
        label: nameById.get(id) ?? id,
        layer: height.get(id)!,
        status: statuses[id] ?? "NOT_INSTALLED",
      })),
      layers: layersOut,
      maxPerLayer: maxPer,
    };
  }, [edges, statuses, catalog]);

  const width = Math.max(700, layers.length * 280);
  const height = Math.max(200, maxPerLayer * LAYER_HEIGHT + 60);

  const xFor = (layer: number) => 40 + layer * (width - 80) / Math.max(1, layers.length - 1);
  const yFor = (layerIdx: number, nodeIdx: number) =>
    40 + nodeIdx * LAYER_HEIGHT + (maxPerLayer - layers[layerIdx].length) * LAYER_HEIGHT / 2;

  const statusColor = (s: string) =>
    s === "ACTIVE" ? "#2dd4bf" : s === "DEGRADED" ? "#fbbf24" : s === "CONFIG_REQUIRED" ? "#a78bfa" : "#475569";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Workflow className="w-4 h-4 text-teal-400" />
        <h2 className="text-sm font-semibold text-slate-100">Dependency Graph</h2>
        <Badge tone="cyan">{edges.length} edges · {nodes.length} nodes</Badge>
      </div>

      <div className="overflow-x-auto">
        <svg width={width} height={height} className="min-w-[700px]">
          <defs>
            <marker id="arrowReq" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#2dd4bf" />
            </marker>
            <marker id="arrowOpt" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const fromNode = nodes.find((n) => n.id === e.from);
            const toNode = nodes.find((n) => n.id === e.to);
            if (!fromNode || !toNode) return null;
            const fromLayerIdx = layers.findIndex((l) => l.includes(e.from));
            const toLayerIdx = layers.findIndex((l) => l.includes(e.to));
            const x1 = xFor(fromNode.layer) + NODE_WIDTH / 2;
            const y1 = yFor(fromLayerIdx, layers[fromLayerIdx].indexOf(e.from)) + NODE_HEIGHT / 2;
            const x2 = xFor(toNode.layer) - NODE_WIDTH / 2;
            const y2 = yFor(toLayerIdx, layers[toLayerIdx].indexOf(e.to)) + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;
            const color = e.type === "required" ? "#2dd4bf" : "#64748b";
            return (
              <path
                key={`${e.from}-${e.to}-${i}`}
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={e.type === "required" ? 1.6 : 1}
                strokeDasharray={e.type === "optional" ? "4 3" : undefined}
                markerEnd={e.type === "required" ? "url(#arrowReq)" : "url(#arrowOpt)"}
                opacity={hovered && hovered !== e.from && hovered !== e.to ? 0.15 : 1}
                style={{ transition: "opacity 150ms" }}
              />
            );
          })}

          {nodes.map((n) => {
            const layerIdx = layers.findIndex((l) => l.includes(n.id));
            const nodeIdx = layers[layerIdx].indexOf(n.id);
            const x = xFor(n.layer) - NODE_WIDTH / 2;
            const y = yFor(layerIdx, nodeIdx) - NODE_HEIGHT / 2;
            const color = statusColor(n.status);
            return (
              <g
                key={n.id}
                transform={`translate(${x}, ${y})`}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={8}
                  fill="#0f172a"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray={n.status === "NOT_INSTALLED" ? "4 3" : undefined}
                  opacity={hovered && hovered !== n.id ? 0.6 : 1}
                  style={{ transition: "opacity 150ms" }}
                />
                <text
                  x={NODE_WIDTH / 2}
                  y={NODE_HEIGHT / 2 - 2}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="11"
                  fontWeight="600"
                >
                  {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
                </text>
                <text x={NODE_WIDTH / 2} y={NODE_HEIGHT / 2 + 12} textAnchor="middle" fill={color} fontSize="9" fontFamily="monospace">
                  {n.status}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-teal-400 inline-block" /> Required dep
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 border-t border-dashed border-slate-500 inline-block" /> Optional dep
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> ACTIVE
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> DEGRADED
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" /> CONFIG_REQUIRED
        </span>
      </div>
    </div>
  );
}