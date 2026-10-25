import type { LucideIcon } from "lucide-react";

export interface Patient {
  id: string;
  uhid: string;
  name: string;
  age: number;
  gender: string;
  department: string;
  bed: string;
  type: string;
  diagnosis: string;
  complaints: string;
  vitals: {
    bp: string;
    hr: number;
    temp: number;
    spo2: number;
    rr: number;
  };
}

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tier?: string;
  timestamp?: string;
  orderDraft?: any;
  orderConfirmed?: any;
  showPathMap?: boolean;
  videoCall?: { bed: string; ward: string; staffName: string };
  statusCard?: { title: string; items: Array<{ label: string; value: string; color?: string }> };
  attachedImage?: string;
  pdfUrl?: string;
  imageAnalysis?: any;
  dxAnalysis?: any;
};

export type ClinicalTab = "symptom" | "erx" | "lab" | "ward" | "discharge";

export interface ClinicalTabDef {
  id: ClinicalTab;
  label: string;
  icon: LucideIcon;
}
