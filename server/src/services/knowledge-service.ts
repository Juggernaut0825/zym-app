import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { VectorService } from './vector-service.js';
import { SecurityEventService } from './security-event-service.js';

interface KnowledgeChunk {
  id: string;
  source: string;
  domain: 'fitness' | 'nutrition';
  text: string;
  vector: number[];
}

interface KnowledgeVectorIndexDocument {
  id?: string;
  source?: string;
  domain?: 'fitness' | 'nutrition';
  text?: string;
  embedding?: number[];
}

interface KnowledgeVectorIndex {
  version: number;
  generatedAt?: string;
  documents: KnowledgeVectorIndexDocument[];
}

interface KnowledgeManifestDocument {
  file: string;
  sha256: string;
  source?: string;
  domain?: 'fitness' | 'nutrition';
  approved?: boolean;
  title?: string;
  referenceUrl?: string;
  pdfUrl?: string;
  authors?: string;
  year?: string;
  category?: string;
}

interface KnowledgeManifest {
  version: number;
  generatedAt?: string;
  documents: KnowledgeManifestDocument[];
}

export interface KnowledgeMatch {
  source: string;
  domain: 'fitness' | 'nutrition';
  text: string;
  score: number;
  backend: 'local' | 'vector';
}

export interface KnowledgeSearchOptions {
  topK?: number;
  minScore?: number;
  domains?: Array<'fitness' | 'nutrition'>;
}

const VECTOR_DIM = 256;
const TOKEN_RE = /[a-zA-Z0-9_\u4e00-\u9fa5]+/g;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) || []).filter(Boolean);
}

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function vectorize(text: string): number[] {
  const vector = new Array(VECTOR_DIM).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const idx = hashToken(token) % VECTOR_DIM;
    vector[idx] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;

  return vector.map(value => value / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i += 1) {
    dot += (a[i] || 0) * (b[i] || 0);
  }
  return dot;
}

function splitIntoChunks(content: string, maxChunkLength = 1_200, maxChunks = 64): string[] {
  const paragraphs = String(content || '')
    .split(/\n\s*\n/g)
    .map(chunk => chunk.replace(/\s+/g, ' ').trim())
    .filter(chunk => chunk.length > 30);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkLength) {
      if (current.trim().length > 30) {
        chunks.push(current.trim());
        current = '';
      }

      for (let idx = 0; idx < paragraph.length; idx += maxChunkLength) {
        const part = paragraph.slice(idx, idx + maxChunkLength).trim();
        if (part.length > 30) {
          chunks.push(part);
        }
        if (chunks.length >= maxChunks) {
          return chunks.slice(0, maxChunks);
        }
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChunkLength && current) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = candidate;
    }

    if (chunks.length >= maxChunks) {
      return chunks.slice(0, maxChunks);
    }
  }

  if (current.trim().length > 30 && chunks.length < maxChunks) {
    chunks.push(current.trim());
  }

  return chunks.slice(0, maxChunks);
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

function inferDomainFromSource(source: string): 'fitness' | 'nutrition' {
  const lower = String(source || '').toLowerCase();
  if (lower.includes('nutrition') || lower.includes('food') || lower.includes('diet')) {
    return 'nutrition';
  }
  return 'fitness';
}

function inferDomainsFromQuery(query: string): Array<'fitness' | 'nutrition'> {
  const text = String(query || '').toLowerCase();
  const nutritionHits = [
    'calorie', 'macro', 'protein', 'carb', 'fat', 'meal', 'diet', 'food', 'nutrition',
  ].some((token) => text.includes(token));
  const fitnessHits = [
    'workout', 'training', 'rep', 'set', 'lift', 'form', 'squat', 'deadlift', 'bench',
  ].some((token) => text.includes(token));

  if (nutritionHits && fitnessHits) return ['fitness', 'nutrition'];
  if (nutritionHits) return ['nutrition'];
  if (fitnessHits) return ['fitness'];
  return ['fitness', 'nutrition'];
}

function normalizeKnowledgePathToken(fileName: string): string {
  const normalized = String(fileName || '').trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    return '';
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 8) {
    return '';
  }

  for (const segment of segments) {
    if (!/^[a-zA-Z0-9._-]{1,180}$/.test(segment)) {
      return '';
    }
  }

  return segments.join('/');
}

function listKnowledgeMarkdownFiles(rootDir: string, currentDir = rootDir): string[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listKnowledgeMarkdownFiles(rootDir, fullPath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    const normalized = normalizeKnowledgePathToken(relativePath);
    if (normalized) {
      files.push(normalized);
    }
  }

  return files.sort();
}

function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizeManifestMode(): 'off' | 'optional' | 'required' {
  const raw = String(process.env.KNOWLEDGE_MANIFEST_MODE || '').trim().toLowerCase();
  if (raw === 'off' || raw === 'optional' || raw === 'required') {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'required' : 'optional';
}

function maybeRecordKnowledgeSecurityEvent(
  eventType: string,
  severity: 'info' | 'warn' | 'high',
  metadata: Record<string, unknown>,
): void {
  try {
    SecurityEventService.create({
      eventType,
      severity,
      metadata,
    });
  } catch {
    // Security logging must never break startup.
  }
}

export class KnowledgeService {
  private chunks: KnowledgeChunk[] = [];
  private semanticChunks: KnowledgeChunk[] = [];
  private initialized = false;

  reload() {
    this.initialized = false;
    this.chunks = [];
    this.semanticChunks = [];
    this.init();
  }

  init() {
    if (this.initialized) return;

    const knowledgeDir = path.join(process.cwd(), 'src', 'knowledge');
    if (!fs.existsSync(knowledgeDir)) {
      this.initialized = true;
      return;
    }

    const semanticIndexPath = path.join(knowledgeDir, 'local-vector-index.json');
    const files = listKnowledgeMarkdownFiles(knowledgeDir);
    const manifestMode = normalizeManifestMode();
    const manifestPath = path.join(knowledgeDir, 'manifest.json');
    let manifestDocsByFile = new Map<string, KnowledgeManifestDocument>();

    if (manifestMode !== 'off') {
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          const parsed = JSON.parse(raw) as KnowledgeManifest;
          if (Number(parsed?.version) !== 1 || !Array.isArray(parsed?.documents)) {
            throw new Error('Invalid manifest schema');
          }

          const nextMap = new Map<string, KnowledgeManifestDocument>();
          for (const doc of parsed.documents) {
            const file = normalizeKnowledgePathToken(String(doc?.file || ''));
            const sha256 = String(doc?.sha256 || '').trim().toLowerCase();
            if (!file || !/^[a-f0-9]{64}$/.test(sha256)) {
              continue;
            }
            const domain = doc?.domain === 'nutrition' ? 'nutrition' : doc?.domain === 'fitness' ? 'fitness' : undefined;
            const source = String(doc?.source || '').trim().slice(0, 180);
            nextMap.set(file, {
              file,
              sha256,
              source,
              domain,
              approved: doc?.approved !== false,
            });
          }
          manifestDocsByFile = nextMap;
        } catch {
          maybeRecordKnowledgeSecurityEvent('knowledge_manifest_invalid', 'high', {
            manifestPath,
          });
          if (manifestMode === 'required') {
            this.initialized = true;
            return;
          }
        }
      } else if (manifestMode === 'required') {
        maybeRecordKnowledgeSecurityEvent('knowledge_manifest_missing', 'high', {
          manifestPath,
        });
        this.initialized = true;
        return;
      }
    }

    const chunks: KnowledgeChunk[] = [];
    const semanticChunks: KnowledgeChunk[] = [];

    if (fs.existsSync(semanticIndexPath)) {
      try {
        const raw = fs.readFileSync(semanticIndexPath, 'utf8');
        const parsed = JSON.parse(raw) as KnowledgeVectorIndex;
        if (Number(parsed?.version) === 1 && Array.isArray(parsed?.documents)) {
          for (const doc of parsed.documents) {
            const source = String(doc?.source || '').trim().slice(0, 180);
            const text = sanitizeKnowledgeSnippet(String(doc?.text || ''));
            const embedding = Array.isArray(doc?.embedding)
              ? doc.embedding.map((value) => Number(value) || 0).filter((value) => Number.isFinite(value))
              : [];
            const domain = doc?.domain === 'nutrition' ? 'nutrition' : 'fitness';
            const id = String(doc?.id || `${source}:${text.slice(0, 64)}`).trim().slice(0, 220);
            if (!source || !text || embedding.length === 0) {
              continue;
            }
            semanticChunks.push({
              id,
              source,
              domain,
              text,
              vector: embedding,
            });
          }
        }
      } catch {
        maybeRecordKnowledgeSecurityEvent('knowledge_vector_index_invalid', 'warn', {
          semanticIndexPath,
        });
      }
    }

    for (const file of files) {
      const fullPath = path.join(knowledgeDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const sha256 = sha256Text(content);

      if (manifestMode !== 'off' && manifestDocsByFile.size > 0) {
        const doc = manifestDocsByFile.get(file);
        if (!doc || doc.approved === false) {
          continue;
        }
        if (doc.sha256 !== sha256) {
          maybeRecordKnowledgeSecurityEvent('knowledge_doc_hash_mismatch', 'high', {
            file,
          });
          continue;
        }
      }

      const split = splitIntoChunks(content);

      split.forEach((text, idx) => {
        const sanitizedText = sanitizeKnowledgeSnippet(text);
        if (sanitizedText.length < 24) {
          return;
        }
        const doc = manifestDocsByFile.get(file);
        chunks.push({
          id: `${file}-${idx}`,
          source: doc?.source || file,
          domain: doc?.domain || inferDomainFromSource(file),
          text: sanitizedText,
          vector: vectorize(sanitizedText),
        });
      });
    }

    this.chunks = chunks;
    this.semanticChunks = semanticChunks;
    this.initialized = true;
    console.log(`[knowledge] loaded ${chunks.length} chunks (${semanticChunks.length} semantic)`);
  }

  search(query: string, topK = 3): Array<{ source: string; text: string; score: number; domain: 'fitness' | 'nutrition' }> {
    return this.searchLocal(query, { topK }).map((item) => ({
      source: item.source,
      text: item.text,
      score: item.score,
      domain: item.domain,
    }));
  }

  searchLocal(query: string, options: KnowledgeSearchOptions = {}): KnowledgeMatch[] {
    this.init();
    if (!query.trim() || this.chunks.length === 0) return [];

    const topK = Math.min(10, Math.max(1, Math.floor(Number(options.topK || 3))));
    const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 0.08;
    const allowedDomains = options.domains?.length ? new Set(options.domains) : null;
    const queryVector = vectorize(query);

    return this.chunks
      .map(chunk => ({
        backend: 'local' as const,
        source: chunk.source,
        domain: chunk.domain,
        text: chunk.text,
        score: cosineSimilarity(queryVector, chunk.vector),
      }))
      .filter((item) => !allowedDomains || allowedDomains.has(item.domain))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(item => item.score >= minScore);
  }

  async searchHybrid(query: string, options: KnowledgeSearchOptions = {}): Promise<KnowledgeMatch[]> {
    const normalized = String(query || '').trim();
    if (!normalized) return [];

    const topK = Math.min(10, Math.max(1, Math.floor(Number(options.topK || 4))));
    const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 0.08;
    const domains = options.domains?.length ? options.domains : inferDomainsFromQuery(normalized);
    const localHits = this.searchLocal(normalized, { topK, minScore, domains });

    let vectorHits: KnowledgeMatch[] = [];
    try {
      const semanticHits = await this.searchSemantic(normalized, { topK, minScore, domains });
      const remoteHits = await VectorService.searchKnowledge(normalized, { domains, topK });
      vectorHits = [...semanticHits, ...remoteHits
        .filter((item) => Number(item.score) >= minScore)
        .map((item) => ({
          source: item.source,
          domain: item.domain,
          text: sanitizeKnowledgeSnippet(item.text),
          score: Number(item.score),
          backend: 'vector' as const,
        }))];
    } catch {
      vectorHits = [];
    }

    const merged = new Map<string, KnowledgeMatch>();
    for (const hit of [...vectorHits, ...localHits]) {
      const key = `${hit.source}:${hit.text.slice(0, 180)}`;
      const existing = merged.get(key);
      if (!existing || existing.score < hit.score) {
        merged.set(key, hit);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async searchSemantic(query: string, options: KnowledgeSearchOptions = {}): Promise<KnowledgeMatch[]> {
    this.init();
    if (!query.trim() || this.semanticChunks.length === 0) {
      return [];
    }

    const topK = Math.min(10, Math.max(1, Math.floor(Number(options.topK || 4))));
    const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 0.08;
    const allowedDomains = options.domains?.length ? new Set(options.domains) : null;
    const embedding = await VectorService.getEmbedding(query);
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return [];
    }

    return this.semanticChunks
      .map((chunk) => ({
        backend: 'vector' as const,
        source: chunk.source,
        domain: chunk.domain,
        text: chunk.text,
        score: cosineSimilarity(embedding, chunk.vector),
      }))
      .filter((item) => !allowedDomains || allowedDomains.has(item.domain))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((item) => item.score >= minScore);
  }
}

export const knowledgeService = new KnowledgeService();
