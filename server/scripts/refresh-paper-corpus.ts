import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { VectorService, type VectorKnowledgeUpsertInput } from '../src/services/vector-service.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const knowledgeRoot = path.join(serverRoot, 'src', 'knowledge');
const papersDir = path.join(knowledgeRoot, 'papers');
const paperPdfDir = path.join(serverRoot, 'data', 'knowledge-papers', 'pdfs');
const catalogPath = path.join(papersDir, 'catalog.json');
const localVectorIndexPath = path.join(knowledgeRoot, 'local-vector-index.json');
const dryRun = process.argv.includes('--dry-run');
const noVectors = process.argv.includes('--no-vectors');
const NETWORK_TIMEOUT_MS = 30_000;

type Domain = 'fitness' | 'nutrition';
type EvidenceType =
  | 'position'
  | 'guideline'
  | 'meta-analysis'
  | 'systematic-review'
  | 'scoping-review'
  | 'narrative-review'
  | 'review';

interface SearchRecipe {
  id: string;
  domain: Domain;
  limit: number;
  query: string;
  excludeTitlePatterns?: RegExp[];
}

interface EuropePmcUrl {
  availability?: string;
  availabilityCode?: string;
  documentStyle?: string;
  site?: string;
  url?: string;
}

interface EuropePmcResult {
  title?: string;
  authorString?: string;
  abstractText?: string;
  pubYear?: string;
  pmcid?: string;
  pmid?: string;
  doi?: string;
  citedByCount?: number;
  journalInfo?: {
    journal?: {
      title?: string;
    };
  };
  fullTextUrlList?: {
    fullTextUrl?: EuropePmcUrl[];
  };
}

interface PaperDocument {
  file: string;
  pdfFile: string;
  category: string;
  domain: Domain;
  title: string;
  source: string;
  authors: string;
  journal: string;
  year: string;
  pmcid: string;
  pmid: string;
  doi: string;
  abstract: string;
  referenceUrl: string;
  pdfUrl: string;
  evidenceType: EvidenceType;
  citedByCount: number;
}

const GLOBAL_EXCLUDE_PATTERNS = [
  /correction/i,
  /protocol/i,
  /case report/i,
  /\bicu\b/i,
  /cancer/i,
  /copd/i,
  /disease/i,
  /disorder/i,
  /patients with/i,
  /neural tube/i,
  /pregnan/i,
  /gestational/i,
  /maternal/i,
  /gastrectomy/i,
  /heart failure/i,
  /female reproductive/i,
  /cerebral palsy/i,
  /children/i,
  /pediatric/i,
  /rehabilitation/i,
  /quality of life/i,
];

const RECIPES: SearchRecipe[] = [
  {
    id: 'hypertrophy-strength',
    domain: 'fitness',
    limit: 10,
    query: '((hypertrophy OR "resistance training" OR strength OR muscle) AND ("systematic review" OR "meta-analysis" OR "overview of reviews" OR "position stand")) AND OPEN_ACCESS:y AND HAS_PDF:y',
    excludeTitlePatterns: [/sarcopenia/i, /older adults/i, /frailty/i],
  },
  {
    id: 'programming-concurrent',
    domain: 'fitness',
    limit: 8,
    query: '(("training volume" OR frequency OR periodization OR "concurrent training" OR "velocity-based") AND ("resistance training" OR hypertrophy OR strength) AND ("systematic review" OR "meta-analysis" OR review OR "position stand")) AND OPEN_ACCESS:y AND HAS_PDF:y',
    excludeTitlePatterns: [/volleyball/i, /triathlete/i, /winter sports/i, /weightless/i],
  },
  {
    id: 'protein-hypertrophy',
    domain: 'nutrition',
    limit: 10,
    query: '((protein OR "protein supplementation" OR "dietary protein" OR amino acid) AND ("resistance training" OR hypertrophy OR muscle OR strength) AND ("systematic review" OR "meta-analysis" OR review OR guideline OR position)) AND OPEN_ACCESS:y AND HAS_PDF:y',
    excludeTitlePatterns: [/sarcopenia/i],
  },
  {
    id: 'weight-loss-body-composition',
    domain: 'nutrition',
    limit: 10,
    query: '(("weight loss" OR obesity OR "body composition" OR "fat loss" OR "caloric restriction") AND (diet OR nutrition OR exercise OR resistance) AND ("systematic review" OR "meta-analysis" OR review OR guideline OR "position statement")) AND OPEN_ACCESS:y AND HAS_PDF:y',
    excludeTitlePatterns: [/glp-1/i, /diabetes/i, /older adults/i],
  },
  {
    id: 'meal-timing-energy-balance',
    domain: 'nutrition',
    limit: 6,
    query: '(("meal timing" OR chrononutrition OR "energy balance" OR "time-restricted feeding" OR "intermittent fasting") AND ("systematic review" OR "meta-analysis" OR review OR guideline)) AND OPEN_ACCESS:y AND HAS_PDF:y',
    excludeTitlePatterns: [/mental health/i, /cortisol/i, /maternal/i, /depression/i],
  },
  {
    id: 'sports-nutrition-guidance',
    domain: 'nutrition',
    limit: 8,
    query: '(("sports nutrition" OR athlete nutrition OR supplementation OR hydration OR creatine) AND (review OR "position stand" OR guideline OR consensus OR "meta-analysis")) AND OPEN_ACCESS:y AND HAS_PDF:y',
    excludeTitlePatterns: [/football/i, /basketball/i, /adolescent track/i, /cycling/i, /combat sports/i, /mixed martial arts/i],
  },
];

function slugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90) || 'paper';
}

function normalizeWhitespace(input: string): string {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(input: string): string {
  return String(input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstAuthorSurname(authors: string): string {
  const first = String(authors || '').split(',')[0]?.trim() || 'Unknown';
  return first.split(/\s+/)[0] || 'Unknown';
}

function classifyEvidenceType(title: string): EvidenceType {
  const text = normalizeWhitespace(title).toLowerCase();
  if (text.includes('position stand') || text.includes('position statement') || text.includes('consensus')) {
    return 'position';
  }
  if (text.includes('guideline') || text.includes('recommendation')) {
    return 'guideline';
  }
  if (text.includes('meta-analysis') || text.includes('network meta-analysis')) {
    return 'meta-analysis';
  }
  if (text.includes('systematic review')) {
    return 'systematic-review';
  }
  if (text.includes('scoping review') || text.includes('overview of reviews')) {
    return 'scoping-review';
  }
  if (text.includes('narrative review') || text.includes('practical review')) {
    return 'narrative-review';
  }
  return 'review';
}

function evidenceWeight(type: EvidenceType): number {
  switch (type) {
    case 'position':
      return 6;
    case 'guideline':
      return 5;
    case 'meta-analysis':
      return 4;
    case 'systematic-review':
      return 3;
    case 'scoping-review':
      return 2;
    case 'narrative-review':
      return 1.5;
    default:
      return 1;
  }
}

function pickBestUrl(urls: EuropePmcUrl[] | undefined, style: 'html' | 'pdf'): string {
  const list = Array.isArray(urls) ? urls : [];
  const matching = list.filter((item) => item.documentStyle === style && item.url);
  const preferred = matching.find((item) => /Europe_PMC|PubMedCentral/i.test(String(item.site || '')));
  return String((preferred || matching[0] || {}).url || '').trim();
}

function titleIsUsable(title: string, recipe: SearchRecipe): boolean {
  const normalized = normalizeWhitespace(title);
  if (!normalized) return false;
  const required = /(review|meta-analysis|position stand|position statement|guideline|consensus|overview)/i;
  if (!required.test(normalized)) return false;
  if (GLOBAL_EXCLUDE_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  if ((recipe.excludeTitlePatterns || []).some((pattern) => pattern.test(normalized))) return false;
  return true;
}

function buildSource(title: string, authors: string, year: string): string {
  const citationLead = `${firstAuthorSurname(authors)} et al. ${year || 'n.d.'}`;
  const shortTitle = normalizeWhitespace(title).replace(/\.$/, '').slice(0, 110);
  return `${citationLead} - ${shortTitle}`.slice(0, 180);
}

function normalizePaper(recipe: SearchRecipe, item: EuropePmcResult): PaperDocument | null {
  const title = normalizeWhitespace(item.title);
  const authors = normalizeWhitespace(item.authorString);
  const year = normalizeWhitespace(item.pubYear);
  const pmcid = normalizeWhitespace(item.pmcid).toUpperCase();
  const pdfUrl = pickBestUrl(item.fullTextUrlList?.fullTextUrl, 'pdf');
  const referenceUrl = pickBestUrl(item.fullTextUrlList?.fullTextUrl, 'html');
  if (!titleIsUsable(title, recipe) || !pmcid || !pdfUrl || !referenceUrl) {
    return null;
  }

  const journal = normalizeWhitespace(item.journalInfo?.journal?.title);
  const abstract = stripHtml(item.abstractText || '');
  const baseName = `${recipe.id}-${year || 'undated'}-${pmcid.toLowerCase()}`;
  return {
    file: `papers/${baseName}.md`,
    pdfFile: `${baseName}.pdf`,
    category: recipe.id,
    domain: recipe.domain,
    title,
    source: buildSource(title, authors, year),
    authors,
    journal,
    year,
    pmcid,
    pmid: normalizeWhitespace(item.pmid),
    doi: normalizeWhitespace(item.doi),
    abstract,
    referenceUrl,
    pdfUrl,
    evidenceType: classifyEvidenceType(title),
    citedByCount: Number(item.citedByCount || 0),
  };
}

function comparePapers(a: PaperDocument, b: PaperDocument): number {
  const evidenceDelta = evidenceWeight(b.evidenceType) - evidenceWeight(a.evidenceType);
  if (evidenceDelta !== 0) return evidenceDelta;
  const citationDelta = b.citedByCount - a.citedByCount;
  if (citationDelta !== 0) return citationDelta;
  return Number(b.year || 0) - Number(a.year || 0);
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'ZYM-Knowledge-Builder/1.0',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchRecipeCandidates(recipe: SearchRecipe): Promise<PaperDocument[]> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=${recipe.limit * 6}&resultType=core&query=${encodeURIComponent(recipe.query)}`;
  const data = await fetchJson(url);
  const results = Array.isArray(data?.resultList?.result) ? data.resultList.result as EuropePmcResult[] : [];
  return results
    .map((item) => normalizePaper(recipe, item))
    .filter((item): item is PaperDocument => Boolean(item))
    .sort(comparePapers);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = NETWORK_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadPdf(url: string, outputPath: string): Promise<void> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'ZYM-Knowledge-Builder/1.0',
      Accept: 'application/pdf,*/*',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download PDF ${url}: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.includes(Buffer.from('%PDF'))) {
    throw new Error(`Downloaded file is not a valid PDF: ${url}`);
  }
  await fs.writeFile(outputPath, bytes);
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const tempPath = `${pdfPath}.txt`;
  try {
    await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, tempPath], {
      maxBuffer: 32 * 1024 * 1024,
    });
    const text = await fs.readFile(tempPath, 'utf8');
    await fs.rm(tempPath, { force: true });
    if (text.trim()) {
      return text;
    }
  } catch {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }

  const pythonExtractor = [
    'from pypdf import PdfReader',
    'import sys',
    'reader = PdfReader(sys.argv[1])',
    'parts = []',
    'for page in reader.pages:',
    '    parts.append(page.extract_text() or "")',
    'print("\\n\\n".join(parts))',
  ].join('\n');
  const { stdout } = await execFileAsync('python3', ['-c', pythonExtractor, pdfPath], {
    maxBuffer: 48 * 1024 * 1024,
  });
  return stdout;
}

function cleanPdfText(input: string): string {
  let text = String(input || '')
    .replace(/([A-Za-z])-\n([A-Za-z])/g, '$1$2')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n');

  text = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean).join(' '))
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 40)
    .join('\n\n');

  const referencesIndex = text.search(/\nreferences\b/i);
  if (referencesIndex > 10_000) {
    text = text.slice(0, referencesIndex).trim();
  }

  return text.slice(0, 180_000);
}

async function fetchFullTextXml(pmcid: string): Promise<string> {
  const normalized = normalizeWhitespace(pmcid).toUpperCase();
  if (!normalized) {
    return '';
  }
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/${normalized}/fullTextXML`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'ZYM-Knowledge-Builder/1.0',
      Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5',
    },
  });
  if (!response.ok) {
    return '';
  }
  return response.text();
}

function cleanXmlText(input: string): string {
  const source = String(input || '');
  const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let text = bodyMatch ? bodyMatch[1] : source;
  text = text
    .replace(/<xref[^>]*>[\s\S]*?<\/xref>/gi, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<sub[^>]*>[\s\S]*?<\/sub>/gi, ' ')
    .replace(/<fig[^>]*>[\s\S]*?<\/fig>/gi, ' ')
    .replace(/<table-wrap[^>]*>[\s\S]*?<\/table-wrap>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const referencesIndex = text.search(/\breferences\b/i);
  if (referencesIndex > 10_000) {
    text = text.slice(0, referencesIndex).trim();
  }
  return text.slice(0, 180_000);
}

function buildMarkdown(doc: PaperDocument, extractedText: string, sourceMode: 'pdf' | 'xml'): string {
  const metadata = [
    `# ${doc.title}`,
    '',
    `- Source: ${doc.source}`,
    `- Category: ${doc.category}`,
    `- Domain: ${doc.domain}`,
    `- Evidence Type: ${doc.evidenceType}`,
    `- Retrieval Source: ${sourceMode}`,
    `- Authors: ${doc.authors || 'Unknown'}`,
    `- Journal: ${doc.journal || 'Unknown'}`,
    `- Year: ${doc.year || 'Unknown'}`,
    `- PMCID: ${doc.pmcid}`,
    `- PMID: ${doc.pmid || 'N/A'}`,
    `- DOI: ${doc.doi || 'N/A'}`,
    `- Reference URL: ${doc.referenceUrl}`,
    `- PDF URL: ${doc.pdfUrl}`,
  ];

  if (doc.abstract) {
    metadata.push('', '## Abstract', '', doc.abstract);
  }

  metadata.push('', sourceMode === 'pdf' ? '## Extracted PDF Text' : '## Extracted Full Text XML', '', extractedText);
  return `${metadata.join('\n').trim()}\n`;
}

function chunkForVectors(markdown: string, maxChunkLength = 1_200, maxChunks = 24): string[] {
  const paragraphs = String(markdown || '')
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 40);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChunkLength && current) {
      chunks.push(current);
      current = paragraph;
    } else if (paragraph.length > maxChunkLength) {
      for (let idx = 0; idx < paragraph.length; idx += maxChunkLength) {
        const part = paragraph.slice(idx, idx + maxChunkLength).trim();
        if (part.length >= 40) {
          chunks.push(part);
        }
        if (chunks.length >= maxChunks) {
          return chunks.slice(0, maxChunks);
        }
      }
      current = '';
    } else {
      current = candidate;
    }

    if (chunks.length >= maxChunks) {
      return chunks.slice(0, maxChunks);
    }
  }

  if (current && chunks.length < maxChunks) {
    chunks.push(current);
  }

  return chunks.slice(0, maxChunks);
}

async function cleanupStaleFiles(expectedRelativeMarkdownFiles: Set<string>, expectedPdfFiles: Set<string>): Promise<void> {
  const markdownEntries = await fs.readdir(papersDir).catch(() => []);
  await Promise.all(markdownEntries
    .filter((entry) => entry.endsWith('.md'))
    .map(async (entry) => {
      const relativePath = `papers/${entry}`;
      if (!expectedRelativeMarkdownFiles.has(relativePath)) {
        await fs.rm(path.join(papersDir, entry), { force: true });
      }
    }));

  const pdfEntries = await fs.readdir(paperPdfDir).catch(() => []);
  await Promise.all(pdfEntries
    .filter((entry) => entry.endsWith('.pdf'))
    .map(async (entry) => {
      if (!expectedPdfFiles.has(entry)) {
        await fs.rm(path.join(paperPdfDir, entry), { force: true });
      }
    }));
}

async function writeLocalVectorIndex(vectorDocs: VectorKnowledgeUpsertInput[]): Promise<number> {
  if (!process.env.OPENROUTER_API_KEY || vectorDocs.length === 0) {
    return 0;
  }

  const normalizedDocs = vectorDocs
    .map((doc) => ({
      original: doc,
      id: String(doc.id || '').trim().slice(0, 180),
      source: normalizeWhitespace(doc.source).slice(0, 180),
      domain: doc.domain === 'nutrition' ? 'nutrition' : 'fitness',
      text: normalizeWhitespace(doc.text).slice(0, 4000),
    }))
    .filter((doc) => doc.id && doc.source && doc.text);

  const documents: Array<{ id: string; source: string; domain: Domain; text: string; embedding: number[] }> = [];
  const batchSize = 32;
  for (let offset = 0; offset < normalizedDocs.length; offset += batchSize) {
    const batch = normalizedDocs.slice(offset, offset + batchSize);
    const embeddings = await VectorService.getEmbeddings(batch.map((doc) => doc.text));
    for (let idx = 0; idx < batch.length; idx += 1) {
      const embedding = Array.isArray(embeddings[idx]) ? embeddings[idx] : [];
      if (embedding.length === 0) {
        continue;
      }
      batch[idx].original.embedding = embedding;
      documents.push({
        id: batch[idx].id,
        source: batch[idx].source,
        domain: batch[idx].domain,
        text: batch[idx].text,
        embedding,
      });
    }
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    documents,
  };
  await fs.writeFile(localVectorIndexPath, `${JSON.stringify(payload)}\n`, 'utf8');
  return documents.length;
}

async function buildCorpus(): Promise<PaperDocument[]> {
  const selected: PaperDocument[] = [];
  const seen = new Set<string>();

  for (const recipe of RECIPES) {
    const candidates = await fetchRecipeCandidates(recipe);
    for (const doc of candidates) {
      const dedupeKey = doc.pmcid || slugify(doc.title);
      if (seen.has(dedupeKey)) {
        continue;
      }
      selected.push(doc);
      seen.add(dedupeKey);
      if (selected.filter((item) => item.category === recipe.id).length >= recipe.limit) {
        break;
      }
    }
  }

  return selected.sort((a, b) => a.category.localeCompare(b.category) || comparePapers(a, b));
}

async function main(): Promise<void> {
  await ensureDir(papersDir);
  await ensureDir(paperPdfDir);

  const selectedDocs = await buildCorpus();
  const expectedPdfFiles = new Set(selectedDocs.map((doc) => doc.pdfFile));

  if (dryRun) {
    console.log(JSON.stringify({
      total: selectedDocs.length,
      categories: Object.fromEntries(RECIPES.map((recipe) => [
        recipe.id,
        selectedDocs.filter((doc) => doc.category === recipe.id).length,
      ])),
      sample: selectedDocs.slice(0, 5),
    }, null, 2));
    return;
  }

  const vectorDocs: VectorKnowledgeUpsertInput[] = [];
  const processedDocs: PaperDocument[] = [];

  for (const [docIndex, doc] of selectedDocs.entries()) {
    const pdfPath = path.join(paperPdfDir, doc.pdfFile);
    const markdownPath = path.join(knowledgeRoot, doc.file);
    let extractedText = '';
    let sourceMode: 'pdf' | 'xml' = 'pdf';
    console.log(`[papers] ${docIndex + 1}/${selectedDocs.length} ${doc.pmcid} ${doc.title.slice(0, 100)}`);

    try {
      try {
        await fs.access(pdfPath);
      } catch {
        await downloadPdf(doc.pdfUrl, pdfPath);
      }
      extractedText = cleanPdfText(await extractPdfText(pdfPath));
    } catch {
      sourceMode = 'xml';
      extractedText = cleanXmlText(await fetchFullTextXml(doc.pmcid));
    }

    if (extractedText.length < 2_000) {
      console.warn(`Skipping ${doc.pmcid}: insufficient extracted text`);
      continue;
    }

    const markdown = buildMarkdown(doc, extractedText, sourceMode);
    await fs.writeFile(markdownPath, markdown, 'utf8');
    processedDocs.push(doc);

    for (const [index, chunk] of chunkForVectors(markdown).entries()) {
      vectorDocs.push({
        id: `paper:${doc.pmcid}:${index + 1}`,
        domain: doc.domain,
        source: doc.source,
        text: chunk,
        title: doc.title,
        referenceUrl: doc.referenceUrl,
        pdfUrl: doc.pdfUrl,
        authors: doc.authors,
        year: doc.year,
        category: doc.category,
        corpus: 'paper-corpus',
      });
    }
  }

  const expectedMarkdownFiles = new Set(processedDocs.map((doc) => doc.file));
  await cleanupStaleFiles(expectedMarkdownFiles, expectedPdfFiles);

  const catalogPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'Europe PMC open-access PDF corpus',
    documents: processedDocs,
  };
  await fs.writeFile(catalogPath, `${JSON.stringify(catalogPayload, null, 2)}\n`, 'utf8');

  await execFileAsync('node', ['scripts/generate-knowledge-manifest.mjs'], {
    cwd: serverRoot,
    maxBuffer: 8 * 1024 * 1024,
  });

  const localVectorCount = await writeLocalVectorIndex(vectorDocs);
  const shouldVectorize = !noVectors && Boolean(process.env.OPENROUTER_API_KEY);
  if (shouldVectorize) {
    const deleted = await VectorService.deleteKnowledgeDocuments({ corpus: 'paper-corpus' });
    const result = await VectorService.upsertKnowledgeDocuments(vectorDocs);
    console.log(`Chroma deleted: ${deleted}, upserted: ${result.upserted}, skipped: ${result.skipped}`);
  } else {
    console.log('Chroma upsert skipped: missing OpenRouter credentials or --no-vectors used.');
  }

  console.log(`Local semantic index chunks: ${localVectorCount}`);
  console.log(`Paper corpus refreshed with ${processedDocs.length} documents.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
