export type CoachCheckInAdherence = 'on_track' | 'partial' | 'off_track';

export interface CoachCheckIn {
  weight_kg?: number | null;
  body_fat_pct?: number | null;
  waist_cm?: number | null;
  energy?: number | null;
  hunger?: number | null;
  recovery?: number | null;
  adherence?: CoachCheckInAdherence | null;
  notes?: string | null;
  timezone?: string | null;
  occurred_at_utc?: string | null;
  logged_at?: string | null;
}

export interface CoachProgressPoint {
  day: string;
  logged_at: string | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  energy: number | null;
  hunger: number | null;
  recovery: number | null;
  adherence: CoachCheckInAdherence | null;
  notes: string | null;
  has_check_in: boolean;
  meal_count: number;
  training_count: number;
  total_intake: number;
  total_burned: number;
}

export interface CoachProgressSummary {
  latestCheckInDay: string | null;
  latestCheckInAt: string | null;
  latestWeightDay: string | null;
  latestWeightKg: number | null;
  latestBodyFatPct: number | null;
  latestWaistCm: number | null;
  weight7dAvg: number | null;
  weight14dDelta: number | null;
  weight30dDelta: number | null;
  avgEnergy7d: number | null;
  avgHunger7d: number | null;
  avgRecovery7d: number | null;
  adherence7d: 'on_track' | 'partial' | 'off_track' | 'mixed' | 'unknown';
  lastBodyFatDay: string | null;
  lastWaistDay: string | null;
  checkInDays: number;
  trendLine: 'down' | 'up' | 'flat' | 'unknown';
  status: 'on_track' | 'watch' | 'off_track' | 'insufficient_data';
  statusLabel: string;
  trendNarrative: string;
}

function safeText(value: unknown, maxLength = 500): string {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toRoundedNumber(value: unknown, min: number, max: number): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < min || numeric > max) return null;
  return Math.round(numeric * 100) / 100;
}

function toRoundedInt(value: unknown, min: number, max: number): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.round(numeric);
  if (integer < min || integer > max) return null;
  return integer;
}

function normalizeAdherence(value: unknown): CoachCheckInAdherence | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'on_track' || normalized === 'partial' || normalized === 'off_track') {
    return normalized;
  }
  return null;
}

function normalizeIso(value: unknown): string | null {
  const text = safeText(value, 80);
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(day: string, delta: number): string {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

function average(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (clean.length === 0) return null;
  const sum = clean.reduce((total, value) => total + value, 0);
  return Math.round((sum / clean.length) * 100) / 100;
}

function firstAndLastDelta(values: Array<{ day: string; value: number | null }>, startDay: string, endDay: string): number | null {
  const inWindow = values.filter((entry) => entry.day >= startDay && entry.day <= endDay && typeof entry.value === 'number');
  if (inWindow.length < 2) return null;
  const first = inWindow[0]?.value;
  const last = inWindow[inWindow.length - 1]?.value;
  if (typeof first !== 'number' || typeof last !== 'number') return null;
  return Math.round((last - first) * 100) / 100;
}

export function normalizeCoachCheckIn(raw: unknown): CoachCheckIn | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const normalized: CoachCheckIn = {
    weight_kg: toRoundedNumber(record.weight_kg, 20, 350),
    body_fat_pct: toRoundedNumber(record.body_fat_pct, 2, 70),
    waist_cm: toRoundedNumber(record.waist_cm, 30, 250),
    energy: toRoundedInt(record.energy, 1, 5),
    hunger: toRoundedInt(record.hunger, 1, 5),
    recovery: toRoundedInt(record.recovery, 1, 5),
    adherence: normalizeAdherence(record.adherence),
    notes: safeText(record.notes, 500) || null,
    timezone: safeText(record.timezone, 80) || null,
    occurred_at_utc: normalizeIso(record.occurred_at_utc),
    logged_at: normalizeIso(record.logged_at),
  };

  const hasMeaningfulValue = Object.values(normalized).some((value) => {
    if (value === null || value === undefined || value === '') return false;
    return true;
  });
  return hasMeaningfulValue ? normalized : null;
}

export function buildCoachProgressPoints(rawDaily: unknown, maxDays = 120): CoachProgressPoint[] {
  if (!rawDaily || typeof rawDaily !== 'object' || Array.isArray(rawDaily)) {
    return [];
  }

  return Object.entries(rawDaily as Record<string, unknown>)
    .filter(([day]) => isIsoDay(day))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-Math.max(1, Math.floor(Number(maxDays) || 120)))
    .map(([day, rawBucket]) => {
      const bucket = rawBucket && typeof rawBucket === 'object' && !Array.isArray(rawBucket)
        ? rawBucket as Record<string, unknown>
        : {};
      const checkIn = normalizeCoachCheckIn(bucket.check_in);
      const meals = Array.isArray(bucket.meals) ? bucket.meals : [];
      const training = Array.isArray(bucket.training) ? bucket.training : [];
      return {
        day,
        logged_at: checkIn?.logged_at ?? null,
        weight_kg: checkIn?.weight_kg ?? null,
        body_fat_pct: checkIn?.body_fat_pct ?? null,
        waist_cm: checkIn?.waist_cm ?? null,
        energy: checkIn?.energy ?? null,
        hunger: checkIn?.hunger ?? null,
        recovery: checkIn?.recovery ?? null,
        adherence: checkIn?.adherence ?? null,
        notes: checkIn?.notes ?? null,
        has_check_in: Boolean(checkIn),
        meal_count: meals.length,
        training_count: training.length,
        total_intake: Math.round(Number(bucket.total_intake || 0) * 100) / 100,
        total_burned: Math.round(Number(bucket.total_burned || 0) * 100) / 100,
      } satisfies CoachProgressPoint;
    });
}

function summarizeAdherence(values: Array<CoachCheckInAdherence | null | undefined>): CoachProgressSummary['adherence7d'] {
  const clean = values.filter((value): value is CoachCheckInAdherence => Boolean(value));
  if (clean.length === 0) return 'unknown';
  if (clean.every((value) => value === 'on_track')) return 'on_track';
  if (clean.every((value) => value === 'partial')) return 'partial';
  if (clean.every((value) => value === 'off_track')) return 'off_track';
  return 'mixed';
}

function buildStatus(goalRaw: unknown, weight14dDelta: number | null): Pick<CoachProgressSummary, 'status' | 'statusLabel' | 'trendLine'> {
  if (weight14dDelta === null) {
    return {
      status: 'insufficient_data',
      statusLabel: 'Need more check-ins',
      trendLine: 'unknown',
    };
  }

  const goal = String(goalRaw || '').trim().toLowerCase();
  const trendLine: CoachProgressSummary['trendLine'] = weight14dDelta < -0.15
    ? 'down'
    : weight14dDelta > 0.15
      ? 'up'
      : 'flat';

  if (goal === 'cut') {
    if (weight14dDelta <= -0.25 && weight14dDelta >= -2.25) {
      return { status: 'on_track', statusLabel: 'Cutting on track', trendLine };
    }
    if (weight14dDelta > 0.3) {
      return { status: 'off_track', statusLabel: 'Weight trending up', trendLine };
    }
    return { status: 'watch', statusLabel: 'Progress needs attention', trendLine };
  }

  if (goal === 'bulk') {
    if (weight14dDelta >= 0.25 && weight14dDelta <= 2.25) {
      return { status: 'on_track', statusLabel: 'Gaining on track', trendLine };
    }
    if (weight14dDelta < -0.3) {
      return { status: 'off_track', statusLabel: 'Weight trending down', trendLine };
    }
    return { status: 'watch', statusLabel: 'Progress needs attention', trendLine };
  }

  if (Math.abs(weight14dDelta) <= 0.8) {
    return { status: 'on_track', statusLabel: 'Holding steady', trendLine };
  }
  return { status: 'watch', statusLabel: 'Weight drifting', trendLine };
}

function buildNarrative(summary: Omit<CoachProgressSummary, 'trendNarrative'>): string {
  if (summary.latestWeightKg === null) {
    return 'No weight check-ins yet. Log one quick check-in so your coach can track progress instead of guessing.';
  }

  const parts = [`Latest weight ${summary.latestWeightKg} kg`];
  if (summary.weight7dAvg !== null) {
    parts.push(`7-day average ${summary.weight7dAvg} kg`);
  }
  if (summary.weight14dDelta !== null) {
    const sign = summary.weight14dDelta > 0 ? '+' : '';
    parts.push(`14-day change ${sign}${summary.weight14dDelta} kg`);
  }
  parts.push(summary.statusLabel);
  return `${parts.join(' • ')}.`;
}

export function computeCoachProgressSummary(
  rawDaily: unknown,
  goalRaw?: unknown,
  maxDays = 120,
): CoachProgressSummary {
  const points = buildCoachProgressPoints(rawDaily, maxDays);
  const latestCheckInPoint = [...points].reverse().find((point) => point.has_check_in) || null;
  const latestWeightPoint = [...points].reverse().find((point) => typeof point.weight_kg === 'number') || null;
  const latestBodyFatPoint = [...points].reverse().find((point) => typeof point.body_fat_pct === 'number') || null;
  const latestWaistPoint = [...points].reverse().find((point) => typeof point.waist_cm === 'number') || null;
  const weightSeries = points
    .filter((point) => typeof point.weight_kg === 'number')
    .map((point) => ({ day: point.day, value: point.weight_kg }));

  const anchorDay = latestWeightPoint?.day || latestCheckInPoint?.day || points[points.length - 1]?.day || null;
  const recent7Start = anchorDay ? addDays(anchorDay, -6) : null;
  const recent14Start = anchorDay ? addDays(anchorDay, -13) : null;
  const recent30Start = anchorDay ? addDays(anchorDay, -29) : null;

  const recentPoints = recent7Start && anchorDay
    ? points.filter((point) => point.day >= recent7Start && point.day <= anchorDay)
    : [];
  const recentWeightPoints = recent7Start && anchorDay
    ? weightSeries.filter((entry) => entry.day >= recent7Start && entry.day <= anchorDay)
    : [];

  const weight7dAvg = average(recentWeightPoints.map((entry) => entry.value));
  const weight14dDelta = recent14Start && anchorDay
    ? firstAndLastDelta(weightSeries, recent14Start, anchorDay)
    : null;
  const weight30dDelta = recent30Start && anchorDay
    ? firstAndLastDelta(weightSeries, recent30Start, anchorDay)
    : null;
  const avgEnergy7d = average(recentPoints.map((point) => point.energy));
  const avgHunger7d = average(recentPoints.map((point) => point.hunger));
  const avgRecovery7d = average(recentPoints.map((point) => point.recovery));
  const adherence7d = summarizeAdherence(recentPoints.map((point) => point.adherence));
  const { status, statusLabel, trendLine } = buildStatus(goalRaw, weight14dDelta);

  const summaryWithoutNarrative: Omit<CoachProgressSummary, 'trendNarrative'> = {
    latestCheckInDay: latestCheckInPoint?.day || null,
    latestCheckInAt: latestCheckInPoint?.logged_at || latestCheckInPoint?.day || null,
    latestWeightDay: latestWeightPoint?.day || null,
    latestWeightKg: latestWeightPoint?.weight_kg ?? null,
    latestBodyFatPct: latestBodyFatPoint?.body_fat_pct ?? null,
    latestWaistCm: latestWaistPoint?.waist_cm ?? null,
    weight7dAvg,
    weight14dDelta,
    weight30dDelta,
    avgEnergy7d,
    avgHunger7d,
    avgRecovery7d,
    adherence7d,
    lastBodyFatDay: latestBodyFatPoint?.day || null,
    lastWaistDay: latestWaistPoint?.day || null,
    checkInDays: points.filter((point) => point.has_check_in).length,
    trendLine,
    status,
    statusLabel,
  };

  return {
    ...summaryWithoutNarrative,
    trendNarrative: buildNarrative(summaryWithoutNarrative),
  };
}

export function buildCoachProgressPinnedFacts(
  rawDaily: unknown,
  goalRaw?: unknown,
  maxDays = 120,
): string[] {
  const summary = computeCoachProgressSummary(rawDaily, goalRaw, maxDays);
  const facts: string[] = [];

  if (summary.latestWeightKg !== null) {
    let weightFact = `Latest weigh-in ${summary.latestWeightKg} kg`;
    if (summary.weight7dAvg !== null) {
      weightFact += `, 7-day average ${summary.weight7dAvg} kg`;
    }
    if (summary.weight14dDelta !== null) {
      const sign = summary.weight14dDelta > 0 ? '+' : '';
      weightFact += `, 14-day change ${sign}${summary.weight14dDelta} kg`;
    }
    facts.push(weightFact);
  }

  if (summary.latestBodyFatPct !== null) {
    facts.push(`Latest body fat ${summary.latestBodyFatPct}%${summary.lastBodyFatDay ? ` on ${summary.lastBodyFatDay}` : ''}`);
  }

  if (summary.avgEnergy7d !== null || summary.avgRecovery7d !== null || summary.adherence7d !== 'unknown') {
    const parts: string[] = [];
    if (summary.avgEnergy7d !== null) parts.push(`energy ${summary.avgEnergy7d}/5`);
    if (summary.avgRecovery7d !== null) parts.push(`recovery ${summary.avgRecovery7d}/5`);
    if (summary.adherence7d !== 'unknown') parts.push(`adherence ${summary.adherence7d}`);
    if (parts.length > 0) {
      facts.push(`Recent check-ins: ${parts.join(', ')}`);
    }
  }

  if (summary.status !== 'insufficient_data') {
    facts.push(`Progress status: ${summary.statusLabel}`);
  }

  return facts;
}
