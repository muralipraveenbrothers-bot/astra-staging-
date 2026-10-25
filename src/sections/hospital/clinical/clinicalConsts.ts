import { Calculator, Brain, AlertTriangle, FlaskConical } from "lucide-react";
import type { ComponentType } from "react";

export const TOKEN = typeof localStorage !== "undefined" ? localStorage.getItem("astra.serverToken") ?? "" : "";

interface CalcField { k: string; l: string; v: string; bool?: boolean; options?: string[] }
interface CalcDef { id: string; name: string; icon: ComponentType<any>; fields: CalcField[] }

export const CALCS: CalcDef[] = [
  { id: "bmi", name: "BMI", icon: Calculator, fields: [{ k: "weightKg", l: "Weight (kg)", v: "70" }, { k: "heightCm", l: "Height (cm)", v: "175" }] },
  { id: "bsa", name: "BSA", icon: Calculator, fields: [{ k: "weightKg", l: "Weight (kg)", v: "70" }, { k: "heightCm", l: "Height (cm)", v: "175" }] },
  { id: "curb65", name: "CURB-65", icon: AlertTriangle, fields: [{ k: "confusion", l: "Confusion", v: "false", bool: true }, { k: "bunMm", l: "BUN mmol/L", v: "9" }, { k: "respRate", l: "Resp Rate", v: "32" }, { k: "sbp", l: "SBP", v: "85" }, { k: "dbp", l: "DBP", v: "55" }, { k: "age", l: "Age", v: "70" }] },
  { id: "gcs", name: "GCS", icon: Brain, fields: [{ k: "eye", l: "Eye (1-4)", v: "4" }, { k: "verbal", l: "Verbal (1-5)", v: "5" }, { k: "motor", l: "Motor (1-6)", v: "6" }] },
  { id: "egfr", name: "eGFR", icon: FlaskConical, fields: [{ k: "creatinine", l: "Creatinine mg/dL", v: "1.2" }, { k: "age", l: "Age", v: "55" }, { k: "sex", l: "Sex", v: "male", options: ["male", "female"] }] },
  { id: "anionGap", name: "Anion Gap", icon: FlaskConical, fields: [{ k: "sodium", l: "Sodium", v: "140" }, { k: "chloride", l: "Chloride", v: "100" }, { k: "hco3", l: "HCO3", v: "24" }] },
  { id: "qsofa", name: "qSOFA", icon: AlertTriangle, fields: [{ k: "respRate", l: "Resp Rate", v: "20" }, { k: "sbp", l: "SBP", v: "110" }, { k: "gcs", l: "GCS", v: "15" }] },
];
