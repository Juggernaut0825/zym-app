import { getDB } from '../database/runtime-db.js';

export interface OpenRouterUsageContext {
  source: string;
  requestKind?: 'chat' | 'embeddings';
  userId?: number | null;
  topic?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
}

interface OpenRouterUsageRecord extends OpenRouterUsageContext {
  providerName?: string | null;
  generationId?: string | null;
  status?: 'success' | 'error';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
}

function safeString(value: unknown, maxLength = 240): string {
  return String(value || '').trim().slice(0, maxLength);
}

function toInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  try {
    const raw = JSON.stringify(metadata);
    return raw.length > 4000 ? `${raw.slice(0, 3997)}...` : raw;
  } catch {
    return null;
  }
}

function extractUsageNumbers(payload: any): {
  model: string | null;
  providerName: string | null;
  generationId: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
} {
  const root = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  const usage = payload?.usage && typeof payload.usage === 'object'
    ? payload.usage
    : (root?.usage && typeof root.usage === 'object' ? root.usage : {});
  const promptTokens = toInteger(
    usage?.prompt_tokens
      ?? root?.tokens_prompt
      ?? root?.native_tokens_prompt
      ?? payload?.prompt_tokens,
  );
  const completionTokens = toInteger(
    usage?.completion_tokens
      ?? root?.tokens_completion
      ?? root?.native_tokens_completion
      ?? payload?.completion_tokens,
  );
  const totalTokens = toInteger(
    usage?.total_tokens
      ?? root?.total_tokens
      ?? (promptTokens + completionTokens),
  );

  return {
    model: safeString(root?.model || payload?.model || '', 160) || null,
    providerName: safeString(root?.provider_name || payload?.provider_name || '', 160) || null,
    generationId: safeString(root?.id || payload?.id || '', 160) || null,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: toNullableNumber(
      usage?.cost
        ?? root?.total_cost
        ?? payload?.total_cost,
    ),
  };
}

export class OpenRouterUsageService {
  static record(record: OpenRouterUsageRecord): void {
    try {
      const db = getDB();
      db.prepare(`
        INSERT INTO openrouter_usage_events (
          user_id,
          source,
          request_kind,
          topic,
          model,
          provider_name,
          generation_id,
          status,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          estimated_cost_usd,
          latency_ms,
          error_message,
          metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number.isInteger(Number(record.userId)) && Number(record.userId) > 0 ? Number(record.userId) : null,
        safeString(record.source, 120) || 'unknown',
        record.requestKind === 'embeddings' ? 'embeddings' : 'chat',
        safeString(record.topic || '', 160) || null,
        safeString(record.model || '', 160) || null,
        safeString(record.providerName || '', 160) || null,
        safeString(record.generationId || '', 160) || null,
        record.status === 'error' ? 'error' : 'success',
        toInteger(record.promptTokens),
        toInteger(record.completionTokens),
        toInteger(record.totalTokens),
        toNullableNumber(record.estimatedCostUsd),
        toNullableNumber(record.latencyMs),
        safeString(record.errorMessage || '', 500) || null,
        safeMetadata(record.metadata),
      );
    } catch {
      // Never block product flows on telemetry.
    }
  }

  static recordSuccessFromPayload(payload: any, context: OpenRouterUsageContext, startedAtMs?: number): void {
    const parsed = extractUsageNumbers(payload);
    this.record({
      ...context,
      model: context.model || parsed.model,
      providerName: parsed.providerName,
      generationId: parsed.generationId,
      status: 'success',
      promptTokens: parsed.promptTokens,
      completionTokens: parsed.completionTokens,
      totalTokens: parsed.totalTokens,
      estimatedCostUsd: parsed.estimatedCostUsd,
      latencyMs: Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - Number(startedAtMs)) : null,
      metadata: context.metadata,
    });
  }

  static recordFailure(error: unknown, context: OpenRouterUsageContext, startedAtMs?: number): void {
    this.record({
      ...context,
      status: 'error',
      latencyMs: Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - Number(startedAtMs)) : null,
      errorMessage: error instanceof Error ? error.message : String(error || 'OpenRouter request failed'),
      metadata: context.metadata,
    });
  }

  static summarizeLocal() {
    const db = getDB();
    const totals = db.prepare(`
      SELECT
        COUNT(1) AS request_count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
        SUM(prompt_tokens) AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
        MAX(created_at) AS last_request_at
      FROM openrouter_usage_events
    `).get() as Record<string, unknown> | undefined;

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const recent = db.prepare(`
      SELECT
        COUNT(1) AS request_count,
        SUM(prompt_tokens) AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd
      FROM openrouter_usage_events
      WHERE created_at >= ?
    `).get(last24h) as Record<string, unknown> | undefined;

    const bySource = db.prepare(`
      SELECT
        source,
        COUNT(1) AS request_count,
        SUM(total_tokens) AS total_tokens,
        SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
        MAX(created_at) AS last_request_at
      FROM openrouter_usage_events
      GROUP BY source
      ORDER BY request_count DESC, total_tokens DESC
      LIMIT 12
    `).all();

    const byModel = db.prepare(`
      SELECT
        COALESCE(model, 'unknown') AS model,
        COUNT(1) AS request_count,
        SUM(total_tokens) AS total_tokens,
        SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
        MAX(created_at) AS last_request_at
      FROM openrouter_usage_events
      GROUP BY COALESCE(model, 'unknown')
      ORDER BY request_count DESC, total_tokens DESC
      LIMIT 12
    `).all();

    return {
      totals: {
        requestCount: toInteger(totals?.request_count),
        successCount: toInteger(totals?.success_count),
        promptTokens: toInteger(totals?.prompt_tokens),
        completionTokens: toInteger(totals?.completion_tokens),
        totalTokens: toInteger(totals?.total_tokens),
        estimatedCostUsd: Number(toNullableNumber(totals?.estimated_cost_usd) || 0),
        lastRequestAt: safeString(totals?.last_request_at || '', 80) || null,
      },
      last24h: {
        requestCount: toInteger(recent?.request_count),
        promptTokens: toInteger(recent?.prompt_tokens),
        completionTokens: toInteger(recent?.completion_tokens),
        totalTokens: toInteger(recent?.total_tokens),
        estimatedCostUsd: Number(toNullableNumber(recent?.estimated_cost_usd) || 0),
      },
      bySource: (Array.isArray(bySource) ? bySource : []).map((row: any) => ({
        source: safeString(row?.source, 120) || 'unknown',
        requestCount: toInteger(row?.request_count),
        totalTokens: toInteger(row?.total_tokens),
        estimatedCostUsd: Number(toNullableNumber(row?.estimated_cost_usd) || 0),
        lastRequestAt: safeString(row?.last_request_at, 80) || null,
      })),
      byModel: (Array.isArray(byModel) ? byModel : []).map((row: any) => ({
        model: safeString(row?.model, 160) || 'unknown',
        requestCount: toInteger(row?.request_count),
        totalTokens: toInteger(row?.total_tokens),
        estimatedCostUsd: Number(toNullableNumber(row?.estimated_cost_usd) || 0),
        lastRequestAt: safeString(row?.last_request_at, 80) || null,
      })),
    };
  }

  static async fetchLiveSummary(): Promise<Record<string, unknown>> {
    const token = safeString(process.env.OPENROUTER_MANAGEMENT_KEY || process.env.OPENROUTER_API_KEY || '', 500);
    if (!token) {
      return {
        configured: false,
        error: 'No OpenRouter management or API key is configured on the server.',
      };
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://app.zym8.com',
      'X-Title': 'ZYM Admin Dashboard',
    };

    const fetchJson = async (url: string) => {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      const payload = await response.json().catch(() => ({} as any));
      return { ok: response.ok, status: response.status, payload };
    };

    try {
      const [keyInfo, creditsInfo] = await Promise.all([
        fetchJson('https://openrouter.ai/api/v1/key'),
        fetchJson('https://openrouter.ai/api/v1/credits'),
      ]);

      return {
        configured: true,
        key: keyInfo.ok ? keyInfo.payload : null,
        credits: creditsInfo.ok ? creditsInfo.payload : null,
        warnings: [
          !keyInfo.ok ? `key endpoint returned ${keyInfo.status}` : '',
          !creditsInfo.ok ? `credits endpoint returned ${creditsInfo.status}` : '',
        ].filter(Boolean),
      };
    } catch (error: any) {
      return {
        configured: true,
        error: String(error?.message || error || 'Failed to reach OpenRouter live usage endpoints.'),
      };
    }
  }
}
