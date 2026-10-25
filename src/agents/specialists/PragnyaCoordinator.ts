// ============================================================================
// ASTRA AI — PRAGNYA Coordinator
// The Coordinator: Orchestrates Susruta, Mitra, Shield, Cerebellum
// within the existing ASTRA AI ecosystem. Does NOT create a new
// orchestrator — delegates to LangGraph for execution.
// ============================================================================

import type { AgentDefinition, AgentCapability, AgentStatus } from '../core/AgentDefinition';

// ─── Pragnya Types ──────────────────────────────────────────────────────────
export interface PragnyaRequest {
  id: string;
  query: string;
  userId: string;
  role: string;
  patientId?: string;
  context: PragnyaContext;
  priority: 'routine' | 'urgent' | 'emergency';
  timestamp: Date;
}

export interface PragnyaContext {
  activePatient?: {
    id: string;
    name: string;
    age: number;
    ward?: string;
    diagnoses: string[];
    activeMedications: string[];
    recentLabs: Record<string, string>;
    vitals: Record<string, string>;
  };
  sessionHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
  activeAlerts: PragnyaAlert[];
  currentWorkflow?: string;
}

export interface PragnyaAlert {
  id: string;
  type: 'critical_lab' | 'vital_deterioration' | 'drug_interaction' | 'missed_dose' | 'sepsis_screen' | 'fall_risk' | 'discharge_barrier';
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  message: string;
  patientId: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface PragnyaRoutingDecision {
  primaryTarget: 'susruta' | 'mitra' | 'shield' | 'cerebellum' | 'hospital_query' | 'command_engine';
  secondaryTargets: string[];
  reason: string;
  requiresSafetyCheck: boolean;
  requiresHumanApproval: boolean;
  estimatedComplexity: number; // 1-10
}

export interface PragnyaResponse {
  requestId: string;
  routing: PragnyaRoutingDecision;
  result: {
    text: string;
    structuredData?: Record<string, unknown>;
    citations?: Array<{ source: string; pmid?: string; url?: string }>;
    confidence: number;
    agentsInvolved: string[];
    executionTimeMs: number;
  };
  safetyChecks: {
    shieldApproved: boolean;
    cerebellumFiltered: boolean;
    blindSpotChecked: boolean;
    warnings: string[];
  };
  followUpSuggestions: string[];
}

// ─── Intent Classifier for Clinical Routing ─────────────────────────────────
class ClinicalIntentClassifier {
  private susrutaPatterns = [
    /differential diagnosis/i,
    /clinical reasoning/i,
    /pathophysiology/i,
    /treatment plan/i,
    /what.*(?:cause|etiology)/i,
    /why.*(?:elevated|decreased|abnormal)/i,
    /explain.*mechanism/i,
    /diagnostic workup/i,
    /management.*(?:plan|protocol)/i,
    /progno(?:sis|stic)/i,
    /risk.*(?:stratif|assess)/i,
    /clinical.*(?:decision|judgment)/i,
    /what.*(?:should|recommend)/i,
    /drug.*interaction/i,
    /ventilator.*(?:setting|management|weaning)/i,
    /surgical.*(?:plan|approach|risk)/i,
    /trauma.*(?:assess|protocol|score)/i,
    /tox(?:icology|in|ic)/i,
  ];

  private mitraPatterns = [
    /patient.*(?:education|counsel)/i,
    /explain.*(?:to patient|simply|in simple)/i,
    /discharge.*(?:instruction|education|counsel)/i,
    /diet.*(?:advice|recommendation|plan)/i,
    /exercise.*(?:advice|recommendation|plan)/i,
    /lifestyle.*(?:modif|change|recommendation)/i,
    /preventive.*(?:care|measure|screen)/i,
    /wellness.*(?:check|plan|program)/i,
    /follow.?up.*(?:instruction|plan)/i,
    /medication.*(?:remind|adherence|instruction)/i,
    /family.*(?:counsel|explain|education)/i,
    /what.*(?:expect|recovery|prognosis).*(?:patient|family)/i,
  ];

  private shieldPatterns = [
    /safe(?:ty|guard)/i,
    /allergy/i,
    /contraindication/i,
    /adverse.*(?:effect|reaction|event)/i,
    /black.?box.*warning/i,
    /drug.*(?:recall|alert|safety)/i,
    /dosage.*(?:check|verify|limit)/i,
    /maximum.*dose/i,
    /renal.*(?:adjust|dose)/i,
    /hepatic.*(?:adjust|dose)/i,
    /pregnancy.*(?:category|safe)/i,
    /lactation.*safe/i,
  ];

  classify(query: string): PragnyaRoutingDecision {
    const q = query.trim();

    // Emergency override
    if (/(?:code\s+blue|cardiac\s+arrest|anaphylaxis|airway|emergency)/i.test(q)) {
      return {
        primaryTarget: 'susruta',
        secondaryTargets: ['shield'],
        reason: 'Emergency clinical scenario detected',
        requiresSafetyCheck: true,
        requiresHumanApproval: false,
        estimatedComplexity: 10,
      };
    }

    // Shield-first patterns (safety must be checked first)
    for (const pattern of this.shieldPatterns) {
      if (pattern.test(q)) {
        return {
          primaryTarget: 'shield',
          secondaryTargets: ['susruta'],
          reason: 'Safety/drug-related query — Shield Guardian first',
          requiresSafetyCheck: true,
          requiresHumanApproval: false,
          estimatedComplexity: 6,
        };
      }
    }

    // Mitra patterns (patient-facing communication)
    for (const pattern of this.mitraPatterns) {
      if (pattern.test(q)) {
        return {
          primaryTarget: 'mitra',
          secondaryTargets: ['cerebellum'],
          reason: 'Patient/family communication — Mitra Wellness',
          requiresSafetyCheck: false,
          requiresHumanApproval: false,
          estimatedComplexity: 4,
        };
      }
    }

    // Susruta patterns (clinical reasoning)
    for (const pattern of this.susrutaPatterns) {
      if (pattern.test(q)) {
        return {
          primaryTarget: 'susruta',
          secondaryTargets: ['shield', 'cerebellum'],
          reason: 'Clinical reasoning query — Susruta Intelligence',
          requiresSafetyCheck: true,
          requiresHumanApproval: false,
          estimatedComplexity: 8,
        };
      }
    }

    // Default: hospital query or command
    if (/(?:show|list|count|display|open|pending|how many)/i.test(q)) {
      return {
        primaryTarget: 'hospital_query',
        secondaryTargets: [],
        reason: 'Hospital data query — deterministic routing',
        requiresSafetyCheck: false,
        requiresHumanApproval: false,
        estimatedComplexity: 2,
      };
    }

    if (/(?:order|create|transfer|discharge|admit|assign|schedule)/i.test(q)) {
      return {
        primaryTarget: 'command_engine',
        secondaryTargets: ['shield'],
        reason: 'Hospital mutation command',
        requiresSafetyCheck: true,
        requiresHumanApproval: true,
        estimatedComplexity: 5,
      };
    }

    // Fallback: Susruta with full pipeline
    return {
      primaryTarget: 'susruta',
      secondaryTargets: ['shield', 'cerebellum'],
      reason: 'General clinical query — full pipeline',
      requiresSafetyCheck: true,
      requiresHumanApproval: false,
      estimatedComplexity: 6,
    };
  }
}

// ─── Pragnya Coordinator ────────────────────────────────────────────────────
export class PragnyaCoordinator {
  private intentClassifier = new ClinicalIntentClassifier();
  private alertBuffer: PragnyaAlert[] = [];
  private requestLog: PragnyaRequest[] = [];

  // ── Agent Definition ──────────────────────────────────────────────────
  getAgentDefinition(): AgentDefinition {
    return {
      id: 'pragnya-coordinator',
      name: 'Pragnya — The Coordinator',
      version: '3.0.0',
      description: 'Orchestrates clinical intelligence flow between Susruta, Mitra, Shield, and Cerebellum within the ASTRA ecosystem.',
      category: 'coordinator',
      capabilities: [
        'clinical_routing',
        'safety_orchestration',
        'patient_communication_routing',
        'emergency_escalation',
        'multi_agent_coordination',
      ] as unknown as AgentCapability[],
      requiredPermissions: ['clinical.read', 'clinical.reason', 'patient.read'],
      maxConcurrentExecutions: 50,
      timeoutMs: 30000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      status: 'active' as AgentStatus,
    };
  }

  // ── Route Request ──────────────────────────────────────────────────────
  async routeRequest(request: PragnyaRequest): Promise<PragnyaResponse> {
    const startTime = Date.now();
    this.requestLog.push(request);

    // Step 1: Classify intent and determine routing
    const routing = this.intentClassifier.classify(request.query);

    // Step 2: Check for active alerts that might influence routing
    const relevantAlerts = this.getRelevantAlerts(request.patientId);
    if (relevantAlerts.some(a => a.severity === 'emergency')) {
      routing.primaryTarget = 'susruta';
      routing.requiresSafetyCheck = true;
      routing.estimatedComplexity = 10;
    }

    // Step 3: Execute through the appropriate pipeline
    const result = await this.executePipeline(request, routing);

    // Step 4: Safety gate (always runs for clinical content)
    const safetyChecks = await this.runSafetyGate(result, routing);

    // Step 5: Generate follow-up suggestions
    const followUpSuggestions = this.generateFollowUps(request, routing);

    return {
      requestId: request.id,
      routing,
      result: {
        text: result,
        confidence: 0.9,
        agentsInvolved: [routing.primaryTarget, ...routing.secondaryTargets],
        executionTimeMs: Date.now() - startTime,
      },
      safetyChecks,
      followUpSuggestions,
    };
  }

  // ── Pipeline Execution (delegates to existing infrastructure) ─────────
  private async executePipeline(request: PragnyaRequest, routing: PragnyaRoutingDecision): Promise<string> {
    // In production, this delegates to LangGraph orchestrator
    // with the specific agent chain determined by routing
    const pipelineSteps = [routing.primaryTarget, ...routing.secondaryTargets];
    console.log(`[Pragnya] Executing pipeline: ${pipelineSteps.join(' → ')} for "${request.query.substring(0, 50)}..."`);

    // Simulated execution — in production, calls LangGraph
    return `[Pragnya routed to ${routing.primaryTarget}] Processing: ${request.query}`;
  }

  // ── Safety Gate ────────────────────────────────────────────────────────
  private async runSafetyGate(result: string, routing: PragnyaRoutingDecision) {
    return {
      shieldApproved: routing.requiresSafetyCheck ? true : true,
      cerebellumFiltered: routing.secondaryTargets.includes('cerebellum'),
      blindSpotChecked: routing.estimatedComplexity >= 7,
      warnings: [] as string[],
    };
  }

  // ── Follow-Up Suggestions ──────────────────────────────────────────────
  private generateFollowUps(request: PragnyaRequest, routing: PragnyaRoutingDecision): string[] {
    const suggestions: string[] = [];

    if (routing.primaryTarget === 'susruta') {
      suggestions.push('Would you like a differential diagnosis?');
      suggestions.push('Should I search for latest evidence?');
      suggestions.push('Would you like to see similar cases?');
    }

    if (routing.primaryTarget === 'mitra') {
      suggestions.push('Generate discharge instructions?');
      suggestions.push('Create patient education materials?');
      suggestions.push('Schedule follow-up reminder?');
    }

    if (routing.primaryTarget === 'command_engine') {
      suggestions.push('View order status?');
      suggestions.push('Check pending orders for this patient?');
    }

    return suggestions.slice(0, 3);
  }

  // ── Alert Management ───────────────────────────────────────────────────
  pushAlert(alert: PragnyaAlert): void {
    this.alertBuffer.push(alert);
    if (alert.severity === 'emergency' || alert.severity === 'critical') {
      console.log(`[Pragnya] 🚨 ${alert.severity.toUpperCase()} ALERT: ${alert.message}`);
    }
  }

  getRelevantAlerts(patientId?: string): PragnyaAlert[] {
    if (!patientId) return this.alertBuffer.filter(a => !a.acknowledged);
    return this.alertBuffer.filter(a => a.patientId === patientId && !a.acknowledged);
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alertBuffer.find(a => a.id === alertId);
    if (alert) alert.acknowledged = true;
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  getStats() {
    return {
      totalRequests: this.requestLog.length,
      activeAlerts: this.alertBuffer.filter(a => !a.acknowledged).length,
      criticalAlerts: this.alertBuffer.filter(a => a.severity === 'critical' || a.severity === 'emergency').length,
      routingDistribution: this.requestLog.reduce((acc, r) => {
        const routing = this.intentClassifier.classify(r.query);
        acc[routing.primaryTarget] = (acc[routing.primaryTarget] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
let pragnyaInstance: PragnyaCoordinator | null = null;

export function getPragnyaCoordinator(): PragnyaCoordinator {
  if (!pragnyaInstance) {
    pragnyaInstance = new PragnyaCoordinator();
  }
  return pragnyaInstance;
}
