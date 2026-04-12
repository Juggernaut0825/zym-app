import fs from 'fs/promises';
import path from 'path';

interface ManifestDocument {
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

interface ManifestPayload {
  version?: number;
  generatedAt?: string;
  documents?: ManifestDocument[];
}

interface EuropePmcResult {
  pmid?: string;
  pmcid?: string;
  title?: string;
  journalTitle?: string;
  pubYear?: string;
  authorString?: string;
}

interface AbstractSection {
  label: string;
  text: string;
}

const serverRoot = path.resolve(process.cwd());
const knowledgeRoot = path.join(serverRoot, 'src', 'knowledge');
const manifestPath = path.join(knowledgeRoot, 'manifest.json');
const catalogPath = path.join(knowledgeRoot, 'papers', 'catalog.json');

const overwrite = process.argv.includes('--overwrite');
const quiet = process.argv.includes('--quiet');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  if (!quiet) {
    console.log(message);
  }
}

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripTags(value: string): string {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeXmlEntities(value: string): string {
  return String(value || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanXmlText(value: string): string {
  return normalizeWhitespace(decodeXmlEntities(stripTags(value)));
}

function extractPmcId(doc: ManifestDocument): string {
  const candidates = [doc.referenceUrl, doc.pdfUrl, doc.file];
  for (const candidate of candidates) {
    const match = String(candidate || '').match(/PMC(\d{5,10})/i);
    if (match?.[1]) {
      return `PMC${match[1]}`;
    }
  }
  return '';
}

function keywordLine(doc: ManifestDocument): string {
  const parts = [
    doc.domain || '',
    doc.category || '',
    doc.title || '',
    doc.source || '',
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/-/g, ' ');

  const unique = Array.from(new Set(parts.split(/\s+/g).filter((item) => item.length > 2)));
  return unique.slice(0, 24).join(', ');
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'zym-knowledge-materializer/1.0',
    },
  });
  if (!response.ok) {
    return null;
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'zym-knowledge-materializer/1.0',
    },
  });
  if (!response.ok) {
    return '';
  }
  return response.text();
}

async function lookupEuropePmc(pmcid: string): Promise<EuropePmcResult | null> {
  if (!pmcid) {
    return null;
  }
  const encoded = encodeURIComponent(`PMCID:${pmcid}`);
  const payload = await fetchJson<{ resultList?: { result?: EuropePmcResult[] } }>(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encoded}&format=json&pageSize=1`,
  );
  return payload?.resultList?.result?.[0] || null;
}

function parseAbstractSections(xml: string): AbstractSection[] {
  const matches = Array.from(xml.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/g));
  const sections = matches
    .map((match) => {
      const attrs = String(match[1] || '');
      const text = cleanXmlText(match[2] || '');
      const labelMatch = attrs.match(/\bLabel="([^"]+)"/i);
      return {
        label: cleanXmlText(labelMatch?.[1] || '') || 'Abstract',
        text,
      };
    })
    .filter((item) => item.text.length > 0);

  if (sections.length > 0) {
    return sections;
  }

  const fallback = cleanXmlText(
    xml
      .replace(/^[\s\S]*?<Abstract>/i, '')
      .replace(/<\/Abstract>[\s\S]*$/i, ''),
  );
  return fallback ? [{ label: 'Abstract', text: fallback }] : [];
}

async function fetchPubMedAbstract(pmid: string): Promise<AbstractSection[]> {
  if (!pmid) {
    return [];
  }
  const xml = await fetchText(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=xml`,
  );
  if (!xml) {
    return [];
  }
  return parseAbstractSections(xml);
}

function buildMarkdown(doc: ManifestDocument, meta: EuropePmcResult | null, sections: AbstractSection[], pmcid: string): string {
  const title = normalizeWhitespace(String(doc.title || meta?.title || doc.file || 'Knowledge paper'));
  const authors = normalizeWhitespace(String(doc.authors || meta?.authorString || ''));
  const year = normalizeWhitespace(String(doc.year || meta?.pubYear || ''));
  const journal = normalizeWhitespace(String(meta?.journalTitle || ''));
  const pmid = normalizeWhitespace(String(meta?.pmid || ''));
  const category = normalizeWhitespace(String(doc.category || ''));
  const domain = doc.domain === 'nutrition' ? 'nutrition' : 'fitness';
  const referenceUrl = normalizeWhitespace(String(doc.referenceUrl || ''));
  const pdfUrl = normalizeWhitespace(String(doc.pdfUrl || ''));
  const keywords = keywordLine(doc);

  const lines: string[] = [
    `# ${title}`,
    '',
  ];

  if (authors) lines.push(`- Authors: ${authors}`);
  if (journal) lines.push(`- Journal: ${journal}`);
  if (year) lines.push(`- Year: ${year}`);
  if (pmid) lines.push(`- PMID: ${pmid}`);
  if (pmcid) lines.push(`- PMCID: ${pmcid}`);
  if (category) lines.push(`- Category: ${category}`);
  lines.push(`- Domain: ${domain}`);
  if (referenceUrl) lines.push(`- Reference URL: ${referenceUrl}`);
  if (pdfUrl) lines.push(`- PDF URL: ${pdfUrl}`);
  if (keywords) lines.push(`- Retrieval tags: ${keywords}`);
  lines.push('');
  lines.push('## Evidence summary');

  if (sections.length > 0) {
    lines.push('');
    sections.forEach((section) => {
      if (section.label && section.label !== 'Abstract') {
        lines.push(`### ${section.label}`);
        lines.push('');
      }
      lines.push(section.text);
      lines.push('');
    });
  } else {
    lines.push('');
    lines.push('The linked source was cataloged for this topic, but an abstract was not retrieved automatically during materialization. Use the reference and PDF URLs for the full paper when grounding an answer.');
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main(): Promise<void> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as ManifestPayload;
  const docs = Array.isArray(manifest.documents) ? manifest.documents : [];

  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    documents: docs
      .filter((doc) => String(doc.file || '').trim())
      .map((doc) => ({
        file: doc.file,
        source: doc.source,
        domain: doc.domain,
        approved: doc.approved !== false,
        title: doc.title,
        referenceUrl: doc.referenceUrl,
        pdfUrl: doc.pdfUrl,
        authors: doc.authors,
        year: doc.year,
        category: doc.category,
      })),
  };
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  let created = 0;
  let skipped = 0;

  for (const doc of docs) {
    const relativeFile = String(doc.file || '').trim();
    if (!relativeFile || doc.approved === false || !relativeFile.endsWith('.md') || !relativeFile.startsWith('papers/')) {
      continue;
    }

    const targetPath = path.join(knowledgeRoot, relativeFile);
    const exists = await fs.access(targetPath).then(() => true).catch(() => false);
    if (exists && !overwrite) {
      skipped += 1;
      continue;
    }

    const pmcid = extractPmcId(doc);
    const meta = await lookupEuropePmc(pmcid);
    const sections = meta?.pmid ? await fetchPubMedAbstract(meta.pmid) : [];
    const markdown = buildMarkdown(doc, meta, sections, pmcid);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, markdown, 'utf8');
    created += 1;
    log(`materialized ${relativeFile}`);
    await sleep(250);
  }

  console.log(JSON.stringify({
    catalogPath: path.relative(serverRoot, catalogPath),
    created,
    skipped,
    documentsInCatalog: catalog.documents.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
