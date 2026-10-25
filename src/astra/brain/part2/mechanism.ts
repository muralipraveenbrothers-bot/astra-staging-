/**
 * Mechanism graph and the cross-cutting clinical chain.
 * Existing D6 text is preserved beside this graph. This graph only states
 * links supported by the verified text or by the fracture teaching pathway.
 */

export type PathView = "Simple" | "Clinical" | "Advanced" | "Cellular" | "Multisystem";

export const PATH_VIEWS: PathView[] = ["Simple", "Clinical", "Advanced", "Cellular", "Multisystem"];

export interface GraphNode {
  id: "CAUSE" | "CELL" | "TISSUE" | "ORGAN" | "SYSTEM" | "COMPENSATION" | "CLINICAL SIGNS" | "LAB SIGNALS" | "COMPLICATIONS" | "INTERVENTION POINTS";
  statements: string[];
}

export interface CausalLink {
  from: string;
  to: string;
  because: string;
}

export interface MechanismGraph {
  title: string;
  levels: Record<"cell" | "tissue" | "organ" | "system" | "multisystem" | "compensation" | "failure", string[]>;
  chain: string[];
  nodes: GraphNode[];
  links: CausalLink[];
  pulsesReassuring: false;
  compartmentPressurePrompt: string | null;
  labLimitation: string | null;
}

const FRACTURE = /fracture|compartment|tibia|femur|crush|swollen limb|fascial/i;

const COMPARTMENT_CHAIN = [
  "fracture / tissue injury",
  "bleeding + edema",
  "noncompliant fascial compartment",
  "rising compartment pressure",
  "impaired venous outflow",
  "worsening tissue edema",
  "reduced capillary perfusion",
  "muscle/nerve ischemia",
  "cellular injury",
  "necrosis / rhabdomyolysis",
  "systemic consequences",
];

export function isFractureRisk(text: string): boolean {
  return FRACTURE.test(text ?? "");
}

export function buildMechanism(text: string, pulsesPresent?: boolean, examinationReliable?: boolean): MechanismGraph {
  if (isFractureRisk(text)) return fractureMechanism(pulsesPresent, examinationReliable);
  return openMechanism(text);
}

function fractureMechanism(pulsesPresent?: boolean, examinationReliable?: boolean): MechanismGraph {
  const equivocal = examinationReliable === false || pulsesPresent === true;
  return {
    title: "Fracture injury to compartment ischemia",
    levels: {
      cell: [
        "Muscle and nerve cells lose perfusion and run out of aerobic energy.",
        "Membrane ion gradients fail as ischemia continues.",
        "The enzyme and receptor detail is unknown until the injured tissue is examined.",
      ],
      tissue: [
        "Bleeding and edema expand inside a compartment that does not stretch.",
        "Venous outflow falls before arterial pulses disappear.",
        "Perfusion of capillaries falls. Necrosis is the late tissue result, not the first sign.",
      ],
      organ: ["The muscle and the nerve in that compartment lose function."],
      system: ["Pain, stretch pain, and sensory or motor change are the local system signals."],
      multisystem: ["Rhabdomyolysis can involve the kidney and the circulation. That is a later systemic consequence."],
      compensation: ["Collateral flow and remaining venous outflow can keep a pulse present while muscle is already ischemic."],
      failure: [
        "The next failure is muscle and nerve necrosis, then rhabdomyolysis.",
        "Detect it with serial pain, passive stretch, tension, sensation, motor power, and analgesic need.",
      ],
    },
    chain: COMPARTMENT_CHAIN,
    nodes: [
      { id: "CAUSE", statements: ["fracture / tissue injury"] },
      { id: "CELL", statements: ["cellular injury after ischemia"] },
      { id: "TISSUE", statements: ["bleeding + edema", "noncompliant fascial compartment", "rising compartment pressure"] },
      { id: "ORGAN", statements: ["muscle and nerve in the compartment"] },
      { id: "SYSTEM", statements: ["impaired venous outflow", "reduced capillary perfusion"] },
      { id: "COMPENSATION", statements: ["A palpable pulse can persist while capillary flow is already failing."] },
      { id: "CLINICAL SIGNS", statements: ["pain out of proportion where that applies", "pain on passive stretch", "rising tension", "sensory change", "motor change"] },
      { id: "LAB SIGNALS", statements: ["CK, potassium, creatinine, urinalysis, and myoglobin describe muscle injury and systemic effect after the fact."] },
      { id: "COMPLICATIONS", statements: ["necrosis / rhabdomyolysis", "systemic consequences"] },
      { id: "INTERVENTION POINTS", statements: ["Serial neurovascular examination.", "A doctor decides whether local orthopedic protocol calls for compartment-pressure measurement."] },
    ],
    links: COMPARTMENT_CHAIN.slice(0, -1).map((from, index) => ({
      from,
      to: COMPARTMENT_CHAIN[index + 1]!,
      because: "Each step raises pressure or lowers perfusion inside the compartment.",
    })),
    pulsesReassuring: false,
    compartmentPressurePrompt: equivocal
      ? "Examination is unreliable or equivocal in an at-risk limb. Ask the clinician to consider objective compartment-pressure assessment under the local orthopedic protocol."
      : null,
    labLimitation: "CK/CPK, potassium, creatinine, urinalysis, and myoglobin do not reliably exclude early compartment syndrome.",
  };
}

function openMechanism(text: string): MechanismGraph {
  const subject = (text ?? "").trim().slice(0, 140) || "unknown presentation";
  const unknown = `Not established from the verified facts for: ${subject}`;
  return {
    title: "Mechanism questions. Answers stay unknown until the facts support them.",
    levels: {
      cell: [unknown],
      tissue: [unknown],
      organ: [unknown],
      system: [unknown],
      multisystem: [unknown],
      compensation: [unknown],
      failure: [unknown],
    },
    chain: [],
    nodes: [
      { id: "CAUSE", statements: [subject] },
      { id: "CELL", statements: [unknown] },
      { id: "TISSUE", statements: [unknown] },
      { id: "ORGAN", statements: [unknown] },
      { id: "SYSTEM", statements: [unknown] },
      { id: "COMPENSATION", statements: [unknown] },
      { id: "CLINICAL SIGNS", statements: ["Use only signs that were recorded."] },
      { id: "LAB SIGNALS", statements: ["Use only results that were recorded."] },
      { id: "COMPLICATIONS", statements: [unknown] },
      { id: "INTERVENTION POINTS", statements: ["A doctor confirms any intervention."] },
    ],
    links: [],
    pulsesReassuring: false,
    compartmentPressurePrompt: null,
    labLimitation: null,
  };
}

const VIEW_NODES: Record<PathView, GraphNode["id"][]> = {
  Simple: ["CAUSE", "CLINICAL SIGNS", "COMPLICATIONS", "INTERVENTION POINTS"],
  Clinical: ["CAUSE", "ORGAN", "SYSTEM", "COMPENSATION", "CLINICAL SIGNS", "LAB SIGNALS", "COMPLICATIONS", "INTERVENTION POINTS"],
  Advanced: ["CAUSE", "CELL", "TISSUE", "ORGAN", "SYSTEM", "COMPENSATION", "CLINICAL SIGNS", "LAB SIGNALS", "COMPLICATIONS", "INTERVENTION POINTS"],
  Cellular: ["CAUSE", "CELL", "TISSUE"],
  Multisystem: ["SYSTEM", "COMPENSATION", "COMPLICATIONS"],
};

export function nodesForView(graph: MechanismGraph, view: PathView): GraphNode[] {
  const allow = new Set(VIEW_NODES[view]);
  return graph.nodes.filter((node) => allow.has(node.id));
}

export function crossCuttingLinks(text: string): CausalLink[] {
  if (!isFractureRisk(text)) {
    return [{ from: "symptoms", to: "management", because: "The causal chain is incomplete until signs, anatomy, and results are recorded." }];
  }
  return [
    { from: "symptoms", to: "signs", because: "Pain and swelling are the clinical face of bleeding and edema." },
    { from: "signs", to: "anatomy", because: "The swelling is trapped in a fascial compartment." },
    { from: "anatomy", to: "physiology", because: "A closed compartment converts volume into pressure." },
    { from: "physiology", to: "pathophysiology", because: "Pressure above capillary flow causes muscle and nerve ischemia." },
    { from: "pathophysiology", to: "investigation signals", because: "Serial examination detects ischemia earlier than a blood test." },
    { from: "investigation signals", to: "differential", because: "Compartment syndrome stays on the list until examination addresses it." },
    { from: "differential", to: "diagnosis", because: "The diagnosis is not declared from the story alone." },
    { from: "diagnosis", to: "management", because: "A doctor confirms fasciotomy or continued observation." },
    { from: "management", to: "outcome / complication", because: "Missed ischemia proceeds to necrosis and rhabdomyolysis." },
  ];
}
