import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MediaStore } from '../context/media-store.js';
import { SessionStore } from '../context/session-store.js';
import { MediaAssetService, type MediaAssetRecord } from './media-asset-service.js';
import { knowledgeService } from './knowledge-service.js';
import { OpenRouterUsageContext, OpenRouterUsageService } from './openrouter-usage-service.js';
import {
  getExerciseLibraryEntry,
  resolveExerciseLibraryEntry,
  searchExerciseLibrary as searchExerciseLibraryEntries,
} from './exercise-library-service.js';
import { getDB } from '../database/runtime-db.js';
import { resolveUserDataDir, resolveUserScopedPath } from '../utils/path-resolver.js';
import { logger } from '../utils/logger.js';
import { resolveAppDataRoot, resolveUploadsDir } from '../config/app-paths.js';

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

interface TrainingPlanExercise {
  id: string;
  exercise_key?: string;
  order: number;
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  target_weight_kg?: number | null;
  cue?: string;
  notes?: string;
  demo_url?: string;
  demo_thumbnail?: string;
  completed_at?: string | null;
}

interface TrainingPlanEntry {
  id: string;
  day: string;
  coach_id: 'zj' | 'lc';
  title: string;
  summary: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  exercises: TrainingPlanExercise[];
}

type TrainingPlanIndex = Record<string, TrainingPlanEntry>;

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

function createTrainingPlanId(day: string): string {
  const stamp = String(day || nowIso().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 8) || '00000000';
  return `plan_${stamp}_${crypto.randomBytes(3).toString('hex')}`;
}

function createTrainingPlanExerciseId(day: string): string {
  const stamp = String(day || nowIso().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 8) || '00000000';
  return `planex_${stamp}_${crypto.randomBytes(3).toString('hex')}`;
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

function normalizeKnowledgeDomains(raw: unknown): KnowledgeDomain[] {
  const normalizeOne = (value: unknown): KnowledgeDomain | null => {
    const text = safeString(value, 40).toLowerCase();
    if (!text) return null;
    if (text === 'fitness' || text === 'training' || text === 'exercise' || text === 'workout' || text === 'lifting') {
      return 'fitness';
    }
    if (text === 'nutrition' || text === 'food' || text === 'diet' || text === 'meal' || text === 'meals' || text === 'macros') {
      return 'nutrition';
    }
    return null;
  };

  if (Array.isArray(raw)) {
    const values = raw
      .map((item) => normalizeOne(item))
      .filter((item): item is KnowledgeDomain => Boolean(item));
    if (values.length > 0) {
      return Array.from(new Set(values));
    }
  }

  const text = safeString(raw, 200).toLowerCase();
  if (text === 'fitness') return ['fitness'];
  if (text === 'nutrition') return ['nutrition'];
  if (text === 'fitness,nutrition' || text === 'nutrition,fitness' || text === 'both') {
    return ['fitness', 'nutrition'];
  }
  const single = normalizeOne(text);
  if (single) {
    return [single];
  }
  return [];
}

function stripHtmlTags(input: string): string {
  return String(input || '').replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(input: string): string {
  return String(input || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

function unwrapDuckDuckGoUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value, 'https://duckduckgo.com');
    return parsed.searchParams.get('uddg') || parsed.toString();
  } catch {
    return value;
  }
}

function isYoutubeWatchUrl(url: string): boolean {
  const value = String(url || '').toLowerCase();
  return value.includes('youtube.com/watch')
    || value.includes('youtube.com/shorts/')
    || value.includes('youtu.be/');
}

function normalizeMarkdownLinkLabel(label: string): string {
  return String(label || '')
    .replace(/[[\]]/g, '')
    .trim()
    .slice(0, 80);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const serialized = JSON.stringify(payload, null, 2);
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, serialized, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EXDEV' && error?.code !== 'EPERM' && error?.code !== 'EACCES') {
      throw error;
    }
    logger.warn(`[coach-tools] atomic rename failed for ${filePath}; falling back to direct write (${String(error?.code || 'unknown')})`);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, serialized, 'utf8');
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readJsonOptional<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
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

function normalizeFreeformProfileText(value: unknown, maxLength = 120): string {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseHeightCm(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = normalizeFreeformProfileText(value, 40).toLowerCase();
  if (!text) return null;

  const feetInches = text.match(/^(\d{1,2})\s*'\s*(\d{1,2})(?:\s*(?:"|in|inch|inches))?$/);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = Number(feetInches[2]);
    const totalInches = feet * 12 + inches;
    return Math.round(totalInches * 2.54 * 10) / 10;
  }

  const meters = text.match(/^(\d(?:\.\d+)?)\s*m$/);
  if (meters) {
    return Math.round(Number(meters[1]) * 100 * 10) / 10;
  }

  const centimeters = text.match(/^(\d{2,3}(?:\.\d+)?)\s*(?:cm|centimeter|centimeters)?$/);
  if (centimeters) {
    const parsed = Number(centimeters[1]);
    return parsed >= 80 && parsed <= 260 ? Math.round(parsed * 10) / 10 : null;
  }

  return null;
}

function parseWeightKg(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = normalizeFreeformProfileText(value, 40).toLowerCase();
  if (!text) return null;

  const pounds = text.match(/^(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)$/);
  if (pounds) {
    return Math.round(Number(pounds[1]) * 0.45359237 * 100) / 100;
  }

  const kilograms = text.match(/^(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilogram|kilograms)?$/);
  if (kilograms) {
    const parsed = Number(kilograms[1]);
    return parsed >= 20 && parsed <= 350 ? Math.round(parsed * 100) / 100 : null;
  }

  return null;
}

function inferGender(value: unknown): 'male' | 'female' | null {
  const text = normalizeFreeformProfileText(value, 40).toLowerCase();
  if (!text) return null;
  if (/\b(male|man|men)\b/.test(text)) return 'male';
  if (/\b(female|woman|women)\b/.test(text)) return 'female';
  return null;
}

function inferActivityLevel(value: unknown): 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null {
  const text = normalizeFreeformProfileText(value, 60).toLowerCase();
  if (!text) return null;
  if (text.includes('very active')) return 'very_active';
  if (text.includes('sedentary')) return 'sedentary';
  if (/\blight\b/.test(text)) return 'light';
  if (/\bmoderate\b/.test(text)) return 'moderate';
  if (/\bactive\b/.test(text)) return 'active';
  return null;
}

function inferGoal(value: unknown): 'cut' | 'bulk' | 'maintain' | null {
  const text = normalizeFreeformProfileText(value, 120).toLowerCase();
  if (!text) return null;
  if (/\b(cut|fat loss|lose fat|lean out|slim)\b/.test(text)) return 'cut';
  if (/\b(bulk|gain|muscle gain|size)\b/.test(text)) return 'bulk';
  if (/\b(maintain|maintenance|keep|recomp|recomposition)\b/.test(text)) return 'maintain';
  return null;
}

function inferExperienceLevel(value: unknown): 'beginner' | 'intermediate' | 'advanced' | null {
  const text = normalizeFreeformProfileText(value, 40).toLowerCase();
  if (!text) return null;
  if (text.includes('beginner')) return 'beginner';
  if (text.includes('intermediate')) return 'intermediate';
  if (text.includes('advanced')) return 'advanced';
  return null;
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

function extractYouTubeVideoId(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return String(parsed.searchParams.get('v') || '').trim();
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      const shortsIndex = parts.indexOf('shorts');
      if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
        return parts[shortsIndex + 1];
      }
      const embedIndex = parts.indexOf('embed');
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    }
  } catch {
    return '';
  }

  return '';
}

function buildYouTubeThumbnailUrl(raw: string): string {
  const videoId = extractYouTubeVideoId(raw);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
}

function isImageLikeUrl(raw: string): boolean {
  return /\.(?:png|jpe?g|webp|gif)(?:\?|#|$)/i.test(String(raw || '').trim());
}

function buildDemoThumbnailUrl(raw: string, fallback?: string): string {
  const value = safeString(raw, 1000);
  if (!value) return safeString(fallback, 1000);
  const youtubeThumb = buildYouTubeThumbnailUrl(value);
  if (youtubeThumb) return youtubeThumb;
  if (isImageLikeUrl(value)) return value;
  return safeString(fallback, 1000);
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
  private mediaAssetService = MediaAssetService.createFromEnvironment({
    uploadsDir: resolveUploadsDir(),
  });
  private sessionStore = new SessionStore();

  private getUserDataDir(userId: string): string {
    return resolveUserDataDir(userId);
  }

  private getProfilePath(userId: string): string {
    return path.join(this.getUserDataDir(userId), 'profile.json');
  }

  private getLegacyProfilePaths(userId: string): string[] {
    const root = resolveAppDataRoot();
    const safeUserId = String(userId || '').trim();
    const candidates = [
      path.join(root, `user${safeUserId}`, 'profile.json'),
      path.join(root, `user_${safeUserId}`, 'profile.json'),
      path.join(root, `user-${safeUserId}`, 'profile.json'),
      path.join(root, 'users', safeUserId, 'profile.json'),
      path.join(root, 'user', safeUserId, 'profile.json'),
      path.join(root, 'profiles', `${safeUserId}.json`),
      path.join(root, 'profiles', `user${safeUserId}.json`),
    ];
    return Array.from(new Set(candidates)).filter((candidate) => candidate !== this.getProfilePath(userId));
  }

  private getDailyPath(userId: string): string {
    return path.join(this.getUserDataDir(userId), 'daily.json');
  }

  private getTrainingPlanPath(userId: string): string {
    return path.join(this.getUserDataDir(userId), 'training-plan.json');
  }

  private assertMediaPathWithinUserRoot(userId: string, storedPath: string): string {
    const candidate = resolveUserScopedPath(userId, storedPath);
    const mediaRoot = path.resolve(this.getUserDataDir(userId), 'media');
    if (candidate !== mediaRoot && !candidate.startsWith(`${mediaRoot}${path.sep}`)) {
      throw new Error('Media path is outside allowed user media directory');
    }
    return candidate;
  }

  private sanitizeProfilePatch(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const height = normalizeFreeformProfileText(raw.height ?? raw.height_cm ?? raw.heightCm, 40);
    const weight = normalizeFreeformProfileText(raw.weight ?? raw.weight_kg ?? raw.weightKg, 40);
    const gender = normalizeFreeformProfileText(raw.gender ?? raw.sex, 40);
    const activity = normalizeFreeformProfileText(raw.activity_level ?? raw.activity ?? raw.activityLevel, 60);
    const goal = normalizeFreeformProfileText(raw.goal ?? raw.fitness_goal ?? raw.fitnessGoal, 120);
    const experience = normalizeFreeformProfileText(raw.experience_level ?? raw.experience ?? raw.experienceLevel, 40);
    const timezone = safeString(raw.timezone ?? raw.timeZone ?? raw.tz, 120).replace(/\s+/g, '');

    const heightCm = parseHeightCm(height);
    const weightKg = parseWeightKg(weight);
    const age = toNumber(raw.age ?? raw.ageYears, 10, 100, true);
    const bodyFat = toNumber(raw.body_fat_pct ?? raw.body_fat ?? raw.bodyFatPct ?? raw.bodyFat, 2, 70);
    const trainingDays = toNumber(raw.training_days ?? raw.trainingDays ?? raw.training_days_per_week ?? raw.trainingDaysPerWeek, 1, 7, true);

    if (height) {
      out.height = height;
      out.height_cm = heightCm;
    } else if (raw.height_cm !== undefined || raw.heightCm !== undefined) {
      const numericHeight = toNumber(raw.height_cm ?? raw.heightCm, 80, 260);
      if (numericHeight !== null) {
        out.height_cm = numericHeight;
        out.height = String(numericHeight);
      }
    }

    if (weight) {
      out.weight = weight;
      out.weight_kg = weightKg;
    } else if (raw.weight_kg !== undefined || raw.weightKg !== undefined) {
      const numericWeight = toNumber(raw.weight_kg ?? raw.weightKg, 20, 350);
      if (numericWeight !== null) {
        out.weight_kg = numericWeight;
        out.weight = String(numericWeight);
      }
    }

    if (age !== null) out.age = age;
    if (bodyFat !== null) out.body_fat_pct = bodyFat;
    if (trainingDays !== null) out.training_days = trainingDays;
    if (gender) out.gender = inferGender(gender) || gender;
    if (activity) out.activity_level = inferActivityLevel(activity) || activity;
    if (goal) out.goal = inferGoal(goal) || goal;
    if (experience) out.experience_level = inferExperienceLevel(experience) || experience;
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

  private unwrapLegacyProfileShape(raw: Record<string, unknown>): Record<string, unknown> {
    const nested = isPlainRecord(raw.profile) ? raw.profile : null;
    if (!nested) {
      return raw;
    }

    const merged = {
      ...nested,
      ...Object.fromEntries(
        Object.entries(raw).filter(([key]) => key !== 'profile' && key !== 'updatedFields' && key !== 'success'),
      ),
    };
    return merged;
  }

  private hasMeaningfulProfileValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private mergeProfileFields(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(source)) {
      if (this.hasMeaningfulProfileValue(value)) {
        target[key] = value;
      }
    }
  }

  private async getProfileSnapshotPaths(userId: string): Promise<string[]> {
    const candidates = new Set<string>([
      this.getProfilePath(userId),
      ...this.getLegacyProfilePaths(userId),
    ]);

    const bases = Array.from(candidates);
    for (const basePath of bases) {
      const dirPath = path.dirname(basePath);
      const fileName = path.basename(basePath);
      try {
        const entries = await fs.readdir(dirPath);
        for (const entry of entries) {
          if (
            entry === `${fileName}.tmp`
            || (entry.startsWith(`${fileName}.`) && entry.endsWith('.tmp'))
            || entry === `${fileName}.bak`
            || (entry.startsWith(`${fileName}.`) && entry.endsWith('.bak'))
          ) {
            candidates.add(path.join(dirPath, entry));
          }
        }
      } catch {
        // Ignore missing legacy directories; they are optional.
      }
    }

    return Array.from(candidates);
  }

  private async loadMergedProfileState(userId: string): Promise<{
    merged: Record<string, unknown>;
    canonical: Record<string, unknown>;
    usedRecoverySources: boolean;
  }> {
    const profilePath = this.getProfilePath(userId);
    const snapshotPaths = await this.getProfileSnapshotPaths(userId);
    const snapshots: Array<{ filePath: string; mtimeMs: number; raw: Record<string, unknown> }> = [];

    for (const filePath of snapshotPaths) {
      const raw = await readJsonOptional<Record<string, unknown>>(filePath);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length === 0) {
        continue;
      }
      let mtimeMs = 0;
      try {
        mtimeMs = (await fs.stat(filePath)).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      snapshots.push({ filePath, mtimeMs, raw });
    }

    snapshots.sort((left, right) => left.mtimeMs - right.mtimeMs);

    const merged: Record<string, unknown> = {};
    const canonical = snapshots.find((snapshot) => snapshot.filePath === profilePath)?.raw || {};

    for (const snapshot of snapshots) {
      const unwrapped = this.unwrapLegacyProfileShape(snapshot.raw);
      this.mergeProfileFields(merged, unwrapped);
      this.mergeProfileFields(merged, this.sanitizeProfilePatch(unwrapped));
    }

    return {
      merged,
      canonical: this.unwrapLegacyProfileShape(canonical),
      usedRecoverySources: snapshots.some((snapshot) => snapshot.filePath !== profilePath),
    };
  }

  private recomputeProfileDerived(profile: Record<string, unknown>): void {
    delete profile.bmr;
    delete profile.tdee;
    delete profile.daily_target;

    const h = parseHeightCm(profile.height ?? profile.height_cm) ?? Number(profile.height_cm || 0);
    const w = parseWeightKg(profile.weight ?? profile.weight_kg) ?? Number(profile.weight_kg || 0);
    const a = Number(profile.age || 0);
    const g = inferGender(profile.gender) || 'male';
    const activity = inferActivityLevel(profile.activity_level) || 'moderate';
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
    const goal = inferGoal(profile.goal) || 'maintain';
    const dailyTarget = goal === 'cut'
      ? Math.round(tdee - 500)
      : goal === 'bulk'
        ? Math.round(tdee + 300)
        : tdee;

    profile.height_cm = Number.isFinite(h) && h > 0 ? Math.round(h * 10) / 10 : null;
    profile.weight_kg = Number.isFinite(w) && w > 0 ? Math.round(w * 100) / 100 : null;
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

  private async readTrainingPlanIndex(userId: string): Promise<TrainingPlanIndex> {
    const raw = await readJson<Record<string, unknown>>(this.getTrainingPlanPath(userId), {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const out: TrainingPlanIndex = {};
    for (const [day, plan] of Object.entries(raw)) {
      if (!normalizeDateOnly(day)) continue;
      if (!plan || typeof plan !== 'object' || Array.isArray(plan)) continue;
      const record = plan as Record<string, unknown>;
      const exercisesRaw = Array.isArray(record.exercises) ? record.exercises : [];
      const exercises = exercisesRaw.map((exercise, index) => {
        const item = exercise && typeof exercise === 'object' && !Array.isArray(exercise)
          ? exercise as Record<string, unknown>
          : {};
        return {
          id: safeString(item.id, 120) || createTrainingPlanExerciseId(day),
          exercise_key: safeString(item.exercise_key, 120) || undefined,
          order: clampInt(item.order, 1, 20, index + 1),
          name: safeString(item.name, 120) || `Exercise ${index + 1}`,
          sets: clampInt(item.sets, 1, 20, 3),
          reps: safeString(item.reps, 30) || '8-12',
          rest_seconds: clampInt(item.rest_seconds, 15, 600, 75),
          target_weight_kg: toNumber(item.target_weight_kg, 0, 500),
          cue: safeString(item.cue, 220),
          notes: safeString(item.notes, 500),
          demo_url: safeString(item.demo_url, 1000),
          demo_thumbnail: safeString(item.demo_thumbnail, 1000),
          completed_at: safeString(item.completed_at, 80) || null,
        } satisfies TrainingPlanExercise;
      });

      out[day] = {
        id: safeString(record.id, 120) || createTrainingPlanId(day),
        day,
        coach_id: safeString(record.coach_id, 10) === 'lc' ? 'lc' : 'zj',
        title: safeString(record.title, 160) || 'Training plan',
        summary: safeString(record.summary, 800),
        timezone: safeString(record.timezone, 80) || 'UTC',
        created_at: safeString(record.created_at, 80) || nowIso(),
        updated_at: safeString(record.updated_at, 80) || nowIso(),
        exercises: exercises.sort((left, right) => left.order - right.order),
      };
    }

    return out;
  }

  private async writeTrainingPlanIndex(userId: string, payload: TrainingPlanIndex): Promise<void> {
    const filePath = this.getTrainingPlanPath(userId);
    await ensureDir(path.dirname(filePath));
    await writeJsonAtomic(filePath, payload);
  }

  private resolveCoachId(userId: string): 'zj' | 'lc' {
    const row = getDB().prepare('SELECT selected_coach FROM users WHERE id = ?').get(userId) as { selected_coach?: string | null } | undefined;
    return safeString(row?.selected_coach, 10) === 'lc' ? 'lc' : 'zj';
  }

  private async hydrateTrainingPlanEntry(
    userId: string,
    day: string,
    entry: TrainingPlanEntry,
    plans?: TrainingPlanIndex,
  ): Promise<TrainingPlanEntry> {
    const exercises = await Promise.all(entry.exercises.map((exercise) => this.hydrateTrainingExerciseDemo(exercise)));
    const changed = exercises.some((exercise, index) => JSON.stringify(exercise) !== JSON.stringify(entry.exercises[index]));
    if (!changed) {
      return entry;
    }

    const next = {
      ...entry,
      exercises,
    };

    if (plans) {
      plans[day] = next;
      await this.writeTrainingPlanIndex(userId, plans);
    }

    return next;
  }

  private async hydrateTrainingExerciseDemo(input: TrainingPlanExercise): Promise<TrainingPlanExercise> {
    const keyedEntry = input.exercise_key ? getExerciseLibraryEntry(input.exercise_key) : null;
    const matchedEntry = keyedEntry || resolveExerciseLibraryEntry(input.name);
    const base: TrainingPlanExercise = matchedEntry
      ? {
          ...input,
          exercise_key: matchedEntry.key,
          name: matchedEntry.name,
          demo_url: input.demo_url || matchedEntry.demoUrl,
          demo_thumbnail: input.demo_thumbnail || matchedEntry.thumbnailUrl,
        }
      : input;

    if (base.demo_url) {
      return {
        ...base,
        demo_thumbnail: buildDemoThumbnailUrl(base.demo_url, base.demo_thumbnail),
      };
    }

    try {
      const result = await this.searchExerciseVideos({
        query: base.name,
        maxResults: 1,
      });
      const first = Array.isArray(result.results) ? result.results[0] as Record<string, unknown> | undefined : undefined;
      const url = safeString(first?.url, 1000);
      return {
        ...base,
        demo_url: url || undefined,
        demo_thumbnail: buildDemoThumbnailUrl(url, base.demo_thumbnail),
      };
    } catch {
      return base;
    }
  }

  async getContext(
    userId: string,
    input: { scope?: unknown; limit?: unknown; sessionFile?: unknown } = {},
  ): Promise<Record<string, unknown>> {
    const scope = normalizeSessionScope(input.scope);
    const limit = clampInt(input.limit, 1, 24, 6);
    const sessionFile = String(input.sessionFile || '').trim() || undefined;
    const session = await this.sessionStore.refreshPinnedFacts(await this.sessionStore.loadFromFile(userId, sessionFile));
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
    const profilePath = this.getProfilePath(userId);
    const { merged, canonical, usedRecoverySources } = await this.loadMergedProfileState(userId);
    const normalized = { ...merged, ...this.sanitizeProfilePatch(merged) } as Record<string, unknown>;
    const userRow = getDB()
      .prepare('SELECT fitness_goal, timezone FROM users WHERE id = ?')
      .get(userId) as { fitness_goal?: string | null; timezone?: string | null } | undefined;
    if (!normalizeFreeformProfileText(normalized.goal, 120)) {
      const fallbackGoal = normalizeFreeformProfileText(userRow?.fitness_goal, 120);
      if (fallbackGoal) {
        normalized.goal = fallbackGoal;
      }
    }
    if (!normalizeFreeformProfileText(normalized.timezone, 120)) {
      const fallbackTimezone = safeString(userRow?.timezone, 120).replace(/\s+/g, '');
      if (fallbackTimezone && isValidTimeZone(fallbackTimezone)) {
        normalized.timezone = fallbackTimezone;
      }
    }
    this.recomputeProfileDerived(normalized);

    const normalizedCanonical = { ...canonical, ...this.sanitizeProfilePatch(canonical) } as Record<string, unknown>;
    this.recomputeProfileDerived(normalizedCanonical);

    if (usedRecoverySources || JSON.stringify(normalizedCanonical) !== JSON.stringify(normalized)) {
      await ensureDir(path.dirname(profilePath));
      await writeJsonAtomic(profilePath, normalized);
    }

    return normalized;
  }

  async setProfile(userId: string, profilePatch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sanitized = this.sanitizeProfilePatch(profilePatch || {});
    const changedKeys = Object.keys(sanitized);
    if (changedKeys.length === 0) {
      throw new Error('No valid profile fields were provided');
    }

    const profilePath = this.getProfilePath(userId);
    await ensureDir(path.dirname(profilePath));
    const { merged: current } = await this.loadMergedProfileState(userId);
    const next = { ...current, ...sanitized };
    this.recomputeProfileDerived(next);
    await writeJsonAtomic(profilePath, next);

    return {
      updatedFields: changedKeys,
      profile: next,
    };
  }

  async getTrainingPlan(
    userId: string,
    input: { day?: unknown; timezone?: unknown } = {},
  ): Promise<Record<string, unknown>> {
    const requestedDay = normalizeDateOnly(input.day);
    const stamp = requestedDay
      ? {
          day: requestedDay,
          timezone: await this.resolvePreferredTimezone(userId, input.timezone),
        }
      : await this.resolveLogStamp(userId, { timezone: input.timezone });
    const plans = await this.readTrainingPlanIndex(userId);
    const plan = plans[stamp.day]
      ? await this.hydrateTrainingPlanEntry(userId, stamp.day, plans[stamp.day], plans)
      : null;
    return {
      day: stamp.day,
      timezone: stamp.timezone,
      plan,
    };
  }

  async setTrainingPlan(userId: string, rawPlan: Record<string, unknown>): Promise<Record<string, unknown>> {
    const stamp = await this.resolveLogStamp(userId, {
      localDate: rawPlan.day,
      timezone: rawPlan.timezone,
    });
    const day = stamp.day;
    const title = safeString(rawPlan.title, 160) || 'Training plan';
    const summary = safeString(rawPlan.summary, 800);
    const exercisesRaw = Array.isArray(rawPlan.exercises) ? rawPlan.exercises : [];

    const cleanedBase = exercisesRaw
      .slice(0, 12)
      .reduce<TrainingPlanExercise[]>((acc, entry, index) => {
        const item = entry && typeof entry === 'object' && !Array.isArray(entry)
          ? entry as Record<string, unknown>
          : {};
        const name = safeString(item.name, 120);
        if (!name) return acc;

        acc.push({
          id: safeString(item.id, 120) || createTrainingPlanExerciseId(day),
          exercise_key: safeString(item.exercise_key, 120) || undefined,
          order: clampInt(item.order, 1, 20, index + 1),
          name,
          sets: clampInt(item.sets, 1, 20, 3),
          reps: safeString(item.reps, 30) || '8-12',
          rest_seconds: clampInt(item.rest_seconds, 15, 600, 75),
          target_weight_kg: toNumber(item.target_weight_kg, 0, 500) ?? undefined,
          cue: safeString(item.cue, 220),
          notes: safeString(item.notes, 500),
          demo_url: safeString(item.demo_url, 1000) || undefined,
          demo_thumbnail: safeString(item.demo_thumbnail, 1000) || undefined,
          completed_at: null,
        });
        return acc;
      }, [])
      .sort((left, right) => left.order - right.order);

    if (cleanedBase.length === 0) {
      throw new Error('A training plan requires at least one exercise');
    }

    const exercises: TrainingPlanExercise[] = [];
    for (const exercise of cleanedBase) {
      exercises.push(await this.hydrateTrainingExerciseDemo(exercise));
    }

    const plans = await this.readTrainingPlanIndex(userId);
    const previous = plans[day];
    plans[day] = {
      id: previous?.id || createTrainingPlanId(day),
      day,
      coach_id: this.resolveCoachId(userId),
      title,
      summary,
      timezone: stamp.timezone,
      created_at: previous?.created_at || nowIso(),
      updated_at: nowIso(),
      exercises,
    };
    await this.writeTrainingPlanIndex(userId, plans);

    return {
      day,
      timezone: stamp.timezone,
      plan: plans[day],
    };
  }

  async toggleTrainingPlanExerciseCompletion(
    userId: string,
    input: { day?: unknown; exerciseId?: unknown; completed?: unknown; occurredAt?: unknown; timezone?: unknown },
  ): Promise<Record<string, unknown>> {
    const day = normalizeDateOnly(input.day);
    const exerciseId = safeString(input.exerciseId, 120);
    if (!day) {
      throw new Error('Valid day is required');
    }
    if (!exerciseId) {
      throw new Error('exerciseId is required');
    }

    const plans = await this.readTrainingPlanIndex(userId);
    const plan = plans[day];
    if (!plan) {
      throw new Error('Training plan not found');
    }

    const exercise = plan.exercises.find((item) => item.id === exerciseId);
    if (!exercise) {
      throw new Error('Training plan exercise not found');
    }

    const shouldComplete = Boolean(input.completed);
    const stamp = await this.resolveLogStamp(userId, {
      localDate: day,
      occurredAt: input.occurredAt,
      timezone: input.timezone || plan.timezone,
    });

    const dailyPath = this.getDailyPath(userId);
    await ensureDir(path.dirname(dailyPath));
    const daily = await readJson<Record<string, any>>(dailyPath, {});
    if (!daily[day] || typeof daily[day] !== 'object') {
      daily[day] = { meals: [], training: [], total_intake: 0, total_burned: 0 };
    }
    if (!Array.isArray(daily[day].training)) {
      daily[day].training = [];
    }

    const trainingEntries = daily[day].training as Array<Record<string, unknown>>;
    const existingIndex = trainingEntries.findIndex((entry) => (
      safeString(entry.source_plan_id, 120) === plan.id
      && safeString(entry.source_exercise_id, 120) === exercise.id
    ));

    if (shouldComplete) {
      exercise.completed_at = nowIso();
      if (existingIndex === -1) {
        trainingEntries.push({
          id: createLogEntryId('train', day),
          time: stamp.time,
          timezone: stamp.timezone,
          occurred_at_utc: stamp.occurredAtUtc,
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          weight_kg: Number.isFinite(Number(exercise.target_weight_kg)) ? Number(exercise.target_weight_kg) : 0,
          notes: exercise.notes || exercise.cue || '',
          source_plan_id: plan.id,
          source_exercise_id: exercise.id,
          from_plan: true,
        });
      }
    } else {
      exercise.completed_at = null;
      if (existingIndex >= 0) {
        trainingEntries.splice(existingIndex, 1);
      }
    }

    plan.updated_at = nowIso();
    await this.writeTrainingPlanIndex(userId, plans);

    daily[day].training = trainingEntries;
    daily[day].total_burned = Math.round(
      trainingEntries.reduce((sum, entry) => {
        const sets = clampInt(entry.sets, 0, 60, 0);
        const repsText = safeString(entry.reps, 20) || '0';
        const reps = clampInt(repsText, 0, 200, 0);
        const weightKg = Number.isFinite(Number(entry.weight_kg)) ? Number(entry.weight_kg) : 0;
        return sum + Math.round((sets * reps * weightKg) / 10);
      }, 0),
    );
    await writeJsonAtomic(dailyPath, daily);

    return {
      day,
      completed: shouldComplete,
      exercise,
      plan,
    };
  }

  private async openRouterJson(
    content: unknown,
    maxTokens = 2048,
    usageContext?: OpenRouterUsageContext,
  ): Promise<any> {
    const apiKey = safeString(process.env.OPENROUTER_API_KEY, 500);
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required');
    }
    const model = safeString(process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview', 120);
    const startedAt = Date.now();
    try {
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
        const error = new Error(`OpenRouter request failed (${response.status}): ${detail.slice(0, 240)}`);
        OpenRouterUsageService.recordFailure(error, {
          source: usageContext?.source || 'coach_typed_tool',
          requestKind: 'chat',
          userId: usageContext?.userId,
          topic: usageContext?.topic,
          model,
          metadata: usageContext?.metadata,
        }, startedAt);
        throw error;
      }
      const payload = await response.json().catch(() => ({} as any));
      OpenRouterUsageService.recordSuccessFromPayload(payload, {
        source: usageContext?.source || 'coach_typed_tool',
        requestKind: 'chat',
        userId: usageContext?.userId,
        topic: usageContext?.topic,
        model,
        metadata: usageContext?.metadata,
      }, startedAt);
      const raw = safeString(payload?.choices?.[0]?.message?.content, 120_000);
      const jsonText = extractJsonPayload(raw);
      try {
        return JSON.parse(jsonText);
      } catch {
        throw new Error('Model did not return valid JSON');
      }
    } catch (error) {
      if (!String(error instanceof Error ? error.message : error).includes('OpenRouter request failed')) {
        OpenRouterUsageService.recordFailure(error, {
          source: usageContext?.source || 'coach_typed_tool',
          requestKind: 'chat',
          userId: usageContext?.userId,
          topic: usageContext?.topic,
          model,
          metadata: usageContext?.metadata,
        }, startedAt);
      }
      throw error;
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
    const ai = await this.openRouterJson([{ type: 'text', text: prompt }], 1600, {
      source: 'coach_meal_estimate',
      requestKind: 'chat',
      userId: Number(userId) || null,
      metadata: { tool: 'log_meal' },
    });
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
    const items = this.mediaAssetService.listRecentForUser(Number(userId), limit);
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
        analysisCount: 0,
      })),
    };
  }

  private async resolveMediaForInspection(
    userId: string,
    mediaId: string,
  ): Promise<{ id: string; kind: 'image' | 'video'; mimeType: string; body: Buffer; sourceType: 'asset' | 'legacy'; asset?: MediaAssetRecord }> {
    if (mediaId.startsWith('asset_')) {
      const asset = this.mediaAssetService.getById(mediaId);
      if (!asset || asset.ownerUserId !== Number(userId) || asset.status !== 'ready') {
        throw new Error('mediaId not found or expired');
      }
      const body = await this.mediaAssetService.getObjectBody(asset);
      return {
        id: asset.id,
        kind: asset.kind === 'video' ? 'video' : 'image',
        mimeType: asset.mimeType,
        body,
        sourceType: 'asset',
        asset,
      };
    }

    const media = await this.mediaStore.getMediaById(userId, mediaId);
    if (!media) {
      throw new Error('mediaId not found or expired');
    }
    const absolutePath = this.assertMediaPathWithinUserRoot(userId, media.storedPath);
    const body = await fs.readFile(absolutePath);
    return {
      id: media.id,
      kind: media.kind,
      mimeType: media.mimeType,
      body,
      sourceType: 'legacy',
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
- For videos sampled by frames, do not claim an exact rep count, set count, or plate load unless it is clearly visible across the sampled evidence.
- If reps, sets, or total load are uncertain, say so explicitly, provide the most likely range, and set needsConfirmation to true.
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
      const targetFrameCount = duration <= 12 ? 8 : duration <= 24 ? 6 : 4;
      const points = Array.from({ length: targetFrameCount }, (_, index) => {
        const ratio = (index + 1) / (targetFrameCount + 1);
        return Math.max(0.1, duration * ratio);
      });

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
    if (!/^(med|asset)_[a-zA-Z0-9._-]{4,120}$/.test(mediaId)) {
      throw new Error('Invalid mediaId');
    }
    const question = safeString(input.question, 500);
    const domain = normalizeInspectDomain(input.domain);

    const media = await this.resolveMediaForInspection(userId, mediaId);
    const binary = media.body;
    const fileSizeMb = binary.length / (1024 * 1024);
    logger.info(
      `[tool][inspect_media] start mediaId=${mediaId} kind=${media.kind} mime=${media.mimeType} sizeMb=${fileSizeMb.toFixed(2)} question="${question.slice(0, 160)}"`,
    );

    let result: any;
    const contentParts: any[] = [];

    if (media.kind === 'video') {
      const tempVideoPath = path.join(os.tmpdir(), `zym-inspect-${mediaId}${media.mimeType.includes('quicktime') ? '.mov' : '.mp4'}`);
      await fs.writeFile(tempVideoPath, binary);
      const frames = await this.extractVideoFrames(tempVideoPath);
      await fs.rm(tempVideoPath, { force: true }).catch(() => {});
      if (frames.length > 0) {
        logger.info(
          `[tool][inspect_media] extracted_frames mediaId=${mediaId} count=${frames.length} mime=${media.mimeType}`,
        );
        for (const frame of frames) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${frame.toString('base64')}` },
          });
        }
      } else if (fileSizeMb <= 22) {
        logger.warn(
          `[tool][inspect_media] direct_video_fallback mediaId=${mediaId} mime=${media.mimeType} sizeMb=${fileSizeMb.toFixed(2)}`,
        );
        contentParts.push({
          type: 'video_url',
          video_url: { url: `data:${media.mimeType};base64,${binary.toString('base64')}` },
        });
      } else {
        logger.warn(
          `[tool][inspect_media] video_too_large mediaId=${mediaId} mime=${media.mimeType} sizeMb=${fileSizeMb.toFixed(2)}`,
        );
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
      result = await this.openRouterJson(contentParts, 2200, {
        source: 'coach_media_inspection',
        requestKind: 'chat',
        userId: Number(userId) || null,
        metadata: {
          tool: 'inspect_media',
          domain,
          hasQuestion: Boolean(question),
          mediaId,
        },
      });
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

    if (media.sourceType === 'legacy') {
      const index = await this.mediaStore.loadIndex(userId);
      const item = index.items.find((entry) => entry.id === mediaId);
      if (item) {
        item.analysisIds = Array.isArray(item.analysisIds) ? item.analysisIds : [];
        if (!item.analysisIds.includes(analysisId)) {
          item.analysisIds.push(analysisId);
        }
        await this.mediaStore.saveIndex(userId, index);
      }
    }
    logger.info(
      `[tool][inspect_media] done mediaId=${mediaId} analysisId=${analysisId} confidence=${normalized.confidence} evidence=${normalized.evidence.length} ambiguities=${normalized.ambiguities.length}`,
    );

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
    const domains = normalizeKnowledgeDomains(input.domains);
    const topK = clampInt(input.topK, 1, 8, 4);
    const minScore = toNumber(input.minScore, 0, 1) ?? 0.08;
    logger.info(
      `[tool][search_knowledge] start domains=${domains.join(',') || 'all'} topK=${topK} minScore=${minScore.toFixed(2)} query="${query.slice(0, 160)}"`,
    );
    const matches = await knowledgeService.searchHybrid(query, {
      domains: domains.length > 0 ? domains : undefined,
      topK,
      minScore,
    });
    logger.info(
      `[tool][search_knowledge] done matches=${matches.length} domains=${domains.join(',') || 'all'} query="${query.slice(0, 160)}"`,
    );

    return {
      query,
      total: matches.length,
      matches: matches.map((item, idx) => ({
        rank: idx + 1,
        title: safeString(item.title || item.source, 300),
        source: item.source,
        domain: item.domain,
        backend: item.backend,
        score: Number(item.score.toFixed(4)),
        authors: safeString(item.authors, 300),
        year: safeString(item.year, 16),
        category: safeString(item.category, 80),
        referenceUrl: safeString(item.referenceUrl, 500),
        pdfUrl: safeString(item.pdfUrl, 500),
        sourceUrl: safeString(item.pdfUrl || item.referenceUrl, 500),
        citationMarkdown: item.pdfUrl || item.referenceUrl
          ? `[${idx + 1}](${safeString(item.pdfUrl || item.referenceUrl, 500)})`
          : '',
        snippet: safeString(item.text, 1200),
      })),
    };
  }

  async searchExerciseLibrary(input: {
    query: unknown;
    limit?: unknown;
  }): Promise<Record<string, unknown>> {
    const query = safeString(input.query, 240);
    if (!query) {
      throw new Error('Query is required');
    }

    const limit = clampInt(input.limit, 1, 8, 5);
    const matches = searchExerciseLibraryEntries(query, limit);
    return {
      query,
      total: matches.length,
      matches: matches.map((match, idx) => ({
        rank: idx + 1,
        exercise_key: match.entry.key,
        name: match.entry.name,
        group: match.entry.group,
        equipment: match.entry.equipment,
        aliases: match.entry.aliases,
        score: Number(match.score.toFixed(4)),
        thumbnailUrl: match.entry.thumbnailUrl,
        demoUrl: match.entry.demoUrl,
        imageUrls: match.entry.imageUrls,
      })),
    };
  }

  async searchExerciseVideos(input: {
    query: unknown;
    maxResults?: unknown;
  }): Promise<Record<string, unknown>> {
    const query = safeString(input.query, 240);
    if (!query) {
      throw new Error('Query is required');
    }

    const maxResults = clampInt(input.maxResults, 1, 5, 3);
    const searchTerms = `${query} exercise form tutorial`;
    const fallbackSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerms)}`;

    try {
      const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(`site:youtube.com ${searchTerms}`)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed (${response.status})`);
      }

      const html = await response.text();
      const results: Array<Record<string, unknown>> = [];
      const pattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(html)) && results.length < maxResults) {
        const url = unwrapDuckDuckGoUrl(decodeHtmlEntities(match[1]));
        if (!isYoutubeWatchUrl(url)) {
          continue;
        }
        const title = safeString(decodeHtmlEntities(stripHtmlTags(match[2])), 180);
        if (!title) {
          continue;
        }
        results.push({
          rank: results.length + 1,
          title,
          url,
          markdownLink: `[${normalizeMarkdownLinkLabel(title)}](${url})`,
          platform: 'youtube',
        });
      }

      return {
        query,
        total: results.length,
        searchUrl: fallbackSearchUrl,
        results,
      };
    } catch (error: any) {
      logger.warn(`[tool][search_exercise_videos] fallback search URL only query="${query.slice(0, 160)}" error=${String(error?.message || error)}`);
      return {
        query,
        total: 0,
        searchUrl: fallbackSearchUrl,
        results: [],
      };
    }
  }
}

export const coachTypedToolsService = new CoachTypedToolsService();
