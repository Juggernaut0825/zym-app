import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectManifestKnowledgeCorpus } from './lib/knowledge-corpus.js';
import { VectorService } from '../src/services/vector-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const knowledgeRoot = path.join(serverRoot, 'src', 'knowledge');

function incrementCounter(target: Record<string, number>, key: string) {
  const normalized = String(key || '').trim() || 'unknown';
  target[normalized] = (target[normalized] || 0) + 1;
}

function extractManifestFileFromVectorId(id: string): string {
  const raw = String(id || '').trim();
  if (!raw.startsWith('knowledge:')) {
    return '';
  }
  const payload = raw.slice('knowledge:'.length);
  const separator = payload.lastIndexOf(':');
  if (separator <= 0) {
    return '';
  }
  return payload.slice(0, separator).trim();
}

async function main(): Promise<void> {
  const corpus = await collectManifestKnowledgeCorpus(knowledgeRoot);
  const chromaCount = await VectorService.countKnowledgeDocuments();
  const chromaFiles = new Set<string>();
  const domainCounts: Record<string, number> = {};
  const corpusCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const samples: Array<Record<string, string>> = [];

  const batchSize = 500;
  for (let offset = 0; offset < chromaCount; offset += batchSize) {
    const page = await VectorService.getKnowledgeDocumentsPage({
      limit: batchSize,
      offset,
      includeText: false,
    });

    for (const item of page) {
      const file = extractManifestFileFromVectorId(item.id);
      if (file) {
        chromaFiles.add(file);
      }
      incrementCounter(domainCounts, item.domain);
      incrementCounter(corpusCounts, item.corpus || 'unknown');
      incrementCounter(categoryCounts, item.category || 'unknown');

      if (samples.length < 12) {
        samples.push({
          id: item.id,
          source: item.source,
          title: item.title || '',
          category: item.category || '',
          corpus: item.corpus || '',
          pdfUrl: item.pdfUrl || item.referenceUrl || '',
        });
      }
    }
  }

  const approvedManifestFiles = new Set(corpus.approvedFiles);
  const missingApprovedFilesInChroma = corpus.approvedFiles.filter((file) => !chromaFiles.has(file));
  const orphanedChromaFiles = Array.from(chromaFiles).filter((file) => !approvedManifestFiles.has(file)).sort();

  const summary = {
    local: {
      manifestDocuments: corpus.manifestDocuments,
      approvedDocuments: corpus.approvedDocuments,
      indexedFilesPresent: corpus.indexedFiles.length,
      missingFiles: corpus.missingFiles,
      localCorpusComplete: corpus.missingFiles.length === 0,
      chunksPreparedFromLocalFiles: corpus.vectorDocs.length,
    },
    chroma: {
      documentCount: chromaCount,
      manifestFileCoverage: chromaFiles.size,
      missingApprovedFiles: missingApprovedFilesInChroma,
      orphanedFilesNotInLocalManifest: orphanedChromaFiles,
      chromaCoverageCompleteForApprovedManifestFiles: missingApprovedFilesInChroma.length === 0,
      manifestApprovedFileCount: approvedManifestFiles.size,
      domains: domainCounts,
      corpora: corpusCounts,
      categories: categoryCounts,
      samples,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
