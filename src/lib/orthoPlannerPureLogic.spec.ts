import { describe, expect, it } from "vitest";
import { BONE_ATLAS_LABEL, atlasNameToBoneId } from "@/components/OrthoPlanner/atlasLogic";
import { addLandmark, deleteLandmark, nextLandmarkName, renameLandmark } from "@/components/OrthoPlanner/landmarkLogic";
import { VIEW_PRESETS } from "@/components/OrthoPlanner/viewPresets";
import { patientRecordToPatient } from "@/components/OrthoPlanner/patientMapping";

describe("OrthoPlanner pure logic", () => {
  it("maps atlas labels by ORTHO_BONES ids", () => {
    expect(BONE_ATLAS_LABEL.radius_ulna).toBe("radius");
    expect(BONE_ATLAS_LABEL.tibia_fibula).toBe("tibia");
    expect(BONE_ATLAS_LABEL.pelvis).toBe("hip bone");
    expect(BONE_ATLAS_LABEL.spine).toBe("vertebral column");
    expect(atlasNameToBoneId("Vertebral column T12")).toBe("spine");
    expect(atlasNameToBoneId("left radius shaft")).toBe("radius_ulna");
  });

  it("keeps stable view presets", () => {
    expect(VIEW_PRESETS.AP.position).toEqual([0, 0, 5.8]);
    expect(VIEW_PRESETS.PA.position).toEqual([0, 0, -5.8]);
    expect(VIEW_PRESETS.lateral.position).toEqual([5.8, 0, 0]);
  });

  it("adds, renames, deletes landmarks and advances presets", () => {
    const first = addLandmark({}, "femur", { x: 1, y: 2, z: 3 }, new Date("2026-01-01T00:00:00.000Z"));
    expect(first.femur[0].name).toBe("Greater Trochanter");
    expect(nextLandmarkName("femur", first.femur)).toBe("Lesser Trochanter");

    const renamed = renameLandmark(first, "femur", first.femur[0].id, "GT custom");
    expect(renamed.femur[0].name).toBe("GT custom");

    const deleted = deleteLandmark(renamed, "femur", first.femur[0].id);
    expect(deleted.femur).toEqual([]);
  });

  it("maps store patient records to full Patient defaults", () => {
    const patient = patientRecordToPatient({
      id: "PT-1",
      name: "Test Patient",
      registeredAt: "2026-01-01",
      source: "manual",
    });
    expect(patient.uhid).toBe("PT-1");
    expect(patient.gender).toBe("Other");
    expect(patient.vitals).toEqual({ bp: "", pulse: 0, temp: 0, spo2: 0, respRate: 0 });
    expect(patient.billStatus).toBe("Pending");
  });
});
