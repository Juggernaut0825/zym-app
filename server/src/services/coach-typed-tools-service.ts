import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MediaStore } from '../context/media-store.js';
import { SessionStore } from '../context/session-store.js';
import { knowledgeService } from './knowledge-service.js';
import { resolveSkillRoot, resolveUserDataDir } from '../utils/path-resolver.js';

const execFileAsync = promisify(execFile);

type KnowledgeDomain = 'fitness' | 'nutrition';
type MediaInspectDomain = 'training' | 'food' | 'chart' | 'generic';
type SessionScope = 'summary' | 'recent' | 'full';

interface MealEstimateItem {
  food: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portion: string;
}

interface MealEstimateResult {
  description: string;
  items: MealEstimateItem[];
  total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

interface LogTimeInput {
  localDate?: unknown;
  occurredAt?: unknown;
  timezone?: unknown;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createLogEntryId(prefix: 'meal' | 'train', day: string): string {
  const stamp = String(day || nowIso().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 8) || '00000000';
  return `${prefix}_${stamp}_${crypto.randomBytes(3).toString('hex')}`;
}

function safeString(value: unknown, maxLength = 400): string {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toNumber(value: unknown, min: number, max: number, asInt = false): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.min(max, Math.max(min, parsed));
  return asInt ? Math.round(normalized) : Math.round(normalized * 100) / 100;
}

function extractJsonPayload(raw: string): string {
  const stripped = String(raw || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    return stripped;
  }
  const objectStart = stripped.indexOf('{');
  const objectEnd = stripped.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return stripped.slice(objectStart, objectEnd + 1);
  }
  const arrayStart = stripped.indexOf('[');
  const arrayEnd = stripped.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return stripped.slice(arrayStart, arrayEnd + 1);
  }
  return stripped;
}

function inferKnowledgeDomains(raw: unknown): KnowledgeDomain[] {
  const text = safeString(raw, 200).toLowerCase();
  if (text === 'fitness') return ['fitness'];
  if (text === 'nutrition') return ['nutrition'];
  return ['fitness', 'nutrition'];
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeInspectDomain(raw: unknown): MediaInspectDomain {
  const value = safeString(raw, 20).toLowerCase();
  if (value === 'training' || value === 'food' || value === 'chart' || value === 'generic') {
    return value;
  }
  return 'generic';
}

function normalizeSessionScope(raw: unknown): SessionScope {
  const value = safeString(raw, 20).toLowerCase();
  if (value === 'summary' || value === 'recent' || value === 'full') {
    return value;
  }
  return 'recent';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function isValidTimeZone(value: string): boolean {
  const tz = String(value || '').trim();
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeDateOnly(value: unknown): string | null {
  const text = safeString(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === text ? text : null;
}

function getLocalDateTimeParts(date: Date, timeZone: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = new Map(parts.map((item) => [item.type, item.value]));
  const year = map.get('year') || '1970';
  const month = map.get('month') || '01';
  const day = map.get('day') || '01';
  const hour = map.get('hour') || '00';
  const minute = map.get('minute') || '00';
  return {
    day: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

export class CoachTypedToolsService {
  private mediaStore = new MediaStore();
  private sessionStore = new SessionStore();

  private getUserDataDir(userId: string): string {
    return resolveUserDataDir(userId);
  }

  private getProfilePath(userId: string): string {
    return path.join(this.getUserDataDir(userId), 'profile.json');
  }

  private getDailyPath(userId: string): string {
    return path.join(this.getUserDataDir(userId), 'daily.json');
  }

  private assertMediaPathWithinUserRoot(userId: string, storedPath: string): string {
    const skillRoot = resolveSkillRoot();
    const candidate = path.resolve(skillRoot, storedPath);
    const mediaRoot = path.resolve(this.getUserDataDir(userId), 'media');
    if (candidate !== mediaRoot && !candidate.startsWith(`${mediaRoot}${path.sep}`)) {
      throw new Error('Media path is outside allowed user media directory');
    }
    return candidate;
  }

  private sanitizeProfilePatch(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const gender = safeString(raw.gender, 20).toLowerCase();
    const activity = safeString(raw.activity_level ?? raw.activity, 40).toLowerCase();
    const goal = safeString(raw.goal, 20).toLowerCase();
    const experience = safeString(raw.experience_level ?? raw.experience, 30).toLowerCase();
    const timezone = safeString(raw.timezone ?? raw.tz, 120).replace(/\s+/g, '');

    const heightCm = toNumber(raw.height_cm ?? raw.height, 80, 260);
    const weightKg = toNumber(raw.weight_kg ?? raw.weight, 20, 350);
    const age = toNumber(raw.age, 10, 100, true);
    const bodyFat = toNumber(raw.body_fat_pct ?? raw.body_fat, 2, 70);
    const trainingDays = toNumber(raw.training_days, 1, 7, true);

    if (heightCm !== null) out.height_cm = heightCm;
    if (weightKg !== null) out.weight_kg = weightKg;
    if (age !== null) out.age = age;
    if (bodyFat !== null) out.body_fat_pct = bodyFat;
    if (trainingDays !== null) out.training_days = trainingDays;
    if (gender === 'male' || gender === 'female') out.gender = gender;
    if (['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(activity)) out.activity_level = activity;
    if (['cut', 'bulk', 'maintain'].includes(goal)) out.goal = goal;
    if (['beginner', 'intermediate', 'advanced'].includes(experience)) out.experience_level = experience;
    if (timezone && isValidTimeZone(timezone)) out.timezone = timezone;

    const notes = safeString(raw.notes, 2000);
    if (notes) out.notes = notes;

    if (Array.isArray(raw.preferences)) {
      const preferences = raw.preferences
        .map((item) => safeString(item, 100))
        .filter(Boolean)
        .slice(0, 20);
      if (preferences.length > 0) {
        out.preferences = preferences;
      }
    }

    return out;
  }

  private recomputeProfileDerived(profile: Record<string, unknown>): void {
    const h = Number(profile.height_cm || 0);
    const w = Number(profile.weight_kg || 0);
    const a = Number(profile.age || 0);
    const g = safeString(profile.gender, 12).toLowerCase() || 'male';
    const activity = safeString(profile.activity_level, 20).toLowerCase() || 'moderate';
    const bf = Number(profile.body_fat_pct || 0);

    if (!Number.isFinite(h) || !Number.isFinite(w) || !Number.isFinite(a) || h <= 0 || w <= 0 || a <= 0) {
      return;
    }

    let bmr = 0;
    if (Number.isFinite(bf) && bf > 2 && bf < 70) {
      const lbm = w * (1 - bf / 100);
      bmr = Math.round(370 + 21.6 * lbm);
    } else if (g === 'female') {
      bmr = Math.round(10 * w + 6.25 * h - 5 * a - 161);
    } else {
      bmr = Math.round(10 * w + 6.25 * h - 5 * a + 5);
    }

    const activityFactors: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };
    const tdee = Math.round(bmr * (activityFactors[activity] || 1.55));
    const goal = safeString(profile.goal, 20).toLowerCase() || 'maintain';
    const dailyTarget = goal === 'cut'
      ? Math.round(tdee - 500)
      : goal === 'bulk'
        ? Math.round(tdee + 300)
        : tdee;

    profile.bmr = bmr;
    profile.tdee = tdee;
    profile.daily_target = dailyTarget;
  }

  private async resolvePreferredTimezone(userId: string, requested: unknown): Promise<string> {
    const requestedTz = safeString(requested, 120).replace(/\s+/g, '');
    if (requestedTz) {
      if (!isValidTimeZone(requestedTz)) {
        throw new Error('Invalid timezone; use an IANA timezone like America/New_York');
      }
      return requestedTz;
    }

    const profile = await this.getProfile(userId);
    const profileTz = safeString((profile as any)?.timezone ?? (profile as any)?.tz, 120).replace(/\s+/g, '');
    if (profileTz && isValidTimeZone(profileTz)) {
      return profileTz;
    }

    const defaultTimezone = safeString(process.env.DEFAULT_USER_TIMEZONE || 'UTC', 120).replace(/\s+/g, '');
    if (defaultTimezone && isValidTimeZone(defaultTimezone)) {
      return defaultTimezone;
    }
    return 'UTC';
  }

  private async resolveLogStamp(
    userId: string,
    input: LogTimeInput = {},
  ): Promise<{ day: string; time: string; timezone: string; occurredAtUtc: string | null; dateSource: 'localDate' | 'occurredAt' | 'now' }> {
    const timezone = await this.resolvePreferredTimezone(userId, input.timezone);
    const localDate = normalizeDateOnly(input.localDate);

    const occurredAtRaw = safeString(input.occurredAt, 120);
    let occurredAt: Date | null = null;
    if (occurredAtRaw) {
      const parsed = new Date(occurredAtRaw);
      if (!Number.isFinite(parsed.getTime())) {
        throw new Error('occurredAt must be a valid ISO-8601 datetime');
      }
      occurredAt = parsed;
    }

    if (localDate) {
      if (occurredAt) {
        const local = getLocalDateTimeParts(occurredAt, timezone);
        return {
          day: localDate,
          time: local.time,
          timezone,
          occurredAtUtc: occurredAt.toISOString(),
          dateSource: 'localDate',
        };
      }
      return {
        day: localDate,
        time: '12:00',
        timezone,
        occurredAtUtc: null,
        dateSource: 'localDate',
      };
    }

    const point = occurredAt || new Date();
    const local = getLocalDateTimeParts(point, timezone);
    return {
      day: local.day,
      time: local.time,
      timezone,
      occurredAtUtc: point.toISOString(),
      dateSource: occurredAt ? 'occurredAt' : 'now',
    };
  }

  async getContext(userId: string, input: { scope?: unknown; limit?: unknown } = {}): Promise<Record<string, unknown>> {
    const scope = normalizeSessionScope(input.scope);
    const limit = clampInt(input.limit, 1, 24, 6);
    const session = await this.sessionStore.refreshPinnedFacts(await this.sessionStore.load(userId));
    const recent = Array.isArray(session.recentMessages) ? session.recentMessages : [];

    let selected = recent;
    if (scope === 'summary') {
      selected = [];
    } else if (scope === 'recent') {
      selected = recent.slice(-limit);
    }

    return {
      rollingSummary: session.rollingSummary || '',
      pinnedFacts: session.pinnedFacts || [],
      recentMessages: selected,
      activeMediaIds: session.activeMediaIds || [],
      lastMessageAt: session.lastMessageAt || null,
    };
  }

  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const profile = await readJson<Record<string, unknown>>(this.getProfilePath(userId), {});
    return profile && typeof profile === 'object' ? profile : {};
  }

  async setProfile(userId: string, profilePatch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sanitized = this.sanitizeProfilePatch(profilePatch || {});
    const changedKeys = Object.keys(sanitized);
    if (changedKeys.length === 0) {
      throw new Error('No valid profile fields were provided');
    }

    const profilePath = this.getProfilePath(userId);
    await ensureDir(path.dirname(profilePath));
    const current = await readJson<Record<string, unknown>>(profilePath, {});
    const next = { ...current, ...sanitized };
    this.recomputeProfileDerived(next);
    await writeJsonAtomic(profilePath, next);

    return {
      updatedFields: changedKeys,
      profile: next,
    };
  }

  private async openRouterJson(content: unknown, maxTokens = 2048): Promise<any> {
    const apiKey = safeString(process.env.OPENROUTER_API_KEY, 500);
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required');
    }
    const model = safeString(process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview', 120);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Juggernaut0825/zym',
        'X-Title': 'ZYM Coach Typed Tools',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenRouter request failed (${response.status}): ${detail.slice(0, 240)}`);
    }
    const payload = await response.json().catch(() => ({} as any));
    const raw = safeString(payload?.choices?.[0]?.message?.content, 120_000);
    const jsonText = extractJsonPayload(raw);
    try {
      return JSON.parse(jsonText);
    } catch {
      throw new Error('Model did not return valid JSON');
    }
  }

  private sanitizeMealEstimate(raw: any, fallbackDescription: string): MealEstimateResult {
    const itemsRaw = Array.isArray(raw?.items) ? raw.items : [];
    const items: MealEstimateItem[] = itemsRaw.slice(0, 20).map((item: any) => ({
      food: safeString(item?.food, 120) || 'Unknown',
      calories: toNumber(item?.calories, 0, 5000) || 0,
      protein_g: toNumber(item?.protein_g, 0, 500) || 0,
      carbs_g: toNumber(item?.carbs_g, 0, 1000) || 0,
      fat_g: toNumber(item?.fat_g, 0, 500) || 0,
      portion: safeString(item?.portion, 120),
    }));
    const total = raw?.total || {};
    return {
      description: safeString(raw?.description, 500) || fallbackDescription,
      items,
      total: {
        calories: toNumber(total?.calories, 0, 10000) || items.reduce((sum, item) => sum + item.calories, 0),
        protein_g: toNumber(total?.protein_g, 0, 500) || items.reduce((sum, item) => sum + item.protein_g, 0),
        carbs_g: toNumber(total?.carbs_g, 0, 1000) || items.reduce((sum, item) => sum + item.carbs_g, 0),
        fat_g: toNumber(total?.fat_g, 0, 500) || items.reduce((sum, item) => sum + item.fat_g, 0),
      },
    };
  }

  private ensureDayBucket(daily: Record<string, any>, day: string): void {
    if (!daily[day] || typeof daily[day] !== 'object') {
      daily[day] = { meals: [], training: [], total_intake: 0, total_burned: 0 };
    }
    if (!Array.isArray(daily[day].meals)) daily[day].meals = [];
    if (!Array.isArray(daily[day].training)) daily[day].training = [];
    if (!Number.isFinite(Number(daily[day].total_intake))) daily[day].total_intake = 0;
    if (!Number.isFinite(Number(daily[day].total_burned))) daily[day].total_burned = 0;
  }

  async logMeal(userId: string, description: string, timeInput: LogTimeInput = {}): Promise<Record<string, unknown>> {
    const safeDescription = safeString(description, 500);
    if (!safeDescription) {
      throw new Error('Meal description is required');
    }

    const prompt = `Estimate calories and macros for: ${safeDescription}
Return ONLY JSON:
{
  "items": [{"food":"string","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"portion":"string"}],
  "total": {"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0},
  "description": "string"
}`;
    const ai = await this.openRouterJson([{ type: 'text', text: prompt }], 1600);
    const normalized = this.sanitizeMealEstimate(ai, safeDescription);

    const dailyPath = this.getDailyPath(userId);
    await ensureDir(path.dirname(dailyPath));
    const daily = await readJson<Record<string, any>>(dailyPath, {});
    const stamp = await this.resolveLogStamp(userId, timeInput);
    const day = stamp.day;
    this.ensureDayBucket(daily, day);

    const mealEntry = {
      id: createLogEntryId('meal', day),
      time: stamp.time,
      timezone: stamp.timezone,
      occurred_at_utc: stamp.occurredAtUtc,
      calories: normalized.total.calories,
      protein_g: normalized.total.protein_g,
      carbs_g: normalized.total.carbs_g,
      fat_g: normalized.total.fat_g,
      description: normalized.description,
      items: normalized.items,
    };
    daily[day].meals.push(mealEntry);
    daily[day].total_intake = Math.round(
      daily[day].meals.reduce((sum: number, meal: any) => sum + (Number(meal?.calories) || 0), 0) * 100,
    ) / 100;

    await writeJsonAtomic(dailyPath, daily);
    return {
      day,
      timezone: stamp.timezone,
      dateSource: stamp.dateSource,
      meal: mealEntry,
      totalIntake: daily[day].total_intake,
    };
  }

  async logTraining(userId: string, entries: unknown, timeInput: LogTimeInput = {}): Promise<Record<string, unknown>> {
    const rawEntries = Array.isArray(entries) ? entries : [entries];
    const stamp = await this.resolveLogStamp(userId, timeInput);
    const cleanEntries = rawEntries.slice(0, 20).map((entry) => {
      const sets = toNumber((entry as any)?.sets, 0, 50, true) || 0;
      const repsText = safeString((entry as any)?.reps, 20) || '0';
      const reps = clampInt(repsText, 0, 200, 0);
      const weightKg = toNumber((entry as any)?.weight_kg, 0, 500) || 0;
      const name = safeString((entry as any)?.name, 120) || 'Unknown';
      const notes = safeString((entry as any)?.notes, 500);
      const volume = Math.round(sets * reps * weightKg * 100) / 100;
      return {
        id: createLogEntryId('train', stamp.day),
        time: stamp.time,
        timezone: stamp.timezone,
        occurred_at_utc: stamp.occurredAtUtc,
        name,
        sets,
        reps: String(repsText || reps),
        weight_kg: weightKg,
        volume_kg: volume,
        notes,
      };
    }).filter((entry) => entry.name && entry.sets >= 0);

    if (cleanEntries.length === 0) {
      throw new Error('No valid training entries were provided');
    }

    const totalVolume = cleanEntries.reduce((sum, item) => sum + item.volume_kg, 0);
    const estimatedBurn = Math.round(totalVolume / 10);

    const dailyPath = this.getDailyPath(userId);
    await ensureDir(path.dirname(dailyPath));
    const daily = await readJson<Record<string, any>>(dailyPath, {});
    const day = stamp.day;
    this.ensureDayBucket(daily, day);
    daily[day].training.push(...cleanEntries);
    daily[day].total_burned = (Number(daily[day].total_burned) || 0) + estimatedBurn;

    await writeJsonAtomic(dailyPath, daily);
    return {
      day,
      timezone: stamp.timezone,
      dateSource: stamp.dateSource,
      entries: cleanEntries.length,
      totalVolumeKg: Math.round(totalVolume * 100) / 100,
      estimatedBurnKcal: estimatedBurn,
      totalBurnedToday: daily[day].total_burned,
    };
  }

  async listRecentMedia(userId: string, input: { limit?: unknown; activeOnly?: unknown } = {}): Promise<Record<string, unknown>> {
    const limit = clampInt(input.limit, 1, 20, 5);
    const activeOnly = Boolean(input.activeOnly);
    const items = await this.mediaStore.listRecentMedia(userId, limit);
    const filtered = activeOnly ? items.filter((item) => item.status === 'ready') : items;
    return {
      items: filtered.map((item) => ({
        id: item.id,
        kind: item.kind,
        mimeType: item.mimeType,
        source: item.originalFilename,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        status: item.status,
        analysisCount: Array.isArray(item.analysisIds) ? item.analysisIds.length : 0,
      })),
    };
  }

  private buildInspectPrompt(domain: MediaInspectDomain, question: string, mediaKind: 'image' | 'video'): string {
    const domainPrompt: Record<MediaInspectDomain, string> = {
      training: 'Focus on movement quality, form risks, and clearly visible setup details.',
      food: 'Focus on visible foods, portions, and conservative calorie/macro ranges.',
      chart: 'Focus on visible chart labels, numbers, and trends exactly as shown.',
      generic: 'Answer only based on visible evidence and state uncertainty explicitly.',
    };
    return `You are a strict media inspection engine.
Domain: ${domain}
Media kind: ${mediaKind}
Question: ${question || 'Provide a baseline analysis.'}
Instructions:
- Use only visible evidence from media.
- Do not hallucinate details.
- If uncertain, lower confidence and list ambiguities.
- Return ONLY JSON.
{
  "kind": "focused_qa or baseline",
  "confidence": "low|medium|high",
  "answerSummary": "short string",
  "evidence": [{"label":"string","observation":"string","confidence":"low|medium|high"}],
  "ambiguities": ["string"],
  "derived": {"scenarios":[{"label":"string","totalWeightKg":0}]},
  "proposedTrainingEntry": {"name":"string","sets":1,"reps":"1","weight_kg":0},
  "needsConfirmation": true
}
${domainPrompt[domain]}`;
  }

  private async hasCommand(command: string): Promise<boolean> {
    try {
      await execFileAsync('which', [command], { timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }

  private async probeVideoDurationSeconds(absolutePath: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          absolutePath,
        ],
        {
          timeout: 8_000,
          maxBuffer: 256 * 1024,
        },
      );
      const duration = Number(String(stdout || '').trim());
      if (!Number.isFinite(duration) || duration <= 0) return null;
      return duration;
    } catch {
      return null;
    }
  }

  private async extractVideoFrames(absolutePath: string): Promise<Buffer[]> {
    const hasFfmpeg = await this.hasCommand('ffmpeg');
    if (!hasFfmpeg) return [];

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zym-video-frames-'));
    const frames: Buffer[] = [];
    try {
      const duration = (await this.probeVideoDurationSeconds(absolutePath)) || 4;
      const points = Array.from(new Set([
        Math.max(0.1, duration * 0.1),
        Math.max(0.2, duration * 0.35),
        Math.max(0.3, duration * 0.6),
        Math.max(0.4, duration * 0.85),
      ])).slice(0, 4);

      for (let index = 0; index < points.length; index += 1) {
        const outputPath = path.join(tempRoot, `frame_${index}.jpg`);
        try {
          await execFileAsync(
            'ffmpeg',
            [
              '-y',
              '-ss',
              points[index].toFixed(2),
              '-i',
              absolutePath,
              '-frames:v',
              '1',
              outputPath,
            ],
            {
              timeout: 15_000,
              maxBuffer: 4 * 1024 * 1024,
            },
          );
          const buffer = await fs.readFile(outputPath);
          if (buffer.length > 0) {
            frames.push(buffer);
          }
        } catch {
          // Continue extracting other frames.
        }
      }
    } finally {
      try {
        await fs.rm(tempRoot, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    }

    return frames;
  }

  private normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
    const v = safeString(value, 20).toLowerCase();
    if (v === 'medium' || v === 'high') return v;
    return 'low';
  }

  async inspectMedia(
    userId: string,
    input: { mediaId: unknown; question?: unknown; domain?: unknown },
  ): Promise<Record<string, unknown>> {
    const mediaId = safeString(input.mediaId, 128);
    if (!/^med_[a-zA-Z0-9._-]{4,120}$/.test(mediaId)) {
      throw new Error('Invalid mediaId');
    }
    const question = safeString(input.question, 500);
    const domain = normalizeInspectDomain(input.domain);

    const media = await this.mediaStore.getMediaById(userId, mediaId);
    if (!media) {
      throw new Error('mediaId not found or expired');
    }

    const absolutePath = this.assertMediaPathWithinUserRoot(userId, media.storedPath);
    const binary = await fs.readFile(absolutePath);
    const fileSizeMb = binary.length / (1024 * 1024);

    let result: any;
    const contentParts: any[] = [];

    if (media.kind === 'video') {
      const frames = await this.extractVideoFrames(absolutePath);
      if (frames.length > 0) {
        for (const frame of frames) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${frame.toString('base64')}` },
          });
        }
      } else if (fileSizeMb <= 22) {
        contentParts.push({
          type: 'video_url',
          video_url: { url: `data:${media.mimeType};base64,${binary.toString('base64')}` },
        });
      } else {
        result = {
          kind: question ? 'focused_qa' : 'baseline',
          confidence: 'low',
          answerSummary: 'Video is too large for reliable direct inspection in current mode. Please upload a shorter clip.',
          evidence: [],
          ambiguities: ['Video exceeds direct analysis size limit'],
          derived: { scenarios: [] },
          proposedTrainingEntry: null,
          needsConfirmation: true,
        };
      }
    } else {
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:${media.mimeType};base64,${binary.toString('base64')}` },
      });
    }

    if (!result) {
      contentParts.push({
        type: 'text',
        text: this.buildInspectPrompt(domain, question, media.kind),
      });
      result = await this.openRouterJson(contentParts, 2200);
    }

    const createdAt = nowIso();
    const analysisId = `ana_${createdAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, '')}_${domain}_${question ? 'focused_qa' : 'baseline'}_${crypto.randomBytes(2).toString('hex')}`;
    const normalized = {
      id: analysisId,
      mediaId,
      kind: safeString(result?.kind, 30) || (question ? 'focused_qa' : 'baseline'),
      domain,
      question,
      confidence: this.normalizeConfidence(result?.confidence),
      answerSummary: safeString(result?.answerSummary, 1200) || 'Unable to derive a reliable answer.',
      evidence: Array.isArray(result?.evidence)
        ? result.evidence.slice(0, 10).map((item: any) => ({
            label: safeString(item?.label, 80) || 'evidence',
            observation: safeString(item?.observation, 420),
            confidence: this.normalizeConfidence(item?.confidence),
          }))
        : [],
      ambiguities: Array.isArray(result?.ambiguities)
        ? result.ambiguities.map((item: unknown) => safeString(item, 220)).filter(Boolean).slice(0, 8)
        : [],
      derived: result?.derived && typeof result.derived === 'object' ? result.derived : { scenarios: [] },
      proposedTrainingEntry: result?.proposedTrainingEntry && typeof result.proposedTrainingEntry === 'object'
        ? result.proposedTrainingEntry
        : null,
      needsConfirmation: Boolean(result?.needsConfirmation ?? true),
      createdAt,
    };

    const analysisDir = path.join(this.getUserDataDir(userId), 'analyses', mediaId);
    await ensureDir(analysisDir);
    await writeJsonAtomic(path.join(analysisDir, `${analysisId}.json`), normalized);

    const index = await this.mediaStore.loadIndex(userId);
    const item = index.items.find((entry) => entry.id === mediaId);
    if (item) {
      item.analysisIds = Array.isArray(item.analysisIds) ? item.analysisIds : [];
      if (!item.analysisIds.includes(analysisId)) {
        item.analysisIds.push(analysisId);
      }
      await this.mediaStore.saveIndex(userId, index);
    }

    return normalized;
  }

  async searchKnowledge(input: {
    query: unknown;
    domains?: unknown;
    topK?: unknown;
    minScore?: unknown;
  }): Promise<Record<string, unknown>> {
    const query = safeString(input.query, 2000);
    if (!query) {
      throw new Error('Query is required');
    }
    const domains = inferKnowledgeDomains(input.domains);
    const topK = clampInt(input.topK, 1, 8, 4);
    const minScore = toNumber(input.minScore, 0, 1) ?? 0.08;
    const matches = await knowledgeService.searchHybrid(query, {
      domains,
      topK,
      minScore,
    });

    return {
      query,
      total: matches.length,
      matches: matches.map((item, idx) => ({
        rank: idx + 1,
        source: item.source,
        domain: item.domain,
        backend: item.backend,
        score: Number(item.score.toFixed(4)),
        text: safeString(item.text, 1200),
      })),
    };
  }
}

export const coachTypedToolsService = new CoachTypedToolsService();
