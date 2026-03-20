import fs from 'fs/promises';
import path from 'path';
import { LoadedSkill } from '../types/index.js';

function parseArrayValue(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseScalarValue(raw: string): string | number | boolean {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = frontmatter.split(/\r?\n/);
  let activeArrayKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && activeArrayKey) {
      const current = Array.isArray(result[activeArrayKey]) ? result[activeArrayKey] as string[] : [];
      current.push(arrayMatch[1].trim());
      result[activeArrayKey] = current;
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kvMatch) {
      activeArrayKey = null;
      continue;
    }

    const [, key, rawValue] = kvMatch;
    if (!rawValue.trim()) {
      result[key] = [];
      activeArrayKey = key;
      continue;
    }

    activeArrayKey = null;
    if (rawValue.includes(',')) {
      result[key] = parseArrayValue(rawValue);
    } else {
      result[key] = parseScalarValue(rawValue);
    }
  }

  return result;
}

function splitFrontmatter(markdown: string): { attributes: Record<string, unknown>; body: string } {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: markdown.trim() };
  }

  return {
    attributes: parseFrontmatter(match[1]),
    body: match[2].trim(),
  };
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

export async function loadSkill(skillName: string): Promise<LoadedSkill> {
  const skillPath = path.join(process.cwd(), 'src', 'agent', 'skills', skillName, `${skillName}-skill.md`);
  const raw = await fs.readFile(skillPath, 'utf8');
  const { attributes, body } = splitFrontmatter(raw);

  return {
    name: String(attributes.name || skillName).trim() || skillName,
    description: String(attributes.description || '').trim(),
    prompt: body,
    toolPolicy: {
      allowedTools: normalizeStringArray(attributes.allowedTools),
      disallowedTools: normalizeStringArray(attributes.disallowedTools),
    },
    maxTurns: typeof attributes.maxTurns === 'number' ? attributes.maxTurns : undefined,
    filePath: skillPath,
  };
}
