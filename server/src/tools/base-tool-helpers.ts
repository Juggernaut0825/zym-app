import fs from 'fs/promises';
import path from 'path';
import { MediaAnalysis, ToolExecutionContext } from '../types/index.js';

export function requireUserId(context: ToolExecutionContext): string {
  const userId = String(context.userId || '').trim();
  if (!/^\d+$/.test(userId)) {
    throw new Error('Missing authenticated user context for tool execution');
  }
  return userId;
}

export function toJson(output: unknown): string {
  return JSON.stringify(output, null, 2);
}

export function getUserDataDir(context: ToolExecutionContext): string {
  const dir = String(context.dataDirectory || context.workingDirectory || '').trim();
  if (!dir) {
    throw new Error('Missing user data directory for tool execution');
  }
  return dir;
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function summarizeMediaAnalysis(analysis: MediaAnalysis): Record<string, unknown> {
  return {
    id: analysis.id,
    mediaId: analysis.mediaId,
    domain: analysis.domain,
    kind: analysis.kind,
    question: analysis.question || '',
    confidence: analysis.confidence,
    answerSummary: analysis.answerSummary,
    needsConfirmation: analysis.needsConfirmation,
    createdAt: analysis.createdAt,
    evidence: Array.isArray(analysis.evidence)
      ? analysis.evidence.slice(0, 4).map((item) => ({
          label: item.label,
          observation: item.observation,
          confidence: item.confidence,
        }))
      : [],
    ambiguities: Array.isArray(analysis.ambiguities) ? analysis.ambiguities.slice(0, 4) : [],
  };
}
