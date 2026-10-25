import { OrderType, OrderPriority } from "./universalOrderTypes";
import { Patient } from "../../types";

export type AstraIntent =
  | "PATIENT_QUERY"
  | "PATIENT_SUMMARY"
  | "CLINICAL_REASONING"
  | "DIFFERENTIAL_DIAGNOSIS"
  | "BLIND_SPOT_ANALYSIS"
  | "MEDICAL_RESEARCH"
  | "WEB_SEARCH"
  | "GUIDELINE_SEARCH"
  | "LAB_ORDER"
  | "MEDICATION_ORDER"
  | "RADIOLOGY_ORDER"
  | "CONSULTATION"
  | "NURSING_ORDER"
  | "VITAL_MONITORING"
  | "OT_WORKFLOW"
  | "ICU_WORKFLOW"
  | "PHARMACY_WORKFLOW"
  | "DOCUMENTATION"
  | "IMAGE_ANALYSIS"
  | "IMAGE_ENHANCEMENT"
  | "ANATOMY_OVERLAY"
  | "PATIENT_NOTIFICATION"
  | "DEPARTMENT_MESSAGE"
  | "RESULT_REVIEW"
  | "FOLLOW_UP"
  | "DISCHARGE"
  | "EMERGENCY"
  | "VOICE_COMMAND"
  | "IDENTITY_QUERY"
  | "HOSPITAL_CENSUS"
  | "BILLING_SUMMARY"
  | "LAB_QUEUE"
  | "RADIOLOGY_QUEUE"
  | "OT_STATUS"
  | "IP_LIST"
  | "OP_LIST"
  | "GENERAL_CONVERSATION"
  | "AMBIGUOUS_COMMAND";

/**
 * Normalizes input text and corrects common typographical mistakes and shorthands
 */
export function normalizeQueryString(text: string): string {
  if (!text) return "";
  let s = text.toLowerCase().trim();

  // Common spelling corrections
  const replacements: [RegExp, string][] = [
    [/\biplsit\b|\biplist\b|\biplst\b|\bip\s*lsit\b/g, "ip list"],
    [/\boplsit\b|\boplist\b|\boplst\b|\bop\s*lsit\b/g, "op list"],
    [/\bpatinet(s)?\b/g, "patient$1"],
    [/\bcenuss\b|\bcencus\b|\bcensu\b/g, "census"],
    [/\bbililng\b|\bbillng\b|\bbilng\b/g, "billing"],
    [/\bparacitamol\b|\bparacitramol\b|\bparacetmol\b/g, "paracetamol"],
    [/\bceftriaxn\b|\bceftriaxone\b|\bceftriaxin\b/g, "ceftriaxone"],
    [/\bxary\b|\bx-ary\b/g, "x-ray"],
    [/\brediolgy\b|\bradiolgy\b/g, "radiology"],
    [/\bdiffrential\b|\bdifferential\s*diag\b/g, "differential diagnosis"],
    [/\bpathopysiology\b|\bpathphysio\b/g, "pathophysiology"],
    [/\bvitals\s*monitoring\b|\bvital\s*signs\b/g, "vitals"],
    [/\bdischrg\b|\bdischarg\b/g, "discharge"],
    [/\bemrgncy\b|\bemrgency\b/g, "emergency"],
  ];

  for (const [regex, rep] of replacements) {
    s = s.replace(regex, rep);
  }

  return s;
}

/**
 * Classifies doctor natural language input into one of Astra intents with robustness,
 * auto-correct, shorthand expansion, and general conversation detection.
 */
export function classifyAstraIntent(text: string): AstraIntent {
  if (!text || !text.trim()) return "GENERAL_CONVERSATION";
  const lower = normalizeQueryString(text);

  // 1. GENERAL CONVERSATION & GREETINGS
  const greetings = [
    "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
    "greetings", "namaste", "how are you", "how are you doing", "what's up",
    "sup", "yo", "thanks", "thank you", "thx", "help", "guide me", "what can you do",
    "who are you", "what is your name", "tell me about yourself", "ok", "okay",
    "nice", "cool", "great", "awesome", "understood"
  ];
  if (greetings.includes(lower) || /^(hi|hello|hey|greetings|namaste|good\s*(morning|afternoon|evening))\b/i.test(lower)) {
    if (lower.includes("who are you") || lower.includes("what is your name") || lower.includes("tell me about yourself")) {
      return "IDENTITY_QUERY";
    }
    return "GENERAL_CONVERSATION";
  }

  // 2. IDENTITY QUERY
  if (lower.includes("who are you") || lower.includes("identity") || lower.includes("what is your name") || lower.includes("about astra")) {
    return "IDENTITY_QUERY";
  }

  // 3. HOSPITAL OPERATIONS SHORTHANDS & NATURAL LANGUAGE
  // Inpatient (IP) / Ward / Census
  if (
    lower === "ip" ||
    lower === "ip list" ||
    lower === "iplist" ||
    lower === "inpatient" ||
    lower === "inpatients" ||
    lower.includes("ip list") ||
    lower.includes("ip patient") ||
    lower.includes("list of ip") ||
    lower.includes("show patients in ward") ||
    lower.includes("show admitted patients") ||
    lower.includes("ward patients") ||
    lower.includes("who is in ward") ||
    lower.includes("who is admitted") ||
    lower.includes("admitted list") ||
    lower.includes("inpatient list") ||
    lower.includes("ward list") ||
    lower.includes("icu patients") ||
    lower.includes("census") ||
    lower.includes("hospital census") ||
    lower.includes("how many patients") ||
    lower.includes("bed occupancy") ||
    lower.includes("bed status")
  ) {
    return "IP_LIST";
  }

  // Outpatient (OP) / OPD Queue
  if (
    lower === "op" ||
    lower === "op list" ||
    lower === "oplist" ||
    lower === "opd" ||
    lower === "outpatient" ||
    lower === "outpatients" ||
    lower.includes("op list") ||
    lower.includes("op patient") ||
    lower.includes("list of op") ||
    lower.includes("show op patients") ||
    lower.includes("show opd queue") ||
    lower.includes("who is in opd") ||
    lower.includes("opd list") ||
    lower.includes("op queue") ||
    lower.includes("opd queue") ||
    lower.includes("today's op") ||
    lower.includes("op appointments")
  ) {
    return "OP_LIST";
  }

  // Billing & Finance
  if (
    lower === "billing" ||
    lower === "revenue" ||
    lower.includes("billing summary") ||
    lower.includes("billing") ||
    lower.includes("revenue") ||
    lower.includes("today's collection") ||
    lower.includes("collections") ||
    lower.includes("financial summary") ||
    lower.includes("pending bills")
  ) {
    return "BILLING_SUMMARY";
  }

  // Operation Theater (OT)
  if (
    lower === "ot" ||
    lower === "ot status" ||
    lower.includes("ot status") ||
    lower.includes("operation theater") ||
    lower.includes("operation theatre") ||
    lower.includes("surgeries today") ||
    lower.includes("surgery schedule") ||
    lower.includes("show ot")
  ) {
    return "OT_STATUS";
  }

  // Pending Queues
  if (lower.includes("pending lab") || lower.includes("lab queue") || lower.includes("pending labs") || lower.includes("lab status")) {
    return "LAB_QUEUE";
  }
  if (lower.includes("pending radiology") || lower.includes("radiology queue") || lower.includes("pending scans") || lower.includes("xray queue")) {
    return "RADIOLOGY_QUEUE";
  }

  // Emergency
  if (lower.includes("emergency") || lower.includes("code blue") || lower.includes("rapid response") || lower.includes("shock") || lower.includes("arrest") || lower.includes("sepsis")) {
    return "EMERGENCY";
  }

  // Discharge
  if (lower.includes("discharge") || lower.includes("discharge clearance") || lower.includes("discharge summary")) {
    return "DISCHARGE";
  }

  // Vitals & Ward Telemetry
  if (lower.includes("vital") || lower.includes("spo2") || lower.includes("telemetry") || lower.includes("monitor q2h") || lower.includes("blood pressure") || lower.includes("ward vitals") || lower.includes("patient vitals")) {
    return "VITAL_MONITORING";
  }

  // Orders
  if (
    lower.includes("prescribe") ||
    lower.includes("give paracetamol") ||
    lower.includes("give pcm") ||
    lower.includes("give ceftriaxone") ||
    lower.includes("give dolo") ||
    lower.includes("give recadril") ||
    lower.includes("give meropenem") ||
    lower.includes("give antibiotic") ||
    lower.includes("medication order") ||
    lower.includes("drug order")
  ) {
    return "MEDICATION_ORDER";
  }

  if (
    lower.includes("x-ray") ||
    lower.includes("xray") ||
    lower.includes("usg") ||
    lower.includes("ct scan") ||
    lower.includes("mri") ||
    lower.includes("radiology order") ||
    lower.includes("order cxr") ||
    lower.includes("order x-ray") ||
    lower.includes("order ultrasound")
  ) {
    return "RADIOLOGY_ORDER";
  }

  if (
    lower.includes("cbc") ||
    lower.includes("cbp") ||
    lower.includes("lft") ||
    lower.includes("kft") ||
    lower.includes("rft") ||
    lower.includes("crp") ||
    lower.includes("dengue") ||
    lower.includes("blood culture") ||
    lower.includes("lab order") ||
    lower.includes("order lab") ||
    lower.includes("send lab") ||
    lower.includes("blood test")
  ) {
    return "LAB_ORDER";
  }

  // Clinical Reasoning & Research
  if (
    lower === "ddx" ||
    lower.includes("differential") ||
    lower.includes("ddx") ||
    lower.includes("diagnostic possibilities") ||
    lower.includes("what could it be")
  ) {
    return "DIFFERENTIAL_DIAGNOSIS";
  }

  if (
    lower === "patho" ||
    lower.includes("pathophysiology") ||
    lower.includes("mechanism") ||
    lower.includes("cellular level") ||
    lower.includes("path map")
  ) {
    return "CLINICAL_REASONING";
  }

  if (lower.includes("blind spot") || lower.includes("red team") || lower.includes("challenge my diagnosis") || lower.includes("what am i missing")) {
    return "BLIND_SPOT_ANALYSIS";
  }

  if (lower.includes("pubmed") || lower.includes("rct") || lower.includes("trial") || lower.includes("literature") || lower.includes("research")) {
    return "MEDICAL_RESEARCH";
  }

  if (lower.includes("guideline") || lower.includes("who protocol") || lower.includes("idsa")) {
    return "GUIDELINE_SEARCH";
  }

  if (lower.includes("web search") || lower.includes("outbreak") || lower.includes("google search")) {
    return "WEB_SEARCH";
  }

  if (lower.includes("summarize") || lower.includes("patient chart") || lower.includes("chart summary")) {
    return "PATIENT_SUMMARY";
  }

  if (lower.includes("follow up") || lower.includes("followup") || lower.includes("review in opd")) {
    return "FOLLOW_UP";
  }

  if (lower.includes("result") || lower.includes("lab report") || lower.includes("what changed")) {
    return "RESULT_REVIEW";
  }

  if (lower.includes("enhance image") || lower.includes("adjust contrast")) {
    return "IMAGE_ENHANCEMENT";
  }

  if (lower.includes("anatomy overlay") || lower.includes("label anatomy") || lower.includes("anatomical")) {
    return "ANATOMY_OVERLAY";
  }

  if (lower.includes("image") || lower.includes("photo") || lower.includes("wound") || lower.includes("lesion") || lower.includes("scan analysis")) {
    return "IMAGE_ANALYSIS";
  }

  if (lower.includes("surgery") || lower.includes("ot workflow") || lower.includes("pre-op") || lower.includes("operation")) {
    return "OT_WORKFLOW";
  }

  if (lower.includes("icu") || lower.includes("ventilator") || lower.includes("arterial line") || lower.includes("central line")) {
    return "ICU_WORKFLOW";
  }

  if (lower.includes("nursing") || lower.includes("foley") || lower.includes("dressing") || lower.includes("positioning")) {
    return "NURSING_ORDER";
  }

  if (lower.includes("consult") || lower.includes("cardiology") || lower.includes("nephrology") || lower.includes("pulmonology") || lower.includes("neurology")) {
    return "CONSULTATION";
  }

  if (lower.includes("progress note") || lower.includes("consult note") || lower.includes("soape note") || lower.includes("charting")) {
    return "DOCUMENTATION";
  }

  if (lower.includes("notify") || lower.includes("alert patient") || lower.includes("whatsapp")) {
    return "PATIENT_NOTIFICATION";
  }

  if (lower.includes("department") || lower.includes("message ward") || lower.includes("message lab")) {
    return "DEPARTMENT_MESSAGE";
  }

  if (lower.includes("voice") || lower.includes("speak") || lower.includes("dictate")) {
    return "VOICE_COMMAND";
  }

  // Check if it looks like a generic query
  if (
    lower.startsWith("what") || 
    lower.startsWith("why") || 
    lower.startsWith("how") || 
    lower.startsWith("tell me") || 
    lower.startsWith("search") ||
    lower.startsWith("can you") ||
    lower.startsWith("could you")
  ) {
    return "PATIENT_QUERY";
  }

  // Unclear / single unrecognized tokens or words -> AMBIGUOUS_COMMAND
  if (lower.length <= 15 && !lower.includes(" ")) {
    return "AMBIGUOUS_COMMAND";
  }

  return "PATIENT_QUERY";
}

/**
 * Parses single or multi-item clinical commands into an order draft bundle
 */
export interface ParsedCommandDraft {
  isCommand: boolean;
  intent: AstraIntent;
  bedNumber: string;
  patientUhid: string;
  patientName: string;
  orderType: OrderType;
  itemSummary: string;
  category: string;
  destinationDept: string;
  priority: OrderPriority;
  rawQuery: string;
}

export interface ParsedCommandBundle {
  isCommandBundle: boolean;
  intent: AstraIntent;
  bedNumber: string;
  patientUhid: string;
  patientName: string;
  drafts: ParsedCommandDraft[];
  rawQuery: string;
}

export function parseClinicalCommand(
  text: string,
  patients: Patient[],
  currentlySelectedPatient: Patient | null
): ParsedCommandDraft | null {
  const bundle = parseClinicalCommandBundle(text, patients, currentlySelectedPatient);
  if (bundle && bundle.drafts.length > 0) {
    return bundle.drafts[0];
  }
  return null;
}

export function parseClinicalCommandBundle(
  text: string,
  patients: Patient[],
  currentlySelectedPatient: Patient | null
): ParsedCommandBundle | null {
  if (!text || text.trim().length < 3) return null;

  const lower = text.toLowerCase().trim();
  const intent = classifyAstraIntent(text);

  const commandKeywords = [
    "order",
    "prescribe",
    "send",
    "get",
    "check",
    "monitor",
    "request",
    "schedule",
    "prepare",
    "give",
    "start",
    "x-ray",
    "xray",
    "cbc",
    "usg",
    "ct",
    "mri",
    "ultrasound",
    "consultation",
    "surgery",
    "paracetamol",
    "dolo",
    "ceftriaxone",
    "vitals",
  ];

  const hasCommandKeyword = commandKeywords.some((kw) => lower.includes(kw));

  if (
    !hasCommandKeyword &&
    (lower.startsWith("what is") || lower.startsWith("why is") || lower.startsWith("how to") || lower.startsWith("tell me about"))
  ) {
    return null;
  }

  // 1. Identify Patient / Bed
  let matchedPatient: Patient | null = currentlySelectedPatient;
  let bedNumber = currentlySelectedPatient?.bedNumber || "Bed-01";

  const bedMatch = lower.match(/(bed\s*\d+|icu\s*bed\s*\d+|room\s*\d+)/i);
  if (bedMatch) {
    const bedStr = bedMatch[0].replace(/\s+/g, "");
    const digitMatch = bedStr.match(/\d+/);
    if (digitMatch) {
      const num = parseInt(digitMatch[0], 10);
      const found = patients.find(
        (p) =>
          (p.bedNumber && p.bedNumber.toLowerCase().includes(num.toString())) ||
          (p.queueNumber === num)
      );
      if (found) {
        matchedPatient = found;
        bedNumber = found.bedNumber || `Bed-${num.toString().padStart(2, "0")}`;
      } else {
        bedNumber = `Bed-${num.toString().padStart(2, "0")}`;
      }
    }
  }

  patients.forEach((p) => {
    if (lower.includes(p.name.toLowerCase().split(" ")[0])) {
      matchedPatient = p;
      bedNumber = p.bedNumber || "Bed-01";
    }
  });

  // Priority
  let priority: OrderPriority = "ROUTINE";
  if (lower.includes("urgent") || lower.includes("stat") || lower.includes("emergency") || lower.includes("immediately")) {
    priority = "STAT";
  }

  if (!matchedPatient) {
    // No patient selected or matched — block order draft
    return null;
  }

  const patientUhid = matchedPatient.uhid;
  const patientName = matchedPatient.name;

  // Check for multi-item order bundle (e.g. "order cbc, crp and chest x-ray")
  const drafts: ParsedCommandDraft[] = [];

  // Sub-item triggers
  const subItems: { kw: string[]; type: OrderType; dept: string; cat: string; label: string }[] = [
    { kw: ["cbc", "complete blood count"], type: "LABORATORY", dept: "Laboratory Workstation", cat: "Hematology", label: "CBC (Complete Blood Count) Panel" },
    { kw: ["crp", "c-reactive protein"], type: "LABORATORY", dept: "Laboratory Workstation", cat: "Biochemistry", label: "C-Reactive Protein (CRP) Quantitative" },
    { kw: ["dengue", "ns1"], type: "LABORATORY", dept: "Laboratory Workstation", cat: "Serology", label: "Dengue NS1 Ag + Serology" },
    { kw: ["lft", "liver function"], type: "LABORATORY", dept: "Laboratory Workstation", cat: "Biochemistry", label: "Liver Function Test (LFT) Panel" },
    { kw: ["kft", "renal function"], type: "LABORATORY", dept: "Laboratory Workstation", cat: "Biochemistry", label: "Kidney Function Test (KFT) Panel" },
    { kw: ["x-ray", "xray", "chest x-ray"], type: "RADIOLOGY", dept: "Radiology & Imaging Workstation", cat: "Radiology", label: "Chest X-Ray PA View (Digital)" },
    { kw: ["usg", "ultrasound"], type: "RADIOLOGY", dept: "Radiology & Imaging Workstation", cat: "Ultrasound", label: "USG Abdomen & Pelvis" },
    { kw: ["ct", "ct scan"], type: "RADIOLOGY", dept: "Radiology & Imaging Workstation", cat: "CT Imaging", label: "NCCT Brain / Chest" },
    { kw: ["mri"], type: "RADIOLOGY", dept: "Radiology & Imaging Workstation", cat: "MRI Imaging", label: "MRI Lumbar Spine" },
    { kw: ["paracetamol", "dolo"], type: "PHARMACY", dept: "Pharmacy & Ward Nursing MAR", cat: "Medication", label: "Paracetamol 650mg PO TDS (Dolo 650mg)" },
    { kw: ["ceftriaxone"], type: "PHARMACY", dept: "Pharmacy & Ward Nursing MAR", cat: "Medication", label: "Ceftriaxone 1g IV BD" },
    { kw: ["augmentin"], type: "PHARMACY", dept: "Pharmacy & Ward Nursing MAR", cat: "Medication", label: "Augmentin 625mg PO BD" },
    { kw: ["vital", "vitals", "monitor q2h"], type: "NURSING_WARD", dept: "Ward / ICU Nursing Desk", cat: "Nursing Task", label: "Vitals Monitoring & Nursing Assessment (q2h)" },
    { kw: ["cardiology", "consult cardiology"], type: "CONSULTATION", dept: "Cardiology Consult Service", cat: "Specialist Referral", label: "Specialist Cardiology Consultation Request" },
    { kw: ["surgery", "pre-op", "ot"], type: "SURGERY_OT", dept: "OT Suite & Pre-op Workflow Desk", cat: "Surgical Workflow", label: "Pre-Op Preparation & Surgery Scheduling" },
    { kw: ["discharge"], type: "DISCHARGE", dept: "Discharge & Billing Desk", cat: "Discharge Workflow", label: "Discharge Summary & Clearance Request" },
  ];

  subItems.forEach((sub) => {
    if (sub.kw.some((k) => lower.includes(k))) {
      drafts.push({
        isCommand: true,
        intent,
        bedNumber,
        patientUhid,
        patientName,
        orderType: sub.type,
        itemSummary: sub.label,
        category: sub.cat,
        destinationDept: sub.dept,
        priority,
        rawQuery: text,
      });
    }
  });

  if (drafts.length === 0 && hasCommandKeyword) {
    // Fallback single order
    drafts.push({
      isCommand: true,
      intent,
      bedNumber,
      patientUhid,
      patientName,
      orderType: "LABORATORY",
      itemSummary: "Routine Clinical Order",
      category: "General",
      destinationDept: "Laboratory Workstation",
      priority,
      rawQuery: text,
    });
  }

  if (drafts.length === 0) return null;

  return {
    isCommandBundle: true,
    intent,
    bedNumber,
    patientUhid,
    patientName,
    drafts,
    rawQuery: text,
  };
}

