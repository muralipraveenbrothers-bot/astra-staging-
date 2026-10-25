/**
 * ASTRA AI — SEMANTIC INTENT CLASSIFIER (Layer 1)
 * 
 * A zero-LLM-latency intent classifier using TF-IDF cosine similarity.
 * Classifies raw text/voice input into one of 15 intent routes in <10ms.
 * 
 * This replaces the regex-based IntentResolver as the primary classifier,
 * with regex fallback for edge cases.
 */

import type { IntentRoute, IntentClassification } from "./types";

// ─── Intent Route Definitions ─────────────────────────────────────

const INTENT_ROUTES: IntentRoute[] = [
  {
    id: "hospital_census",
    name: "Hospital Census / IP List",
    department: "WARD",
    utterances: [
      "show ip patients", "ip list", "inpatient census", "how many patients admitted",
      "total admissions today", "ward occupancy", "bed occupancy rate",
      "show admitted patients", "current admissions", "ip count",
      "how many beds occupied", "ward census", "patient census",
    ],
    riskLevel: "LOW",
    requiresLLM: false,
  },
  {
    id: "patient_lookup",
    name: "Patient Lookup",
    department: "RECEPTION",
    utterances: [
      "find patient", "search patient", "patient details", "show patient",
      "uhid lookup", "patient info", "get patient record", "look up patient",
      "patient profile", "patient history", "show details for",
    ],
    riskLevel: "LOW",
    requiresLLM: false,
  },
  {
    id: "lab_order",
    name: "Laboratory Order",
    department: "LABORATORY",
    utterances: [
      "order cbc", "order blood test", "lab order", "order rft", "order lft",
      "send for blood work", "complete blood count", "order coagulation",
      "lab test for patient", "order hemogram", "book lab test",
      "order culture sensitivity", "urine routine", "thyroid profile",
    ],
    riskLevel: "IMPORTANT",
    requiresLLM: false,
    requiredTools: ["create_lab_order"],
  },
  {
    id: "radiology_order",
    name: "Radiology Order",
    department: "RADIOLOGY",
    utterances: [
      "order xray", "order ct scan", "order mri", "radiology order",
      "book scan", "order ultrasound", "order ecg", "order echo",
      "chest xray", "abdominal scan", "brain mri", "order imaging",
    ],
    riskLevel: "IMPORTANT",
    requiresLLM: false,
    requiredTools: ["create_radiology_order"],
  },
  {
    id: "pharmacy_order",
    name: "Pharmacy / Prescription Order",
    department: "PHARMACY",
    utterances: [
      "prescribe", "order medication", "pharmacy order", "dispense",
      "medication order", "drug order", "write prescription",
      "tablet", "injection", "iv fluid", "dose", "mg",
    ],
    riskLevel: "HIGH_RISK",
    requiresLLM: false,
    requiredTools: ["create_prescription"],
  },
  {
    id: "billing_query",
    name: "Billing & Finance Query",
    department: "BILLING",
    utterances: [
      "billing summary", "total revenue", "collections today",
      "pending bills", "insurance claims", "billing status",
      "outstanding amount", "payment pending", "discharge billing",
      "ip billing", "op billing", "financial summary",
    ],
    riskLevel: "LOW",
    requiresLLM: false,
  },
  {
    id: "ot_status",
    name: "OT Status / Checklist",
    department: "OT",
    utterances: [
      "ot status", "ot checklist", "operation theater", "surgery schedule",
      "ot available", "fumigation status", "pre op checklist",
      "anesthesia ready", "surgery ready", "ot command",
      "which ot is free", "ot preparation",
    ],
    riskLevel: "HIGH_RISK",
    requiresLLM: false,
  },
  {
    id: "clinical_reasoning",
    name: "Clinical Reasoning / Diagnosis",
    department: "CLINICAL",
    utterances: [
      "what could be the diagnosis", "differential diagnosis", "clinical reasoning",
      "what is wrong with", "treatment plan", "suggest treatment",
      "management plan", "clinical assessment", "medical opinion",
      "pathophysiology", "prognosis", "risk assessment",
      "analyze symptoms", "interpret results",
    ],
    riskLevel: "CLINICAL",
    requiresLLM: true,
  },
  {
    id: "drug_interaction",
    name: "Drug Interaction / Safety Check",
    department: "PHARMACY",
    utterances: [
      "drug interaction", "contraindication", "can patient take",
      "allergy check", "medication safety", "adverse reaction",
      "drug compatibility", "cross reactivity", "side effects",
    ],
    riskLevel: "CLINICAL",
    requiresLLM: true,
  },
  {
    id: "evidence_search",
    name: "Evidence / Literature Search",
    department: "CLINICAL",
    utterances: [
      "search evidence", "find study", "pubmed search", "clinical trial",
      "guideline", "protocol", "latest research", "evidence for",
      "best practice", "systematic review", "meta analysis",
    ],
    riskLevel: "LOW",
    requiresLLM: true,
  },
  {
    id: "image_analysis",
    name: "Medical Image Analysis",
    department: "RADIOLOGY",
    utterances: [
      "analyze image", "analyze xray", "wound analysis", "read this scan",
      "interpret image", "medical image", "dicom analysis",
      "what does this show", "fracture detection",
    ],
    riskLevel: "CLINICAL",
    requiresLLM: true,
  },
  {
    id: "voice_command",
    name: "Voice Command / Dictation",
    department: "CLINICAL",
    utterances: [
      "dictate note", "voice note", "record note", "transcribe",
      "speech to text", "clinical note dictation",
    ],
    riskLevel: "LOW",
    requiresLLM: false,
  },
  {
    id: "consent_generation",
    name: "Consent / Document Generation",
    department: "OT",
    utterances: [
      "generate consent", "surgery consent", "anesthesia consent",
      "procedure notes", "discharge summary", "create document",
      "auto consent", "consent form",
    ],
    riskLevel: "IMPORTANT",
    requiresLLM: false,
  },
  {
    id: "identity_query",
    name: "Identity / About Astra",
    department: "SYSTEM",
    utterances: [
      "who are you", "what are you", "your name", "what can you do",
      "help me", "capabilities", "about astra", "introduce yourself",
    ],
    riskLevel: "LOW",
    requiresLLM: false,
  },
  {
    id: "general_chat",
    name: "General Conversation",
    department: "SYSTEM",
    utterances: [
      "hello", "hi", "good morning", "thank you", "thanks",
      "how are you", "okay", "bye",
    ],
    riskLevel: "LOW",
    requiresLLM: true,
  },
];

// ─── TF-IDF Tokenizer ────────────────────────────────────────────

/** Simple tokenizer: lowercase, split on non-alphanumeric, remove stopwords */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "and", "but",
  "or", "nor", "not", "so", "yet", "both", "either", "neither", "each",
  "every", "all", "any", "few", "more", "most", "other", "some", "such",
  "no", "only", "own", "same", "than", "too", "very", "just", "because",
  "if", "when", "where", "how", "what", "which", "who", "whom", "this",
  "that", "these", "those", "it", "its", "i", "me", "my", "we", "our",
  "you", "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "please", "tell", "show", "give", "get", "let", "make",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// ─── Build IDF Index ──────────────────────────────────────────────

interface IDFIndex {
  idf: Map<string, number>;
  routeVectors: Map<string, Map<string, number>>;
}

function buildIndex(routes: IntentRoute[]): IDFIndex {
  const documentFreq = new Map<string, number>();
  const routeTokenSets: { routeId: string; tokens: string[] }[] = [];

  // Collect all tokens per route
  for (const route of routes) {
    const allText = route.utterances.join(" ");
    const tokens = tokenize(allText);
    routeTokenSets.push({ routeId: route.id, tokens });

    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      documentFreq.set(token, (documentFreq.get(token) ?? 0) + 1);
    }
  }

  // Compute IDF
  const N = routes.length;
  const idf = new Map<string, number>();
  for (const [token, df] of documentFreq) {
    idf.set(token, Math.log((N + 1) / (df + 1)) + 1); // smoothed IDF
  }

  // Compute TF-IDF vectors per route
  const routeVectors = new Map<string, Map<string, number>>();
  for (const { routeId, tokens } of routeTokenSets) {
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    const tfidf = new Map<string, number>();
    for (const [token, count] of tf) {
      const idfVal = idf.get(token) ?? 1;
      tfidf.set(token, (count / tokens.length) * idfVal);
    }

    routeVectors.set(routeId, tfidf);
  }

  return { idf, routeVectors };
}

// ─── Cosine Similarity ───────────────────────────────────────────

function cosineSimilarity(
  vecA: Map<string, number>,
  vecB: Map<string, number>
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of vecA) {
    const valB = vecB.get(key) ?? 0;
    dot += valA * valB;
    normA += valA * valA;
  }
  for (const [, valB] of vecB) {
    normB += valB * valB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Semantic Intent Classifier ──────────────────────────────────

export class SemanticIntentClassifier {
  private routes: IntentRoute[];
  private index: IDFIndex;
  private confidenceThreshold: number;

  constructor(confidenceThreshold = 0.25) {
    this.routes = INTENT_ROUTES;
    this.index = buildIndex(this.routes);
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Classify a raw text input into an intent route.
   * Returns classification with confidence score. <10ms for typical inputs.
   */
  classify(input: string): IntentClassification {
    const t0 = performance.now();
    const inputTokens = tokenize(input);

    if (inputTokens.length === 0) {
      return this.fallback("general_chat", [], true);
    }

    // Build input TF-IDF vector
    const tf = new Map<string, number>();
    for (const token of inputTokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    const inputVec = new Map<string, number>();
    for (const [token, count] of tf) {
      const idfVal = this.index.idf.get(token) ?? 1;
      inputVec.set(token, (count / inputTokens.length) * idfVal);
    }

    // Score against all routes
    let bestRouteId = "general_chat";
    let bestScore = 0;
    const matchedTokens: string[] = [];

    for (const [routeId, routeVec] of this.index.routeVectors) {
      const score = cosineSimilarity(inputVec, routeVec);
      if (score > bestScore) {
        bestScore = score;
        bestRouteId = routeId;
      }
    }

    // Collect matched tokens for explainability
    const bestRouteVec = this.index.routeVectors.get(bestRouteId);
    if (bestRouteVec) {
      for (const token of inputTokens) {
        if (bestRouteVec.has(token)) {
          matchedTokens.push(token);
        }
      }
    }

    // Apply threshold
    if (bestScore < this.confidenceThreshold) {
      return this.fallback("general_chat", matchedTokens, true);
    }

    const route = this.routes.find((r) => r.id === bestRouteId)!;
    const elapsed = performance.now() - t0;

    console.log(
      `[SemanticClassifier] "${input}" → ${bestRouteId} (confidence: ${bestScore.toFixed(3)}, ${elapsed.toFixed(1)}ms)`
    );

    return {
      routeId: bestRouteId,
      confidence: Math.min(bestScore * 1.5, 1.0), // Normalize to 0-1 range
      department: route.department,
      riskLevel: route.riskLevel,
      requiresLLM: route.requiresLLM,
      matchedTokens,
      fallbackUsed: false,
    };
  }

  /**
   * Get all available intent routes for dashboard display.
   */
  getRoutes(): IntentRoute[] {
    return [...this.routes];
  }

  /**
   * Add custom intent routes (e.g., hospital-specific commands).
   */
  addRoute(route: IntentRoute): void {
    this.routes.push(route);
    this.index = buildIndex(this.routes);
  }

  private fallback(
    routeId: string,
    matchedTokens: string[],
    fallbackUsed: boolean
  ): IntentClassification {
    const route = this.routes.find((r) => r.id === routeId) ?? this.routes[this.routes.length - 1];
    return {
      routeId: route.id,
      confidence: 0.3,
      department: route.department,
      riskLevel: route.riskLevel,
      requiresLLM: route.requiresLLM,
      matchedTokens,
      fallbackUsed,
    };
  }
}

// ─── Singleton Export ─────────────────────────────────────────────

export const semanticClassifier = new SemanticIntentClassifier();
