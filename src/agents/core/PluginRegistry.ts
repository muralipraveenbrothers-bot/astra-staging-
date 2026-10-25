/**
 * ASTRA AI — PLUGIN REGISTRY (1.6)
 * ============================================================================
 * Canonical schema and registry for modular plugins across hospital,
 * clinical, vision, voice, RAG, and automation domains.
 */

export type PluginCategory =
  | "CORE"
  | "ORCHESTRATION"
  | "MODEL"
  | "MEDICAL"
  | "VOICE"
  | "VISION"
  | "HOSPITAL"
  | "KNOWLEDGE"
  | "AGENT"
  | "AUTOMATION"
  | "INTEGRATION"
  | "PRINT"
  | "QUALITY"
  | "ANALYTICS";

export type PluginStatus =
  | "DISCOVERED"
  | "INSTALLING"
  | "INSTALLED"
  | "CONNECTING"
  | "READY"
  | "ACTIVE"
  | "DEGRADED"
  | "FAILED"
  | "DISABLED";

export interface PluginManifest {
  pluginId: string;
  name: string;
  version: string;
  category: PluginCategory;
  description: string;
  license: string;
  runtime: "NODE" | "BROWSER" | "HYBRID";
  dependencies: string[];
  services: string[];
  agents: string[];
  tools: string[];
  models: string[];
  knowledgeSources: string[];
  permissions: string[];
  routes: string[];
  uiComponents: string[];
  healthCheckConfig: { endpoint: string; intervalMs: number };
  configurationSchema: Record<string, any>;
  riskLevel: "INFO" | "REVERSIBLE" | "IMPORTANT" | "HIGH_RISK";
  checksum: string;
  sourceUrl?: string;
  status: PluginStatus;
}

class PluginRegistryService {
  private plugins: Map<string, PluginManifest> = new Map();

  constructor() {
    this.seedDefaultPlugins();
  }

  private seedDefaultPlugins() {
    const defaultPlugins: PluginManifest[] = [
      {
        pluginId: "plugin-astra-brain-core",
        name: "ASTRA Brain Core",
        version: "2026.08.14",
        category: "CORE",
        description: "Hermes central reasoning, Model Router, Memory Governor, and Base Tool Registry.",
        license: "Proprietary",
        runtime: "HYBRID",
        dependencies: [],
        services: ["hermes", "model-router", "memory", "tool-registry"],
        agents: ["hermes_brain", "validator_agent"],
        tools: ["getHospitalCensus", "getPatient", "getVitals"],
        models: ["qwen-2.5-medical", "gemini-3.1-pro", "kimi-2.8t"],
        knowledgeSources: ["HospitalDB"],
        permissions: ["*"],
        routes: ["/api/brain", "/api/command"],
        uiComponents: ["CommandCentre", "SupercoreLayout"],
        healthCheckConfig: { endpoint: "/api/health", intervalMs: 30000 },
        configurationSchema: {},
        riskLevel: "INFO",
        checksum: "sha256-astra-brain-core-2026",
        status: "ACTIVE"
      },
      {
        pluginId: "plugin-langgraph-orchestrator",
        name: "LangGraph Multi-Agent Orchestrator",
        version: "2026.08.14",
        category: "ORCHESTRATION",
        description: "Stateful agent graphs, checkpointing, and human-in-the-loop safety checkpoints.",
        license: "Proprietary",
        runtime: "HYBRID",
        dependencies: ["plugin-astra-brain-core"],
        services: ["orchestrator", "workflow-engine"],
        agents: ["langgraph_orchestrator"],
        tools: [],
        models: [],
        knowledgeSources: [],
        permissions: ["admin:agent"],
        routes: ["/api/agents/invoke"],
        uiComponents: ["AgentExecutionPanel", "TracePanel"],
        healthCheckConfig: { endpoint: "/api/agents/health", intervalMs: 30000 },
        configurationSchema: {},
        riskLevel: "INFO",
        checksum: "sha256-langgraph-orchestrator-2026",
        status: "ACTIVE"
      },
      {
        pluginId: "plugin-command-engine",
        name: "Hospital Command Engine Gateway",
        version: "2026.08.14",
        category: "HOSPITAL",
        description: "Authoritative hospital state mutations, RBAC gateway, and immutable audit logs.",
        license: "Proprietary",
        runtime: "HYBRID",
        dependencies: ["plugin-astra-brain-core"],
        services: ["command-engine", "audit-logger"],
        agents: ["command_agent", "hospital_query_agent", "patient_context_agent"],
        tools: ["createLabOrder", "createRadiologyOrder", "createPrescription", "createTask"],
        models: [],
        knowledgeSources: ["HospitalDB"],
        permissions: ["order:create", "patient:write"],
        routes: ["/api/command/execute"],
        uiComponents: ["OrderCenterModal"],
        healthCheckConfig: { endpoint: "/api/command/health", intervalMs: 15000 },
        configurationSchema: {},
        riskLevel: "IMPORTANT",
        checksum: "sha256-command-engine-2026",
        status: "ACTIVE"
      },
      {
        pluginId: "plugin-medical-vision",
        name: "Medical Vision & Trauma Intelligence",
        version: "2026.08.14",
        category: "VISION",
        description: "DICOM viewing, trauma wound analysis, anatomical structure mapping, and neurovascular safety check.",
        license: "Proprietary",
        runtime: "HYBRID",
        dependencies: ["plugin-astra-brain-core"],
        services: ["vision-engine", "dicom-adapter"],
        agents: ["image_agent"],
        tools: ["analyzeImage", "compareImages", "getDICOMSeries"],
        models: ["medical-vision-vit"],
        knowledgeSources: ["AnatomyOntology"],
        permissions: ["ai:image_analysis"],
        routes: ["/api/vision/analyze"],
        uiComponents: ["MedicalImageAnnotatorModal"],
        healthCheckConfig: { endpoint: "/api/vision/health", intervalMs: 60000 },
        configurationSchema: {},
        riskLevel: "INFO",
        checksum: "sha256-medical-vision-2026",
        status: "ACTIVE"
      },
      {
        pluginId: "plugin-voicebox",
        name: "Voicebox Multilingual Speech Engine",
        version: "2026.08.14",
        category: "VOICE",
        description: "Local-first streaming STT/TTS with Dr. Arjun, Dr. Priya, and Reception Guide across 5 languages.",
        license: "MIT",
        runtime: "HYBRID",
        dependencies: ["plugin-astra-brain-core"],
        services: ["voicebox-stt", "voicebox-tts", "vad-engine"],
        agents: ["voice_agent"],
        tools: ["transcribeVoice", "speakVoice"],
        models: ["voicebox-v3"],
        knowledgeSources: [],
        permissions: ["ai:voice_command"],
        routes: ["/api/voice/stream"],
        uiComponents: ["AvatarOrb", "VoiceControls"],
        healthCheckConfig: { endpoint: "http://127.0.0.1:17493/health", intervalMs: 30000 },
        configurationSchema: {},
        riskLevel: "INFO",
        checksum: "sha256-voicebox-2026",
        status: "ACTIVE"
      },
      {
        pluginId: "plugin-smart-rag",
        name: "Smart RAG & Medical Knowledge Fabric",
        version: "2026.08.14",
        category: "KNOWLEDGE",
        description: "PubMed, PMC, ClinicalTrials.gov, hybrid dense+BM25 retrieval, and guideline conflict detector.",
        license: "Proprietary",
        runtime: "HYBRID",
        dependencies: ["plugin-astra-brain-core"],
        services: ["rag-pipeline", "pubmed-connector", "evidence-ranker"],
        agents: ["evidence_agent", "clinical_reasoning_agent"],
        tools: ["searchPubMed", "retrieveGuideline", "checkDrugInteraction"],
        models: ["bioclinicalbert-embeddings"],
        knowledgeSources: ["PubMed", "PMC", "ClinicalTrials.gov", "WHO"],
        permissions: ["ai:evidence_search"],
        routes: ["/api/knowledge/query"],
        uiComponents: ["EvidenceAiCopilot"],
        healthCheckConfig: { endpoint: "/api/knowledge/health", intervalMs: 60000 },
        configurationSchema: {},
        riskLevel: "INFO",
        checksum: "sha256-smart-rag-2026",
        status: "ACTIVE"
      }
    ];

    for (const p of defaultPlugins) {
      this.plugins.set(p.pluginId, p);
    }
  }

  public register(plugin: PluginManifest): void {
    this.plugins.set(plugin.pluginId, plugin);
  }

  public get(pluginId: string): PluginManifest | undefined {
    return this.plugins.get(pluginId);
  }

  public list(): PluginManifest[] {
    return Array.from(this.plugins.values());
  }

  public updateStatus(pluginId: string, status: PluginStatus): boolean {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.status = status;
      return true;
    }
    return false;
  }
}

export const PluginRegistry = new PluginRegistryService();
