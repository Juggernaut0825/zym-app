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

interface KnowledgeManifestDocument {
  file: string;
  sha256: string;
  source?: string;
  domain?: 'fitness' | 'nutrition';
  approved?: boolean;
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
  let dot = 0;
  for (let i = 0; i < VECTOR_DIM; i += 1) {
    dot += (a[i] || 0) * (b[i] || 0);
  }
  return dot;
}

function splitIntoChunks(content: string): string[] {
  return content
    .split(/\n\s*\n/g)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 30)
    .slice(0, 32);
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

function normalizeFileToken(fileName: string): string {
  const base = path.basename(String(fileName || '').trim());
  return /^[a-zA-Z0-9._-]{1,180}$/.test(base) ? base : '';
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
  private initialized = false;

  reload() {
    this.initialized = false;
    this.chunks = [];
    this.init();
  }

  init() {
    if (this.initialized) return;

    const knowledgeDir = path.join(process.cwd(), 'src', 'knowledge');
    if (!fs.existsSync(knowledgeDir)) {
      this.initialized = true;
      return;
    }

    const files = fs.readdirSync(knowledgeDir).filter(file => file.endsWith('.md'));
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
            const file = normalizeFileToken(String(doc?.file || ''));
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
    this.initialized = true;
    console.log(`[knowledge] loaded ${chunks.length} chunks`);
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
      const hits = await VectorService.searchKnowledge(normalized, { domains, topK });
      vectorHits = hits
        .filter((item) => Number(item.score) >= minScore)
        .map((item) => ({
          source: item.source,
          domain: item.domain,
          text: sanitizeKnowledgeSnippet(item.text),
          score: Number(item.score),
          backend: 'vector' as const,
        }));
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
}

export const knowledgeService = new KnowledgeService();
