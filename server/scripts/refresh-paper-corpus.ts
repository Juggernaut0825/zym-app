import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { VectorService, type VectorKnowledgeUpsertInput } from '../src/services/vector-service.js';
import { collectManifestKnowledgeCorpus } from './lib/knowledge-corpus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const knowledgeRoot = path.join(serverRoot, 'src', 'knowledge');
const dryRun = process.argv.includes('--dry-run');
const clearFirst = process.argv.includes('--clear');
const allowPartial = process.argv.includes('--allow-partial');

async function main(): Promise<void> {
  const corpus = await collectManifestKnowledgeCorpus(knowledgeRoot);
  const vectorDocs = corpus.vectorDocs as VectorKnowledgeUpsertInput[];

  if (corpus.missingFiles.length > 0 && !allowPartial) {
    throw new Error(
      `Refusing KB reindex because ${corpus.missingFiles.length} approved manifest files are missing locally. `
      + 'Run `npm run kb:inspect` to review coverage, restore the missing paper markdown files, '
      + 'or rerun with --allow-partial if you intentionally want a partial reindex.',
    );
  }

  const summary = {
    manifestDocuments: corpus.manifestDocuments,
    approvedDocuments: corpus.approvedDocuments,
    indexedFiles: corpus.indexedFiles.length,
    missingFiles: corpus.missingFiles,
    chunksPrepared: vectorDocs.length,
    partialMode: allowPartial,
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
