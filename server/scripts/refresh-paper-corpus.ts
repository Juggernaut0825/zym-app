import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { VectorService, type VectorKnowledgeUpsertInput } from '../src/services/vector-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const knowledgeRoot = path.join(serverRoot, 'src', 'knowledge');
const manifestPath = path.join(knowledgeRoot, 'manifest.json');
const dryRun = process.argv.includes('--dry-run');
const clearFirst = process.argv.includes('--clear');

interface KnowledgeManifestDocument {
  file?: string;
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
  version?: number;
  generatedAt?: string;
  documents?: KnowledgeManifestDocument[];
}

function normalizeWhitespace(input: string): string {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function normalizeRelativePath(fileName: string): string {
  const normalized = String(fileName || '').trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 8) {
    return '';
  }
  return segments.join('/');
}

function chunkMarkdown(content: string, maxChunkLength = 1_200, maxChunks = 96): string[] {
  const paragraphs = String(content || '')
    .split(/\n\s*\n/g)
    .map((item) => normalizeWhitespace(item))
    .filter((item) => item.length > 40);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChunkLength && current) {
      chunks.push(current);
      current = paragraph;
    } else if (paragraph.length > maxChunkLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let index = 0; index < paragraph.length; index += maxChunkLength) {
        const part = paragraph.slice(index, index + maxChunkLength).trim();
        if (part.length > 40) {
          chunks.push(part);
        }
        if (chunks.length >= maxChunks) return chunks.slice(0, maxChunks);
      }
    } else {
      current = next;
    }

    if (chunks.length >= maxChunks) return chunks.slice(0, maxChunks);
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.slice(0, maxChunks);
}

async function loadManifest(): Promise<KnowledgeManifestDocument[]> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as KnowledgeManifest;
  if (Number(parsed?.version) !== 1 || !Array.isArray(parsed?.documents)) {
    throw new Error(`Invalid knowledge manifest: ${manifestPath}`);
  }
  return parsed.documents;
}

async function main(): Promise<void> {
  const manifestDocs = await loadManifest();
  const vectorDocs: VectorKnowledgeUpsertInput[] = [];
  const missingFiles: string[] = [];
  const indexedFiles: string[] = [];

  for (const doc of manifestDocs) {
    if (doc?.approved === false) {
      continue;
    }

    const file = normalizeRelativePath(String(doc?.file || ''));
    if (!file) {
      continue;
    }

    const fullPath = path.join(knowledgeRoot, file);
    let content = '';
    try {
      content = await fs.readFile(fullPath, 'utf8');
    } catch {
      missingFiles.push(file);
      continue;
    }

    const chunks = chunkMarkdown(content);
    if (chunks.length === 0) {
      continue;
    }

    indexedFiles.push(file);
    chunks.forEach((chunk, index) => {
      vectorDocs.push({
        id: `knowledge:${file}:${index + 1}`,
        domain: doc.domain === 'nutrition' ? 'nutrition' : 'fitness',
        source: normalizeWhitespace(String(doc.source || doc.title || file)).slice(0, 180),
        text: chunk,
        title: normalizeWhitespace(String(doc.title || '')).slice(0, 300),
        referenceUrl: normalizeWhitespace(String(doc.referenceUrl || '')).slice(0, 500),
        pdfUrl: normalizeWhitespace(String(doc.pdfUrl || '')).slice(0, 500),
        authors: normalizeWhitespace(String(doc.authors || '')).slice(0, 300),
        year: normalizeWhitespace(String(doc.year || '')).slice(0, 16),
        category: normalizeWhitespace(String(doc.category || '')).slice(0, 80),
        corpus: 'knowledge-manifest',
      });
    });
  }

  const summary = {
    manifestDocuments: manifestDocs.length,
    indexedFiles: indexedFiles.length,
    missingFiles,
    chunksPrepared: vectorDocs.length,
  };

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (clearFirst) {
    const deleted = await VectorService.deleteKnowledgeDocuments({ corpus: 'knowledge-manifest' });
    console.log(`Deleted existing Chroma documents: ${deleted}`);
  }

  const result = await VectorService.upsertKnowledgeDocuments(vectorDocs);
  console.log(JSON.stringify({
    ...summary,
    upserted: result.upserted,
    skipped: result.skipped,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
