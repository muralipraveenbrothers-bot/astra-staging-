import React from "react";
import { HumanAtlasViewer } from "./HumanAtlas/HumanAtlasViewer";

interface AstraAtlasViewerProps {
  onStructureSelected?: (id: string, name: string, system: string) => void;
}

/**
 * AstraAtlasViewer - now powered by the real Human Atlas 3D engine (BodyParts3D)
 * with 2,234 anatomical structures directly integrated (no iframe needed).
 */
export function AstraAtlasViewer({ onStructureSelected }: AstraAtlasViewerProps) {
  return (
    <div className="relative h-full w-full bg-slate-950">
      <HumanAtlasViewer
        onStructureSelect={(name, system) => {
          // Bridge to existing command bus interface
          onStructureSelected?.(name.toLowerCase().replace(/ /g, '-'), name, system);
        }}
      />
    </div>
  );
}
