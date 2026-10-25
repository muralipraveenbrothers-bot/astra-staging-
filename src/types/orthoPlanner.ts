// ASTRA OrthoPlanner — data models
// Orthopedic / reconstruction planning workspace

export interface OrthoPlan {
  id: string;
  patientUhid: string;
  patientName: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  bodyRegion: string;
  laterality: "Left" | "Right" | "Bilateral" | "Midline" | "NA";
  diagnosis?: string;
  procedure?: string;
  status: "DRAFT" | "REVIEW" | "FINALIZED";
  landmarks: PlannerLandmark[];
  measurements: PlannerMeasurement[];
  notes: string[];
  imagingRefs: string[];
  slicerScenePath?: string;
  reconstructionMode?: string;
}

export interface PlannerLandmark {
  id: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  createdAt: string;
}

export interface PlannerMeasurement {
  id: string;
  type: "distance" | "angle" | "length";
  label: string;
  value: number;
  unit: "mm" | "cm" | "deg";
  source: "WEB_SIMULATION" | "SLICER" | "RADIOLOGY";
}

export interface PatientImagingSource {
  id: string;
  patientUhid: string;
  modality: string;
  sourceType: "DICOM" | "STL" | "GLB" | "SEGMENTATION" | "REPORT_ONLY";
  path?: string;
  url?: string;
}

export type AnatomyVisualMode = "astra_atlas" | "clinical_holo" | "lightweight";

export type AnatomySystemId =
  | "skeletal"
  | "muscular"
  | "cardiovascular"
  | "respiratory"
  | "nervous"
  | "digestive"
  | "endocrine"
  | "urinary"
  | "reproductive"
  | "lymphatic"
  | "integumentary";

export interface AnatomyStructure {
  id: string;
  name: string;
  system: AnatomySystemId;
  description?: string;
  clinicalRelevance?: string;
}

export interface AnatomySelectedContext {
  patientUhid: string;
  patientName: string;
  selectedStructureId: string;
  selectedStructureName: string;
  system: string;
  currentDiagnosis?: string;
  chiefComplaints?: string;
  symptoms?: string[];
  availableImaging?: string[];
  availableLabData?: string[];
}

export type SlicerStatus = {
  installed: boolean;
  executableFound: boolean;
  extensionFound: boolean;
  ready: boolean;
  version?: string;
  error?: string;
};
