import { Pinecone } from '@pinecone-database/pinecone';

export interface VectorKnowledgeMatch {
  id: string;
  domain: 'fitness' | 'nutrition';
  source: string;
  text: string;
  score: number;
}

export interface VectorSearchOptions {
  domains?: Array<'fitness' | 'nutrition'>;
  topK?: number;
}

export interface VectorKnowledgeUpsertInput {
  id: string;
  domain: 'fitness' | 'nutrition';
  source: string;
  text: string;
}

export class VectorService {
  private static pinecone: Pinecone | null = null;
  private static initialized = false;
  private static indexName = String(process.env.PINECONE_INDEX_NAME || 'zym-knowledge').trim();
  private static allowedSourceRegex: RegExp | null = this.parseAllowedSourceRegex();

  private static parseAllowedSourceRegex(): RegExp | null {
    const raw = String(process.env.KB_ALLOWED_SOURCE_REGEX || '').trim();
    if (!raw) return null;
    try {
      return new RegExp(raw, 'i');
    } catch {
      return null;
    }
  }

  static async init() {
    if (this.initialized) return;
    this.initialized = true;
    if (!process.env.PINECONE_API_KEY) return;
    this.pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }

  private static fallbackDomainsForQuery(query: string): Array<'fitness' | 'nutrition'> {
    const text = String(query || '').toLowerCase();
    const nutritionHits = [
      'calorie', 'kcal', 'macro', 'protein', 'carb', 'fat', 'meal', 'diet', 'nutrition', 'food',
    ].some((token) => text.includes(token));
    const fitnessHits = [
      'squat', 'bench', 'deadlift', 'cardio', 'run', 'rep', 'set', 'training', 'workout', 'form',
    ].some((token) => text.includes(token));

    if (nutritionHits && fitnessHits) return ['fitness', 'nutrition'];
    if (nutritionHits) return ['nutrition'];
    if (fitnessHits) return ['fitness'];
    return ['fitness', 'nutrition'];
  }

  static async searchKnowledge(
    query: string,
    options: VectorSearchOptions = {},
  ): Promise<VectorKnowledgeMatch[]> {
    await this.init();
    const normalized = String(query || '').trim();
    if (!normalized || !this.pinecone || !process.env.OPENROUTER_API_KEY) {
      return [];
    }

    const domains = options.domains?.length ? options.domains : this.fallbackDomainsForQuery(normalized);
    const topK = Math.min(8, Math.max(1, Math.floor(Number(options.topK || 4))));
    const embedding = await this.getEmbedding(normalized);
    if (embedding.length === 0) return [];

    const index = this.pinecone.index(this.indexName);
    const merged = new Map<string, VectorKnowledgeMatch>();

    for (const domain of domains) {
      const results = await index.query({
        vector: embedding,
        filter: { domain },
        topK,
        includeMetadata: true,
      });

      for (const match of results.matches || []) {
        const text = String(match.metadata?.text || '').replace(/\s+/g, ' ').trim().slice(0, 4_000);
        if (!text) continue;
        const source = String(match.metadata?.source || match.metadata?.title || `${domain}-kb`).trim().slice(0, 180);
        if (this.allowedSourceRegex && !this.allowedSourceRegex.test(source)) {
          continue;
        }
        const score = Number(match.score || 0);
        const id = String(match.id || `${domain}:${source}:${Math.round(score * 1000)}`);
        const key = `${source}:${text.slice(0, 120)}`;
        const existing = merged.get(key);
        if (existing && existing.score >= score) continue;
        merged.set(key, {
          id,
          domain,
          source,
          text,
          score,
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  static async searchKnowledgeByDomain(query: string, domain: 'fitness' | 'nutrition'): Promise<string[]> {
    const hits = await this.searchKnowledge(query, { domains: [domain], topK: 3 });
    return hits.map((item) => item.text);
  }

  static async upsertKnowledgeDocuments(docs: VectorKnowledgeUpsertInput[]): Promise<{ upserted: number; skipped: number }> {
    await this.init();
    if (!Array.isArray(docs) || docs.length === 0) {
      return { upserted: 0, skipped: 0 };
    }
    if (!this.pinecone || !process.env.OPENROUTER_API_KEY) {
      return { upserted: 0, skipped: docs.length };
    }

    const index = this.pinecone.index(this.indexName);
    let upserted = 0;
    let skipped = 0;

    const vectors: any[] = [];
    for (const doc of docs.slice(0, 240)) {
      const text = String(doc.text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
      const source = String(doc.source || '').trim().slice(0, 180);
      const id = String(doc.id || '').trim().slice(0, 180);
      const domain = doc.domain === 'nutrition' ? 'nutrition' : 'fitness';
      if (!id || !text || !source) {
        skipped += 1;
        continue;
      }
      const embedding = await this.getEmbedding(text);
      if (!Array.isArray(embedding) || embedding.length === 0) {
        skipped += 1;
        continue;
      }
      vectors.push({
        id,
        values: embedding,
        metadata: {
          domain,
          source,
          text,
        },
      });
    }

    if (vectors.length === 0) {
      return { upserted: 0, skipped };
    }

    try {
      await (index as any).upsert(vectors);
      upserted = vectors.length;
    } catch {
      skipped += vectors.length;
      upserted = 0;
    }

    return { upserted, skipped };
  }

  static async getEmbedding(text: string): Promise<number[]> {
    const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) return [];

    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GAUZ_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json().catch(() => ({} as any));
    const embedding = data?.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding.map((value: unknown) => Number(value) || 0) : [];
  }
}

// Backward compatibility for older call sites.
export async function searchKnowledge(query: string, domain: 'fitness' | 'nutrition'): Promise<string[]> {
  return VectorService.searchKnowledgeByDomain(query, domain);
}
