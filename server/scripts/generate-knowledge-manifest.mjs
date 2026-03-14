#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const knowledgeDir = path.join(serverRoot, 'src', 'knowledge');
const manifestPath = path.join(knowledgeDir, 'manifest.json');
const paperCatalogPath = path.join(knowledgeDir, 'papers', 'catalog.json');

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function inferDomain(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.includes('nutrition') || lower.includes('diet') || lower.includes('food')) {
    return 'nutrition';
  }
  return 'fitness';
}

function normalizeRelativePath(filePath) {
  const normalized = String(filePath || '').trim().replace(/\\/g, '/');
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

function sourceFromFile(fileName) {
  return String(fileName || '')
    .replace(/\.md$/i, '')
    .replace(/[\\/]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);
}

function walkMarkdownFiles(rootDir, currentDir = rootDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(rootDir, fullPath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const relativePath = normalizeRelativePath(path.relative(rootDir, fullPath));
    if (relativePath) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function loadPaperCatalog() {
  if (!fs.existsSync(paperCatalogPath)) {
    return new Map();
  }

  try {
    const raw = fs.readFileSync(paperCatalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const docs = Array.isArray(parsed?.documents) ? parsed.documents : [];
    const map = new Map();
    for (const doc of docs) {
      const file = normalizeRelativePath(doc?.file);
      if (!file) continue;
      map.set(file, doc);
    }
    return map;
  } catch {
    return new Map();
  }
}

function main() {
  if (!fs.existsSync(knowledgeDir)) {
    throw new Error(`Knowledge directory not found: ${knowledgeDir}`);
  }

  const paperCatalog = loadPaperCatalog();
  const documents = walkMarkdownFiles(knowledgeDir)
    .sort()
    .map((file) => {
      const fullPath = path.join(knowledgeDir, file);
      const catalogDoc = paperCatalog.get(file) || {};
      return {
        file,
        sha256: sha256File(fullPath),
        source: String(catalogDoc.source || sourceFromFile(file)).slice(0, 180),
        domain: catalogDoc.domain === 'nutrition' ? 'nutrition' : catalogDoc.domain === 'fitness' ? 'fitness' : inferDomain(file),
        approved: true,
        title: typeof catalogDoc.title === 'string' ? catalogDoc.title.slice(0, 300) : undefined,
        authors: typeof catalogDoc.authors === 'string' ? catalogDoc.authors.slice(0, 300) : undefined,
        year: typeof catalogDoc.year === 'string' ? catalogDoc.year.slice(0, 16) : undefined,
        category: typeof catalogDoc.category === 'string' ? catalogDoc.category.slice(0, 80) : undefined,
        referenceUrl: typeof catalogDoc.referenceUrl === 'string' ? catalogDoc.referenceUrl.slice(0, 500) : undefined,
        pdfUrl: typeof catalogDoc.pdfUrl === 'string' ? catalogDoc.pdfUrl.slice(0, 500) : undefined,
      };
    });

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    documents,
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote knowledge manifest: ${manifestPath}`);
  console.log(`Documents: ${documents.length}`);
}

main();
