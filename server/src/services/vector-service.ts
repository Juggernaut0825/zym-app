import { DiscoverInstancesCommand, ServiceDiscoveryClient } from '@aws-sdk/client-servicediscovery';
import { ChromaClient, type Collection } from 'chromadb';
import { OpenRouterUsageService } from './openrouter-usage-service.js';

export interface VectorKnowledgeMatch {
  id: string;
  domain: 'fitness' | 'nutrition';
  source: string;
  text: string;
  score: number;
  title?: string;
  referenceUrl?: string;
  pdfUrl?: string;
  authors?: string;
  year?: string;
  category?: string;
  corpus?: string;
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
  embedding?: number[];
  title?: string;
  referenceUrl?: string;
  pdfUrl?: string;
  authors?: string;
  year?: string;
  category?: string;
  corpus?: string;
}

export interface VectorKnowledgeRecord {
  id: string;
  domain: 'fitness' | 'nutrition';
  source: string;
  text?: string;
  title?: string;
  referenceUrl?: string;
  pdfUrl?: string;
  authors?: string;
  year?: string;
  category?: string;
  corpus?: string;
}

function parseAllowedSourceRegex(): RegExp | null {
  const raw = String(process.env.KB_ALLOWED_SOURCE_REGEX || '').trim();
  if (!raw) return null;
  try {
    return new RegExp(raw, 'i');
  } catch {
    return null;
  }
}

function parseChromaUrl(raw: string): { host: string; port: number; ssl: boolean } | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
      ssl: parsed.protocol === 'https:',
    };
  } catch {
    return null;
  }
}

function isLiteralIpAddress(host: string): boolean {
  const value = String(host || '').trim();
  if (!value) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true;
  return value.includes(':');
}

function shouldDiscoverChromaHost(host: string): boolean {
  const value = String(host || '').trim().toLowerCase();
  if (!value || value === 'localhost' || isLiteralIpAddress(value)) return false;
  return !value.includes('.');
}

export class VectorService {
  private static client: ChromaClient | null = null;
  private static collection: Collection | null = null;
  private static initialized = false;
  private static serviceDiscoveryClient: ServiceDiscoveryClient | null = null;
  private static resolvedEndpointCache:
    | { host: string; port: number; ssl: boolean; expiresAt: number }
    | null = null;
  private static collectionName = String(process.env.CHROMA_COLLECTION_NAME || 'zym-knowledge').trim();
  private static chromaUrl = String(process.env.CHROMA_URL || 'http://127.0.0.1:8000').trim();
  private static allowedSourceRegex: RegExp | null = parseAllowedSourceRegex();

  private static resetClient() {
    this.client = null;
    this.collection = null;
    this.initialized = false;
  }

  private static getServiceDiscoveryClient(): ServiceDiscoveryClient {
    if (!this.serviceDiscoveryClient) {
      this.serviceDiscoveryClient = new ServiceDiscoveryClient({});
    }
    return this.serviceDiscoveryClient;
  }

  private static async resolveChromaEndpoint(parsed: { host: string; port: number; ssl: boolean }) {
    if (!shouldDiscoverChromaHost(parsed.host)) {
      return parsed;
    }

    const cached = this.resolvedEndpointCache;
    if (cached && cached.expiresAt > Date.now()) {
      return { host: cached.host, port: cached.port, ssl: cached.ssl };
    }

    const namespace = String(process.env.CHROMA_DISCOVERY_NAMESPACE || process.env.CLOUDMAP_NAMESPACE || 'zym-internal').trim();
    if (!namespace) {
      return parsed;
    }

    try {
      const response = await this.getServiceDiscoveryClient().send(new DiscoverInstancesCommand({
        NamespaceName: namespace,
        ServiceName: parsed.host,
      }));
      const instances = Array.isArray(response.Instances) ? response.Instances : [];
      const match = instances.find((instance) => {
        const attributes = instance.Attributes || {};
        return Boolean(String(attributes.AWS_INSTANCE_IPV4 || '').trim());
      });
      const attributes = match?.Attributes || {};
      const host = String(attributes.AWS_INSTANCE_IPV4 || '').trim();
      const port = Number(attributes.AWS_INSTANCE_PORT || parsed.port);
      if (!host || !Number.isFinite(port) || port <= 0) {
        return parsed;
      }

      const ttlMs = Math.max(15_000, Math.min(300_000, Number(process.env.CHROMA_DISCOVERY_CACHE_MS || 60_000)));
      this.resolvedEndpointCache = {
        host,
        port,
        ssl: parsed.ssl,
        expiresAt: Date.now() + ttlMs,
      };
      return { host, port, ssl: parsed.ssl };
    } catch {
      return parsed;
    }
  }

  static async init(force = false) {
    if (this.initialized && !force) return;
    if (force) {
      this.client = null;
      this.collection = null;
    }
    this.initialized = true;

    const parsed = parseChromaUrl(this.chromaUrl);
    if (!parsed) return;
    const resolved = await this.resolveChromaEndpoint(parsed);

    const headers: Record<string, string> = {};
    const authToken = String(process.env.CHROMA_AUTH_TOKEN || '').trim();
    if (authToken) {
      headers['x-chroma-token'] = authToken;
    }

    this.client = new ChromaClient({
      host: resolved.host,
      port: resolved.port,
      ssl: resolved.ssl,
      tenant: String(process.env.CHROMA_TENANT || '').trim() || undefined,
      database: String(process.env.CHROMA_DATABASE || '').trim() || undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }

  private static async getCollection(retried = false): Promise<Collection | null> {
    await this.init();
    if (!this.client) return null;
    if (this.collection) return this.collection;

    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { 'hnsw:space': 'cosine' },
        embeddingFunction: null,
      });
      return this.collection;
    } catch {
      if (!retried) {
        this.resetClient();
        await this.init(true);
        return this.getCollection(true);
      }
      return null;
    }
  }

  private static normalizeScore(distance: number): number {
    const numeric = Number(distance);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric <= 1) return Math.max(0, 1 - numeric);
    return 1 / (1 + numeric);
  }

  static async searchKnowledge(
    query: string,
    options: VectorSearchOptions = {},
  ): Promise<VectorKnowledgeMatch[]> {
    const normalized = String(query || '').trim();
    if (!normalized || !process.env.OPENROUTER_API_KEY) {
      return [];
    }

    const collection = await this.getCollection();
    if (!collection) {
      return [];
    }

    const topK = Math.min(8, Math.max(1, Math.floor(Number(options.topK || 4))));
    const embedding = await this.getEmbedding(normalized);
    if (embedding.length === 0) return [];

    const merged = new Map<string, VectorKnowledgeMatch>();

    const domainFilters = Array.isArray(options.domains) && options.domains.length > 0
      ? options.domains
      : [null];

    for (const domain of domainFilters) {
      try {
        const result = await collection.query({
          queryEmbeddings: [embedding],
          nResults: topK,
          where: domain ? { domain } : undefined,
          include: ['metadatas', 'documents', 'distances'],
        });

        const ids = Array.isArray(result.ids?.[0]) ? result.ids[0] : [];
        const documents = Array.isArray(result.documents?.[0]) ? result.documents[0] : [];
        const metadatas = Array.isArray(result.metadatas?.[0]) ? result.metadatas[0] : [];
        const distances = Array.isArray(result.distances?.[0]) ? result.distances[0] : [];

        for (let index = 0; index < ids.length; index += 1) {
          const metadata = metadatas[index] as Record<string, unknown> | null | undefined;
          const text = String(documents[index] || metadata?.text || '').replace(/\s+/g, ' ').trim().slice(0, 4_000);
          if (!text) continue;
          const matchDomain = metadata?.domain === 'nutrition' ? 'nutrition' : 'fitness';
          const source = String(metadata?.source || metadata?.title || `${matchDomain}-kb`).trim().slice(0, 180);
          if (this.allowedSourceRegex && !this.allowedSourceRegex.test(source)) {
            continue;
          }
          const score = this.normalizeScore(Number(distances[index] || 0));
          const id = String(ids[index] || `${matchDomain}:${source}:${index + 1}`);
          const dedupeAnchor = String(metadata?.title || source).trim().slice(0, 300) || source;
          const key = `${matchDomain}:${dedupeAnchor}`;
          const existing = merged.get(key);
          if (existing && existing.score >= score) continue;
          merged.set(key, {
            id,
            domain: matchDomain,
            source,
            text,
            score,
            title: String(metadata?.title || '').trim().slice(0, 300) || undefined,
            referenceUrl: String(metadata?.referenceUrl || '').trim().slice(0, 500) || undefined,
            pdfUrl: String(metadata?.pdfUrl || '').trim().slice(0, 500) || undefined,
            authors: String(metadata?.authors || '').trim().slice(0, 300) || undefined,
            year: String(metadata?.year || '').trim().slice(0, 16) || undefined,
            category: String(metadata?.category || '').trim().slice(0, 80) || undefined,
            corpus: String(metadata?.corpus || '').trim().slice(0, 80) || undefined,
          });
        }
      } catch {
        continue;
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

  static async deleteKnowledgeDocuments(where: Record<string, string | number | boolean>): Promise<number> {
    const collection = await this.getCollection();
    if (!collection || !where || Object.keys(where).length === 0) {
      return 0;
    }

    try {
      const result = await collection.delete({ where });
      return Number(result.deleted || 0);
    } catch {
      return 0;
    }
  }

  static async upsertKnowledgeDocuments(docs: VectorKnowledgeUpsertInput[]): Promise<{ upserted: number; skipped: number }> {
    if (!Array.isArray(docs) || docs.length === 0) {
      return { upserted: 0, skipped: 0 };
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return { upserted: 0, skipped: docs.length };
    }

    const collection = await this.getCollection();
    if (!collection) {
      return { upserted: 0, skipped: docs.length };
    }

    const normalizedDocs = docs.slice(0, 2_400).map((doc) => {
      const text = String(doc.text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
      const source = String(doc.source || '').trim().slice(0, 180);
      const id = String(doc.id || '').trim().slice(0, 180);
      const domain = doc.domain === 'nutrition' ? 'nutrition' : 'fitness';
      if (!id || !text || !source) return null;
      return {
        id,
        domain,
        source,
        text,
        embedding: Array.isArray(doc.embedding) ? doc.embedding.map((value) => Number(value) || 0) : [],
        title: String(doc.title || '').trim().slice(0, 300),
        referenceUrl: String(doc.referenceUrl || '').trim().slice(0, 500),
        pdfUrl: String(doc.pdfUrl || '').trim().slice(0, 500),
        authors: String(doc.authors || '').trim().slice(0, 300),
        year: String(doc.year || '').trim().slice(0, 16),
        category: String(doc.category || '').trim().slice(0, 80),
        corpus: String(doc.corpus || '').trim().slice(0, 80),
      };
    });

    const validDocs = normalizedDocs.filter((item): item is NonNullable<typeof item> => Boolean(item));
    let skipped = normalizedDocs.length - validDocs.length;
    let upserted = 0;

    const batchSize = 32;
    for (let offset = 0; offset < validDocs.length; offset += batchSize) {
      const batch = validDocs.slice(offset, offset + batchSize);
      const needsRemoteEmbeddings = batch.some((doc) => doc.embedding.length === 0);
      const embeddings = needsRemoteEmbeddings
        ? await this.getEmbeddings(batch.map((doc) => doc.text))
        : batch.map((doc) => doc.embedding);

      const ids: string[] = [];
      const documents: string[] = [];
      const metadatas: Array<Record<string, string>> = [];
      const vectors: number[][] = [];

      for (let index = 0; index < batch.length; index += 1) {
        const doc = batch[index];
        const embedding = doc.embedding.length > 0
          ? doc.embedding
          : Array.isArray(embeddings[index]) ? embeddings[index] : [];
        if (embedding.length === 0) {
          skipped += 1;
          continue;
        }
        ids.push(doc.id);
        documents.push(doc.text);
        vectors.push(embedding);
        metadatas.push({
          domain: doc.domain,
          source: doc.source,
          text: doc.text,
          title: doc.title || '',
          referenceUrl: doc.referenceUrl || '',
          pdfUrl: doc.pdfUrl || '',
          authors: doc.authors || '',
          year: doc.year || '',
          category: doc.category || '',
          corpus: doc.corpus || '',
        });
      }

      if (ids.length === 0) {
        continue;
      }

      try {
        await collection.upsert({
          ids,
          documents,
          embeddings: vectors,
          metadatas,
        });
        upserted += ids.length;
      } catch {
        skipped += ids.length;
      }
    }

    return { upserted, skipped };
  }

  static async countKnowledgeDocuments(): Promise<number> {
    const collection = await this.getCollection();
    if (!collection) {
      return 0;
    }

    try {
      return await collection.count();
    } catch {
      return 0;
    }
  }

  static async getKnowledgeDocumentsPage(options: {
    limit?: number;
    offset?: number;
    includeText?: boolean;
  } = {}): Promise<VectorKnowledgeRecord[]> {
    const collection = await this.getCollection();
    if (!collection) {
      return [];
    }

    const limit = Math.max(1, Math.min(1_000, Math.floor(Number(options.limit || 100))));
    const offset = Math.max(0, Math.floor(Number(options.offset || 0)));
    const include = options.includeText
      ? ['documents', 'metadatas'] as ['documents', 'metadatas']
      : ['metadatas'] as ['metadatas'];

    try {
      const result = await collection.get({
        limit,
        offset,
        include,
      });

      const ids = Array.isArray(result.ids) ? result.ids : [];
      const metadatas = Array.isArray(result.metadatas) ? result.metadatas : [];
      const documents = Array.isArray(result.documents) ? result.documents : [];

      return ids.map((rawId, index) => {
        const metadata = metadatas[index] as Record<string, unknown> | null | undefined;
        const rawText = options.includeText ? String(documents[index] || metadata?.text || '').trim() : '';
        return {
          id: String(rawId || '').trim(),
          domain: (metadata?.domain === 'nutrition' ? 'nutrition' : 'fitness') as 'fitness' | 'nutrition',
          source: String(metadata?.source || metadata?.title || '').trim(),
          text: rawText ? rawText : undefined,
          title: String(metadata?.title || '').trim() || undefined,
          referenceUrl: String(metadata?.referenceUrl || '').trim() || undefined,
          pdfUrl: String(metadata?.pdfUrl || '').trim() || undefined,
          authors: String(metadata?.authors || '').trim() || undefined,
          year: String(metadata?.year || '').trim() || undefined,
          category: String(metadata?.category || '').trim() || undefined,
          corpus: String(metadata?.corpus || '').trim() || undefined,
        };
      }).filter((item) => item.id && item.source);
    } catch {
      return [];
    }
  }

  static async getEmbedding(text: string): Promise<number[]> {
    const [embedding] = await this.getEmbeddings([text]);
    return Array.isArray(embedding) ? embedding : [];
  }

  static async getEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    const normalized = Array.isArray(texts)
      ? texts.map((text) => String(text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 128)
      : [];
    if (!apiKey || normalized.length === 0) return [];

    const model = process.env.GAUZ_EMBEDDING_MODEL || 'qwen/qwen3-embedding-4b';
    const startedAt = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: normalized.length === 1 ? normalized[0] : normalized,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      OpenRouterUsageService.recordFailure(new Error(`OpenRouter embeddings request failed (${response.status})`), {
        source: 'knowledge_embeddings',
        requestKind: 'embeddings',
        model,
        metadata: { inputCount: normalized.length },
      }, startedAt);
      return [];
    }

    const data = await response.json().catch(() => ({} as any));
    OpenRouterUsageService.recordSuccessFromPayload(data, {
      source: 'knowledge_embeddings',
      requestKind: 'embeddings',
      model,
      metadata: { inputCount: normalized.length },
    }, startedAt);
    if (!Array.isArray(data?.data)) {
      return [];
    }
    return data.data.map((item: any) => (
      Array.isArray(item?.embedding)
        ? item.embedding.map((value: unknown) => Number(value) || 0)
        : []
    ));
  }
}

export async function searchKnowledge(query: string, domain: 'fitness' | 'nutrition'): Promise<string[]> {
  return VectorService.searchKnowledgeByDomain(query, domain);
}
