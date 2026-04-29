import crypto from 'crypto';
import fs from 'fs';
import http2 from 'http2';
import { getDB } from '../database/runtime-db.js';
import { coachDisplayName, normalizeCoachId } from '../utils/coach-prefs.js';
import { logger } from '../utils/logger.js';

type PushEnvironment = 'sandbox' | 'production';
type CommunityPushSourceType = 'post_comment' | 'post_reaction';

interface MessagePushInput {
  actorUserId: number;
  recipientUserIds: number[];
  topic: string;
  messageId: number;
  snippet: string;
}

interface CommunityPushInput {
  actorUserId: number;
  recipientUserIds: number[];
  sourceType: CommunityPushSourceType;
  sourceId: number;
  postId: number;
  snippet?: string;
}

interface APNSConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
}

let cachedProviderToken: { token: string; issuedAt: number } | null = null;
let missingConfigWarningLogged = false;

function normalizeDeviceToken(value: unknown): string {
  return String(value || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function resolveEnvironment(value: unknown): PushEnvironment {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'sandbox' || normalized === 'development' ? 'sandbox' : 'production';
}

function uniqueRecipientIds(recipientUserIds: number[], excludedUserId?: number): number[] {
  const excluded = Number(excludedUserId || 0);
  return Array.from(new Set(recipientUserIds
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0 && item !== excluded)));
}

function apnsConfig(): APNSConfig | null {
  const keyId = String(process.env.APNS_KEY_ID || '').trim();
  const teamId = String(process.env.APNS_TEAM_ID || '').trim();
  const bundleId = String(process.env.APNS_BUNDLE_ID || process.env.IOS_BUNDLE_ID || 'com.zym8.app').trim();
  const inlineKey = String(process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const keyPath = String(process.env.APNS_PRIVATE_KEY_PATH || '').trim();
  const privateKey = inlineKey || (keyPath ? fs.readFileSync(keyPath, 'utf8') : '');

  if (!keyId || !teamId || !bundleId || !privateKey) {
    if (!missingConfigWarningLogged) {
      logger.warn('[push] APNs configuration is incomplete; remote iOS pushes are disabled.');
      missingConfigWarningLogged = true;
    }
    return null;
  }
  return { keyId, teamId, bundleId, privateKey };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function readAsn1Length(signature: Buffer, offset: number): { length: number; offset: number } {
  let length = signature[offset];
  offset += 1;
  if ((length & 0x80) === 0) return { length, offset };

  const bytes = length & 0x7f;
  length = 0;
  for (let index = 0; index < bytes; index += 1) {
    length = (length << 8) | signature[offset + index];
  }
  return { length, offset: offset + bytes };
}

function normalizeEcdsaPart(value: Buffer, size = 32): Buffer {
  let part = value;
  while (part.length > size && part[0] === 0) {
    part = part.subarray(1);
  }
  if (part.length > size) {
    part = part.subarray(part.length - size);
  }
  if (part.length === size) return part;
  return Buffer.concat([Buffer.alloc(size - part.length), part]);
}

function derToJose(signature: Buffer): string {
  let offset = 0;
  if (signature[offset] !== 0x30) {
    throw new Error('Invalid ECDSA signature.');
  }
  offset += 1;
  const sequence = readAsn1Length(signature, offset);
  offset = sequence.offset;
  if (signature[offset] !== 0x02) {
    throw new Error('Invalid ECDSA signature.');
  }
  offset += 1;
  const rLength = readAsn1Length(signature, offset);
  offset = rLength.offset;
  const r = signature.subarray(offset, offset + rLength.length);
  offset += rLength.length;
  if (signature[offset] !== 0x02) {
    throw new Error('Invalid ECDSA signature.');
  }
  offset += 1;
  const sLength = readAsn1Length(signature, offset);
  offset = sLength.offset;
  const s = signature.subarray(offset, offset + sLength.length);

  return Buffer.concat([normalizeEcdsaPart(r), normalizeEcdsaPart(s)]).toString('base64url');
}

function providerToken(config: APNSConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedProviderToken && now - cachedProviderToken.issuedAt < 45 * 60) {
    return cachedProviderToken.token;
  }

  const header = base64UrlJson({ alg: 'ES256', kid: config.keyId });
  const payload = base64UrlJson({ iss: config.teamId, iat: now });
  const signingInput = `${header}.${payload}`;
  const derSignature = crypto.createSign('SHA256').update(signingInput).sign(config.privateKey);
  const token = `${signingInput}.${derToJose(derSignature)}`;
  cachedProviderToken = { token, issuedAt: now };
  return token;
}

function actorDisplayName(actorUserId: number, topic?: string): string {
  if (Number(actorUserId) === 0) {
    const coachId = normalizeCoachId(String(topic || '').match(/^coach_(zj|lc)_/)?.[1]);
    return coachId ? coachDisplayName(coachId) : 'Coach';
  }

  const actor = getDB()
    .prepare(`
      SELECT COALESCE(NULLIF(TRIM(display_name), ''), username) AS display_name
      FROM users
      WHERE id = ?
    `)
    .get(actorUserId) as { display_name?: string } | undefined;
  return String(actor?.display_name || 'ZYM').slice(0, 120);
}

function tokensForRecipients(recipientUserIds: number[]): Array<{ device_token: string; environment: string }> {
  if (recipientUserIds.length === 0) return [];
  const placeholders = recipientUserIds.map(() => '?').join(',');
  return getDB().prepare(`
    SELECT device_token, environment
    FROM push_device_tokens
    WHERE platform = 'ios' AND user_id IN (${placeholders})
    ORDER BY datetime(last_seen_at) DESC
  `).all(...recipientUserIds) as Array<{ device_token: string; environment: string }>;
}

function postPushAllowedRecipientIds(recipientUserIds: number[]): number[] {
  if (recipientUserIds.length === 0) return [];
  const placeholders = recipientUserIds.map(() => '?').join(',');
  const rows = getDB().prepare(`
    SELECT id, post_notifications_enabled
    FROM users
    WHERE id IN (${placeholders})
  `).all(...recipientUserIds) as Array<{ id: number; post_notifications_enabled?: number | boolean | null }>;

  return rows
    .filter((row) => row.post_notifications_enabled === true || Number(row.post_notifications_enabled ?? 1) === 1)
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function sendAPNSRequest(input: {
  config: APNSConfig;
  environment: PushEnvironment;
  deviceToken: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const origin = input.environment === 'sandbox'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';

  return new Promise((resolve) => {
    const client = http2.connect(origin);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      client.close();
      resolve();
    };

    client.on('error', (error) => {
      logger.warn('[push] APNs connection failed', error);
      finish();
    });

    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${input.deviceToken}`,
      authorization: `bearer ${providerToken(input.config)}`,
      'apns-topic': input.config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });

    let responseBody = '';
    let statusCode = 0;
    request.setEncoding('utf8');
    request.on('response', (headers) => {
      statusCode = Number(headers[':status'] || 0);
    });
    request.on('data', (chunk) => {
      responseBody += chunk;
    });
    request.on('error', (error) => {
      logger.warn('[push] APNs request failed', error);
      finish();
    });
    request.on('end', () => {
      if (statusCode >= 300) {
        logger.warn(`[push] APNs rejected notification status=${statusCode} body=${responseBody.slice(0, 300)}`);
      }
      finish();
    });
    request.end(JSON.stringify(input.payload));
  });
}

export class PushNotificationService {
  static registerDeviceToken(input: {
    userId: number;
    platform?: string;
    deviceToken: string;
    environment?: string;
  }): boolean {
    const userId = Number(input.userId);
    const token = normalizeDeviceToken(input.deviceToken);
    if (!Number.isInteger(userId) || userId <= 0 || token.length < 32 || token.length > 256) {
      return false;
    }

    const platform = String(input.platform || 'ios').trim().toLowerCase() || 'ios';
    const environment = resolveEnvironment(input.environment);
    getDB().prepare(`
      INSERT INTO push_device_tokens (user_id, platform, device_token, environment, last_seen_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(device_token)
      DO UPDATE SET
        user_id = excluded.user_id,
        platform = excluded.platform,
        environment = excluded.environment,
        last_seen_at = CURRENT_TIMESTAMP
    `).run(userId, platform, token, environment);
    return true;
  }

  static unregisterDeviceToken(userId: number, deviceToken: string): number {
    const token = normalizeDeviceToken(deviceToken);
    if (!token) return 0;
    const result = getDB()
      .prepare('DELETE FROM push_device_tokens WHERE user_id = ? AND device_token = ?')
      .run(userId, token);
    return Number(result.changes || 0);
  }

  static async sendMessageNotifications(input: MessagePushInput): Promise<void> {
    const config = apnsConfig();
    if (!config) return;

    const recipients = uniqueRecipientIds(input.recipientUserIds, input.actorUserId);
    if (recipients.length === 0) return;

    const tokens = tokensForRecipients(recipients);
    if (tokens.length === 0) return;

    const title = actorDisplayName(input.actorUserId, input.topic);
    const body = String(input.snippet || '').trim().slice(0, 180) || 'Open ZYM to read it.';
    const payload = {
      aps: {
        alert: { title, body },
        sound: 'default',
      },
      type: 'message',
      topic: input.topic,
      messageId: input.messageId,
    };

    await Promise.all(tokens.map((row) => sendAPNSRequest({
      config,
        environment: resolveEnvironment(row.environment),
        deviceToken: row.device_token,
        payload,
      })));
  }

  static async sendCommunityNotifications(input: CommunityPushInput): Promise<void> {
    const config = apnsConfig();
    if (!config) return;

    const recipients = postPushAllowedRecipientIds(uniqueRecipientIds(input.recipientUserIds, input.actorUserId));
    if (recipients.length === 0) return;

    const tokens = tokensForRecipients(recipients);
    if (tokens.length === 0) return;

    const actor = actorDisplayName(input.actorUserId);
    const title = input.sourceType === 'post_comment'
      ? `${actor} commented on your post`
      : `${actor} liked your post`;
    const body = input.sourceType === 'post_comment'
      ? (String(input.snippet || '').trim().slice(0, 180) || 'Open ZYM to read the comment.')
      : 'Open ZYM to see the activity.';
    const payload = {
      aps: {
        alert: { title: title.slice(0, 120), body },
        sound: 'default',
      },
      type: 'community',
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postId: input.postId,
    };

    await Promise.all(tokens.map((row) => sendAPNSRequest({
      config,
      environment: resolveEnvironment(row.environment),
      deviceToken: row.device_token,
      payload,
    })));
  }
}
