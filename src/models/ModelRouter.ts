// ============================================================================
// ASTRA AI — Model Router
// ONE Model Router. Latency/complexity-based routing between database,
// local models, medical models, and frontier adapters.
// ============================================================================

// ─── Model Types ────────────────────────────────────────────────────────────
export enum ModelCategory {
  FAST = 'FAST',           // Low-latency, simple tasks (< 500ms)
  REASONING = 'REASONING', // Complex clinical reasoning
  MEDICAL = 'MEDICAL',     // Specialized medical models
  VISION = 'VISION',       // Image analysis (X-ray, CT, MRI)
  STT = 'STT',             // Speech-to-text
  TTS = 'TTS',             // Text-to-speech
  EMBEDDING = 'EMBEDDING', // Vector embeddings for RAG
  CODING = 'CODING',       // Code generation / analysis
}

export enum ModelProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  CUSTOM = 'CUSTOM',
}

export interface ModelEndpoint {
  id: string;
  name: string;
  category: ModelCategory;
  provider: ModelProvider;
  modelId: string;
  baseUrl?: string;
  apiKey?: string;
  maxTokens: number;
  contextWindow: number;
  costPer1kTokens: number;
  avgLatencyMs: number;
  capabilities: string[];
  isAvailable: boolean;
  isPrimary: boolean;
  fallbackModelId?: string;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  healthCheck?: {
    lastCheck: Date;
    status: 'healthy' | 'degraded' | 'down';
    successRate: number;
  };
}

export interface RoutingDecision {
  selectedModel: ModelEndpoint;
  reason: string;
  fallbackModel?: ModelEndpoint;
  estimatedLatencyMs: number;
  estimatedCost: number;
  routingDurationMs: number;
}

export interface ModelRequest {
  query: string;
  category?: ModelCategory;
  maxLatencyMs?: number;
  preferLocal?: boolean;
  requireCapabilities?: string[];
  tokenBudget?: number;
  priority: 'low' | 'normal' | 'high' | 'emergency';
}

// ─── Complexity Classifier ──────────────────────────────────────────────────
class ComplexityClassifier {
  private highComplexityPatterns = [
    /differential diagnosis/i,
    /pathophysiology/i,
    /multi-?system/i,
    /treatment plan/i,
    /drug interaction/i,
    /clinical reasoning/i,
    /imaging interpretation/i,
    /surgical planning/i,
    /ventilator management/i,
    /explain.*mechanism/i,
    /why.*(?:elevated|decreased|abnormal)/i,
    /what.*(?:cause|etiology)/i,
  ];

  private lowComplexityPatterns = [
    /^show\s/i,
    /^list\s/i,
    /^how\s+many/i,
    /^count\s/i,
    /^open\s/i,
    /^display\s/i,
    /patient\s+(?:list|census|count)/i,
    /pending\s+(?:lab|radiology|pharmacy)/i,
    /who\s+are\s+you/i,
    /what\s+is\s+your\s+name/i,
  ];

  classify(query: string): 'database' | 'fast' | 'reasoning' | 'medical' {
    const q = query.trim();

    // Database-only (no LLM needed)
    for (const pattern of this.lowComplexityPatterns) {
      if (pattern.test(q)) return 'database';
    }

    // High complexity — needs reasoning/medical model
    for (const pattern of this.highComplexityPatterns) {
      if (pattern.test(q)) return q.length > 100 ? 'medical' : 'reasoning';
    }

    // Medium complexity — fast model sufficient
    if (q.split(/\s+/).length < 15) return 'fast';
    return 'reasoning';
  }
}

// ─── Health Monitor ─────────────────────────────────────────────────────────
class ModelHealthMonitor {
  private latencyHistory: Map<string, number[]> = new Map();
  private failureCount: Map<string, number> = new Map();

  recordLatency(modelId: string, latencyMs: number): void {
    const history = this.latencyHistory.get(modelId) || [];
    history.push(latencyMs);
    // Keep only last 100 measurements
    if (history.length > 100) history.shift();
    this.latencyHistory.set(modelId, history);
  }

  recordFailure(modelId: string): void {
    this.failureCount.set(modelId, (this.failureCount.get(modelId) || 0) + 1);
  }

  recordSuccess(modelId: string): void {
    this.failureCount.set(modelId, 0);
  }

  getAvgLatency(modelId: string): number {
    const history = this.latencyHistory.get(modelId);
    if (!history || history.length === 0) return 0;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }

  getSuccessRate(modelId: string): number {
    const failures = this.failureCount.get(modelId) || 0;
    if (failures === 0) return 1.0;
    return Math.max(0, 1 - failures * 0.1);
  }

  isHealthy(modelId: string): boolean {
    return this.getSuccessRate(modelId) > 0.5;
  }
}

// ─── Model Router ───────────────────────────────────────────────────────────
export class ModelRouter {
  private models: Map<string, ModelEndpoint> = new Map();
  private complexityClassifier = new ComplexityClassifier();
  private healthMonitor = new ModelHealthMonitor();

  // ── Registration ────────────────────────────────────────────────────────
  registerModel(model: ModelEndpoint): void {
    this.models.set(model.id, model);
    console.log(`[ModelRouter] Registered: ${model.name} (${model.category}, ${model.provider})`);
  }

  getModel(id: string): ModelEndpoint | undefined {
    return this.models.get(id);
  }

  listModels(category?: ModelCategory): ModelEndpoint[] {
    const all = Array.from(this.models.values());
    if (category) return all.filter(m => m.category === category);
    return all;
  }

  // ── Routing Logic ───────────────────────────────────────────────────────
  route(request: ModelRequest): RoutingDecision {
    const startTime = Date.now();

    // Step 1: Determine required category
    const complexity = this.complexityClassifier.classify(request.query);
    let targetCategory = request.category;

    if (!targetCategory) {
      switch (complexity) {
        case 'database': targetCategory = ModelCategory.FAST; break;
        case 'fast': targetCategory = ModelCategory.FAST; break;
        case 'reasoning': targetCategory = ModelCategory.REASONING; break;
        case 'medical': targetCategory = ModelCategory.MEDICAL; break;
      }
    }

    // Step 2: Get candidates for this category
    let candidates = this.listModels(targetCategory).filter(m => m.isAvailable);

    // Step 3: Filter by capabilities
    if (request.requireCapabilities) {
      candidates = candidates.filter(m =>
        request.requireCapabilities!.every(cap => m.capabilities.includes(cap))
      );
    }

    // Step 4: Filter by latency constraint
    if (request.maxLatencyMs) {
      candidates = candidates.filter(m => m.avgLatencyMs <= request.maxLatencyMs!);
    }

    // Step 5: Prefer local models if requested
    if (request.preferLocal) {
      const localModels = candidates.filter(m => m.provider === ModelProvider.LOCAL);
      if (localModels.length > 0) candidates = localModels;
    }

    // Step 6: Filter by health
    candidates = candidates.filter(m => this.healthMonitor.isHealthy(m.id));

    // Step 7: Score and select best
    if (candidates.length === 0) {
      // Fallback: try any available model
      candidates = Array.from(this.models.values()).filter(m => m.isAvailable);
    }

    const scored = candidates.map(m => ({
      model: m,
      score: this.scoreModel(m, request),
    })).sort((a, b) => b.score - a.score);

    const selected = scored[0]?.model || this.getDefaultModel();
    const fallback = scored[1]?.model;

    const estimatedTokens = Math.ceil(request.query.length / 4) * 2; // rough estimate

    return {
      selectedModel: selected,
      reason: `Routed to ${selected.name} (${complexity} complexity, ${targetCategory} category)`,
      fallbackModel: fallback,
      estimatedLatencyMs: selected.avgLatencyMs,
      estimatedCost: (estimatedTokens / 1000) * selected.costPer1kTokens,
      routingDurationMs: Date.now() - startTime,
    };
  }

  private scoreModel(model: ModelEndpoint, request: ModelRequest): number {
    let score = 0;

    // Primary model bonus
    if (model.isPrimary) score += 20;

    // Latency score (lower is better)
    score += Math.max(0, 100 - model.avgLatencyMs / 10);

    // Cost score (lower is better)
    score += Math.max(0, 50 - model.costPer1kTokens * 100);

    // Health score
    score += this.healthMonitor.getSuccessRate(model.id) * 30;

    // Emergency priority — prefer fastest available
    if (request.priority === 'emergency') {
      score += Math.max(0, 200 - model.avgLatencyMs / 5);
    }

    // Token budget compliance
    if (request.tokenBudget && model.maxTokens < request.tokenBudget) {
      score -= 50;
    }

    return score;
  }

  private getDefaultModel(): ModelEndpoint {
    return {
      id: 'default-fast',
      name: 'Default Fast Model',
      category: ModelCategory.FAST,
      provider: ModelProvider.LOCAL,
      modelId: 'local-fast-v1',
      maxTokens: 4096,
      contextWindow: 8192,
      costPer1kTokens: 0,
      avgLatencyMs: 100,
      capabilities: ['text-generation', 'classification'],
      isAvailable: true,
      isPrimary: true,
    };
  }

  // ── Register Defaults ─────────────────────────────────────────────────
  registerDefaultModels(): void {
    const defaults: ModelEndpoint[] = [
      {
        id: 'gemini-flash',
        name: 'Gemini 2.5 Flash',
        category: ModelCategory.FAST,
        provider: ModelProvider.GOOGLE,
        modelId: 'gemini-2.5-flash',
        maxTokens: 8192,
        contextWindow: 1048576,
        costPer1kTokens: 0.075,
        avgLatencyMs: 300,
        capabilities: ['text-generation', 'classification', 'summarization', 'medical-qa'],
        isAvailable: true,
        isPrimary: true,
      },
      {
        id: 'gemini-pro',
        name: 'Gemini 2.5 Pro',
        category: ModelCategory.REASONING,
        provider: ModelProvider.GOOGLE,
        modelId: 'gemini-2.5-pro',
        maxTokens: 65536,
        contextWindow: 1048576,
        costPer1kTokens: 1.25,
        avgLatencyMs: 2000,
        capabilities: ['text-generation', 'clinical-reasoning', 'differential-diagnosis', 'treatment-planning', 'deep-analysis'],
        isAvailable: true,
        isPrimary: true,
      },
      {
        id: 'med-gemini',
        name: 'Med-Gemini',
        category: ModelCategory.MEDICAL,
        provider: ModelProvider.GOOGLE,
        modelId: 'med-gemini-2.0',
        maxTokens: 32768,
        contextWindow: 524288,
        costPer1kTokens: 2.50,
        avgLatencyMs: 3000,
        capabilities: ['clinical-reasoning', 'medical-qa', 'drug-interaction', 'pathophysiology', 'evidence-synthesis'],
        isAvailable: true,
        isPrimary: true,
      },
      {
        id: 'gemini-vision',
        name: 'Gemini Vision',
        category: ModelCategory.VISION,
        provider: ModelProvider.GOOGLE,
        modelId: 'gemini-2.5-flash',
        maxTokens: 8192,
        contextWindow: 1048576,
        costPer1kTokens: 0.10,
        avgLatencyMs: 1500,
        capabilities: ['image-analysis', 'xray-reading', 'ct-interpretation', 'mri-analysis', 'ecg-reading'],
        isAvailable: true,
        isPrimary: true,
      },
      {
        id: 'chirp-stt',
        name: 'Google Chirp STT',
        category: ModelCategory.STT,
        provider: ModelProvider.GOOGLE,
        modelId: 'chirp-2',
        maxTokens: 0,
        contextWindow: 0,
        costPer1kTokens: 0.016,
        avgLatencyMs: 200,
        capabilities: ['speech-to-text', 'multilingual', 'medical-terminology', 'indian-english', 'telugu', 'hindi', 'tamil', 'kannada'],
        isAvailable: true,
        isPrimary: true,
      },
      {
        id: 'google-tts',
        name: 'Google WaveNet TTS',
        category: ModelCategory.TTS,
        provider: ModelProvider.GOOGLE,
        modelId: 'wavenet-v2',
        maxTokens: 0,
        contextWindow: 0,
        costPer1kTokens: 0.016,
        avgLatencyMs: 300,
        capabilities: ['text-to-speech', 'multilingual', 'natural-voice', 'indian-english', 'telugu', 'hindi'],
        isAvailable: true,
        isPrimary: true,
      },
      {
        id: 'text-embedding',
        name: 'Text Embedding Model',
        category: ModelCategory.EMBEDDING,
        provider: ModelProvider.GOOGLE,
        modelId: 'text-embedding-005',
        maxTokens: 0,
        contextWindow: 2048,
        costPer1kTokens: 0.00004,
        avgLatencyMs: 100,
        capabilities: ['embedding', 'semantic-search', 'medical-embedding'],
        isAvailable: true,
        isPrimary: true,
      },
    ];

    for (const model of defaults) {
      this.registerModel(model);
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  getStats() {
    const all = Array.from(this.models.values());
    return {
      totalModels: all.length,
      availableModels: all.filter(m => m.isAvailable).length,
      byCategory: Object.values(ModelCategory).map(cat => ({
        category: cat,
        count: all.filter(m => m.category === cat).length,
      })),
      byProvider: Object.values(ModelProvider).map(prov => ({
        provider: prov,
        count: all.filter(m => m.provider === prov).length,
      })),
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
let routerInstance: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!routerInstance) {
    routerInstance = new ModelRouter();
    routerInstance.registerDefaultModels();
  }
  return routerInstance;
}
