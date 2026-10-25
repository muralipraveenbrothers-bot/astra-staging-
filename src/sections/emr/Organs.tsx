import * as THREE from "three";

export function Organs() {
  return (
    <group>
      <mesh position={[-0.05, 0.42, 0.06]}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color="#dc2626" roughness={0.4} />
      </mesh>
      <mesh position={[-0.18, 0.45, 0.04]}>
        <sphereGeometry args={[0.14, 18, 18]} />
        <meshStandardMaterial color="#fca5a5" transparent opacity={0.85} roughness={0.5} />
      </mesh>
      <mesh position={[0.18, 0.45, 0.04]}>
        <sphereGeometry args={[0.14, 18, 18]} />
        <meshStandardMaterial color="#fca5a5" transparent opacity={0.85} roughness={0.5} />
      </mesh>
      <mesh position={[0.12, 0.08, 0.04]} scale={[1, 0.7, 0.6]}>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshStandardMaterial color="#92400e" roughness={0.5} />
      </mesh>
      <mesh position={[0.05, 0.0, 0.02]} rotation={[0, 0, 0.3]}>
        <capsuleGeometry args={[0.04, 0.22, 6, 12]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.45} />
      </mesh>
      <mesh position={[-0.1, 0.05, 0.03]} scale={[1, 0.8, 0.7]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color="#fdba74" roughness={0.5} />
      </mesh>
      <mesh position={[-0.14, -0.1, -0.04]}>
        <sphereGeometry args={[0.06, 14, 14]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.4} />
      </mesh>
      <mesh position={[0.14, -0.1, -0.04]}>
        <sphereGeometry args={[0.06, 14, 14]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.4} />
      </mesh>
    </group>
  );
}

export function Skeleton() {
  return (
    <group>
      <mesh position={[0, 0.1, -0.12]}>
        <capsuleGeometry args={[0.05, 1.4, 6, 14]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} metalness={0.1} />
      </mesh>
      {[-0.2, 0, 0.2].map((y, i) => (
        <mesh key={i} position={[0, 0.45 + y, -0.05]} rotation={[0.3, 0, 0]}>
          <torusGeometry args={[0.16, 0.015, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[-0.18, -1.1, -0.02]}>
        <capsuleGeometry args={[0.05, 1.0, 6, 12]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      <mesh position={[0.18, -1.1, -0.02]}>
        <capsuleGeometry args={[0.05, 1.0, 6, 12]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.27, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e2e8f0" transparent opacity={0.25} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.6, -0.03]}>
        <torusGeometry args={[0.22, 0.04, 8, 24]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
    </group>
  );
}