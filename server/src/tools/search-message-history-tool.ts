import fs from 'fs/promises';
import { CompactMessage, Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

interface SearchableTranscriptEntry extends CompactMessage {}

function tokenize(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function scoreEntry(entry: SearchableTranscriptEntry, queryTokens: string[]): number {
  const haystack = `${entry.role} ${entry.toolName || ''} ${entry.text} ${(entry.mediaIds || []).join(' ')}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += haystack.includes(` ${token} `) ? 3 : 1;
    }
  }
  return score;
}

async function loadTranscriptEntries(context: ToolExecutionContext): Promise<SearchableTranscriptEntry[]> {
  const transcriptPath = String(context.contextDirectory || '').trim()
    ? `${String(context.contextDirectory).trim()}/transcript.ndjson`
    : '';

  if (!transcriptPath) {
    return [];
  }

  try {
    const raw = await fs.readFile(transcriptPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SearchableTranscriptEntry)
      .filter((item) => typeof item?.text === 'string' && typeof item?.role === 'string');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export class SearchMessageHistoryTool implements Tool {
  definition: ToolDefinition = {
    name: 'search_message_history',
    description: 'Search the long-term coach transcript for relevant prior discussion snippets and linked media IDs.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords or short natural-language search query for prior discussion.',
          minLength: 2,
          maxLength: 300,
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of transcript matches to return.',
          minimum: 1,
          maximum: 12,
        },
        roles: {
          type: 'array',
          description: 'Optional role filter. Supported roles: user, assistant, tool.',
        },
        includeToolMessages: {
          type: 'boolean',
          description: 'Whether to include tool transcript summaries in the results.',
        },
      },
      required: ['query'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    requireUserId(context);
    const limit = Math.max(1, Math.min(12, Number(args?.limit) || 5));
    const requestedRoles = Array.isArray(args?.roles)
      ? args.roles.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const includeToolMessages = args?.includeToolMessages !== false;
    const query = String(args?.query || '').trim();
    const queryTokens = tokenize(query);

    const entries = await loadTranscriptEntries(context);
    const filtered = entries
      .filter((entry) => includeToolMessages || entry.role !== 'tool')
      .filter((entry) => requestedRoles.length === 0 || requestedRoles.includes(entry.role))
      .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.entry.createdAt).localeCompare(String(a.entry.createdAt));
      })
      .slice(0, limit);

    return toJson({
      query,
      totalMatches: filtered.length,
      matches: filtered.map(({ entry, score }) => ({
        id: entry.id,
        role: entry.role,
        createdAt: entry.createdAt,
        text: entry.text,
        mediaIds: Array.isArray(entry.mediaIds) ? entry.mediaIds : [],
        toolName: entry.toolName || null,
        relevanceScore: score,
      })),
    });
  }
}
