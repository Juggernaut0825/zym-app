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

function sourceFromFile(fileName) {
  return String(fileName || '')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);
}

function main() {
  if (!fs.existsSync(knowledgeDir)) {
    throw new Error(`Knowledge directory not found: ${knowledgeDir}`);
  }

  const documents = fs.readdirSync(knowledgeDir)
    .filter((item) => item.endsWith('.md'))
    .sort()
    .map((file) => {
      const fullPath = path.join(knowledgeDir, file);
      return {
        file,
        sha256: sha256File(fullPath),
        source: sourceFromFile(file),
        domain: inferDomain(file),
        approved: true,
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

