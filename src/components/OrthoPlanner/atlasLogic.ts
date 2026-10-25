import { ORTHO_BONES } from "@/services/orthoClassificationData";

export const BONE_ATLAS_LABEL: Record<string, string> = {
  humerus: "humerus",
  radius_ulna: "radius",
  radius: "radius",
  femur: "femur",
  tibia_fibula: "tibia",
  mandible: "mandible",
  pelvis: "hip bone",
  clavicle: "clavicle",
  calcaneus: "calcaneus",
  spine: "vertebral column",
  patella: "patella",
};

export function atlasNameToBoneId(name: string): string | null {
  const lowerName = name.toLowerCase();
  const match = Object.entries(BONE_ATLAS_LABEL).find(([_id, atlasName]) =>
    lowerName.includes(atlasName.toLowerCase())
  );
  if (match) return match[0];

  const bone = ORTHO_BONES.find((candidate) => lowerName.includes(candidate.name.toLowerCase()));
  return bone?.id ?? null;
}
