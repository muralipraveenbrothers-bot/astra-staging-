/**
 * Astra AI — Dynamic Model Router & Provider Matrix
 * ====================================================
 * Analyzes request complexity and routes to the optimal tier:
 *   1. LOCAL FAST (Ollama local quantized models)
 *   2. MEDICAL SPECIALIST (MedGemma / RAG-augmented specialist reasoning)
 *   3. FRONTIER CLOUD (Kimi K3 104B active/2.8T total, Gemini, Claude, GPT)
 *   4. DETERMINISTIC TOOLS (0ms LLM latency for calculations and SQL mutations)
 */

export interface ModelProfile {
  id: string;
  name: string;
  provider: "ollama" | "kimi" | "anthropic" | "google" | "openai" | "deterministic";
  tier: "LOCAL_FAST" | "MEDICAL_SPECIALIST" | "FRONTIER_REASONING" | "DETERMINISTIC";
  totalParams?: string;
  activeParams?: string;
  architecture?: string;
  status: "CONNECTED" | "CONFIG_REQUIRED" | "OFFLINE";
  contextWindow: number;
  capabilities: ("text" | "reasoning" | "vision" | "embeddings" | "tools")[];
}

export class ModelRouter {
  private registry: Map<string, ModelProfile> = new Map();

  constructor() {
    this.initDefaultRegistry();
  }

  private initDefaultRegistry(): void {
    // 1. Local Ollama Models
    this.registry.set("bge-m3", {
      id: "bge-m3",
      name: "BAAI BGE-M3 Dense Medical Embedder",
      provider: "ollama",
      tier: "LOCAL_FAST",
      totalParams: "567M",
      activeParams: "567M",
      architecture: "Dense Transformer (1024-dim)",
      status: "CONNECTED",
      contextWindow: 8192,
      capabilities: ["embeddings"],
    });

    this.registry.set("llama3.2:3b", {
      id: "llama3.2:3b",
      name: "Meta Llama 3.2 3B Instruct",
      provider: "ollama",
      tier: "LOCAL_FAST",
      totalParams: "3.2B",
      activeParams: "3.2B",
      architecture: "Dense Llama",
      status: "CONNECTED",
      contextWindow: 128000,
      capabilities: ["text", "tools"],
    });

    // 2. Frontier Providers
    this.registry.set("kimi-k3", {
      id: "kimi-k3",
      name: "Moonshot Kimi K3 Reasoning MoE",
      provider: "kimi",
      tier: "FRONTIER_REASONING",
      totalParams: "2.8T",
      activeParams: "104B",
      architecture: "Sparse Mixture-of-Experts (MoE)",
      status: process.env.MOONSHOT_API_KEY ? "CONNECTED" : "CONFIG_REQUIRED",
      contextWindow: 200000,
      capabilities: ["text", "reasoning", "vision", "tools"],
    });

    this.registry.set("gemini-2.0-flash", {
      id: "gemini-2.0-flash",
      name: "Google Gemini 2.0 Flash / 3.7",
      provider: "google",
      tier: "FRONTIER_REASONING",
      totalParams: "Frontier",
      activeParams: "Frontier",
      architecture: "Multimodal Frontier",
      status: process.env.GEMINI_API_KEY ? "CONNECTED" : "CONFIG_REQUIRED",
      contextWindow: 1000000,
      capabilities: ["text", "reasoning", "vision", "tools"],
    });

    this.registry.set("claude-3-7-sonnet", {
      id: "claude-3-7-sonnet",
      name: "Anthropic Claude 3.7 Sonnet (Thinking)",
      provider: "anthropic",
      tier: "FRONTIER_REASONING",
      totalParams: "Frontier",
      activeParams: "Frontier",
      architecture: "Extended Thinking Hybrid",
      status: process.env.ANTHROPIC_API_KEY ? "CONNECTED" : "CONFIG_REQUIRED",
      contextWindow: 200000,
      capabilities: ["text", "reasoning", "vision", "tools"],
    });
  }

  public getRegistry(): ModelProfile[] {
    return Array.from(this.registry.values());
  }

  /**
   * Route query based on intent & required capabilities
   */
  public route(query: string, category: string): ModelProfile {
    // 1. Embeddings always route to local bge-m3
    if (category === "embeddings") {
      return this.registry.get("bge-m3")!;
    }

    // 2. Operations & deterministic regex commands
    if (category === "census" || category === "tasks" || category === "cpoe") {
      return this.registry.get("llama3.2:3b")!;
    }

    // 3. Deep clinical reasoning & differential
    if (/differential|pathophysiology|rare disease|pharmacokinetics|guideline/i.test(query)) {
      const kimi = this.registry.get("kimi-k3");
      if (kimi && kimi.status === "CONNECTED") return kimi;
      const gemini = this.registry.get("gemini-2.0-flash");
      if (gemini && gemini.status === "CONNECTED") return gemini;
    }

    // Default to Local Fast
    return this.registry.get("llama3.2:3b")!;
  }
}

export const modelRouter = new ModelRouter();
