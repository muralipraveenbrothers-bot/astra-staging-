import { useState } from "react";
import { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Hotspot } from "./types";

interface Props {
  hotspot: Hotspot;
  active: boolean;
  onSelect: (id: string) => void;
}

export function HotspotMarker({ hotspot, active, onSelect }: Props) {
  const [hovered, setHovered] = useState(false);

  const color = active ? hotspot.color : hovered ? hotspot.color : "#94a3b8";
  const scale = active ? 1.35 : hovered ? 1.15 : 0.9;

  return (
    <group position={hotspot.position}>
      <mesh
        scale={scale * 0.12}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(hotspot.id); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.8 : 0.4} transparent opacity={active ? 0.95 : 0.7} />
      </mesh>
      <mesh scale={scale * 0.2} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color={hotspot.color} transparent opacity={active ? 0.5 : 0.18} side={THREE.DoubleSide} />
      </mesh>
      {(active || hovered) && (
        <Html center distanceFactor={6} position={[0, 0.28, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-cyan-400/40 bg-slate-900/90 px-2 py-1 text-[10px] font-bold text-cyan-200 shadow-lg shadow-cyan-500/20">
            {hotspot.label}
          </div>
        </Html>
      )}
    </group>
  );
}