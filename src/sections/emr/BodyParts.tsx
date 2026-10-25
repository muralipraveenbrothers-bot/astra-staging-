import * as THREE from "three";

export function TransparentBody() {
  return (
    <group>
      <mesh position={[0, 0.1, 0]}>
        <capsuleGeometry args={[0.42, 1.0, 8, 24]} />
        <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.14} roughness={0.1} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.26, 24, 24]} />
        <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.16} roughness={0.1} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <capsuleGeometry args={[0.38, 0.3, 8, 20]} />
        <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.12} roughness={0.1} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.55, 0.15, 0]} rotation={[0, 0, 0.18]}>
        <capsuleGeometry args={[0.1, 0.95, 6, 16]} />
        <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.1} roughness={0.15} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.55, 0.15, 0]} rotation={[0, 0, -0.18]}>
        <capsuleGeometry args={[0.1, 0.95, 6, 16]} />
        <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.1} roughness={0.15} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.18, -1.15, 0]}>
        <capsuleGeometry args={[0.13, 1.1, 6, 16]} />
        <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.12} roughness={0.12} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.18, -1.15, 0]}>
        <capsuleGeometry args={[0.13, 1.1, 6, 16]} />
        <meshPhysicalMaterial color="#93c5fd" transparent opacity={0.12} roughness={0.12} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}