import fs from 'fs';
import path from 'path';

interface KnowledgeChunk {
  id: string;
  source: string;
  text: string;
  vector: number[];
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

export class KnowledgeService {
  private chunks: KnowledgeChunk[] = [];
  private initialized = false;

  init() {
    if (this.initialized) return;

    const knowledgeDir = path.join(process.cwd(), 'src', 'knowledge');
    if (!fs.existsSync(knowledgeDir)) {
      this.initialized = true;
      return;
    }

    const files = fs.readdirSync(knowledgeDir).filter(file => file.endsWith('.md'));
    const chunks: KnowledgeChunk[] = [];

    for (const file of files) {
      const fullPath = path.join(knowledgeDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const split = splitIntoChunks(content);

      split.forEach((text, idx) => {
        chunks.push({
          id: `${file}-${idx}`,
          source: file,
          text,
          vector: vectorize(text),
        });
      });
    }

    this.chunks = chunks;
    this.initialized = true;
    console.log(`[knowledge] loaded ${chunks.length} chunks`);
  }

  search(query: string, topK = 3): Array<{ source: string; text: string; score: number }> {
    this.init();
    if (!query.trim() || this.chunks.length === 0) return [];

    const queryVector = vectorize(query);
    return this.chunks
      .map(chunk => ({
        source: chunk.source,
        text: chunk.text,
        score: cosineSimilarity(queryVector, chunk.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(item => item.score > 0.08);
  }
}

export const knowledgeService = new KnowledgeService();
