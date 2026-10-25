// PAPERCLIP — knowledge ingestion + retrieval (RAG) stored locally in IndexedDB with in-memory fallback.
// Feed: WHO/CDC/ICD-11 notes, open-access articles, hospital SOPs, NABH protocols.
// Do NOT ingest pirated textbooks — open/licensed material only.

const DB_NAME = 'astra_paperclip';
const STORE = 'chunks';

export interface KbChunk {
  id: string;
  doc: string;
  text: string;
  embedding: number[];
  addedAt: string;
}

const inMemoryChunks: KbChunk[] = [
  {
    id: 'WHO-Dengue-Guidelines-2024.md#0',
    doc: 'WHO-Dengue-Guidelines-2024.md',
    text: 'Dengue Fluid Protocol: Judicious crystalloid resuscitation (5-7 mL/kg/hr in critical phase). Warning signs: persistent vomiting, abdominal pain, mucosal bleed, fluid accumulation. Platelet transfusion indicated therapeutically for active bleeding or prophylactically when <10,000/uL.',
    embedding: [],
    addedAt: new Date().toISOString(),
  },
  {
    id: 'ACC-AHA-STEMI-Guideline-2023.md#0',
    doc: 'ACC-AHA-STEMI-Guideline-2023.md',
    text: 'STEMI Management: Door-to-balloon time <90 mins for primary PCI. Loading dose: Aspirin 325mg non-enteric coated chewable + P2Y12 inhibitor (Ticagrelor 180mg or Prasugrel 60mg or Clopidogrel 600mg). STAT high-intensity statin (Atorvastatin 80mg). Heparin anticoagulation.',
    embedding: [],
    addedAt: new Date().toISOString(),
  },
  {
    id: 'AO-Surgery-Trauma-Reference.md#0',
    doc: 'AO-Surgery-Trauma-Reference.md',
    text: 'Intertrochanteric Femur Fractures: Cephalomedullary nailing (PFN/PFNA) preferred for unstable patterns (reverse obliquity, posteromedial comminution, lateral wall breach). Dynamic Hip Screw (DHS) with 4-hole plate suitable for stable two-part intertrochanteric fractures with intact lateral wall (>20.5mm).',
    embedding: [],
    addedAt: new Date().toISOString(),
  },
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') {
      rej(new Error('IndexedDB not supported in current environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    out.push(text.slice(i, i + size));
  }
  return out.filter(c => c.trim().length > 40);
}

// Bag-of-words hash embedding if Gemini API key is missing
function fallbackEmbed(text: string): number[] {
  const dim = 128;
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length >= 2);
  for (const w of words) {
    let h = 0;
    for (let i = 0; i < w.length; i++) {
      h = (h * 31 + w.charCodeAt(i)) % dim;
    }
    vec[h] += 1;
  }
  const mag = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map(v => v / mag);
}

async function embed(texts: string[]): Promise<number[][]> {
  const key = import.meta.env?.VITE_GEMINI_API_KEY;
  if (!key) {
    return texts.map(t => fallbackEmbed(t));
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map(t => ({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: t }] },
          })),
        }),
      }
    );
    if (!res.ok) throw new Error('Embedding failed: ' + res.status);
    const j = await res.json();
    return j.embeddings.map((e: any) => e.values as number[]);
  } catch (err) {
    console.warn('Gemini embedding failed or offline, using fallback embedding:', err);
    return texts.map(t => fallbackEmbed(t));
  }
}

const cosine = (a: number[], b: number[]) => {
  if (!a || !b || !a.length || !b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

export const paperclip = {
  async init(): Promise<void> {
    try {
      await openDb();
    } catch {
      // Memory fallback initialized
    }
  },

  async ingest(docName: string, rawText: string): Promise<number> {
    const chunks = chunkText(rawText);
    if (!chunks.length) return 0;
    const vectors = await embed(chunks);

    try {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readwrite');
      chunks.forEach((text, i) => {
        tx.objectStore(STORE).put({
          id: `${docName}#${i}`,
          doc: docName,
          text,
          embedding: vectors[i] || fallbackEmbed(text),
          addedAt: new Date().toISOString(),
        });
      });
      return new Promise(res => {
        tx.oncomplete = () => res(chunks.length);
        tx.onerror = () => res(0);
      });
    } catch {
      // In-memory fallback
      chunks.forEach((text, i) => {
        inMemoryChunks.push({
          id: `${docName}#${i}`,
          doc: docName,
          text,
          embedding: vectors[i] || fallbackEmbed(text),
          addedAt: new Date().toISOString(),
        });
      });
      return chunks.length;
    }
  },

  async search(query: string, k = 5): Promise<{ doc: string; text: string; score: number }[]> {
    let all: KbChunk[] = [];
    try {
      const db = await openDb();
      all = await new Promise(res => {
        const out: KbChunk[] = [];
        const cur = db.transaction(STORE).objectStore(STORE).openCursor();
        cur.onsuccess = () => {
          if (cur.result) {
            out.push(cur.result.value);
            cur.result.continue();
          } else res(out);
        };
        cur.onerror = () => res([]);
      });
    } catch {
      all = inMemoryChunks;
    }

    if (!all.length) {
      all = inMemoryChunks;
    }

    const [q] = await embed([query]);
    return all
      .map(c => {
        const emb = c.embedding?.length ? c.embedding : fallbackEmbed(c.text);
        return { doc: c.doc, text: c.text, score: cosine(q, emb) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  },

  async listDocs(): Promise<string[]> {
    try {
      const db = await openDb();
      const all: KbChunk[] = await new Promise(res => {
        const out: KbChunk[] = [];
        const cur = db.transaction(STORE).objectStore(STORE).openCursor();
        cur.onsuccess = () => {
          if (cur.result) {
            out.push(cur.result.value);
            cur.result.continue();
          } else res(out);
        };
        cur.onerror = () => res([]);
      });
      const docs = [...new Set(all.map(c => c.doc))];
      if (!docs.length) {
        return ['WHO-Dengue-Guidelines-2024.md', 'ACC-AHA-STEMI-Guideline-2023.md', 'AO-Surgery-Trauma-Reference.md'];
      }
      return docs;
    } catch {
      return [...new Set(inMemoryChunks.map(c => c.doc))];
    }
  },
};
