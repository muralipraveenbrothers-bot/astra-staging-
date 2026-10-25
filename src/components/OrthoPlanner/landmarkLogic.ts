import type { PlannerLandmark } from "@/types/orthoPlanner";

export const LANDMARK_PRESETS: Record<string, string[]> = {
  femur: ["Greater Trochanter", "Lesser Trochanter", "Medial Epicondyle", "Lateral Epicondyle"],
  tibia_fibula: ["Tibial Tuberosity", "Medial Malleolus", "Lateral Malleolus"],
  humerus: ["Greater Tuberosity", "Lesser Tuberosity", "Medial Epicondyle", "Lateral Epicondyle"],
  mandible: ["Mental Foramen (L)", "Mental Foramen (R)", "Gonion (L)", "Gonion (R)"],
  pelvis: ["ASIS (L)", "ASIS (R)", "Pubic Symphysis", "Sacral Promontory"],
  radius_ulna: ["Radial Styloid", "Ulnar Styloid", "Lister Tubercle"],
  clavicle: ["Sternal End", "Acromial End"],
  calcaneus: ["Posterior Tuberosity", "Sustentaculum Tali"],
  spine: ["Superior Endplate", "Inferior Endplate", "Pedicle (L)", "Pedicle (R)"],
  patella: ["Superior Pole", "Inferior Pole"],
};

export type LandmarkState = Record<string, PlannerLandmark[]>;

export function nextLandmarkName(boneId: string, landmarks: PlannerLandmark[]): string {
  const presets = LANDMARK_PRESETS[boneId] ?? [];
  return presets[landmarks.length] ?? `Landmark ${landmarks.length + 1}`;
}

export function addLandmark(
  state: LandmarkState,
  boneId: string,
  point: { x: number; y: number; z?: number },
  now = new Date()
): LandmarkState {
  const existing = state[boneId] ?? [];
  const landmark: PlannerLandmark = {
    id: `lm-${now.getTime()}-${existing.length}`,
    name: nextLandmarkName(boneId, existing),
    x: point.x,
    y: point.y,
    z: point.z,
    createdAt: now.toISOString(),
  };
  return { ...state, [boneId]: [...existing, landmark] };
}

export function renameLandmark(state: LandmarkState, boneId: string, landmarkId: string, name: string): LandmarkState {
  return {
    ...state,
    [boneId]: (state[boneId] ?? []).map((landmark) =>
      landmark.id === landmarkId ? { ...landmark, name } : landmark
    ),
  };
}

export function deleteLandmark(state: LandmarkState, boneId: string, landmarkId: string): LandmarkState {
  return {
    ...state,
    [boneId]: (state[boneId] ?? []).filter((landmark) => landmark.id !== landmarkId),
  };
}
