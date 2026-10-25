import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, TransformControls, Box } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FractureClassification } from "@/services/orthoClassificationData";
import type { PlannerLandmark } from "@/types/orthoPlanner";
import { getViewPreset, type PlannerView } from "./viewPresets";
import {
  registerGestureViewer,
  type GestureViewerAdapter,
} from "@/features/mayin/gesture/gestureViewerRegistry";

/** Animates OrbitControls camera to the requested view preset */
function CameraController({ view, controlsRef }: { view: PlannerView; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const animating = useRef(false);
  const t = useRef(0);

  useEffect(() => {
    const preset = getViewPreset(view);
    targetPos.current.set(...preset.position);
    targetLook.current.set(...preset.target);
    animating.current = true;
    t.current = 0;
  }, [view]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    t.current = Math.min(1, t.current + delta * 2.5); // ~400ms ease
    const ease = 1 - Math.pow(1 - t.current, 3); // ease-out cubic
    camera.position.lerp(targetPos.current, ease);
    if (controlsRef.current) {
      const ctrl = controlsRef.current;
      ctrl.target.lerp(targetLook.current, ease);
      ctrl.update();
    }
    if (t.current >= 1) animating.current = false;
  });

  return null;
}

// Preload anatomical 3D assets
useGLTF.preload("/Skeleton.glb");
useGLTF.preload("/BoneReconstructionPlanner.gltf");

function normalizeBoneName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Map all orthopedic and skeletal regions to exact node names in Skeleton.glb
const SKELETON_NODE_MAP: Record<string, string[]> = {
  humerus: ["humerusr"],
  "humerus.l": ["humerusl"],
  radius_ulna: ["radiusr", "ulnar"],
  "radius / ulna": ["radiusr", "ulnar"],
  radius: ["radiusr", "ulnar"],
  ulna: ["ulnar", "radiusr"],
  femur: ["femurr"],
  "femur.l": ["femurl"],
  tibia_fibula: ["tibiar", "fibular"],
  "tibia / fibula": ["tibiar", "fibular"],
  tibia: ["tibiar", "fibular"],
  fibula: ["fibular", "tibiar"],
  mandible: ["mandible"],
  pelvis: ["hipboner"],
  "pelvis / acetabulum": ["hipboner"],
  clavicle: ["clavicler", "scapular"],
  calcaneus: ["calcaneusr", "talusr", "navicularboner", "cuboidboner"],
  spine: [
    "vertebrat9",
    "vertebrat10",
    "vertebrat11",
    "vertebrat12",
    "vertebral1",
    "vertebral2",
    "vertebral3",
    "vertebral4",
    "vertebral5",
  ],
  "thoracolumbar spine": [
    "vertebrat9",
    "vertebrat10",
    "vertebrat11",
    "vertebrat12",
    "vertebral1",
    "vertebral2",
    "vertebral3",
    "vertebral4",
    "vertebral5",
  ],
  patella: ["patellar"],
  scapula: ["scapular"],
};

// 3D Surgical Cutting Guide Jig
function SurgicalCuttingGuideJig({
  position,
  rotation,
  label,
  angle,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  label: string;
  angle?: number;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0.7, 0, 0]} castShadow>
        <boxGeometry args={[1.4, 0.45, 0.85]} />
        <meshStandardMaterial
          color="#cbd5e1"
          transparent
          opacity={0.82}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.6, 0.06, 1.05]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.65} metalness={0.8} />
      </mesh>
      <mesh position={[0.9, 0, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.9, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <ringGeometry args={[0.2, 1.2, 32]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {label && (
        <Html position={[1.7, 0, 0]} center>
          <div className="flex items-center gap-1 bg-slate-900/90 text-cyan-200 border border-cyan-500/40 text-[9px] font-mono px-1.5 py-0.5 rounded shadow-lg backdrop-blur-sm whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>{label}</span>
            {angle !== undefined && <span className="text-amber-400 font-bold">{angle}°</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

// 3D Anatomical Locking Compression Plate (LCP) Fixation System
function AnatomicalFixationPlate({
  position,
  rotation,
  boneHeight,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  boneHeight: number;
}) {
  const plateLength = Math.min(3.8, boneHeight * 0.75);
  const screwPositions = [-1.4, -0.85, -0.3, 0.3, 0.85, 1.4].filter(
    (y) => Math.abs(y) <= plateLength / 2 - 0.2
  );

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0.22, 0, 0]}>
        <boxGeometry args={[0.1, plateLength, 0.28]} />
        <meshStandardMaterial
          color="#38bdf8"
          metalness={0.88}
          roughness={0.2}
          envMapIntensity={1.2}
        />
      </mesh>
      {screwPositions.map((yPos, idx) => (
        <group key={idx} position={[0.22, yPos, 0]}>
          <mesh position={[0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, 0.04, 16]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.95} roughness={0.1} />
          </mesh>
          <mesh position={[-0.32, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.045, 0.045, 0.75, 16]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
          </mesh>
        </group>
      ))}
      <Html position={[0.5, 0, 0]} center>
        <div className="bg-sky-950/80 text-sky-200 border border-sky-500/40 text-[8px] font-mono px-1 py-0.5 rounded shadow whitespace-nowrap">
          Titanium LCP 3.5mm ({screwPositions.length} Locking Screws)
        </div>
      </Html>
    </group>
  );
}

// 3D Vascularized Fibula Free-Flap Inset System
function VascularizedFibulaFreeFlapSystem({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <group position={[-0.6, 0.5, 0]} rotation={[0, 0, 0.35]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.24, 0.24, 1.4, 24]} />
          <meshStandardMaterial color="#fef08a" roughness={0.42} />
        </mesh>
        <Html position={[0, 0.8, 0]} center>
          <div className="text-[8px] font-mono text-purple-200 bg-purple-950/80 px-1 py-0.5 rounded border border-purple-500/40 whitespace-nowrap">
            Flap Seg 1: 32mm (Body) · 25°
          </div>
        </Html>
      </group>
      <group position={[0.45, -0.4, 0]} rotation={[0, 0, -0.45]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.24, 0.24, 1.3, 24]} />
          <meshStandardMaterial color="#fef08a" roughness={0.42} />
        </mesh>
        <Html position={[0, -0.8, 0]} center>
          <div className="text-[8px] font-mono text-purple-200 bg-purple-950/80 px-1 py-0.5 rounded border border-purple-500/40 whitespace-nowrap">
            Flap Seg 2: 28mm (Symphysis) · 45°
          </div>
        </Html>
      </group>
      <mesh position={[0, 0, 0.1]}>
        <tubeGeometry
          args={[
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(-0.9, 1.2, 0.1),
              new THREE.Vector3(-0.3, 0.6, 0.25),
              new THREE.Vector3(0.2, 0.0, 0.3),
              new THREE.Vector3(0.7, -0.7, 0.15),
              new THREE.Vector3(1.1, -1.3, 0.0),
            ]),
            32,
            0.045,
            12,
            false,
          ]}
        />
        <meshStandardMaterial color="#ef4444" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh position={[0.05, 0.02, 0.12]}>
        <tubeGeometry
          args={[
            new THREE.CatmullRomCurve3([
              new THREE.Vector3(-0.85, 1.25, 0.15),
              new THREE.Vector3(-0.25, 0.65, 0.28),
              new THREE.Vector3(0.25, 0.05, 0.32),
              new THREE.Vector3(0.75, -0.65, 0.18),
              new THREE.Vector3(1.15, -1.25, 0.05),
            ]),
            32,
            0.055,
            12,
            false,
          ]}
        />
        <meshStandardMaterial color="#2563eb" roughness={0.3} metalness={0.1} />
      </mesh>
      <Html position={[0, 0.2, 0.4]} center>
        <div className="bg-slate-900/90 text-rose-300 border border-rose-500/50 text-[8px] font-mono px-1.5 py-0.5 rounded shadow flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
          Peroneal Vascular Pedicle (12.4cm)
        </div>
      </Html>
    </group>
  );
}

// ─── PUZZLE STATE INTERFACE ──────────────────────────────────────────────────
type PuzzlePieceId = "proximal" | "distal" | "butterfly" | "flake";

interface PuzzleState {
  selectedPiece: PuzzlePieceId;
  distalOffset: [number, number, number];
  distalRot: [number, number, number];
  butterflyOffset: [number, number, number];
  butterflyRot: [number, number, number];
  flakeOffset: [number, number, number];
  flakeRot: [number, number, number];
  snapLocked: boolean;
  score: number;
}

// ─── HIGH-PRECISION REAL ANATOMICAL BONE MESH COMPONENT ──────────────────────
function RealAnatomicalBoneMesh({
  boneType,
  classification,
  reductionProgress,
  implantActive,
  osteotomyActive,
  freeFlapActive,
  manualMode,
  puzzleMode,
  puzzleState,
  setPuzzleState,
  showMeasurements = false,
}: {
  boneType: string;
  classification: FractureClassification | null;
  reductionProgress: number;
  implantActive: boolean;
  osteotomyActive: boolean;
  freeFlapActive: boolean;
  manualMode: boolean;
  puzzleMode: boolean;
  puzzleState: PuzzleState;
  setPuzzleState: React.Dispatch<React.SetStateAction<PuzzleState>>;
  showMeasurements?: boolean;
}) {
  const { gl } = useThree();
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  const distalRef = useRef<THREE.Group>(null);
  const [activeTransform, setActiveTransform] = useState<"translate" | "rotate">("translate");

  const skeletonGltf = useGLTF("/Skeleton.glb");

  const key = boneType.toLowerCase().trim();
  const targetNodeNames =
    SKELETON_NODE_MAP[key] ||
    SKELETON_NODE_MAP[key.replace(/\s*\/\s*/g, "_")] ||
    SKELETON_NODE_MAP[key.split(" ")[0]] || ["humerusr"];

  // Extract, merge, and center the real anatomical bone geometries
  const { geometry, normalizedHeight } = useMemo(() => {
    const geometriesToMerge: THREE.BufferGeometry[] = [];
    const targetNormals = targetNodeNames.map(normalizeBoneName);

    skeletonGltf.scene.updateMatrixWorld(true);

    skeletonGltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        const objNorm = normalizeBoneName(obj.name);
        const parentNorm = normalizeBoneName(obj.parent ? obj.parent.name : "");
        const grandNorm = normalizeBoneName(
          obj.parent && obj.parent.parent ? obj.parent.parent.name : ""
        );

        const isMatch = targetNormals.some((tNorm) => {
          return (
            parentNorm === tNorm ||
            objNorm === tNorm ||
            parentNorm.startsWith(tNorm) ||
            objNorm.startsWith(tNorm) ||
            grandNorm === tNorm
          );
        });

        if (isMatch) {
          const cloned = obj.geometry.clone();
          cloned.applyMatrix4(obj.matrixWorld);
          geometriesToMerge.push(cloned);
        }
      }
    });

    if (geometriesToMerge.length === 0) {
      const fallbackGeom = new THREE.CylinderGeometry(0.3, 0.3, 3.2, 32);
      return { geometry: fallbackGeom, normalizedHeight: 3.2 };
    }

    const merged =
      geometriesToMerge.length > 1
        ? mergeGeometries(geometriesToMerge, false)
        : geometriesToMerge[0];

    merged.computeBoundingBox();
    const box = merged.boundingBox || new THREE.Box3();
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Center geometry at origin (0, 0, 0)
    merged.translate(-center.x, -center.y, -center.z);

    // Scale so max dimension is ~3.8 units in view
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scaleFactor = 3.8 / maxDim;
    merged.scale(scaleFactor, scaleFactor, scaleFactor);
    merged.computeVertexNormals();

    return {
      geometry: merged,
      normalizedHeight: size.y * scaleFactor,
    };
  }, [skeletonGltf, targetNodeNames]);

  const params = classification?.reconstruction3DParams || {
    fractureLevel: 0.5,
    gapMm: 2.2,
    angulationDeg: 12,
    displacementMm: 9,
    fragments: 2,
  };

  const fracturePlaneY = (params.fractureLevel - 0.5) * (normalizedHeight * 0.7);

  const currentGap = params.gapMm * (1 - reductionProgress) * 0.07;
  const currentDisplacement = params.displacementMm * (1 - reductionProgress) * 0.035;
  const currentAngulation = (params.angulationDeg * (Math.PI / 180)) * (1 - reductionProgress);

  const proximalClip = useMemo(
    () => [new THREE.Plane(new THREE.Vector3(0, -1, 0), fracturePlaneY)],
    [fracturePlaneY]
  );
  const distalClip = useMemo(
    () => [new THREE.Plane(new THREE.Vector3(0, 1, 0), -fracturePlaneY)],
    [fracturePlaneY]
  );

  // Natural clinical bone ivory material
  const boneColor = "#eef4f8";
  const proximalColor = puzzleMode ? "#38bdf8" : boneColor;
  const distalColor = puzzleMode ? "#f43f5e" : reductionProgress === 1 ? boneColor : "#f8fafc";

  const proximalMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: proximalColor,
      roughness: 0.32,
      metalness: puzzleMode ? 0.2 : 0.05,
      side: THREE.DoubleSide,
      clippingPlanes: proximalClip,
      clipShadows: true,
    });
  }, [proximalColor, proximalClip, puzzleMode]);

  const distalMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: distalColor,
      roughness: 0.32,
      metalness: puzzleMode ? 0.2 : 0.05,
      side: THREE.DoubleSide,
      clippingPlanes: distalClip,
      clipShadows: true,
    });
  }, [distalColor, distalClip, puzzleMode]);

  const distalOffset = puzzleState?.distalOffset || [0, 0, 0];
  const distalRot = puzzleState?.distalRot || [0, 0, 0];
  const butterflyOffset = puzzleState?.butterflyOffset || [0, 0, 0];
  const butterflyRot = puzzleState?.butterflyRot || [0, 0, 0];
  const flakeOffset = puzzleState?.flakeOffset || [0, 0, 0];
  const flakeRot = puzzleState?.flakeRot || [0, 0, 0];

  useEffect(() => {
    if (!puzzleMode || !puzzleState) return;
    const distDist = Math.sqrt(
      distalOffset[0] ** 2 +
      distalOffset[1] ** 2 +
      distalOffset[2] ** 2
    );
    const rotDist = Math.abs(distalRot[2]);
    const totalError = distDist + rotDist * 0.5;
    const score = Math.max(0, Math.min(100, Math.round(100 - totalError * 40)));
    const locked = distDist < 0.12 && rotDist < 0.08;

    setPuzzleState((s) => ({ ...s, score, snapLocked: locked }));
  }, [puzzleMode, distalOffset, distalRot, setPuzzleState]);

  const distalPos: [number, number, number] = puzzleMode
    ? distalOffset
    : [currentDisplacement, -currentGap * 0.5, 0];

  const distalRotation: [number, number, number] = puzzleMode
    ? distalRot
    : [0, 0, currentAngulation];

  return (
    <group>
      <Box args={[6, 8, 6]} position={[0, 0, 0]} visible={true}>
        <meshBasicMaterial
          color={puzzleMode ? "#a855f7" : "#38bdf8"}
          wireframe={true}
          transparent
          opacity={puzzleMode ? 0.15 : 0.08}
        />
      </Box>

      {/* Proximal Anchor */}
      <group position={[0, currentGap * 0.5, 0]}>
        <mesh geometry={geometry} material={proximalMat} castShadow receiveShadow />
        {puzzleMode && (
          <Html position={[0, 1.4, 0]} center>
            <div className="bg-sky-950/90 text-sky-200 border border-sky-400 text-[8px] font-bold px-2 py-0.5 rounded-full shadow-lg">
              🧩 Piece 1: Proximal Anchor
            </div>
          </Html>
        )}
      </group>

      {/* Distal Fragment */}
      {manualMode || puzzleMode ? (
        <TransformControls
          mode={activeTransform}
          position={distalPos}
          rotation={distalRotation}
          onObjectChange={(e: any) => {
            if (puzzleMode && e?.target?.object) {
              const obj = e.target.object as THREE.Group;
              setPuzzleState((prev) => ({
                ...prev,
                distalOffset: [obj.position.x, obj.position.y, obj.position.z],
                distalRot: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
              }));
            }
          }}
        >
          <group ref={distalRef}>
            <mesh geometry={geometry} material={distalMat} castShadow receiveShadow />
            {puzzleMode && (
              <Html position={[0, -1.2, 0]} center>
                <div
                  className={`border text-[8px] font-bold px-2 py-0.5 rounded-full shadow-lg ${
                    puzzleState?.snapLocked
                      ? "bg-emerald-950 text-emerald-300 border-emerald-400 animate-pulse"
                      : "bg-rose-950 text-rose-200 border-rose-500"
                  }`}
                >
                  {puzzleState?.snapLocked ? "✓ LOCKED IN FIT!" : "🧩 Piece 2: Distal Fragment"}
                </div>
              </Html>
            )}
          </group>
        </TransformControls>
      ) : (
        <group ref={distalRef} position={distalPos} rotation={distalRotation}>
          <mesh geometry={geometry} material={distalMat} castShadow receiveShadow />
          {reductionProgress < 0.96 && !freeFlapActive && (
            <mesh position={[0, fracturePlaneY, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.05, 0.42, 32]} />
              <meshBasicMaterial color="#dc2626" side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      )}

      {/* Butterfly fragment */}
      {(params.fragments >= 3 || puzzleMode) && !freeFlapActive && (
        <group
          position={
            puzzleMode
              ? butterflyOffset
              : [0.45 * (1 - reductionProgress), fracturePlaneY, 0.3 * (1 - reductionProgress)]
          }
          rotation={
            puzzleMode
              ? butterflyRot
              : [0.4 * (1 - reductionProgress), 0.2 * (1 - reductionProgress), 0.6 * (1 - reductionProgress)]
          }
        >
          <mesh castShadow>
            <tetrahedronGeometry args={[0.32]} />
            <meshStandardMaterial
              color={puzzleMode ? "#10b981" : "#fbbf24"}
              roughness={0.45}
            />
          </mesh>
          {puzzleMode && (
            <Html position={[0.4, 0, 0]} center>
              <div className="bg-emerald-950/90 text-emerald-200 border border-emerald-400 text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow">
                🧩 Piece 3: Wedge
              </div>
            </Html>
          )}
        </group>
      )}

      {/* Comminuted Flake */}
      {puzzleMode && (
        <group position={flakeOffset} rotation={flakeRot}>
          <mesh castShadow>
            <dodecahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.45} />
          </mesh>
          <Html position={[0.3, 0, 0]} center>
            <div className="bg-amber-950/90 text-amber-200 border border-amber-400 text-[7px] font-bold px-1 py-0.5 rounded-full shadow">
              🧩 Piece 4: Flake
            </div>
          </Html>
        </group>
      )}

      {/* Osteotomy Guides */}
      {osteotomyActive && !freeFlapActive && !puzzleMode && (
        <group>
          {(params.osteotomyPlanes || [{ angle: 45, position: 0.5, label: "Osteotomy Cut" }]).map(
            (plane, idx) => (
              <SurgicalCuttingGuideJig
                key={idx}
                position={[0, (plane.position - 0.5) * normalizedHeight * 0.8, 0]}
                rotation={[0, 0, plane.angle * (Math.PI / 180)]}
                label={plane.label || `Cut Guide #${idx + 1}`}
                angle={plane.angle}
              />
            )
          )}
        </group>
      )}

      {/* Free flap */}
      {freeFlapActive && !puzzleMode && (
        <VascularizedFibulaFreeFlapSystem position={[0, 0, 0]} rotation={[0, 0, 0]} />
      )}

      {/* Implant plate */}
      {implantActive && !freeFlapActive && !puzzleMode && (
        <AnatomicalFixationPlate
          position={[currentDisplacement * 0.5 + 0.38, fracturePlaneY, 0]}
          rotation={[0, 0, currentAngulation * 0.5]}
          boneHeight={normalizedHeight}
        />
      )}

      {/* Real measurements */}
      {showMeasurements && !puzzleMode && (
        <BoneMeasurements
          geometry={geometry}
          gapMm={params.gapMm * (1 - reductionProgress)}
          angleDeg={params.angulationDeg * (1 - reductionProgress)}
        />
      )}

      {/* Gizmo switch */}
      {(manualMode || puzzleMode) && !freeFlapActive && (
        <Html position={[0, 3.2, 0]} center>
          <div className="flex gap-1.5 bg-slate-900/95 p-1.5 rounded-lg border border-cyan-500/40 shadow-2xl backdrop-blur-md">
            <button
              onClick={() => setActiveTransform("translate")}
              className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all ${
                activeTransform === "translate"
                  ? "bg-cyan-500 text-slate-950"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              MOVE XYZ
            </button>
            <button
              onClick={() => setActiveTransform("rotate")}
              className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all ${
                activeTransform === "rotate"
                  ? "bg-amber-500 text-slate-950"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              ROTATE 3D
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}

// SlicerBoneReconstructionPlanner Full GLTF Model Loader
function SlicerMandibleModel({ modelUrl }: { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);
  return (
    <primitive
      object={scene}
      scale={[0.035, 0.035, 0.035]}
      position={[0, -0.6, 0]}
    />
  );
}

interface InteractiveProps {
  boneType: string;
  classification: FractureClassification | null;
  reductionProgress: number;
  implantActive: boolean;
  osteotomyActive: boolean;
  freeFlapActive?: boolean;
  showMeasurements: boolean;
  useSlicerGLTF?: boolean;
  manualMode?: boolean;
  puzzleMode?: boolean;
  view?: PlannerView;
  onBoneClick?: (boneName: string) => void;
  landmarks?: PlannerLandmark[];
  onLandmarkAdd?: (x: number, y: number, z: number) => void;
  landmarkStep?: boolean;
}

/** Renders numbered landmark spheres in the 3D scene */
function LandmarkSpheres({ landmarks }: { landmarks: PlannerLandmark[] }) {
  return (
    <group>
      {landmarks.map((lm, idx) => (
        <group key={lm.id} position={[lm.x, lm.y, lm.z ?? 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.4} />
          </mesh>
          <Html position={[0.12, 0.12, 0]} center>
            <div className="bg-slate-900/95 text-amber-300 border border-amber-500/50 text-[8px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
              {idx + 1}. {lm.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** Renders real bone measurements from bounding box data */
function BoneMeasurements({ geometry, gapMm, angleDeg }: { geometry: THREE.BufferGeometry; gapMm: number; angleDeg: number }) {
  const { length, width, depth } = useMemo(() => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    box.getSize(size);
    // Scale factor: the mesh is normalized to ~3.8 units, real bone lengths vary
    // We use a rough scale of 1 unit ≈ 50mm for display
    const scale = 50;
    return {
      length: Math.round(size.y * scale),
      width: Math.round(size.x * scale),
      depth: Math.round(size.z * scale),
    };
  }, [geometry]);

  return (
    <Html position={[-2.2, -1.5, 0]}>
      <div className="bg-slate-900/95 border border-cyan-500/40 rounded-lg p-2 text-[9px] font-mono text-cyan-200 space-y-0.5 shadow-xl backdrop-blur-sm min-w-[120px]">
        <div className="text-[8px] font-bold text-cyan-400 uppercase tracking-wider mb-1">Measurements</div>
        <div>Length: <span className="text-white font-bold">{length} mm</span></div>
        <div>Width: <span className="text-white font-bold">{width} mm</span></div>
        <div>Depth: <span className="text-white font-bold">{depth} mm</span></div>
        {gapMm > 0.1 && <div>Gap: <span className="text-amber-300 font-bold">{gapMm.toFixed(1)} mm</span></div>}
        {angleDeg > 0.5 && <div>Angulation: <span className="text-amber-300 font-bold">{angleDeg.toFixed(1)}°</span></div>}
      </div>
    </Html>
  );
}

/** ClickableBone wrapper — hover glow + click to select */
function ClickableBoneWrapper({
  children,
  boneType,
  onBoneClick,
  landmarkStep,
  onLandmarkAdd,
}: {
  children: React.ReactNode;
  boneType: string;
  onBoneClick?: (boneName: string) => void;
  landmarkStep?: boolean;
  onLandmarkAdd?: (x: number, y: number, z: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group
      ref={groupRef}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; }}
      onClick={(e) => {
        e.stopPropagation();
        if (landmarkStep && onLandmarkAdd && e.point) {
          onLandmarkAdd(e.point.x, e.point.y, e.point.z);
        } else if (onBoneClick) {
          onBoneClick(boneType);
        }
      }}
    >
      {children}
      {/* Hover glow outline */}
      {hovered && (
        <mesh>
          <sphereGeometry args={[2.2, 16, 16]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} side={THREE.BackSide} />
        </mesh>
      )}
    </group>
  );
}

export function InteractiveBone3DCanvas({
  boneType,
  classification,
  reductionProgress,
  implantActive,
  osteotomyActive,
  freeFlapActive = false,
  showMeasurements,
  useSlicerGLTF = false,
  manualMode = false,
  puzzleMode = false,
  view = "AP",
  onBoneClick,
  landmarks = [],
  onLandmarkAdd,
  landmarkStep = false,
}: InteractiveProps) {
  const [puzzleState, setPuzzleState] = useState<PuzzleState>({
    selectedPiece: "distal",
    distalOffset: [0.65, -0.7, 0.25],
    distalRot: [0.2, 0.1, 0.35],
    butterflyOffset: [-0.6, 0.2, 0.4],
    butterflyRot: [0.3, 0.5, -0.2],
    flakeOffset: [0.4, 0.5, -0.3],
    flakeRot: [0.1, -0.3, 0.4],
    snapLocked: false,
    score: 35,
  });

  const handleScramble = useCallback(() => {
    setPuzzleState({
      selectedPiece: "distal",
      distalOffset: [(Math.random() - 0.5) * 1.5, -0.8 - Math.random() * 0.5, (Math.random() - 0.5) * 1.2],
      distalRot: [
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
      ],
      butterflyOffset: [
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.0,
        (Math.random() - 0.5) * 1.0,
      ],
      butterflyRot: [Math.random(), Math.random(), Math.random()],
      flakeOffset: [
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.0,
        (Math.random() - 0.5) * 1.0,
      ],
      flakeRot: [Math.random(), Math.random(), Math.random()],
      snapLocked: false,
      score: 18,
    });
  }, []);

  const handleAutoSolve = useCallback(() => {
    setPuzzleState({
      selectedPiece: "distal",
      distalOffset: [0, 0, 0],
      distalRot: [0, 0, 0],
      butterflyOffset: [0, 0, 0],
      butterflyRot: [0, 0, 0],
      flakeOffset: [0, 0, 0],
      flakeRot: [0, 0, 0],
      snapLocked: true,
      score: 100,
    });
  }, []);

  const controlsRef = useRef<any>(null);

  // Gesture bridge (prompt 07): hand gestures rotate / zoom / select this
  // canvas through the shared registry while hand control is ON.
  const boneTypeRef = useRef(boneType);
  boneTypeRef.current = boneType;
  const onBoneClickRef = useRef(onBoneClick);
  onBoneClickRef.current = onBoneClick;

  useEffect(() => {
    const adapter: GestureViewerAdapter = {
      id: "orthoplanner-bone",
      moveCursor: () => {},
      hideCursor: () => {},
      selectUnderCursor: () => onBoneClickRef.current?.(boneTypeRef.current),
      rotateBy: (dx, dy) => {
        const c = controlsRef.current;
        if (!c) return;
        c.rotateLeft(dx * 0.01);
        c.rotateUp(dy * 0.01);
        c.update();
      },
      zoomBy: (factor) => {
        const c = controlsRef.current;
        if (!c) return;
        if (factor > 1) c.dollyIn(factor);
        else c.dollyOut(1 / factor);
        c.update();
      },
      pan: (dx, dy) => {
        const c = controlsRef.current;
        if (!c?.pan) return;
        c.pan(dx, dy);
        c.update();
      },
      reset: () => controlsRef.current?.reset?.(),
      tourStep: () => {},
      setPresentMode: () => {},
    };
    return registerGestureViewer(adapter);
  }, []);

  // Only apply Slicer GLTF for mandible or fibula bones
  const boneKey = boneType.toLowerCase().trim();
  const isSlicerBone = boneKey === "mandible" || boneKey === "fibula";
  const effectiveSlicerGLTF = useSlicerGLTF && isSlicerBone;

  return (
    <div className="relative w-full h-full min-h-[440px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <Canvas
        camera={{ position: [0, 0, 5.8], fov: 42 }}
        gl={{ antialias: true, alpha: true, localClippingEnabled: true }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[6, 8, 5]} intensity={1.8} castShadow />
        <directionalLight position={[-6, -4, -3]} intensity={1.2} color="#38bdf8" />
        <directionalLight position={[0, -5, 4]} intensity={0.6} color="#f8fafc" />
        <pointLight position={[0, 0, 3.5]} intensity={0.7} color="#f8fafc" />

        <CameraController view={view} controlsRef={controlsRef} />

        <React.Suspense
          fallback={
            <Html center>
              <div className="text-xs text-cyan-300 animate-pulse font-mono bg-slate-900/90 px-3 py-1.5 rounded-lg border border-cyan-500/40 shadow-xl whitespace-nowrap flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                Loading Real Anatomical 3D Bone Geometry...
              </div>
            </Html>
          }
        >
          <ClickableBoneWrapper
            boneType={boneType}
            onBoneClick={onBoneClick}
            landmarkStep={landmarkStep}
            onLandmarkAdd={onLandmarkAdd}
          >
            {effectiveSlicerGLTF ? (
              <SlicerMandibleModel modelUrl="/BoneReconstructionPlanner.gltf" />
            ) : (
              <RealAnatomicalBoneMesh
                boneType={boneType}
                classification={classification}
                reductionProgress={reductionProgress}
                implantActive={implantActive}
                osteotomyActive={osteotomyActive}
                freeFlapActive={freeFlapActive}
                manualMode={manualMode}
                puzzleMode={puzzleMode}
                puzzleState={puzzleState}
                setPuzzleState={setPuzzleState}
                showMeasurements={showMeasurements}
              />
            )}
          </ClickableBoneWrapper>
          {landmarks.length > 0 && <LandmarkSpheres landmarks={landmarks} />}
        </React.Suspense>

        <OrbitControls
          ref={controlsRef}
          enablePan={!manualMode && !puzzleMode}
          enableZoom={true}
          enableRotate={!manualMode && !puzzleMode}
          autoRotate={
            !manualMode &&
            !puzzleMode &&
            !implantActive &&
            !osteotomyActive &&
            reductionProgress < 0.2 &&
            !freeFlapActive
          }
          autoRotateSpeed={0.4}
          minDistance={1.8}
          maxDistance={12}
        />
      </Canvas>

      {/* Clinical HUD Overlays */}
      <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1.5 z-10">
        <div className="px-2.5 py-1 rounded bg-slate-900/90 border border-slate-700 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-md flex items-center gap-1.5 shadow-lg w-max">
          <span
            className={`w-2 h-2 rounded-full ${
              puzzleMode
                ? "bg-purple-400 animate-ping"
                : manualMode
                ? "bg-amber-400 animate-pulse"
                : "bg-cyan-400 animate-ping"
            }`}
          />
          {puzzleMode
            ? "🧩 3D FRACTURE PUZZLE MATCHING"
            : useSlicerGLTF
            ? "SLICER VSP 3D ENGINE"
            : manualMode
            ? "MANUAL 3D BONE REDUCTION"
            : freeFlapActive
            ? "VASCULARIZED FREE-FLAP INSET"
            : "REAL ANATOMICAL BONE VSP"}
        </div>
        <div className="text-[10px] text-slate-300 font-mono bg-slate-950/75 px-2.5 py-1.5 rounded border border-slate-800 w-max backdrop-blur-md space-y-0.5">
          <div>
            Bone: <span className="text-cyan-300 font-bold uppercase">{boneType}</span>
          </div>
          <div>
            Classification:{" "}
            <span className="text-amber-300 font-bold">
              {classification?.code || "Anatomical Model"}
            </span>
          </div>
          {puzzleMode ? (
            <div className="flex items-center gap-1.5 mt-1">
              <span>Cortical Fit Score:</span>
              <span
                className={`font-bold font-mono px-1.5 py-0.2 rounded text-[10px] ${
                  puzzleState.score > 85
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : puzzleState.score > 50
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                }`}
              >
                {puzzleState.score}%
              </span>
            </div>
          ) : (
            reductionProgress > 0 &&
            !freeFlapActive && (
              <div>
                Reduction:{" "}
                <span className="text-emerald-400 font-bold">
                  {Math.round(reductionProgress * 100)}%
                </span>
              </div>
            )
          )}
        </div>
      </div>

      {/* PUZZLE MATCHING CONTROLS OVERLAY — bottom-left to avoid overlap with Reduction slider */}
      {puzzleMode && (
        <div className="absolute bottom-14 left-3 flex flex-col gap-1.5 z-10">
          <div className="bg-slate-900/95 backdrop-blur-md border border-purple-500/40 p-2 rounded-xl shadow-2xl space-y-2 w-56">
            <div className="flex items-center justify-between text-[10px] font-bold text-purple-200">
              <span>🧩 Fracture Puzzle</span>
              <span className="font-mono text-emerald-400">{puzzleState.score}% Match</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 transition-all duration-200"
                style={{ width: `${puzzleState.score}%` }}
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleScramble}
                className="flex-1 px-2 py-1 rounded text-[9px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition-all"
              >
                🎲 Scramble
              </button>
              <button
                onClick={handleAutoSolve}
                className="flex-1 px-2 py-1 rounded text-[9px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all"
              >
                ⚡ Snap Reduce
              </button>
            </div>
          </div>
        </div>
      )}

      {manualMode && !puzzleMode && !freeFlapActive && (
        <div className="absolute bottom-14 left-3 px-2.5 py-1 bg-amber-500/20 text-amber-200 border border-amber-500/40 rounded text-[9px] font-bold shadow-lg">
          TransformControls Active
        </div>
      )}
    </div>
  );
}
