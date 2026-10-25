import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { Suspense } from "react";
import { AnatomyScene } from "./AnatomyScene";

interface AnatomyViewerProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  systemFilter: string;
}

export function AnatomyViewer({ activeId, onSelect, systemFilter }: AnatomyViewerProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.3, 2.6], fov: 42 }}
      dpr={[1, 1.8]}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.65} />
        <directionalLight position={[3, 5, 4]} intensity={1.1} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <pointLight position={[0, 1, 2]} intensity={0.5} color="#60a5fa" />
        <AnatomyScene activeId={activeId} onSelect={onSelect} systemFilter={systemFilter} />
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={1.2}
          maxDistance={5}
          target={[0, 0.2, 0]}
        />
      </Suspense>
    </Canvas>
  );
}