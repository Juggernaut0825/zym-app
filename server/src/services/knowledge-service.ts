import { VectorService } from './vector-service.js';

export interface KnowledgeMatch {
  id: string;
  source: string;
  domain: 'fitness' | 'nutrition';
  text: string;
  score: number;
  backend: 'chroma';
  title?: string;
  referenceUrl?: string;
  pdfUrl?: string;
  authors?: string;
  year?: string;
  category?: string;
  corpus?: string;
}

export interface KnowledgeSearchOptions {
  topK?: number;
  minScore?: number;
  domains?: Array<'fitness' | 'nutrition'>;
}

function sanitizeKnowledgeSnippet(text: string): string {
  let cleaned = String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const suspicious = [
    /ignore\s+previous\s+instructions?/gi,
    /reveal\s+system\s+prompt/gi,
    /developer\s+message/gi,
    /jailbreak/gi,
  ];
  for (const pattern of suspicious) {
    cleaned = cleaned.replace(pattern, '[filtered]');
  }
  return cleaned.slice(0, 2_000);
}

export class KnowledgeService {
  private initialized = false;

  reload() {
    this.initialized = false;
  }

  init() {
    this.initialized = true;
  }

  async searchHybrid(query: string, options: KnowledgeSearchOptions = {}): Promise<KnowledgeMatch[]> {
    this.init();
    const normalized = String(query || '').trim();
    if (!normalized) return [];

    const topK = Math.min(10, Math.max(1, Math.floor(Number(options.topK || 4))));
    const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 0.08;

    const matches = await VectorService.searchKnowledge(normalized, {
      domains: Array.isArray(options.domains) && options.domains.length > 0 ? options.domains : undefined,
      topK,
    });

    return matches
      .filter((item) => Number(item.score) >= minScore)
      .map((item) => ({
        id: item.id,
        source: item.source,
        domain: item.domain,
        text: sanitizeKnowledgeSnippet(item.text),
        score: Number(item.score),
        backend: 'chroma' as const,
        title: item.title,
        referenceUrl: item.referenceUrl,
        pdfUrl: item.pdfUrl,
        authors: item.authors,
        year: item.year,
        category: item.category,
        corpus: item.corpus,
      }))
      .slice(0, topK);
  }
}

export const knowledgeService = new KnowledgeService();
