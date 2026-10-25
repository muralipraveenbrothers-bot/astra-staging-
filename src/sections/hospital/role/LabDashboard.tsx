import React, { useState, useMemo } from "react";
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Barcode,
  Bot,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  DollarSign,
  Download,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  HelpCircle,
  Layers,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Scan,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  TestTube,
  Trash2,
  TrendingUp,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { executeWorkflowAction } from "@/astra/clinical/workflow/workflowClient";
import { submitResultReport } from "@/astra/clinical/results/resultsClient";
import { labVoiceLine } from "@/astra/clinical/results/resultsLoop";
import { voiceEngine } from "@/astra/voice/voiceEngine";
import { useAuth } from "@/lib/auth";
import { HospitalPrintEngine } from "@/lib/printEngine";

type LabSubTab = "workstation" | "barcode" | "reagents" | "analytics";
type OcrEngine = "vision" | "tesseract" | "manual";

interface ParameterRow {
  param: string;
  observed: string;
  unit: string;
  normalRange: string;
  isPanic?: boolean;
}

interface LabOrder {
  id: string;
  uhid: string;
  patientName: string;
  age: number;
  gender: "Male" | "Female";
  doctorName: string;
  doctorPhone: string;
  testName: string;
  category: "Hematology" | "Biochemistry" | "Microbiology" | "Immunology" | "Pathology";
  baseTariff: number;
  orderedAt: string;
  status: "Ordered" | "Completed";
  clinicalHistory: string;
  parameters: ParameterRow[];
  impression: string;
  icd10Code: string;
  isOutsidePatient?: boolean;
}

export const TEST_PARAMETER_TEMPLATES: Record<string, { tariff: number; category: string; parameters: ParameterRow[]; impression: string; icd10: string }> = {
  "Complete Blood Count (CBC) + Dengue NS1 Antigen": {
    tariff: 400,
    category: "Hematology",
    parameters: [
      { param: "Hemoglobin (Hb)", observed: "11.2", unit: "g/dL", normalRange: "12.0 - 16.0" },
      { param: "Total WBC Count", observed: "3,200", unit: "/uL", normalRange: "4,000 - 11,000", isPanic: true },
      { param: "Platelet Count", observed: "82,000", unit: "/uL", normalRange: "150,000 - 450,000", isPanic: true },
      { param: "RBC Count", observed: "4.1", unit: "M/uL", normalRange: "4.2 - 5.8" },
      { param: "Neutrophils", observed: "58", unit: "%", normalRange: "40 - 70" },
      { param: "Lymphocytes", observed: "32", unit: "%", normalRange: "20 - 40" },
      { param: "Eosinophils", observed: "4", unit: "%", normalRange: "1 - 6" },
      { param: "Dengue NS1 Antigen", observed: "POSITIVE", unit: "Index", normalRange: "NEGATIVE", isPanic: true },
      { param: "Dengue IgM Antibody", observed: "POSITIVE", unit: "Index", normalRange: "NEGATIVE", isPanic: true },
      { param: "Dengue IgG Antibody", observed: "NEGATIVE", unit: "Index", normalRange: "NEGATIVE" },
    ],
    impression: "Severe Thrombocytopenia with Leukopenia. Suggests Dengue Viral Infection with warning signs.",
    icd10: "A97.1",
  },
  "Complete Blood Picture (CBP)": {
    tariff: 400,
    category: "Hematology",
    parameters: [
      { param: "Hemoglobin (Hb)", observed: "12.8", unit: "g/dL", normalRange: "12.0 - 16.0" },
      { param: "Total Leucocyte Count (TLC)", observed: "6,400", unit: "/uL", normalRange: "4,000 - 11,000" },
      { param: "Platelet Count", observed: "210,000", unit: "/uL", normalRange: "150,000 - 450,000" },
      { param: "Packed Cell Volume (PCV)", observed: "38.2", unit: "%", normalRange: "36.0 - 48.0" },
      { param: "Mean Corpuscular Volume (MCV)", observed: "88.4", unit: "fL", normalRange: "80.0 - 100.0" },
      { param: "MCH", observed: "29.2", unit: "pg", normalRange: "27.0 - 32.0" },
      { param: "MCHC", observed: "33.5", unit: "g/dL", normalRange: "31.5 - 35.0" },
      { param: "Neutrophils", observed: "62", unit: "%", normalRange: "40 - 70" },
      { param: "Lymphocytes", observed: "30", unit: "%", normalRange: "20 - 40" },
    ],
    impression: "Normocytic Normochromic blood picture. All hematological parameters within normal limits.",
    icd10: "Z01.89",
  },
  "Hemoglobin (Hb)": {
    tariff: 150,
    category: "Hematology",
    parameters: [
      { param: "Hemoglobin (Hb)", observed: "11.4", unit: "g/dL", normalRange: "12.0 - 16.0" },
      { param: "Hematocrit (Calculated)", observed: "34.2", unit: "%", normalRange: "36.0 - 48.0" },
    ],
    impression: "Mild microcytic anemia. Dietary iron supplementation recommended.",
    icd10: "D50.9",
  },
  "Platelet Count": {
    tariff: 150,
    category: "Hematology",
    parameters: [
      { param: "Observed Value 1", observed: "Normal", unit: "-", normalRange: "Normal" },
      { param: "Observed Value 2", observed: "Negative", unit: "-", normalRange: "Negative" },
      { param: "Platelet Count (Automated)", observed: "185,000", unit: "/uL", normalRange: "150,000 - 450,000" },
    ],
    impression: "Findings documented.",
    icd10: "Z01.89",
  },
  "ESR (Westergren)": {
    tariff: 100,
    category: "Hematology",
    parameters: [
      { param: "Erythrocyte Sedimentation Rate (1st Hr)", observed: "24", unit: "mm/hr", normalRange: "0 - 20" },
    ],
    impression: "Borderline elevated ESR indicative of non-specific inflammatory response.",
    icd10: "R70.0",
  },
  "Arterial Blood Gas (ABG) + Serum Electrolytes": {
    tariff: 400,
    category: "Biochemistry",
    parameters: [
      { param: "pH", observed: "7.38", unit: "", normalRange: "7.35 - 7.45" },
      { param: "pCO2", observed: "38", unit: "mmHg", normalRange: "35 - 45" },
      { param: "pO2", observed: "92", unit: "mmHg", normalRange: "80 - 100" },
      { param: "Serum Sodium (Na+)", observed: "138", unit: "mEq/L", normalRange: "135 - 145" },
      { param: "Serum Potassium (K+)", observed: "4.2", unit: "mEq/L", normalRange: "3.5 - 5.0" },
      { param: "Serum Chloride (Cl-)", observed: "101", unit: "mEq/L", normalRange: "98 - 106" },
      { param: "Bicarbonate (HCO3)", observed: "23.4", unit: "mEq/L", normalRange: "22 - 26" },
    ],
    impression: "Normal acid-base equilibrium and serum electrolyte values.",
    icd10: "E87.8",
  },
  "Liver Function Test (LFT) + Lipid Profile": {
    tariff: 400,
    category: "Biochemistry",
    parameters: [
      { param: "Total Bilirubin", observed: "1.4", unit: "mg/dL", normalRange: "0.2 - 1.2" },
      { param: "Direct Bilirubin", observed: "0.5", unit: "mg/dL", normalRange: "0.0 - 0.3" },
      { param: "SGOT / AST", observed: "58", unit: "U/L", normalRange: "10 - 40" },
      { param: "SGPT / ALT", observed: "64", unit: "U/L", normalRange: "10 - 45" },
      { param: "Alkaline Phosphatase (ALP)", observed: "112", unit: "U/L", normalRange: "40 - 130" },
      { param: "Total Cholesterol", observed: "215", unit: "mg/dL", normalRange: "< 200" },
      { param: "Triglycerides", observed: "185", unit: "mg/dL", normalRange: "< 150" },
      { param: "HDL Cholesterol", observed: "42", unit: "mg/dL", normalRange: "> 40" },
      { param: "LDL Cholesterol", observed: "136", unit: "mg/dL", normalRange: "< 100" },
    ],
    impression: "Mild transaminitis with borderline mixed hyperlipidemia. Correlate with clinical findings.",
    icd10: "K76.0",
  },
  "Liver Function Test (LFT)": {
    tariff: 800,
    category: "Biochemistry",
    parameters: [
      { param: "Total Bilirubin", observed: "1.1", unit: "mg/dL", normalRange: "0.2 - 1.2" },
      { param: "Direct Bilirubin", observed: "0.3", unit: "mg/dL", normalRange: "0.0 - 0.3" },
      { param: "Indirect Bilirubin", observed: "0.8", unit: "mg/dL", normalRange: "0.2 - 0.9" },
      { param: "SGOT / AST", observed: "32", unit: "U/L", normalRange: "10 - 40" },
      { param: "SGPT / ALT", observed: "36", unit: "U/L", normalRange: "10 - 45" },
      { param: "Alkaline Phosphatase (ALP)", observed: "95", unit: "U/L", normalRange: "40 - 130" },
      { param: "Total Protein", observed: "7.2", unit: "g/dL", normalRange: "6.0 - 8.3" },
      { param: "Serum Albumin", observed: "4.1", unit: "g/dL", normalRange: "3.5 - 5.0" },
      { param: "Serum Globulin", observed: "3.1", unit: "g/dL", normalRange: "2.3 - 3.5" },
      { param: "A/G Ratio", observed: "1.32", unit: "", normalRange: "1.1 - 2.2" },
    ],
    impression: "Normal hepatic biochemical parameters. No evidence of hepatocellular injury or cholestasis.",
    icd10: "Z01.89",
  },
  "Renal Function Test (RFT / KFT)": {
    tariff: 700,
    category: "Biochemistry",
    parameters: [
      { param: "Blood Urea", observed: "26.4", unit: "mg/dL", normalRange: "15 - 45" },
      { param: "Serum Creatinine", observed: "0.92", unit: "mg/dL", normalRange: "0.6 - 1.2" },
      { param: "Serum Uric Acid", observed: "5.4", unit: "mg/dL", normalRange: "3.5 - 7.2" },
      { param: "Blood Urea Nitrogen (BUN)", observed: "12.3", unit: "mg/dL", normalRange: "7 - 20" },
      { param: "eGFR (CKD-EPI)", observed: "98", unit: "mL/min/1.73m2", normalRange: "> 90" },
    ],
    impression: "Normal renal biochemical profile with preserved glomerular filtration rate.",
    icd10: "Z01.89",
  },
  "Lipid Profile": {
    tariff: 650,
    category: "Biochemistry",
    parameters: [
      { param: "Total Cholesterol", observed: "192", unit: "mg/dL", normalRange: "< 200" },
      { param: "Serum Triglycerides", observed: "142", unit: "mg/dL", normalRange: "< 150" },
      { param: "HDL Cholesterol", observed: "48", unit: "mg/dL", normalRange: "> 40" },
      { param: "LDL Cholesterol", observed: "115", unit: "mg/dL", normalRange: "< 100" },
      { param: "VLDL Cholesterol", observed: "28.4", unit: "mg/dL", normalRange: "< 30" },
      { param: "Cholesterol / HDL Ratio", observed: "4.0", unit: "", normalRange: "< 4.5" },
    ],
    impression: "Normal lipid profile with optimal cardioprotective HDL index.",
    icd10: "Z01.89",
  },
  "Thyroid Profile (T3, T4, TSH)": {
    tariff: 650,
    category: "Biochemistry",
    parameters: [
      { param: "Total Triiodothyronine (T3)", observed: "1.24", unit: "ng/mL", normalRange: "0.8 - 2.0" },
      { param: "Total Thyroxine (T4)", observed: "8.6", unit: "ug/dL", normalRange: "5.1 - 14.1" },
      { param: "Ultrasensitive TSH", observed: "2.84", unit: "uIU/mL", normalRange: "0.35 - 4.94" },
    ],
    impression: "Euthyroid state. Pituitary-thyroid axis functioning within normal biological limits.",
    icd10: "Z01.89",
  },
  "HbA1c (Glycosylated Hemoglobin)": {
    tariff: 500,
    category: "Biochemistry",
    parameters: [
      { param: "HbA1c (HPLC)", observed: "6.8", unit: "%", normalRange: "4.0 - 5.6" },
      { param: "Estimated Average Glucose (eAG)", observed: "148", unit: "mg/dL", normalRange: "< 120" },
    ],
    impression: "Moderate glycemic control in known diabetic. Lifestyle & dietary calibration advised.",
    icd10: "E11.65",
  },
  "Blood Glucose (Fasting / PP / Random)": {
    tariff: 120,
    category: "Biochemistry",
    parameters: [
      { param: "Fasting Plasma Glucose", observed: "96", unit: "mg/dL", normalRange: "70 - 99" },
    ],
    impression: "Normal fasting plasma glucose.",
    icd10: "Z01.89",
  },
  "Serum Electrolytes (Na+, K+, Cl-)": {
    tariff: 450,
    category: "Biochemistry",
    parameters: [
      { param: "Serum Sodium (Na+)", observed: "139", unit: "mEq/L", normalRange: "135 - 145" },
      { param: "Serum Potassium (K+)", observed: "4.1", unit: "mEq/L", normalRange: "3.5 - 5.0" },
      { param: "Serum Chloride (Cl-)", observed: "102", unit: "mEq/L", normalRange: "98 - 106" },
    ],
    impression: "Normal serum electrolyte balance.",
    icd10: "Z01.89",
  },
  "Dengue NS1 / IgM / IgG": {
    tariff: 750,
    category: "Immunology",
    parameters: [
      { param: "Dengue NS1 Antigen", observed: "POSITIVE", unit: "Index", normalRange: "NEGATIVE", isPanic: true },
      { param: "Dengue IgM Antibody", observed: "POSITIVE", unit: "Index", normalRange: "NEGATIVE", isPanic: true },
      { param: "Dengue IgG Antibody", observed: "NEGATIVE", unit: "Index", normalRange: "NEGATIVE" },
    ],
    impression: "Acute Dengue Viral Infection (Primary Phase). Monitor daily platelet counts and hematocrit.",
    icd10: "A97.1",
  },
  "C-Reactive Protein (CRP)": {
    tariff: 400,
    category: "Immunology",
    parameters: [
      { param: "C-Reactive Protein (Quantitative)", observed: "18.4", unit: "mg/L", normalRange: "< 6.0" },
    ],
    impression: "Significantly elevated CRP consistent with active systemic inflammatory process.",
    icd10: "R79.89",
  },
  "Widal Slide & Tube Test": {
    tariff: 300,
    category: "Microbiology",
    parameters: [
      { param: "S. Typhi 'O' Titre", observed: "1:160 (Positive)", unit: "Titre", normalRange: "< 1:80" },
      { param: "S. Typhi 'H' Titre", observed: "1:160 (Positive)", unit: "Titre", normalRange: "< 1:80" },
      { param: "S. Paratyphi 'AH' Titre", observed: "< 1:80 (Negative)", unit: "Titre", normalRange: "< 1:80" },
      { param: "S. Paratyphi 'BH' Titre", observed: "< 1:80 (Negative)", unit: "Titre", normalRange: "< 1:80" },
    ],
    impression: "Serological evidence suggestive of active Enteric (Typhoid) Fever.",
    icd10: "A01.0",
  },
  "Urine Routine & Culture": {
    tariff: 350,
    category: "Microbiology",
    parameters: [
      { param: "Color & Appearance", observed: "Pale Yellow, Clear", unit: "", normalRange: "Clear" },
      { param: "pH", observed: "6.0", unit: "", normalRange: "4.5 - 8.0" },
      { param: "Specific Gravity", observed: "1.018", unit: "", normalRange: "1.005 - 1.030" },
      { param: "Urine Protein", observed: "NIL", unit: "", normalRange: "NIL" },
      { param: "Urine Sugar", observed: "NIL", unit: "", normalRange: "NIL" },
      { param: "Pus Cells", observed: "2-4", unit: "/hpf", normalRange: "0 - 5" },
      { param: "Epithelial Cells", observed: "1-2", unit: "/hpf", normalRange: "0 - 5" },
      { param: "48-Hr Colony Culture", observed: "No Bacterial Growth", unit: "", normalRange: "Sterile" },
    ],
    impression: "Normal Urine Routine examination. Sterile 48-hour culture with no significant bacteriuria.",
    icd10: "Z01.89",
  },
};

const SMART_CATALOG = [
  // Hematology
  { category: "Hematology", name: "Complete Blood Count (CBC) + Dengue NS1 Antigen", tariff: 400 },
  { category: "Hematology", name: "Complete Blood Picture (CBP)", tariff: 400 },
  { category: "Hematology", name: "Hemoglobin (Hb)", tariff: 150 },
  { category: "Hematology", name: "Platelet Count", tariff: 150 },
  { category: "Hematology", name: "ESR (Westergren)", tariff: 100 },
  { category: "Hematology", name: "Peripheral Smear for Malarial Parasite", tariff: 300 },
  { category: "Hematology", name: "Coagulation Profile (PT/INR, aPTT)", tariff: 600 },
  { category: "Hematology", name: "Reticulocyte Count", tariff: 250 },
  { category: "Hematology", name: "Other Hematology Test...", tariff: 300 },

  // Biochemistry
  { category: "Biochemistry", name: "Arterial Blood Gas (ABG) + Serum Electrolytes", tariff: 400 },
  { category: "Biochemistry", name: "Liver Function Test (LFT) + Lipid Profile", tariff: 400 },
  { category: "Biochemistry", name: "Liver Function Test (LFT)", tariff: 800 },
  { category: "Biochemistry", name: "Renal Function Test (RFT / KFT)", tariff: 700 },
  { category: "Biochemistry", name: "Lipid Profile", tariff: 650 },
  { category: "Biochemistry", name: "Thyroid Profile (T3, T4, TSH)", tariff: 650 },
  { category: "Biochemistry", name: "HbA1c (Glycosylated Hemoglobin)", tariff: 500 },
  { category: "Biochemistry", name: "Blood Glucose (Fasting / PP / Random)", tariff: 120 },
  { category: "Biochemistry", name: "Serum Electrolytes (Na+, K+, Cl-)", tariff: 450 },
  { category: "Biochemistry", name: "Other Biochemistry Test...", tariff: 500 },

  // Microbiology
  { category: "Microbiology", name: "Urine Routine & Culture", tariff: 350 },
  { category: "Microbiology", name: "Stool Routine & Culture", tariff: 350 },
  { category: "Microbiology", name: "Blood Culture & Sensitivity (Automated)", tariff: 750 },
  { category: "Microbiology", name: "Sputum AFB & Culture", tariff: 400 },
  { category: "Microbiology", name: "Widal Slide & Tube Test", tariff: 300 },
  { category: "Microbiology", name: "Other Microbiology Test...", tariff: 400 },

  // Immunology & Serology
  { category: "Immunology", name: "Dengue NS1 / IgM / IgG", tariff: 750 },
  { category: "Immunology", name: "C-Reactive Protein (CRP)", tariff: 400 },
  { category: "Immunology", name: "RA Factor (Quantitative)", tariff: 450 },
  { category: "Immunology", name: "ANA (Antinuclear Antibody by IFA)", tariff: 800 },
  { category: "Immunology", name: "Anti-dsDNA Antibody", tariff: 1200 },
  { category: "Immunology", name: "HIV I & II (4th Gen ELISA)", tariff: 500 },
  { category: "Immunology", name: "HBsAg (Hepatitis B Surface Antigen)", tariff: 400 },
  { category: "Immunology", name: "HCV Antibody Test", tariff: 500 },
  { category: "Immunology", name: "Other Immunology Test...", tariff: 500 },

  // Pathology
  { category: "Pathology", name: "Fine Needle Aspiration Cytology (FNAC)", tariff: 1200 },
  { category: "Pathology", name: "Biopsy (Histopathology)", tariff: 1800 },
  { category: "Pathology", name: "Pap Smear Cytology", tariff: 850 },
  { category: "Pathology", name: "Other Pathology Test...", tariff: 1000 },
];

const INITIAL_LAB_ORDERS: LabOrder[] = [
  {
    id: "LAB-2026-9901",
    uhid: "UHID-2026-8801",
    patientName: "Rajesh Kumar",
    age: 42,
    gender: "Male",
    doctorName: "Dr. Murali Praveen",
    doctorPhone: "+91 98480 12345",
    testName: "Complete Blood Count (CBC) + Dengue NS1 Antigen",
    category: "Hematology",
    baseTariff: 400,
    orderedAt: "2026-08-08 09:30 AM",
    status: "Completed",
    clinicalHistory: "Patient presenting with high grade fever, retro-orbital headache, body pain for 3 days.",
    parameters: TEST_PARAMETER_TEMPLATES["Complete Blood Count (CBC) + Dengue NS1 Antigen"].parameters,
    impression: TEST_PARAMETER_TEMPLATES["Complete Blood Count (CBC) + Dengue NS1 Antigen"].impression,
    icd10Code: TEST_PARAMETER_TEMPLATES["Complete Blood Count (CBC) + Dengue NS1 Antigen"].icd10,
  },
  {
    id: "LAB-2026-9902",
    uhid: "UHID-2026-8802",
    patientName: "Ananya Sharma",
    age: 29,
    gender: "Female",
    doctorName: "Dr. Murali Praveen",
    doctorPhone: "+91 98480 12345",
    testName: "Arterial Blood Gas (ABG) + Serum Electrolytes",
    category: "Biochemistry",
    baseTariff: 400,
    orderedAt: "2026-08-08 08:45 AM",
    status: "Completed",
    clinicalHistory: "3-day fever and body ache.",
    parameters: TEST_PARAMETER_TEMPLATES["Arterial Blood Gas (ABG) + Serum Electrolytes"].parameters,
    impression: TEST_PARAMETER_TEMPLATES["Arterial Blood Gas (ABG) + Serum Electrolytes"].impression,
    icd10Code: TEST_PARAMETER_TEMPLATES["Arterial Blood Gas (ABG) + Serum Electrolytes"].icd10,
  },
  {
    id: "LAB-2026-9903",
    uhid: "UHID-2026-8803",
    patientName: "Vikram Reddy",
    age: 58,
    gender: "Male",
    doctorName: "Dr. Murali Praveen",
    doctorPhone: "+91 98480 12345",
    testName: "Liver Function Test (LFT) + Lipid Profile",
    category: "Biochemistry",
    baseTariff: 400,
    orderedAt: "2026-08-08 10:15 AM",
    status: "Ordered",
    clinicalHistory: "3-day fever and body ache.",
    parameters: TEST_PARAMETER_TEMPLATES["Liver Function Test (LFT) + Lipid Profile"].parameters,
    impression: TEST_PARAMETER_TEMPLATES["Liver Function Test (LFT) + Lipid Profile"].impression,
    icd10Code: TEST_PARAMETER_TEMPLATES["Liver Function Test (LFT) + Lipid Profile"].icd10,
  },
];

export function LabDashboard() {
  const { account } = useAuth();
  const [subTab, setSubTab] = useState<LabSubTab>("workstation");
  const [labOrders, setLabOrders] = useState<LabOrder[]>(INITIAL_LAB_ORDERS);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(INITIAL_LAB_ORDERS[0].id);

  const selectedOrder = useMemo(() => {
    return labOrders.find((o) => o.id === selectedOrderId) || labOrders[0];
  }, [labOrders, selectedOrderId]);

  // Form State
  const [activeTestName, setActiveTestName] = useState<string>(selectedOrder.testName);
  const [activeTariff, setActiveTariff] = useState<number>(selectedOrder.baseTariff);
  const [clinicalHistory, setClinicalHistory] = useState<string>(selectedOrder.clinicalHistory);
  const [parameters, setParameters] = useState<ParameterRow[]>(selectedOrder.parameters);
  const [impression, setImpression] = useState<string>(selectedOrder.impression);
  const [icd10, setIcd10] = useState<string>(selectedOrder.icd10Code);
  const [overridePin, setOverridePin] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  // Dual OCR Pipeline State
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>("tesseract");
  const [ocrReviewStatus, setOcrReviewStatus] = useState<"idle" | "reviewed" | "preview-only">("idle");

  // Outside Patient Registration Modal
  const [outsideModalOpen, setOutsideModalOpen] = useState(false);
  const [outsideName, setOutsideName] = useState("");
  const [outsideAge, setOutsideAge] = useState("");
  const [outsideGender, setOutsideGender] = useState<"Male" | "Female">("Male");
  const [outsidePhone, setOutsidePhone] = useState("");
  const [outsideRefDoc, setOutsideRefDoc] = useState("Dr. Murali Praveen");
  const [outsideTest, setOutsideTest] = useState("Complete Blood Picture (CBP)");

  // Sync state on selected order change
  const handleSelectOrder = (order: LabOrder) => {
    setSelectedOrderId(order.id);
    setActiveTestName(order.testName);
    setActiveTariff(order.baseTariff);
    setClinicalHistory(order.clinicalHistory);
    setParameters(order.parameters);
    setImpression(order.impression);
    setIcd10(order.icd10Code);
  };

  const gstTax = useMemo(() => +(activeTariff * 0.05).toFixed(2), [activeTariff]);
  const netTotal = useMemo(() => +(activeTariff + gstTax).toFixed(2), [activeTariff, gstTax]);

  // When user selects a new test from the dropdown, auto-populate the test parameters & tariff!
  const handleTestSelectionChange = (newTestName: string) => {
    setActiveTestName(newTestName);
    const template = TEST_PARAMETER_TEMPLATES[newTestName];
    const catEntry = SMART_CATALOG.find((c) => c.name === newTestName);

    if (template) {
      setActiveTariff(template.tariff);
      setParameters(template.parameters);
      setImpression(template.impression);
      setIcd10(template.icd10);
    } else {
      const fallbackTariff = catEntry?.tariff || 400;
      setActiveTariff(fallbackTariff);
      // Fallback parameter rows matching screenshot
      setParameters([
        { param: "Observed Value 1", observed: "Normal", unit: "-", normalRange: "Normal" },
        { param: "Observed Value 2", observed: "Negative", unit: "-", normalRange: "Negative" },
      ]);
      setImpression("Findings documented.");
      setIcd10("Z01.89");
    }

    toast.success(`Selected Test: ${newTestName} (Tariff: ₹${template?.tariff || catEntry?.tariff || activeTariff})`);
  };

  const handleParameterChange = (index: number, val: string) => {
    const updated = [...parameters];
    updated[index].observed = val;

    // Panic value detection
    const numVal = parseFloat(val.replace(/,/g, ""));
    if (updated[index].param.includes("WBC") && !isNaN(numVal) && numVal < 4000) {
      updated[index].isPanic = true;
    } else if (updated[index].param.includes("Platelet") && !isNaN(numVal) && numVal < 100000) {
      updated[index].isPanic = true;
    } else if (val.toUpperCase() === "POSITIVE" && updated[index].param.includes("Dengue")) {
      updated[index].isPanic = true;
    } else {
      updated[index].isPanic = false;
    }

    setParameters(updated);
  };

  const handleUploadOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file || ocrEngine === "manual") return;
    if (file.type === "text/plain") {
      try {
        const response = await fetch("/api/reception/document-intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, text: await file.text() }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || body.error || "Document intake failed");
        setOcrReviewStatus("reviewed");
        const summary = Object.entries(body.extracted ?? {})
          .map(([key, value]: [string, any]) => `${key}: ${value.value}`)
          .join(" • ");
        toast.success("Document reviewed", { description: summary || "No labeled patient fields found; review manually." });
      } catch (error) {
        toast.error("Document intake failed", { description: error instanceof Error ? error.message : "Review the document manually." });
      }
      return;
    }
    setOcrReviewStatus("preview-only");
    toast.info("Image/PDF preview available", { description: "No laboratory values were extracted. Enter and verify results manually." });
  };

  const handleCompleteAndAutoPush = async () => {
    const gate = await executeWorkflowAction({
      action: "upload_report",
      patientUhid: selectedOrder.uhid,
      orderId: selectedOrder.id,
      department: "laboratory",
      actorId: account?.id ?? "lab-workstation",
      actorRole: account?.role ?? "lab",
      device: "lab-dashboard",
      adminPin: overridePin,
      adminReason: overrideReason,
    });
    if (!gate.allowed) {
      toast.error(gate.message);
      return;
    }
    setLabOrders((prev) =>
      prev.map((o) =>
        o.id === selectedOrder.id
          ? {
              ...o,
              status: "Completed",
              clinicalHistory,
              parameters,
              impression,
              icd10Code: icd10,
            }
          : o
      )
    );

    // R5-06 closed loop: push the structured values to the results API so the
    // ordering doctor is notified and deterministic critical values are checked.
    // Structured values first; the server flags manual review when none exist.
    const submission = await submitResultReport({
      patientUhid: selectedOrder.uhid,
      patientName: selectedOrder.patientName,
      orderId: selectedOrder.id,
      testName: activeTestName,
      department: "laboratory",
      values: parameters.map((p) => ({ param: p.param, value: p.observed, unit: p.unit })),
      impression,
      orderingDoctor: selectedOrder.doctorName,
    });
    if (submission.ok) {
      // Optional lab voice line, reusing the existing voice layer.
      try { voiceEngine.speak(labVoiceLine("report_uploaded"), "en-IN"); } catch { /* best-effort */ }
      if (submission.criticalCheck?.manualReviewRequired) {
        toast.info("Report uploaded — critical check not possible, manual review", {
          description: "No structured values to check deterministically. Sent to the ordering doctor for manual review.",
        });
      } else if (submission.alert) {
        toast.error(`CRITICAL VALUE — ${submission.alert.findings[0]?.message ?? "critical result"}`, {
          description: `Level-3 alert raised for ${selectedOrder.patientName}. The ordering doctor must acknowledge it.`,
        });
      }
      // Normal path: the existing "Finalized & Pushed" toast below covers it.
    } else {
      toast.error("Report finalized locally but the closed-loop notify failed", { description: submission.error });
    }

    // Auto-generate printable lab report in Reception Print Hub
    HospitalPrintEngine.printLabReport({
      patientName: selectedOrder.patientName,
      uhid: selectedOrder.uhid,
      age: selectedOrder.age,
      gender: selectedOrder.gender,
      testName: activeTestName,
      collectedAt: selectedOrder.orderedAt,
      verifiedAt: new Date().toLocaleString(),
      doctorName: selectedOrder.doctorName,
      parameters: parameters.map((p) => ({
        param: p.param,
        result: p.observed,
        unit: p.unit,
        normalRange: p.normalRange,
        isCritical: p.isPanic,
      })),
      impression,
    });

    toast.info(`Lab Report for ${selectedOrder.patientName} opened a print window on this computer.`, {
      description: `No bill was sent. On-screen amount only: ₹${netTotal}.`,
    });
  };

  const handleRegisterOutsidePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outsideName || !outsideAge) {
      toast.error("Please fill required fields");
      return;
    }

    const newUhid = `OUT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const gate = await executeWorkflowAction({
      action: "add_lab_test",
      patientUhid: newUhid,
      department: "laboratory",
      actorId: account?.id ?? "lab-workstation",
      actorRole: account?.role ?? "lab",
      device: "lab-dashboard",
      adminPin: overridePin,
      adminReason: overrideReason,
      billed: false,
    });
    if (!gate.allowed) {
      toast.error(gate.message);
      return;
    }
    const catEntry = SMART_CATALOG.find((c) => c.name === outsideTest);
    const template = TEST_PARAMETER_TEMPLATES[outsideTest];

    const newOrder: LabOrder = {
      id: `LAB-${newUhid}`,
      uhid: newUhid,
      patientName: outsideName,
      age: parseInt(outsideAge) || 30,
      gender: outsideGender,
      doctorName: outsideRefDoc || "Dr. Murali Praveen",
      doctorPhone: outsidePhone || "+91 98480 00000",
      testName: outsideTest,
      category: (catEntry?.category as any) || "Hematology",
      baseTariff: template?.tariff || catEntry?.tariff || 400,
      orderedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "Ordered",
      clinicalHistory: "Walk-in outpatient diagnostic investigation.",
      parameters: template?.parameters || [
        { param: "Observed Value 1", observed: "Normal", unit: "-", normalRange: "Normal" },
        { param: "Observed Value 2", observed: "Negative", unit: "-", normalRange: "Negative" },
      ],
      impression: template?.impression || "Diagnostic study ordered for outside walk-in patient.",
      icd10Code: template?.icd10 || "Z01.89",
      isOutsidePatient: true,
    };

    setLabOrders([newOrder, ...labOrders]);
    handleSelectOrder(newOrder);
    setOutsideModalOpen(false);
    toast.success(`Outside patient added on this screen: ${outsideName} (${newUhid})`, {
      description: `Local number only, not a hospital UHID. On-screen tariff ₹${newOrder.baseTariff}.`,
    });
  };

  const outsidePatientsCount = useMemo(
    () => labOrders.filter((o) => o.isOutsidePatient).length,
    [labOrders]
  );

  return (
    <div className="space-y-4 max-w-[1550px] mx-auto p-1 text-slate-100">
      {/* ---------------- 1. Workstation Header & Global Actions ---------------- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Laboratory Workstation
              </h1>
              <Badge tone="cyan">Dual OCR &amp; Billing Integration</Badge>
              <OrderStatusChip patientUhid={selectedOrder?.uhid} role="lab" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Outside Patient registration, dual OCR pipeline, compact dropdowns, tariff billing &amp; doctor alerts
            </p>
          </div>
        </div>

        {/* Top Right Action Button matching Screenshot */}
        <button
          onClick={() => setOutsideModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition-all active:scale-95"
        >
          <UserPlus className="w-4 h-4" /> + New Patient (Outside OUT-XXXX)
        </button>
      </div>

      {/* ---------------- 2. Sub-View Tabs matching Screenshot ---------------- */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: "workstation", label: "Workstation", icon: FlaskConical },
          { id: "barcode", label: "Barcode Queue", icon: Barcode },
          { id: "reagents", label: "Reagents", icon: TestTube },
          { id: "analytics", label: "Analytics", icon: TrendingUp },
        ].map((tab) => {
          const active = subTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                active
                  ? "bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-900/40"
                  : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------- TAB 1: WORKSTATION VIEW (Screenshots 1-5) ---------------- */}
      {subTab === "workstation" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Lab Test Queue (col-span-4) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-cyan-400" /> Lab Test Queue ({labOrders.length}) <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 font-bold normal-case tracking-normal">Demo worklist</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-semibold">
                  {outsidePatientsCount} Outside Pts
                </span>
              </div>

              {/* Scrollable Patient Test Cards */}
              <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
                {labOrders.map((order) => {
                  const isSelected = order.id === selectedOrderId;
                  return (
                    <div
                      key={order.id}
                      onClick={() => handleSelectOrder(order)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-slate-800 border-purple-500 shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/50"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <strong className="text-xs font-bold text-white block">
                          {order.testName}
                        </strong>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                            order.status === "Completed"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300">
                        Patient: <span className="font-semibold text-white">{order.patientName}</span> ({order.uhid})
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
                        <span className="font-mono font-bold text-cyan-300 text-[11px]">Tariff: ₹{order.baseTariff}</span>
                        <span>{order.orderedAt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Test Result Entry & Dual OCR Console (col-span-8) */}
          <div className="lg:col-span-8 space-y-3">
            {/* Patient Header Box matching Screenshot */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-xl space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold text-white">{selectedOrder.patientName}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                    {selectedOrder.uhid}
                  </span>
                </div>
                <div className="text-right text-xs text-slate-400">
                  Doctor / Ref: <span className="font-bold text-white">{selectedOrder.doctorName}</span> • Phone:{" "}
                  <span className="font-mono text-cyan-300">{selectedOrder.doctorPhone}</span>
                </div>
              </div>

              {/* Smart Lab Test Selection (Grouped Categories Dropdown) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[11px] font-bold text-slate-300">
                    Smart Lab Test Selection (Grouped Categories):
                  </label>
                  <span className="font-mono font-bold text-cyan-300">Tariff Rate: ₹{activeTariff}</span>
                </div>

                <select
                  value={activeTestName}
                  onChange={(e) => handleTestSelectionChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-semibold"
                >
                  <optgroup label="🩸 Hematology">
                    {SMART_CATALOG.filter((c) => c.category === "Hematology").map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} — ₹{c.tariff}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🧪 Biochemistry">
                    {SMART_CATALOG.filter((c) => c.category === "Biochemistry").map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} — ₹{c.tariff}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🧫 Microbiology">
                    {SMART_CATALOG.filter((c) => c.category === "Microbiology").map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} — ₹{c.tariff}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🛡️ Immunology & Serology">
                    {SMART_CATALOG.filter((c) => c.category === "Immunology").map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} — ₹{c.tariff}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🔬 Pathology & Histopathology">
                    {SMART_CATALOG.filter((c) => c.category === "Pathology").map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} — ₹{c.tariff}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Dual OCR Recognition & Manual Entry Pipeline matching Screenshots 1-3 */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Dual OCR Recognition &amp; Manual Entry Pipeline
                  </span>

                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => {
                        setOcrEngine("vision");
                      }}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        ocrEngine === "vision"
                          ? "bg-purple-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Vision OCR (Handwritten)
                    </button>
                    <button
                      onClick={() => {
                        setOcrEngine("tesseract");
                      }}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        ocrEngine === "tesseract"
                          ? "bg-purple-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Tesseract OCR (Typed)
                    </button>
                    <button
                      onClick={() => setOcrEngine("manual")}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        ocrEngine === "manual"
                          ? "bg-amber-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Manual Entry Mode
                    </button>
                  </div>
                </div>

                {/* OCR Status Banner or Manual Notification */}
                {ocrEngine === "manual" ? (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
                    <span>Manual Entry Mode Active. Technician can type all parameters and tariff manually</span>
                    <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold">Manual Entry Tag Active</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-300">
                        Selected OCR Engine:{" "}
                        <strong className="text-white">
                          {ocrEngine === "vision" ? "Vision AI (Handwriting)" : "Tesseract OCR (Typed Fallback)"}
                        </strong>
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${ocrReviewStatus === "reviewed" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
                        {ocrReviewStatus === "reviewed" ? "Text document reviewed" : ocrReviewStatus === "preview-only" ? "Preview only · manual verification required" : "Provider unavailable · fail-closed"}
                      </span>
                    </div>

                    <label className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" /> Upload Photo / Text Review
                      <input type="file" accept="image/*,application/pdf,text/plain" onChange={handleUploadOCR} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              {/* Heading 1: Clinical History */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300">Heading 1: Clinical History</label>
                <textarea
                  value={clinicalHistory}
                  onChange={(e) => setClinicalHistory(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono leading-relaxed focus:border-cyan-500"
                  placeholder="Enter clinical presentation or symptoms..."
                />
              </div>

              {/* Heading 2: Observations & Quantitative Results Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300">
                    Heading 2: Observations &amp; Quantitative Results ({activeTestName})
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 font-bold">
                    Reference Ranges Configured
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[9px]">
                      <tr>
                        <th className="p-2.5">Test Parameter Name</th>
                        <th className="p-2.5">Observed result value</th>
                        <th className="p-2.5">unit</th>
                        <th className="p-2.5">standard ref range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {parameters.map((row, idx) => (
                        <tr key={idx} className={row.isPanic ? "bg-rose-950/20" : ""}>
                          <td className="p-2.5 text-white font-sans font-semibold flex items-center gap-1.5">
                            {row.isPanic && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                            {row.param}
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={row.observed}
                              onChange={(e) => handleParameterChange(idx, e.target.value)}
                              className={`px-2 py-1 rounded bg-slate-950 border text-xs font-bold w-32 ${
                                row.isPanic
                                  ? "border-rose-500 text-rose-400 bg-rose-950/40"
                                  : "border-slate-700 text-cyan-300"
                              }`}
                            />
                          </td>
                          <td className="p-2.5 text-slate-400">{row.unit || "-"}</td>
                          <td className="p-2.5 text-slate-300">{row.normalRange}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Heading 3 & Billing Breakdown Split Row matching Screenshots */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
                {/* Heading 3: Impression & AI ICD-10 Diagnosis (Col 7) */}
                <div className="lg:col-span-7 p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    Heading 3: Impression &amp; AI ICD-10 Diagnosis
                  </label>
                  <textarea
                    value={impression}
                    onChange={(e) => setImpression(e.target.value)}
                    rows={3}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono leading-relaxed"
                  />
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">
                      Insurance Status:{" "}
                      <strong className="text-emerald-400">
                        🟢 Claim Check Passed (ICD-10 Mapped: {icd10})
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Test Tariff & Billing Breakdown (Col 5) */}
                <div className="lg:col-span-5 p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 flex flex-col justify-between">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                      <span className="font-bold text-white">Test Tariff &amp; Billing Breakdown</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-cyan-300 font-bold">
                        Reception Auto-Invoice
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-300 text-[11px]">
                      <span className="truncate max-w-[180px]">Base Test Fee ({activeTestName}):</span>
                      <span className="font-mono text-white">₹{activeTariff.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>GST Tax (5% Pharma Rate):</span>
                      <span className="font-mono text-white">₹{gstTax.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-sm font-black text-white pt-1 border-t border-slate-800">
                      <span>Net Total Billable:</span>
                      <span className="text-emerald-400 font-mono">₹{netTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input type="password" value={overridePin} onChange={(e) => setOverridePin(e.target.value)} placeholder="Admin PIN" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px]" />
                    <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Override reason" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px]" />
                  </div>
                  <button
                    onClick={handleCompleteAndAutoPush}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" /> 🗹 Complete &amp; Auto-Push to Doctor &amp; Reception
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 2: BARCODE QUEUE matching Screenshot 2 ---------------- */}
      {subTab === "barcode" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Barcode className="w-4 h-4 text-cyan-400" /> Sample Tube Barcodes &amp; Pipeline Tracking
              </h2>
              <p className="text-xs font-semibold text-amber-300">Demo tubes</p>
              <p className="text-xs text-slate-400">Sample names on this list only. Not live tube labels.</p>
            </div>
            <button
              onClick={() => toast.info("No label printer was contacted. Stickers were not queued.")}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> 🏷️ Batch Print Barcode Stickers
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                name: "Rajesh Kumar",
                uhid: "UHID-2026-8801",
                code: "SAMP-2026-0809-101",
                test: "Complete Blood",
                tube: "EDTA / SST Tube • Astra AI Lab",
                cat: "Hematology",
              },
              {
                name: "Ananya Sharma",
                uhid: "UHID-2026-8802",
                code: "SAMP-2026-0809-102",
                test: "Arterial Blood",
                tube: "EDTA / SST Tube • Astra AI Lab",
                cat: "Biochemistry",
              },
              {
                name: "Vikram Reddy",
                uhid: "UHID-2026-8803",
                code: "SAMP-2026-0809-103",
                test: "Liver Function",
                tube: "EDTA / SST Tube • Astra AI Lab",
                cat: "Biochemistry",
              },
            ].map((b, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{b.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 font-mono font-bold">
                    {b.uhid}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white text-slate-900 text-center space-y-1">
                  <div className="font-mono text-base font-black tracking-widest leading-none">
                    |||||||||||||||||||||||||||||||||||||||||||||
                  </div>
                  <div className="text-[10px] font-mono font-bold text-slate-800">
                    {b.code} ({b.test})
                  </div>
                  <div className="text-[9px] text-slate-500">{b.tube}</div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Category: {b.cat}</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" /> Barcode Scanned
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- TAB 3: REAGENTS matching Screenshot 3 ---------------- */}
      {subTab === "reagents" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <TestTube className="w-4 h-4 text-amber-400" /> Reagent Inventory &amp; Expiry Alerts
              </h2>
              <p className="text-xs text-slate-400">Tracking biochemistry kits, vacuum tubes, stains, and culture bottles</p>
            </div>
            <button
              onClick={() => toast.info("No purchase order was created. Reorder is not connected.")}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> ⚡ Auto-Reorder Expiring Reagents
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[9px]">
                <tr>
                  <th className="p-3">Reagent / Kit Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Manufacturer / Lot No</th>
                  <th className="p-3">Stock Level</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {[
                  {
                    name: "EDTA K3 Vacuum Tubes (4ml)",
                    cat: "Hematology",
                    mfg: "BD Vacutainer (LOT-8821A)",
                    stock: "450 Tubes",
                    exp: "2027-02-15",
                    status: "Sufficient",
                    tone: "emerald",
                  },
                  {
                    name: "LFT Biochemistry Reagent Kit (80 Tests)",
                    cat: "Biochemistry",
                    mfg: "Erba Diagnostics (LOT-9011B)",
                    stock: "12 Kits",
                    exp: "2026-10-15",
                    status: "Expiring Soon",
                    tone: "rose",
                  },
                  {
                    name: "HbA1c Immunoassay Cartridges",
                    cat: "Biochemistry",
                    mfg: "Bio-Rad Lab (LOT-5521C)",
                    stock: "18 Strips",
                    exp: "2026-09-30",
                    status: "Low Stock",
                    tone: "amber",
                  },
                  {
                    name: "Blood Culture Bottles (Adult Aerobic)",
                    cat: "Microbiology",
                    mfg: "BD Bactec (LOT-3321D)",
                    stock: "110 Bottles",
                    exp: "2027-08-20",
                    status: "Sufficient",
                    tone: "emerald",
                  },
                  {
                    name: "Dengue NS1 Rapid Antigen Kits",
                    cat: "Immunology",
                    mfg: "SD Bioline (LOT-7711E)",
                    stock: "65 Kits",
                    exp: "2026-11-10",
                    status: "Sufficient",
                    tone: "emerald",
                  },
                ].map((r, i) => (
                  <tr key={i} className="hover:bg-slate-900/40 font-mono">
                    <td className="p-3 font-sans font-bold text-white">{r.name}</td>
                    <td className="p-3 text-cyan-300 font-sans">{r.cat}</td>
                    <td className="p-3 text-slate-400">{r.mfg}</td>
                    <td className="p-3 text-white font-bold">{r.stock}</td>
                    <td className="p-3 text-slate-300">{r.exp}</td>
                    <td className="p-3 font-sans">
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                          r.tone === "emerald"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : r.tone === "rose"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- TAB 4: ANALYTICS matching Screenshot 4 ---------------- */}
      {subTab === "analytics" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Diagnostic Analytics &amp; Revenue Summary
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">TOTAL TESTS EXECUTED</span>
              <div className="text-2xl font-black text-white">45 Tests</div>
              <span className="text-[10px] text-emerald-400 font-bold">↑ 18% vs Yesterday</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">TOTAL LAB REVENUE</span>
              <div className="text-2xl font-black text-cyan-300">₹19600</div>
              <span className="text-[10px] text-slate-400">Collected at Reception</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">CRITICAL VALUES FLAGGED</span>
              <div className="text-2xl font-black text-amber-400">3 Criticals</div>
              <span className="text-[10px] text-slate-400">Auto-notified Doctor Dashboard</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">OUTSIDE PATIENT RATIO</span>
              <div className="text-2xl font-black text-white">0%</div>
              <span className="text-[10px] text-slate-400">Prefix OUT-XXXX</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Outside Patient Registration Modal ---------------- */}
      {outsideModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" /> Direct Outside Patient Lab Registration
              </h3>
              <button onClick={() => setOutsideModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterOutsidePatient} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Patient Full Name *</label>
                <input
                  type="text"
                  required
                  value={outsideName}
                  onChange={(e) => setOutsideName(e.target.value)}
                  placeholder="e.g. Ramesh Chandra"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Age *</label>
                  <input
                    type="number"
                    required
                    value={outsideAge}
                    onChange={(e) => setOutsideAge(e.target.value)}
                    placeholder="45"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Gender *</label>
                  <select
                    value={outsideGender}
                    onChange={(e) => setOutsideGender(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Mobile Phone Number</label>
                  <input
                    type="text"
                    value={outsidePhone}
                    onChange={(e) => setOutsidePhone(e.target.value)}
                    placeholder="+91 98480 00000"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Referring Doctor / Clinic</label>
                  <input
                    type="text"
                    value={outsideRefDoc}
                    onChange={(e) => setOutsideRefDoc(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Select Lab Investigation *</label>
                <select
                  value={outsideTest}
                  onChange={(e) => setOutsideTest(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-semibold"
                >
                  {SMART_CATALOG.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.category}: {c.name} (₹{c.tariff})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setOutsideModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
                >
                  ✓ Register &amp; Load Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
