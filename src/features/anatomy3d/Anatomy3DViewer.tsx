/**
 * src/features/anatomy3d/Anatomy3DViewer.tsx
 *
 * Interactive 3D anatomy viewer using react-three-fiber.
 * System tabs: Cardiovascular, Respiratory, Skeletal, Muscular, Nervous, Digestive.
 * Each system loads lazily from optimised GLBs or the BodyParts3D atlas.
 * Supports hover glow, click-to-select with camera fly, sequenced label tours,
 * X-ray mode, isolate/hide, search, and an imperative API for voice/gesture.
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  Suspense,
  type ReactNode,
} from "react";
import { Canvas, useThree, useFrame, invalidate } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import {
  type AnatomySystem,
  resolveLabel,
  TOUR_SEQUENCES,
  type TourStep,
} from "./labels";
import { Anatomy3DContext, type Anatomy3DAPI } from "./Anatomy3DContext";
import { HandControlToggle } from "@/features/mayin/gesture/HandControlToggle";
import {
  registerGestureViewer,
  type GestureViewerAdapter,
} from "@/features/mayin/gesture/gestureViewerRegistry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_TABS: { id: AnatomySystem; label: string; color: string }[] = [
  { id: "cardiovascular", label: "Cardiovascular", color: "#b91c1c" },
  { id: "respiratory", label: "Respiratory", color: "#ec4899" },
  { id: "skeletal", label: "Skeletal", color: "#5c5346" },
  { id: "muscular", label: "Muscular", color: "#a85b50" },
  { id: "nervous", label: "Nervous", color: "#eab308" },
  { id: "digestive", label: "Digestive", color: "#f97316" },
];

const MODEL_URLS: Record<string, string> = {
  skeleton: "/models/anatomy/skeleton.glb",
  muscles: "/models/anatomy/muscles.glb",
  vascular: "/models/anatomy/vascular.glb",
  joints: "/models/anatomy/joints.glb",
};

/** Which GLB source each system uses */
const SYSTEM_MODEL: Record<AnatomySystem, string | null> = {
  cardiovascular: "vascular",
  skeletal: "skeleton",
  muscular: "muscles",
  respiratory: null, // atlas
  nervous: null, // atlas
  digestive: null, // atlas
};

/** Atlas system IDs that map to our system tabs */
const ATLAS_SYSTEMS: Record<AnatomySystem, string[] | null> = {
  respiratory: ["respiratory"],
  nervous: ["nervous"],
  digestive: ["digestive"],
  cardiovascular: null,
  skeletal: null,
  muscular: null,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StructureInfo {
  name: string;
  label: string;
  side: string;
  system: AnatomySystem;
  description: string;
}

interface Anatomy3DViewerProps {
  patient?: { name: string; bed: string; id?: string };
  isDarkTheme?: boolean;
  onAskCoPilot?: (structure: string, context: string) => void;
}

// ---------------------------------------------------------------------------
// Inner scene: renders loaded model meshes with hover/click
// ---------------------------------------------------------------------------

function SystemScene({
  modelUrl,
  system,
  onHover,
  onSelect,
  selected,
  xrayMode,
  hiddenNodes,
  isolatedNode,
  searchTarget,
  externalHovered,
  onReady,
}: {
  modelUrl: string;
  system: AnatomySystem;
  onHover: (info: StructureInfo | null) => void;
  onSelect: (info: StructureInfo) => void;
  selected: string | null;
  xrayMode: boolean;
  hiddenNodes: Set<string>;
  isolatedNode: string | null;
  searchTarget: string | null;
  /** Structure hovered by the gesture cursor (pointer hover wins when active). */
  externalHovered: string | null;
  onReady?: () => void;
}) {
  const { scene } = useGLTF(modelUrl);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const effectiveHovered = hovered ?? externalHovered;

  // Build a map of mesh name → mesh object for quick lookup
  const meshes = useMemo(() => {
    const map = new Map<string, THREE.Mesh>();
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        map.set(child.name, child as THREE.Mesh);
      }
    });
    return map;
  }, [scene]);

  // Clone the scene so we don't mutate the cached original
  const cloned = useMemo(() => scene.clone(true), [scene]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current?.();
  }, [scene]);

  useEffect(() => {
    // Apply materials based on state
    cloned.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const name = mesh.name;

      // Hidden check
      if (hiddenNodes.has(name)) {
        mesh.visible = false;
        return;
      }

      // Isolated check
      if (isolatedNode && name !== isolatedNode) {
        mesh.visible = xrayMode;
        if (xrayMode && mesh.material) {
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (system === "muscular" && mat.color) {
          const matName = mat.name || "";
          const redMuscle = matName === "Internal rotator" || /muscle/i.test(name);
          const tintHex = redMuscle ? "#9a3b32"
            : matName === "Tendon" ? "#f3e6d6"
            : matName === "Ligament" ? "#d7b59a"
            : matName === "Cartilage" ? "#efe6d4"
            : matName === "Fat" ? "#e4b98a"
            : matName === "Articular capsule" ? "#e7c2ae"
            : matName === "Bursa" ? "#e8b2a8"
            : "#e6c2a6";
          mat.color.set(tintHex);
          mat.metalness = 0.04;
          mat.roughness = 0.58;
        }
          mat.transparent = true;
          mat.opacity = 0.15;
          mat.depthWrite = false;
          mesh.material = mat;
        }
        return;
      }

      mesh.visible = true;

      // Normal materials
      if (mesh.material) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (system === "muscular" && mat.color) {
          const matName = mat.name || "";
          const redMuscle = matName === "Internal rotator" || /muscle/i.test(name);
          const tintHex = redMuscle ? "#9a3b32"
            : matName === "Tendon" ? "#f3e6d6"
            : matName === "Ligament" ? "#d7b59a"
            : matName === "Cartilage" ? "#efe6d4"
            : matName === "Fat" ? "#e4b98a"
            : matName === "Articular capsule" ? "#e7c2ae"
            : matName === "Bursa" ? "#e8b2a8"
            : "#e6c2a6";
          mat.color.set(tintHex);
          mat.metalness = 0.04;
          mat.roughness = 0.58;
        }

        if (name === selected) {
          mat.emissive = new THREE.Color(0x38bdf8);
          mat.emissiveIntensity = 0.6;
          mat.transparent = false;
          mat.opacity = 1;
        } else if (name === effectiveHovered) {
          mat.emissive = new THREE.Color(0x5ef2c2);
          mat.emissiveIntensity = 0.35;
          mat.transparent = false;
          mat.opacity = 1;
        } else if (xrayMode && isolatedNode && name !== isolatedNode) {
          mat.transparent = true;
          mat.opacity = 0.15;
          mat.depthWrite = false;
        } else {
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
          mat.transparent = false;
          mat.opacity = 1;
        }

        mesh.material = mat;
      }
    });
    invalidate();
  }, [cloned, selected, effectiveHovered, xrayMode, hiddenNodes, isolatedNode, system]);

  const handlePointerOver = useCallback(
    (e: any) => {
      e.stopPropagation();
      const name = (e.object as THREE.Mesh).name;
      setHovered(name);
      const info = resolveLabel(name, system);
      onHover({ name, ...info });
      document.body.style.cursor = "pointer";
    },
    [system, onHover],
  );

  const handlePointerOut = useCallback(() => {
    setHovered(null);
    onHover(null);
    document.body.style.cursor = "auto";
  }, [onHover]);

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      const name = (e.object as THREE.Mesh).name;
      const info = resolveLabel(name, system);
      onSelect({ name, ...info });
    },
    [system, onSelect],
  );

  return (
    <group ref={groupRef}>
      <primitive
        object={cloned}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Atlas scene (for respiratory, nervous, digestive from BodyParts3D)
// ---------------------------------------------------------------------------

function AtlasSystemScene({
  system,
  atlasSystemIds,
  onHover,
  onSelect,
  selected,
  xrayMode,
  hiddenNodes,
  isolatedNode,
  externalHovered,
}: {
  system: AnatomySystem;
  atlasSystemIds: string[];
  onHover: (info: StructureInfo | null) => void;
  onSelect: (info: StructureInfo) => void;
  selected: string | null;
  xrayMode: boolean;
  hiddenNodes: Set<string>;
  isolatedNode: string | null;
  /** Structure hovered by the gesture cursor (pointer hover wins when active). */
  externalHovered: string | null;
}) {
  const [atlas, setAtlas] = useState<any>(null);
  const [meshData, setMeshData] = useState<
    { name: string; geometry: THREE.BufferGeometry; systemId: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const effectiveHovered = hovered ?? externalHovered;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/models/atlas.json");
        if (!resp.ok) throw new Error("Failed to load atlas.json");
        const data = await resp.json();
        if (cancelled) return;
        setAtlas(data);

        // Filter parts for this system
        const parts = data.parts.filter((p: any) =>
          atlasSystemIds.includes(p.system),
        );

        // Load the binary chunks
        const chunkCache = new Map<number, ArrayBuffer>();
        const neededChunks = [...new Set(parts.map((p: any) => p.chunk))] as number[];
        await Promise.all(
          neededChunks.map(async (ci) => {
            const chunk = data.chunks[ci];
            const url = `/models/${chunk.url}`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`Failed to load ${url}`);
            chunkCache.set(ci, await r.arrayBuffer());
          }),
        );

        if (cancelled) return;

        // Build geometries
        const geometries: typeof meshData = [];
        for (const part of parts) {
          const buf = chunkCache.get(part.chunk);
          if (!buf) continue;

          const geo = new THREE.BufferGeometry();
          const positions = new Float32Array(buf, part.positions, part.vertexCount * 3);
          const normals = new Float32Array(buf, part.normals, part.vertexCount * 3);

          geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
          geo.setAttribute("normal", new THREE.BufferAttribute(normals.slice(), 3));

          if (part.indexCount > 0) {
            const indices = new Uint32Array(buf, part.indices, part.indexCount);
            geo.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
          }

          geo.computeBoundingSphere();
          geometries.push({ name: part.name, geometry: geo, systemId: part.system });
        }

        setMeshData(geometries);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [atlasSystemIds]);

  if (loading) return null;
  if (error || meshData.length === 0) return null;

  const handlePointerOver = (name: string) => {
    setHovered(name);
    const info = resolveLabel(name, system);
    onHover({ name, ...info });
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = () => {
    setHovered(null);
    onHover(null);
    document.body.style.cursor = "auto";
  };

  const handleClick = (name: string) => {
    const info = resolveLabel(name, system);
    onSelect({ name, ...info });
  };

  // System-specific base colors
  const baseColors: Record<AnatomySystem, string> = {
    respiratory: "#e8a0aa",
    nervous: "#d8b565",
    digestive: "#b8916b",
    cardiovascular: "#c05245",
    skeletal: "#e2d9ba",
    muscular: "#a85b50",
  };

  return (
    <group>
      {meshData.map((m) => {
        if (hiddenNodes.has(m.name)) return null;
        if (isolatedNode && m.name !== isolatedNode) {
          if (!xrayMode) return null;
        }
        const isSelected = m.name === selected;
        const isHovered = m.name === effectiveHovered;
        const isGhosted = xrayMode && isolatedNode && m.name !== isolatedNode;

        return (
          <mesh
            key={m.name}
            name={m.name}
            geometry={m.geometry}
            onPointerOver={(e: any) => {
              e.stopPropagation();
              handlePointerOver(m.name);
            }}
            onPointerOut={(e: any) => {
              e.stopPropagation();
              handlePointerOut();
            }}
            onClick={(e: any) => {
              e.stopPropagation();
              handleClick(m.name);
            }}
          >
            <meshStandardMaterial
              color={baseColors[system]}
              emissive={isSelected ? "#38bdf8" : isHovered ? "#5ef2c2" : "#000000"}
              emissiveIntensity={isSelected ? 0.6 : isHovered ? 0.35 : 0}
              transparent={!!isGhosted}
              opacity={isGhosted ? 0.15 : 1}
              depthWrite={!isGhosted}
              roughness={0.5}
              metalness={0.1}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Camera fly-to controller
// ---------------------------------------------------------------------------

function CameraFly({
  target,
  controlsRef,
}: {
  target: THREE.Vector3 | null;
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const animRef = useRef<{
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
    t: number;
  } | null>(null);

  useEffect(() => {
    if (!target) return;
    // Fly to a position that looks at the target from the front
    const lookAt = target.clone();
    const camPos = new THREE.Vector3(
      target.x,
      target.y + 0.05,
      target.z + 0.5,
    );
    animRef.current = { targetPos: camPos, targetLook: lookAt, t: 0 };
  }, [target]);

  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim) return;
    anim.t = Math.min(1, anim.t + delta * 1.67); // ~600ms
    const ease = 1 - Math.pow(1 - anim.t, 3);
    camera.position.lerp(anim.targetPos, ease);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(anim.targetLook, ease);
      controlsRef.current.update();
    }
    invalidate();
    if (anim.t >= 1) animRef.current = null;
  });

  return null;
}


function FrameFullBody({ token }: { token: string }) {
  const { camera, scene, invalidate } = useThree();
  const controls = useThree((s) => s.controls as { target: THREE.Vector3; update: () => void } | null);
  const fitted = useRef("");
  const pending = useRef("");
  const lastSize = useRef("");
  const tries = useRef(0);

  useFrame(() => {
    // Canvas uses frameloop="demand", so keep requesting frames until the body is framed.
    const kick = () => {
      if (tries.current++ < 180) invalidate();
    };
    if (pending.current !== token) {
      pending.current = token;
      lastSize.current = "";
      fitted.current = "";
      tries.current = 0;
    }
    if (!controls?.target) {
      kick();
      return;
    }
    const box = new THREE.Box3();
    let meshes = 0;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || mesh.name === "gesture-cursor") return;
      box.expandByObject(mesh);
      meshes += 1;
    });
    if (meshes === 0 || box.isEmpty()) {
      kick();
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    if (span < 1e-4) {
      kick();
      return;
    }
    const sizeKey = token + "|" + meshes + "|" + size.x.toFixed(2) + "|" + size.y.toFixed(2) + "|" + size.z.toFixed(2);
    if (fitted.current === sizeKey) return;
    if (lastSize.current !== sizeKey) {
      lastSize.current = sizeKey;
      kick();
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = (persp.fov * Math.PI) / 180;
    const aspect = persp.aspect > 0.05 ? persp.aspect : 1;
    const distY = size.y / 2 / Math.tan(vFov / 2);
    const distX = size.x / 2 / (Math.tan(vFov / 2) * aspect);
    const dist = Math.max(distY, distX, 0.35) * 1.22;
    persp.position.set(center.x, center.y, center.z + dist);
    persp.near = Math.max(0.01, dist / 100);
    persp.far = Math.max(20, dist * 20);
    persp.updateProjectionMatrix();
    persp.lookAt(center);
    controls.target.copy(center);
    controls.update();
    fitted.current = sizeKey;
    invalidate();
  });

  return null;
}

// ---------------------------------------------------------------------------
// Gesture cursor: glowing dot driven by the hand, raycasts hover targets
// ---------------------------------------------------------------------------

function GestureCursorRig({
  cursorNdcRef,
  onHoverNode,
}: {
  /** NDC (-1..1) cursor position written by the gesture adapter; null = hidden. */
  cursorNdcRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onHoverNode: (name: string | null) => void;
}) {
  const { camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const dotRef = useRef<THREE.Mesh>(null);
  const lastHit = useRef<string | null>(null);
  const lastRaycastAt = useRef(0);

  useFrame(() => {
    const dot = dotRef.current;
    if (!dot) return;
    const cursor = cursorNdcRef.current;
    if (!cursor) {
      dot.visible = false;
      if (lastHit.current) {
        lastHit.current = null;
        onHoverNode(null);
      }
      return;
    }
    const now = performance.now();
    if (now - lastRaycastAt.current < 50) return; // ~20 Hz raycast budget
    lastRaycastAt.current = now;

    ndc.set(cursor.x, cursor.y);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster
      .intersectObjects(scene.children, true)
      .find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible);

    dot.visible = true;
    if (hit) {
      dot.position.copy(hit.point);
      const name = hit.object.name || null;
      if (name !== lastHit.current) {
        lastHit.current = name;
        onHoverNode(name);
      }
    } else {
      // Keep the cursor visible even over empty space.
      const fallback = new THREE.Vector3();
      raycaster.ray.at(1.5, fallback);
      dot.position.copy(fallback);
      if (lastHit.current) {
        lastHit.current = null;
        onHoverNode(null);
      }
    }
    invalidate();
  });

  return (
    <mesh name="gesture-cursor" ref={dotRef} visible={false} renderOrder={999}>
      <sphereGeometry args={[0.015, 16, 16]} />
      <meshBasicMaterial color="#5ef2c2" transparent opacity={0.95} depthTest={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Sequenced label tour overlay
// ---------------------------------------------------------------------------

function TourLabels({
  steps,
  currentIndex,
  modelUrl,
  system,
}: {
  steps: TourStep[];
  currentIndex: number;
  modelUrl: string | null;
  system: AnatomySystem;
}) {
  // We render labels as Html overlays at the mesh bounding-box centres
  // Since we don't have the exact positions without loading the model,
  // we show labels at screen positions via the index data
  return null; // Labels are rendered inline in the main viewer
}

// ---------------------------------------------------------------------------
// Glass info card
// ---------------------------------------------------------------------------

function InfoCard({
  info,
  onClose,
  onAskCoPilot,
}: {
  info: StructureInfo;
  onClose: () => void;
  onAskCoPilot?: (structure: string) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        width: 320,
        background: "#ffffff",
        backdropFilter: "blur(18px) saturate(140%)",
        border: "1px solid #111111",
        borderRadius: 16,
        padding: 16,
        color: "#111111",
        zIndex: 20,
        boxShadow: "0 18px 50px rgba(0,0,0,0.35), 0 0 22px -6px #7CC8FF",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.02em",
            color: "#1d4ed8",
          }}
        >
          {info.label}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#111111",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 6,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        <span style={{ color: "#0f766e" }}>{info.system}</span>
        {info.side !== "midline" && (
          <span style={{ color: "#444444" }}>{info.side}</span>
        )}
      </div>
      {info.description && (
        <p style={{ fontSize: 12, color: "#333333", marginTop: 8, lineHeight: 1.5 }}>
          {info.description}
        </p>
      )}
      {onAskCoPilot && (
        <button
          onClick={() => onAskCoPilot(info.label)}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "8px 12px",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            background: "linear-gradient(135deg, #6C63FF, #7CC8FF)",
            border: "none",
            borderRadius: 10,
            color: "#111111",
            cursor: "pointer",
          }}
        >
          Ask Co-Pilot
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tour overlay (HUD labels drawn over the canvas)
// ---------------------------------------------------------------------------

function TourOverlay({
  steps,
  currentIndex,
  paused,
  onPause,
  onResume,
  onStep,
  onStop,
}: {
  steps: TourStep[];
  currentIndex: number;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStep: (dir: number) => void;
  onStop: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#ffffff",
        backdropFilter: "blur(12px)",
        border: "1px solid #111111",
        borderRadius: 12,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: "#111111",
        zIndex: 30,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span style={{ color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
        Tour
      </span>
      <span>
        {currentIndex + 1}/{steps.length}: {steps[currentIndex]?.label}
      </span>
      <button onClick={() => onStep(-1)} disabled={currentIndex <= 0} style={tourBtn}>
        ◀
      </button>
      <button onClick={paused ? onResume : onPause} style={tourBtn}>
        {paused ? "▶" : "⏸"}
      </button>
      <button onClick={() => onStep(1)} disabled={currentIndex >= steps.length - 1} style={tourBtn}>
        ▶
      </button>
      <button onClick={onStop} style={{ ...tourBtn, color: "#b91c1c" }}>
        ✕
      </button>
    </div>
  );
}

const tourBtn: React.CSSProperties = {
  background: "#111111",
  border: "1px solid #111111",
  borderRadius: 6,
  color: "#111111",
  cursor: "pointer",
  padding: "4px 8px",
  fontSize: 11,
};

// ---------------------------------------------------------------------------
// Loading ring
// ---------------------------------------------------------------------------

function LoadingRing() {
  return (
    <div
      style={{
        position: "absolute",
        left: 8,
        bottom: 22,
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "#000000",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        zIndex: 6,
        pointerEvents: "none",
        background: "#ffffff",
        border: "1px solid #111111",
        borderRadius: 8,
        padding: "4px 8px",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="4" />
        <circle
          cx="20" cy="20" r="16"
          fill="none" stroke="#111111" strokeWidth="4"
          strokeDasharray="80" strokeDashoffset="60"
          style={{ animation: "spin 1s linear infinite", transformOrigin: "center" }}
        />
      </svg>
      Loading model
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function NotInstalledNotice({ system }: { system: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#444444",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        padding: 24,
        zIndex: 10,
      }}
    >
      {system} system model — loading from atlas…
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main viewer component
// ---------------------------------------------------------------------------

export default function Anatomy3DViewer({
  patient,
  isDarkTheme: _isDark,
  onAskCoPilot,
}: Anatomy3DViewerProps) {
  const [activeSystem, setActiveSystem] = useState<AnatomySystem>("cardiovascular");
  const [selectedInfo, setSelectedInfo] = useState<StructureInfo | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<StructureInfo | null>(null);
  const [xrayMode, setXrayMode] = useState(false);
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [isolatedNode, setIsolatedNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [flyTarget, setFlyTarget] = useState<THREE.Vector3 | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<Record<string, boolean>>({});

  // Tour state
  const [touring, setTouring] = useState(false);
  const [tourSteps, setTourSteps] = useState<TourStep[]>([]);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourPaused, setTourPaused] = useState(false);
  const tourTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gesture control state (prompt 07)
  const [gestureHoverName, setGestureHoverName] = useState<string | null>(null);
  const [presentMode, setPresentMode] = useState(false);
  const cursorNdcRef = useRef<{ x: number; y: number } | null>(null);
  const gestureHoverRef = useRef<string | null>(null);
  const hoverSourceRef = useRef<"pointer" | "gesture" | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const controlsRef = useRef<any>(null);

  // Index data for camera fly-to
  const [indexData, setIndexData] = useState<
    Record<string, { name: string; centre: number[]; size: number[] }[]>
  >({});

  // Load index data for the active system
  useEffect(() => {
    const modelKey = SYSTEM_MODEL[activeSystem];
    if (!modelKey || indexData[modelKey]) return;

    fetch(`/models/anatomy/${modelKey}-index.json`)
      .then((r) => r.json())
      .then((data) => {
        setIndexData((prev) => ({ ...prev, [modelKey]: data }));
      })
      .catch(() => {
        // Index load failed — non-critical
      });
  }, [activeSystem, indexData]);

  // Mark a system as loaded
  const onSystemLoaded = useCallback((system: string) => {
    setLoaded((prev) => new Set(prev).add(system));
  }, []);

  // Find a structure's 3D position from index data
  const findPosition = useCallback(
    (name: string): THREE.Vector3 | null => {
      for (const entries of Object.values(indexData)) {
        const entry = entries.find(
          (e: any) => e.name === name,
        );
        if (entry) {
          return new THREE.Vector3(
            entry.centre[0],
            entry.centre[1],
            entry.centre[2],
          );
        }
      }
      return null;
    },
    [indexData],
  );

  // Select a structure and fly to it
  const selectAndFly = useCallback(
    (info: StructureInfo) => {
      setSelectedInfo(info);
      const pos = findPosition(info.name);
      if (pos) setFlyTarget(pos.clone());
    },
    [findPosition],
  );

  // Tour logic
  const advanceTour = useCallback(() => {
    setTourIndex((prev) => {
      const next = prev + 1;
      if (next >= tourSteps.length) {
        setTouring(false);
        return prev;
      }
      // Fly to next step
      const step = tourSteps[next];
      if (step) {
        const pos = findPosition(step.nodeName);
        if (pos) setFlyTarget(pos.clone());
        setSelectedInfo({
          name: step.nodeName,
          label: step.label,
          side: "midline",
          system: activeSystem,
          description: "",
        });
      }
      return next;
    });
  }, [tourSteps, findPosition, activeSystem]);

  useEffect(() => {
    if (!touring || tourPaused) return;
    tourTimer.current = setTimeout(advanceTour, 350);
    return () => {
      if (tourTimer.current) clearTimeout(tourTimer.current);
    };
  }, [touring, tourPaused, tourIndex, advanceTour]);

  const startTour = useCallback(
    (system: AnatomySystem) => {
      const steps = TOUR_SEQUENCES[system];
      if (!steps || steps.length === 0) return;
      setActiveSystem(system);
      setTourSteps(steps);
      setTourIndex(0);
      setTouring(true);
      setTourPaused(false);
      // Fly to first step
      const pos = findPosition(steps[0].nodeName);
      if (pos) setFlyTarget(pos.clone());
      setSelectedInfo({
        name: steps[0].nodeName,
        label: steps[0].label,
        side: "midline",
        system,
        description: "",
      });
    },
    [findPosition],
  );

  // Keyboard handling for tour
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!touring) return;
      if (e.code === "Space") {
        e.preventDefault();
        setTourPaused((p) => !p);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        advanceTour();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setTourIndex((prev) => {
          const next = Math.max(0, prev - 1);
          const step = tourSteps[next];
          if (step) {
            const pos = findPosition(step.nodeName);
            if (pos) setFlyTarget(pos.clone());
            setSelectedInfo({
              name: step.nodeName,
              label: step.label,
              side: "midline",
              system: activeSystem,
              description: "",
            });
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [touring, tourSteps, advanceTour, findPosition, activeSystem]);

  // Imperative API
  const api: Anatomy3DAPI = useMemo(
    () => ({
      selectStructure(name: string) {
        // Search across all index data for the name (fuzzy match)
        const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const [modelKey, entries] of Object.entries(indexData)) {
          const entry = entries.find(
            (e: any) =>
              e.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(normalized) ||
              normalized.includes(e.name.toLowerCase().replace(/[^a-z0-9]/g, "")),
          );
          if (entry) {
            // Determine the system for this model
            const sys = Object.entries(SYSTEM_MODEL).find(
              ([, v]) => v === modelKey,
            );
            const system = (sys?.[0] as AnatomySystem) || activeSystem;
            setActiveSystem(system);
            const info = resolveLabel(entry.name, system);
            setSelectedInfo({ name: entry.name, ...info });
            const pos = new THREE.Vector3(
              entry.centre[0],
              entry.centre[1],
              entry.centre[2],
            );
            setFlyTarget(pos);
            return;
          }
        }
      },
      rotateBy(dx: number, dy: number) {
        if (controlsRef.current) {
          const c = controlsRef.current;
          c.rotateLeft(dx * 0.01);
          c.rotateUp(dy * 0.01);
          c.update();
          invalidate();
        }
      },
      zoomBy(factor: number) {
        if (controlsRef.current) {
          const c = controlsRef.current;
          if (factor > 1) c.dollyIn(factor);
          else c.dollyOut(1 / factor);
          c.update();
          invalidate();
        }
      },
      pan(dx: number, dy: number) {
        if (controlsRef.current) {
          controlsRef.current.pan(dx, dy);
          controlsRef.current.update();
          invalidate();
        }
      },
      reset() {
        if (controlsRef.current) {
          controlsRef.current.reset();
          invalidate();
        }
        setSelectedInfo(null);
        setHiddenNodes(new Set());
        setIsolatedNode(null);
        setXrayMode(false);
        setTouring(false);
        setSearchQuery("");
      },
      startTour,
    }),
    [indexData, activeSystem, startTour],
  );

  // Gesture-control wiring (prompt 07). Refs keep the adapter stable across
  // re-renders while always acting on the latest viewer state.
  const apiRef = useRef(api);
  apiRef.current = api;
  const activeSystemRef = useRef(activeSystem);
  activeSystemRef.current = activeSystem;
  const findPositionRef = useRef(findPosition);
  findPositionRef.current = findPosition;
  const selectAndFlyRef = useRef(selectAndFly);
  selectAndFlyRef.current = selectAndFly;
  const tourStateRef = useRef({ touring, tourSteps, tourIndex });
  tourStateRef.current = { touring, tourSteps, tourIndex };

  const stepTour = useCallback((dir: number) => {
    const { touring: isTouring, tourSteps: steps, tourIndex: idx } = tourStateRef.current;
    if (!isTouring || !steps.length) return;
    const next = Math.max(0, Math.min(steps.length - 1, idx + dir));
    if (next === idx) return;
    setTourIndex(next);
    const step = steps[next];
    if (step) {
      const pos = findPositionRef.current(step.nodeName);
      if (pos) setFlyTarget(pos.clone());
      setSelectedInfo({
        name: step.nodeName,
        label: step.label,
        side: "midline",
        system: activeSystemRef.current,
        description: "",
      });
    }
  }, []);

  // Gesture cursor hover → highlight + tooltip, without fighting pointer hover.
  const handleGestureHoverNode = useCallback((name: string | null) => {
    gestureHoverRef.current = name;
    setGestureHoverName(name);
    if (name) {
      hoverSourceRef.current = "gesture";
      setHoveredInfo({ name, ...resolveLabel(name, activeSystemRef.current) });
    } else if (hoverSourceRef.current === "gesture") {
      hoverSourceRef.current = null;
      setHoveredInfo(null);
    }
  }, []);

  const handlePointerHover = useCallback((info: StructureInfo | null) => {
    hoverSourceRef.current = info ? "pointer" : null;
    setHoveredInfo(info);
  }, []);

  // Register this viewer as a gesture target; the newest mounted viewer wins.
  useEffect(() => {
    const adapter: GestureViewerAdapter = {
      id: "anatomy3d",
      moveCursor: (x, y) => {
        cursorNdcRef.current = { x: x * 2 - 1, y: 1 - y * 2 };
        invalidate();
      },
      hideCursor: () => {
        cursorNdcRef.current = null;
        if (gestureHoverRef.current) {
          gestureHoverRef.current = null;
          setGestureHoverName(null);
          if (hoverSourceRef.current === "gesture") {
            hoverSourceRef.current = null;
            setHoveredInfo(null);
          }
        }
        invalidate();
      },
      selectUnderCursor: () => {
        const name = gestureHoverRef.current;
        if (!name) return;
        const info = resolveLabel(name, activeSystemRef.current);
        selectAndFlyRef.current({ name, ...info });
      },
      rotateBy: (dx, dy) => apiRef.current.rotateBy(dx, dy),
      zoomBy: (factor) => apiRef.current.zoomBy(factor),
      pan: (dx, dy) => apiRef.current.pan(dx, dy),
      reset: () => apiRef.current.reset(),
      tourStep: (dir) => stepTour(dir),
      setPresentMode: (on) => setPresentMode((prev) => (on ? !prev : false)),
    };
    return registerGestureViewer(adapter);
  }, [stepTour]);

  // Esc exits present mode.
  useEffect(() => {
    if (!presentMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresentMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentMode]);

  // Search functionality
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) return;
      api.selectStructure(query);
    },
    [api],
  );

  // Cross-panel bridge: lets clinical panels highlight an organ (e.g. a
  // Scientist hypothesis's anatomyFocus) by dispatching astra-anatomy-select.
  useEffect(() => {
    const handler = (e: Event) => {
      const structure = (e as CustomEvent)?.detail?.structure;
      if (typeof structure === "string" && structure) api.selectStructure(structure);
    };
    window.addEventListener("astra-anatomy-select", handler);
    return () => window.removeEventListener("astra-anatomy-select", handler);
  }, [api]);

  // Determine what to render
  const modelKey = SYSTEM_MODEL[activeSystem];
  const atlasSystemIds = ATLAS_SYSTEMS[activeSystem];
  const modelUrl = modelKey ? MODEL_URLS[modelKey] : null;

  return (
    <Anatomy3DContext.Provider value={api}>
      <div
        ref={containerRef}
        style={
          presentMode
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 1200,
                background: "#ffffff",
                padding: 12,
                display: "flex",
                flexDirection: "column",
              }
            : { display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0, color: "#111111" }
        }
      >
        {/* Present-mode bar: browsers require a real click for true fullscreen,
            so the gesture enters this overlay and the doctor clicks once. */}
        {presentMode && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
              padding: "4px 6px 10px",
              color: "#333333",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <span style={{ color: "#0f766e", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 10 }}>
              Present mode
            </span>
            <span>Press F11 for true full screen</span>
            <button
              type="button"
              onClick={() => {
                const request = containerRef.current?.requestFullscreen?.();
                if (request) request.catch(() => undefined);
              }}
              style={{
                padding: "5px 12px",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                border: "1px solid #111111",
                borderRadius: 8,
                background: "#ffffff",
                color: "#0f766e",
                cursor: "pointer",
              }}
            >
              Full screen
            </button>
            <button
              type="button"
              onClick={() => setPresentMode(false)}
              style={{
                marginLeft: "auto",
                padding: "5px 12px",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                border: "1px solid #111111",
                borderRadius: 8,
                background: "#ffffff",
                color: "#333333",
                cursor: "pointer",
              }}
            >
              Exit present
            </button>
          </div>
        )}
        {/* System tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "4px 0",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {SYSTEM_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSystem(tab.id);
                setSelectedInfo(null);
                setIsolatedNode(null);
              }}
              style={{
                flex: "0 0 auto",
                padding: "6px 12px",
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                border: "1px solid",
                borderColor:
                  activeSystem === tab.id
                    ? tab.color
                    : "#111111",
                borderRadius: 8,
                background:
                  activeSystem === tab.id
                    ? `${tab.color}22`
                    : "#ffffff",
                color: activeSystem === tab.id ? tab.color : "#333333",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls bar */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "4px 0",
            alignItems: "center",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Search anatomy…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch(searchQuery);
            }}
            style={{
              flex: "1 1 120px",
              maxWidth: 200,
              padding: "5px 10px",
              fontSize: 11,
              background: "#ffffff",
              border: "1px solid #111111",
              borderRadius: 8,
              color: "#111111",
              outline: "none",
            }}
          />
          <ToolBtn
            active={xrayMode}
            onClick={() => setXrayMode((p) => !p)}
            label="X-Ray"
          />
          {selectedInfo && (
            <>
              <ToolBtn
                active={isolatedNode === selectedInfo.name}
                onClick={() =>
                  setIsolatedNode((p) =>
                    p === selectedInfo.name ? null : selectedInfo.name,
                  )
                }
                label="Isolate"
              />
              <ToolBtn
                active={hiddenNodes.has(selectedInfo.name)}
                onClick={() =>
                  setHiddenNodes((prev) => {
                    const next = new Set(prev);
                    if (next.has(selectedInfo.name)) next.delete(selectedInfo.name);
                    else next.add(selectedInfo.name);
                    return next;
                  })
                }
                label="Hide"
              />
            </>
          )}
          <ToolBtn active={false} onClick={() => startTour(activeSystem)} label="Tour" />
          <ToolBtn active={false} onClick={() => api.reset()} label="Reset" />
          <HandControlToggle variant="tool" />
        </div>

        {/* 3D Canvas */}
        <div className="dh-anatomy-canvas" style={{ flex: "1 1 auto", minHeight: 0, width: "100%", position: "relative", overflow: "hidden" }}>
          <Canvas
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [0, 0.9, 3.2], fov: 35 }}
            style={{ width: "100%", height: "100%", display: "block", background: "#ffffff" }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.1;
            }}
          >
            {/* Lighting — soft studio setup */}
            <ambientLight intensity={0.4} />
            <hemisphereLight
              color="#c8d8e8"
              groundColor="#203040"
              intensity={0.8}
            />
            <directionalLight
              position={[-2, 4, 3]}
              intensity={2.0}
              color="#fffaf4"
            />
            <directionalLight
              position={[2, 2, -3]}
              intensity={0.28}
              color="#fff1e6"
            />

            <OrbitControls
              ref={controlsRef}
              makeDefault
              enableDamping
              dampingFactor={0.08}
              minDistance={0.1}
              maxDistance={8}
              onChange={() => invalidate()}
            />

            <CameraFly target={flyTarget} controlsRef={controlsRef} />
            <FrameFullBody token={activeSystem} />

            <GestureCursorRig cursorNdcRef={cursorNdcRef} onHoverNode={handleGestureHoverNode} />

            <Suspense fallback={null}>
              {modelUrl && (
                <SystemScene
                  modelUrl={modelUrl}
                  system={activeSystem}
                  onHover={handlePointerHover}
                  onSelect={selectAndFly}
                  selected={selectedInfo?.name || null}
                  xrayMode={xrayMode}
                  hiddenNodes={hiddenNodes}
                  isolatedNode={isolatedNode}
                  searchTarget={null}
                  externalHovered={gestureHoverName}
                  onReady={() => onSystemLoaded(activeSystem)}
                />
              )}
              {atlasSystemIds && (
                <AtlasSystemScene
                  system={activeSystem}
                  atlasSystemIds={atlasSystemIds}
                  onHover={handlePointerHover}
                  onSelect={selectAndFly}
                  selected={selectedInfo?.name || null}
                  xrayMode={xrayMode}
                  hiddenNodes={hiddenNodes}
                  isolatedNode={isolatedNode}
                  externalHovered={gestureHoverName}
                />
              )}
            </Suspense>
          </Canvas>

          {/* Hover tooltip */}
          {hoveredInfo && !selectedInfo && (
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                background: "#ffffff",
                backdropFilter: "blur(12px)",
                border: "1px solid #111111",
                borderRadius: 8,
                padding: "6px 12px",
                color: "#111111",
                fontSize: 12,
                fontWeight: 700,
                zIndex: 15,
                pointerEvents: "none",
              }}
            >
              {hoveredInfo.label}
            </div>
          )}

          {/* Selected info card */}
          {selectedInfo && !touring && (
            <InfoCard
              info={selectedInfo}
              onClose={() => setSelectedInfo(null)}
              onAskCoPilot={
                onAskCoPilot
                  ? (s) => onAskCoPilot(s, patient ? `Patient: ${patient.name}` : "")
                  : undefined
              }
            />
          )}

          {/* Tour overlay */}
          {touring && (
            <TourOverlay
              steps={tourSteps}
              currentIndex={tourIndex}
              paused={tourPaused}
              onPause={() => setTourPaused(true)}
              onResume={() => setTourPaused(false)}
              onStep={stepTour}
              onStop={() => setTouring(false)}
            />
          )}

          {/* Loading ring when Suspense child is loading */}
          {!loaded.has(activeSystem) && modelUrl && <LoadingRing />}

          {/* Attribution */}
          <div
            style={{
              position: "absolute",
              bottom: 4,
              left: 8,
              fontSize: 9,
              color: "#555555",
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            Anatomy models: Z-Anatomy, CC BY-SA 4.0 / BodyParts3D, CC BY 4.0
          </div>
        </div>
      </div>
    </Anatomy3DContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Small tool button
// ---------------------------------------------------------------------------

function ToolBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 10px",
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        border: "1px solid",
        borderColor: active ? "#0f766e" : "#111111",
        borderRadius: 8,
        background: active ? "#ecfdf5" : "#ffffff",
        color: active ? "#0f766e" : "#333333",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );
}

Object.values(MODEL_URLS).forEach((url) => {
  useGLTF.preload(url);
});
