import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDB } from '../database/runtime-db.js';
import { knowledgeService } from './knowledge-service.js';
import { SecurityEventService } from './security-event-service.js';
import { VectorService } from './vector-service.js';

type KnowledgeDomain = 'fitness' | 'nutrition';
type IngestionStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';
type RiskLevel = 'low' | 'medium' | 'high';

interface IngestionRiskAssessment {
  riskLevel: RiskLevel;
  riskFlags: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDomain(raw: unknown): KnowledgeDomain {
  const value = String(raw || '').trim().toLowerCase();
  return value === 'nutrition' ? 'nutrition' : 'fitness';
}

function safeString(value: unknown, maxLength = 400): string {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeMultiline(value: unknown, maxLength = 240_000): string {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function sha256Text(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 72) || 'document';
}

function chunkText(input: string, maxChunkLength = 900): string[] {
  const paragraphs = String(input || '')
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 30);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkLength) {
      chunks.push(paragraph);
      continue;
    }
    for (let idx = 0; idx < paragraph.length; idx += maxChunkLength) {
      const part = paragraph.slice(idx, idx + maxChunkLength).trim();
      if (part.length >= 30) chunks.push(part);
      if (chunks.length >= 80) break;
    }
    if (chunks.length >= 80) break;
  }
  return chunks.slice(0, 80);
}

function parseAdminIds(): Set<number> {
  const configured = String(process.env.KNOWLEDGE_ADMIN_IDS || '').trim();
  const ids = new Set<number>();
  if (configured) {
    for (const token of configured.split(',')) {
      const parsed = Number(token.trim());
      if (Number.isInteger(parsed) && parsed > 0) ids.add(parsed);
    }
  }
  if (ids.size === 0) {
    ids.add(1);
  }
  return ids;
}

const KNOWLEDGE_ADMIN_IDS = parseAdminIds();

function assessContentRisk(content: string): IngestionRiskAssessment {
  const text = String(content || '').toLowerCase();
  const flags: string[] = [];
  const patterns: Array<[string, RegExp]> = [
    ['prompt_injection_phrase', /ignore\s+previous\s+instruction/gi],
    ['system_prompt_probe', /reveal\s+system\s+prompt/gi],
    ['tool_policy_override', /disable\s+tool\s+(?:checks|policy)/gi],
    ['credential_probe', /(api[_\s-]?key|access[_\s-]?token|password)\s*[:=]/gi],
    ['shell_execution_hint', /\bbash\s+scripts\/|rm\s+-rf|curl\s+http/gi],
  ];
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) flags.push(label);
  }
  if (content.length > 120_000) {
    flags.push('oversized_document');
  }
  const riskLevel: RiskLevel = flags.length >= 2 ? 'high' : flags.length === 1 ? 'medium' : 'low';
  return { riskLevel, riskFlags: flags };
}

function recordSecurityEvent(eventType: string, severity: 'info' | 'warn' | 'high', metadata: Record<string, unknown>) {
  try {
    SecurityEventService.create({ eventType, severity, metadata });
  } catch {
    // Never block ingestion flow due to telemetry failure.
  }
}

export class KnowledgeIngestionService {
  private knowledgeDir = path.join(process.cwd(), 'src', 'knowledge');
  private manifestPath = path.join(this.knowledgeDir, 'manifest.json');

  isAdmin(userId: number): boolean {
    return KNOWLEDGE_ADMIN_IDS.has(userId);
  }

  requestIngestion(input: {
    requesterUserId: number;
    source: string;
    domain: KnowledgeDomain;
    title?: string;
    content: string;
  }): { requestId: number; riskLevel: RiskLevel; riskFlags: string[] } {
    const requesterUserId = Number(input.requesterUserId);
    if (!Number.isInteger(requesterUserId) || requesterUserId <= 0) {
      throw new Error('Invalid requesterUserId');
    }
    const source = safeString(input.source, 180);
    const title = safeString(input.title || '', 140);
    const domain = normalizeDomain(input.domain);
    const content = safeMultiline(input.content, 240_000);

    if (!source) throw new Error('source is required');
    if (content.length < 120) throw new Error('content is too short');

    const risk = assessContentRisk(content);
    const contentSha = sha256Text(content);

    const result = getDB()
      .prepare(`
        INSERT INTO knowledge_ingestion_requests (
          requester_user_id,
          source,
          domain,
          title,
          content,
          content_sha256,
          status,
          risk_level,
          risk_flags
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .run(
        requesterUserId,
        source,
        domain,
        title || null,
        content,
        contentSha,
        risk.riskLevel,
        JSON.stringify(risk.riskFlags),
      );

    const requestId = Number(result.lastInsertRowid || 0);
    this.writeAudit(requestId, requesterUserId, 'requested', {
      source,
      domain,
      contentSha,
      riskLevel: risk.riskLevel,
      riskFlags: risk.riskFlags,
    });

    if (risk.riskLevel !== 'low') {
      recordSecurityEvent('knowledge_ingestion_risk_detected', 'warn', {
        requesterUserId,
        requestId,
        source,
        riskLevel: risk.riskLevel,
        riskFlags: risk.riskFlags,
      });
    }

    return {
      requestId,
      riskLevel: risk.riskLevel,
      riskFlags: risk.riskFlags,
    };
  }

  listRequests(actorUserId: number): Array<Record<string, unknown>> {
    const userId = Number(actorUserId);
    if (!Number.isInteger(userId) || userId <= 0) throw new Error('Invalid user id');
    const admin = this.isAdmin(userId);

    const rows = admin
      ? getDB()
          .prepare(`
            SELECT id, requester_user_id, source, domain, title, content_sha256, status, risk_level, risk_flags, reviewed_by_user_id, review_notes, reviewed_at, applied_at, created_at
            FROM knowledge_ingestion_requests
            ORDER BY datetime(created_at) DESC
            LIMIT 200
          `)
          .all()
      : getDB()
          .prepare(`
            SELECT id, requester_user_id, source, domain, title, content_sha256, status, risk_level, risk_flags, reviewed_by_user_id, review_notes, reviewed_at, applied_at, created_at
            FROM knowledge_ingestion_requests
            WHERE requester_user_id = ?
            ORDER BY datetime(created_at) DESC
            LIMIT 200
          `)
          .all(userId);

    return (rows as any[]).map((row) => ({
      id: Number(row.id),
      requesterUserId: Number(row.requester_user_id),
      source: row.source,
      domain: row.domain,
      title: row.title,
      contentSha256: row.content_sha256,
      status: row.status,
      riskLevel: row.risk_level,
      riskFlags: this.tryParseJsonArray(row.risk_flags),
      reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
      reviewNotes: row.review_notes,
      reviewedAt: row.reviewed_at,
      appliedAt: row.applied_at,
      createdAt: row.created_at,
    }));
  }

  reviewRequest(input: {
    actorUserId: number;
    requestId: number;
    action: 'approve' | 'reject';
    notes?: string;
  }): { requestId: number; status: IngestionStatus } {
    const actorUserId = Number(input.actorUserId);
    if (!this.isAdmin(actorUserId)) {
      throw new Error('Only knowledge admins can review ingestion requests');
    }
    const requestId = Number(input.requestId);
    if (!Number.isInteger(requestId) || requestId <= 0) throw new Error('Invalid requestId');
    const action = input.action === 'reject' ? 'reject' : 'approve';
    const notes = safeString(input.notes || '', 500);
    const status: IngestionStatus = action === 'approve' ? 'approved' : 'rejected';

    const row = getDB()
      .prepare('SELECT id, status FROM knowledge_ingestion_requests WHERE id = ?')
      .get(requestId) as { id?: number; status?: string } | undefined;
    if (!row?.id) throw new Error('Ingestion request not found');
    if (String(row.status) !== 'pending' && String(row.status) !== 'approved' && String(row.status) !== 'rejected') {
      throw new Error('Request can no longer be reviewed');
    }

    getDB()
      .prepare(`
        UPDATE knowledge_ingestion_requests
        SET status = ?, reviewed_by_user_id = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(status, actorUserId, notes || null, requestId);

    this.writeAudit(requestId, actorUserId, `review_${status}`, {
      notes,
    });

    return { requestId, status };
  }

  async applyApprovedRequest(input: {
    actorUserId: number;
    requestId: number;
  }): Promise<{ requestId: number; file: string; sha256: string; vectorUpserted: number }> {
    const actorUserId = Number(input.actorUserId);
    if (!this.isAdmin(actorUserId)) {
      throw new Error('Only knowledge admins can apply ingestion requests');
    }
    const requestId = Number(input.requestId);
    if (!Number.isInteger(requestId) || requestId <= 0) throw new Error('Invalid requestId');

    const row = getDB()
      .prepare(`
        SELECT id, requester_user_id, source, domain, title, content, content_sha256, status, risk_level, risk_flags
        FROM knowledge_ingestion_requests
        WHERE id = ?
      `)
      .get(requestId) as any;
    if (!row?.id) throw new Error('Ingestion request not found');
    if (String(row.status) !== 'approved') {
      throw new Error('Request must be approved before apply');
    }

    const content = safeMultiline(row.content, 240_000);
    const recomputedSha = sha256Text(content);
    if (recomputedSha !== String(row.content_sha256 || '').toLowerCase()) {
      throw new Error('Request content hash mismatch; ingestion aborted');
    }

    fs.mkdirSync(this.knowledgeDir, { recursive: true });
    const titleOrSource = safeString(row.title || row.source, 120);
    const file = `ingested_${requestId}_${slugify(titleOrSource)}.md`;
    const filePath = path.join(this.knowledgeDir, file);
    fs.writeFileSync(filePath, content, 'utf8');
    this.upsertManifestDocument({
      file,
      sha256: recomputedSha,
      source: safeString(row.source, 180),
      domain: normalizeDomain(row.domain),
      approved: true,
    });

    let vectorUpserted = 0;
    try {
      const chunks = chunkText(content);
      if (chunks.length > 0) {
        const payload = chunks.map((chunk, index) => ({
          id: `ingested:${requestId}:${index + 1}`,
          domain: normalizeDomain(row.domain),
          source: safeString(row.source, 180),
          text: chunk,
        }));
        const vectorResult = await VectorService.upsertKnowledgeDocuments(payload);
        vectorUpserted = vectorResult.upserted;
      }
    } catch {
      vectorUpserted = 0;
    }

    getDB()
      .prepare(`
        UPDATE knowledge_ingestion_requests
        SET status = 'applied', applied_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(requestId);
    this.writeAudit(requestId, actorUserId, 'applied', {
      file,
      sha256: recomputedSha,
      vectorUpserted,
    });

    knowledgeService.reload();
    recordSecurityEvent('knowledge_ingestion_applied', 'info', {
      requestId,
      actorUserId,
      file,
      vectorUpserted,
    });

    return {
      requestId,
      file,
      sha256: recomputedSha,
      vectorUpserted,
    };
  }

  private writeAudit(requestId: number, actorUserId: number | null, action: string, metadata: Record<string, unknown>) {
    getDB()
      .prepare(`
        INSERT INTO knowledge_ingestion_audit (request_id, actor_user_id, action, metadata)
        VALUES (?, ?, ?, ?)
      `)
      .run(requestId, actorUserId, safeString(action, 80), JSON.stringify(metadata || {}));
  }

  private tryParseJsonArray(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => safeString(item, 120)).filter(Boolean);
    } catch {
      return [];
    }
  }

  private upsertManifestDocument(document: {
    file: string;
    sha256: string;
    source: string;
    domain: KnowledgeDomain;
    approved: boolean;
  }) {
    const fallback = { version: 1, generatedAt: nowIso(), documents: [] as any[] };
    const manifest = (() => {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Number(parsed?.version) !== 1 || !Array.isArray(parsed?.documents)) {
          return fallback;
        }
        return parsed;
      } catch {
        return fallback;
      }
    })();

    const nextDocuments = (manifest.documents as any[]).filter((item) => safeString(item?.file, 180) !== document.file);
    nextDocuments.push({
      file: document.file,
      sha256: document.sha256,
      source: document.source,
      domain: document.domain,
      approved: document.approved,
    });
    const nextManifest = {
      version: 1,
      generatedAt: nowIso(),
      documents: nextDocuments,
    };
    fs.writeFileSync(this.manifestPath, JSON.stringify(nextManifest, null, 2), 'utf8');
  }
}

export const knowledgeIngestionService = new KnowledgeIngestionService();
