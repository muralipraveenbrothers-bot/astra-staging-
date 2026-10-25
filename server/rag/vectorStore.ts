/**
 * ASTRA AI — Lightweight Vector Store (RAG backbone)
 * ============================================================================
 * Local, dependency-light semantic store for Agentic RAG. Uses cosine
 * similarity over TF-IDF-style term vectors so it works without heavy
 * native dependencies. For production scale this swaps to ChromaDB/Pinecone
 * behind the same interface.
 *
 * Per your rule: implement what is missing, keep it modular, no fake data.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface RagDocument {
  id: string;
  text: string;
  source: string;
  category: string;        // e.g. "medical-knowledge", "hospital-policy", "guideline"
  specialty?: string;
  evidenceLevel?: "A" | "B" | "C" | "D" | "F" | "unrated";
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface RagChunk extends RagDocument {
  chunkIndex: number;
  embedding: number[];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
}

function buildVocab(chunks: RagChunk[]): Map<string, number> {
  const vocab = new Map<string, number>();
  for (const c of chunks) {
    for (const tok of tokenize(c.text)) {
      if (!vocab.has(tok)) vocab.set(tok, vocab.size);
    }
  }
  return vocab;
}

function vectorize(text: string, vocab: Map<string, number>): number[] {
  const vec = new Array(vocab.size).fill(0);
  for (const tok of tokenize(text)) {
    const idx = vocab.get(tok);
    if (idx !== undefined) vec[idx] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

export const RAG_INDEX_PATH = process.env.ASTRA_RAG_INDEX_PATH || path.join(process.cwd(), "data", "rag-index.json");
/** Minimum cosine similarity for evidence retrieval; configurable for calibration, default 0.25. */
export const DEFAULT_MIN_SIMILARITY = 0.25;
export function minSimilarity(): number {
  const parsed = Number(process.env.ASTRA_RAG_MIN_SIMILARITY);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_MIN_SIMILARITY;
}

class VectorStore {
  private chunks: RagChunk[] = [];
  private vocab: Map<string, number> = new Map();
  private docCount = 0;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(RAG_INDEX_PATH)) {
        const data = JSON.parse(fs.readFileSync(RAG_INDEX_PATH, "utf-8")) as { chunks: RagChunk[]; vocab: [string, number][] };
        this.chunks = data.chunks ?? [];
        this.vocab = new Map(data.vocab ?? []);
        this.docCount = new Set(this.chunks.map((c) => c.id)).size;
      }
    } catch { /* start empty */ }
  }

  private persist(): void {
    try {
      const dir = path.dirname(RAG_INDEX_PATH);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        RAG_INDEX_PATH,
        JSON.stringify({ chunks: this.chunks, vocab: Array.from(this.vocab.entries()) }, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.error("[rag-store] persist failed:", err instanceof Error ? err.message : err);
    }
  }

  /** Rebuild embeddings from scratch (call after add/remove). */
  private rebuild(): void {
    this.vocab = buildVocab(this.chunks);
    for (const c of this.chunks) c.embedding = vectorize(c.text, this.vocab);
    this.docCount = new Set(this.chunks.map((c) => c.id)).size;
  }

  public add(doc: RagDocument, chunkSize = 500): void {
    const text = doc.text.trim();
    if (!text) return;
    // Remove prior chunks for this doc
    this.chunks = this.chunks.filter((c) => c.id !== doc.id);
    // Chunk by character window
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunkText = text.slice(i, i + chunkSize);
      this.chunks.push({
        ...doc,
        chunkIndex: Math.floor(i / chunkSize),
        text: chunkText,
        id: doc.id,
        embedding: [],
      });
    }
    this.rebuild();
    this.persist();
  }

  public remove(docId: string): void {
    this.chunks = this.chunks.filter((c) => c.id !== docId);
    this.rebuild();
    this.persist();
  }

  public search(query: string, topK = 5, categoryFilter?: string): RagChunk[] {
    if (this.chunks.length === 0 || this.vocab.size === 0) return [];
    const qVec = vectorize(query, this.vocab);
    const scored = this.chunks
      .filter((c) => !categoryFilter || c.category === categoryFilter)
      .map((c) => ({ c, s: cosine(qVec, c.embedding) }))
      .filter(({ s }) => s >= minSimilarity())
      .sort((a, b) => b.s - a.s);
    const topScore = scored[0]?.s ?? 0;
    const margin = topScore * 0.9;
    const selected = scored.filter(({ s }) => s >= margin).slice(0, topK);
    return selected.map((x) => x.c);
  }

  public get size(): number { return this.docCount; }
  public get chunkCount(): number { return this.chunks.length; }
  public categories(): string[] { return [...new Set(this.chunks.map((c) => c.category))]; }
}

export const vectorStore = new VectorStore();
