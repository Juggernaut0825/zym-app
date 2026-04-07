'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getCoachRecords,
  getCoachTrainingPlan,
  toggleCoachTrainingPlanExercise,
  updateCoachCheckInRecord,
  updateCoachMealRecord,
  updateCoachRecordProfile,
  updateCoachTrainingRecord,
} from '@/lib/api';
import {
  activityLevelOptions,
  bodyFatRangeOptions,
  bodyFatRangeToValue,
  bodyFatValueToRange,
  experienceLevelOptions,
  formatNumericProfileValue,
  genderOptions,
  goalOptions,
  normalizeActivityLevelValue,
  normalizeExperienceLevelValue,
  normalizeGenderValue,
  normalizeGoalValue,
  normalizeTrainingDaysValue,
  trainingDayOptions,
  type SelectOption,
} from '@/lib/coach-profile-options';
import {
  CoachCheckInRecord,
  CoachDayRecord,
  CoachMealRecord,
  CoachProfileData,
  CoachProgressSummary,
  CoachRecordsResponse,
  CoachTrainingPlan,
  CoachTrainingPlanResponse,
  CoachTrainingRecord,
} from '@/lib/types';

export type CoachWorkspaceMode = 'info' | 'meals' | 'trains' | 'progress';

interface CoachWorkspacePanelProps {
  userId: number;
  active: boolean;
  mode: CoachWorkspaceMode;
  coachId: 'zj' | 'lc';
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onOpenMedia: (url: string, label: string) => void;
}

interface CoachProfileDraft {
  height: string;
  weight: string;
  age: string;
  bodyFatRange: string;
  trainingDays: string;
  gender: string;
  activityLevel: string;
  goal: string;
  experienceLevel: string;
  notes: string;
}

interface MealEditDraft {
  day: string;
  mealId: string;
  description: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  time: string;
}

interface TrainingEditDraft {
  day: string;
  trainingId: string;
  name: string;
  sets: string;
  reps: string;
  weight_kg: string;
  notes: string;
  time: string;
}

interface CheckInDraft {
  day: string;
  weight_kg: string;
  body_fat_pct: string;
  waist_cm: string;
  energy: string;
  hunger: string;
  recovery: string;
  adherence: string;
  notes: string;
}

type ProgressViewMode = 'trend' | 'calendar';
type ProgressRange = 7 | 30 | 90;

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toIntOrUndefined(value: string): number | undefined {
  const numeric = toNumberOrUndefined(value);
  if (numeric === undefined) return undefined;
  return Math.floor(numeric);
}

function localDayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatRest(seconds?: number): string {
  const safeSeconds = Number(seconds || 0);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) return 'Rest as needed';
  return `${safeSeconds} sec rest`;
}

function buildProfileDraft(profile: CoachProfileData): CoachProfileDraft {
  return {
    height: formatNumericProfileValue(profile.height_cm ?? profile.heightCm ?? profile.height, 1),
    weight: formatNumericProfileValue(profile.weight_kg ?? profile.weightKg ?? profile.weight, 2),
    age: formatNumericProfileValue(profile.age, 0),
    bodyFatRange: bodyFatValueToRange((profile.body_fat_pct ?? profile.bodyFatPct) as number | null | undefined),
    trainingDays: normalizeTrainingDaysValue(profile.training_days ?? profile.trainingDays),
    gender: normalizeGenderValue(profile.gender).slice(0, 40),
    activityLevel: normalizeActivityLevelValue(profile.activity_level ?? profile.activityLevel).slice(0, 60),
    goal: normalizeGoalValue(profile.goal ?? profile.fitness_goal ?? profile.fitnessGoal).slice(0, 120),
    experienceLevel: normalizeExperienceLevelValue(profile.experience_level ?? profile.experienceLevel).slice(0, 40),
    notes: toText(profile.notes).slice(0, 2000),
  };
}

function buildMealEditDraft(day: string, meal: CoachMealRecord): MealEditDraft {
  return {
    day,
    mealId: meal.id,
    description: toText(meal.description).slice(0, 500),
    calories: toText(meal.calories),
    protein_g: toText(meal.protein_g),
    carbs_g: toText(meal.carbs_g),
    fat_g: toText(meal.fat_g),
    time: toText(meal.time).slice(0, 5),
  };
}

function buildTrainingEditDraft(day: string, entry: CoachTrainingRecord): TrainingEditDraft {
  return {
    day,
    trainingId: entry.id,
    name: toText(entry.name).slice(0, 120),
    sets: toText(entry.sets),
    reps: toText(entry.reps).slice(0, 20),
    weight_kg: toText(entry.weight_kg),
    notes: toText(entry.notes).slice(0, 500),
    time: toText(entry.time).slice(0, 5),
  };
}

function buildCheckInDraft(day: string, checkIn?: CoachCheckInRecord | null): CheckInDraft {
  return {
    day,
    weight_kg: toText(checkIn?.weight_kg),
    body_fat_pct: toText(checkIn?.body_fat_pct),
    waist_cm: toText(checkIn?.waist_cm),
    energy: toText(checkIn?.energy),
    hunger: toText(checkIn?.hunger),
    recovery: toText(checkIn?.recovery),
    adherence: toText(checkIn?.adherence),
    notes: toText(checkIn?.notes).slice(0, 500),
  };
}

function selectClassName(value: string): string {
  return `input-shell ${value ? 'text-slate-700' : 'text-slate-400'}`;
}

function coachDisplayName(coachId: 'zj' | 'lc'): string {
  return coachId === 'lc' ? 'LC Coach' : 'ZJ Coach';
}

function buildPlanDescription(plan: CoachTrainingPlan | null): string {
  if (!plan?.summary) return '';
  return String(plan.summary || '').trim();
}

function addDays(day: string, delta: number): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

function buildRecentDays(range: number, endDay = localDayString()): string[] {
  return Array.from({ length: range }, (_, index) => addDays(endDay, index - range + 1));
}

function average(numbers: Array<number | null | undefined>): number | null {
  const clean = numbers.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (clean.length === 0) return null;
  const total = clean.reduce((sum, value) => sum + value, 0);
  return Math.round((total / clean.length) * 100) / 100;
}

function formatNullableMetric(value: number | null | undefined, suffix = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100) / 100}${suffix}`;
}

function formatSignedMetric(value: number | null | undefined, suffix = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}${suffix}`;
}

function formatChartDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day.slice(5);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

function buildLinePath(values: Array<number | null>, width: number, height: number): { path: string; dots: Array<{ x: number; y: number; value: number }> } {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numericValues.length === 0) {
    return { path: '', dots: [] };
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const paddedMin = min - 0.8;
  const paddedMax = max + 0.8;
  const range = Math.max(0.8, paddedMax - paddedMin);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const dots: Array<{ x: number; y: number; value: number }> = [];
  let path = '';

  values.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const x = stepX * index;
    const y = height - (((value - paddedMin) / range) * height);
    dots.push({ x, y, value });
    path += `${path ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  return { path, dots };
}

export function CoachWorkspacePanel(props: CoachWorkspacePanelProps) {
  const {
    userId,
    active,
    mode,
    coachId,
    onNotice,
    onError,
    onOpenMedia,
  } = props;

  const [selectedDay, setSelectedDay] = useState('');
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<CoachRecordsResponse | null>(null);
  const [trainingPlan, setTrainingPlan] = useState<CoachTrainingPlanResponse | null>(null);
  const [profileDraft, setProfileDraft] = useState<CoachProfileDraft>({
    height: '',
    weight: '',
    age: '',
    bodyFatRange: '',
    trainingDays: '',
    gender: '',
    activityLevel: '',
    goal: '',
    experienceLevel: '',
    notes: '',
  });
  const [mealDraft, setMealDraft] = useState<MealEditDraft | null>(null);
  const [trainingDraft, setTrainingDraft] = useState<TrainingEditDraft | null>(null);
  const [checkInDraft, setCheckInDraft] = useState<CheckInDraft>(buildCheckInDraft(localDayString(), null));
  const [progressViewMode, setProgressViewMode] = useState<ProgressViewMode>('trend');
  const [progressRange, setProgressRange] = useState<ProgressRange>(30);

  const effectiveDay = selectedDay || localDayString();
  const coachLabel = coachDisplayName(coachId);
  const primaryButtonClass = coachId === 'lc' ? 'btn btn-lc' : 'btn btn-zj';

  const dayLookup = useMemo(() => {
    const map = new Map<string, CoachDayRecord>();
    for (const day of records?.records || []) {
      map.set(day.day, day);
    }
    return map;
  }, [records]);

  const selectedDayRecord = useMemo(
    () => dayLookup.get(effectiveDay) || null,
    [dayLookup, effectiveDay],
  );

  const progressSummary = useMemo<CoachProgressSummary | null>(
    () => records?.progress || records?.profile?.progress_summary || null,
    [records],
  );

  const progressDays = useMemo(() => buildRecentDays(progressRange), [progressRange]);
  const progressSeries = useMemo(() => progressDays.map((day, index, allDays) => {
    const record = dayLookup.get(day);
    const weight = typeof record?.check_in?.weight_kg === 'number' ? record.check_in.weight_kg : null;
    const avgWeight = average(
      allDays
        .slice(Math.max(0, index - 6), index + 1)
        .map((innerDay) => {
          const innerRecord = dayLookup.get(innerDay);
          return typeof innerRecord?.check_in?.weight_kg === 'number' ? innerRecord.check_in.weight_kg : null;
        }),
    );
    return {
      day,
      weight,
      avgWeight,
      record,
    };
  }), [dayLookup, progressDays]);
  const calendarDays = useMemo(() => buildRecentDays(28), []);

  const activePlanExercises = useMemo(
    () => (trainingPlan?.plan?.exercises || [])
      .filter((exercise) => !exercise.completed_at)
      .sort((left, right) => left.order - right.order),
    [trainingPlan],
  );

  useEffect(() => {
    setSelectedDay((current) => current || localDayString());
  }, []);

  useEffect(() => {
    setCheckInDraft(buildCheckInDraft(effectiveDay, selectedDayRecord?.check_in || null));
  }, [effectiveDay, selectedDayRecord]);

  async function loadRecords() {
    if (!userId || userId <= 0) return;
    try {
      setLoadingRecords(true);
      const result = await getCoachRecords(userId, 120);
      setRecords(result);
      setProfileDraft(buildProfileDraft(result.profile || {}));
    } catch (error: any) {
      onError(error?.message || 'Failed to load coach records.');
    } finally {
      setLoadingRecords(false);
    }
  }

  async function loadPlan(day = effectiveDay) {
    if (!userId || userId <= 0) return;
    try {
      setLoadingPlan(true);
      const result = await getCoachTrainingPlan(userId, day);
      setTrainingPlan(result);
    } catch (error: any) {
      onError(error?.message || 'Failed to load training plan.');
    } finally {
      setLoadingPlan(false);
    }
  }

  useEffect(() => {
    if (!active || !userId) return;
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId]);

  useEffect(() => {
    if (!active || !userId || mode !== 'trains' || !effectiveDay) return;
    void loadPlan(effectiveDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId, mode, effectiveDay]);

  async function handleRefresh() {
    await loadRecords();
    if (mode === 'trains') {
      await loadPlan(effectiveDay);
    }
  }

  async function handleSaveProfile() {
    try {
      setSaving(true);
      await updateCoachRecordProfile({
        userId,
        height: profileDraft.height.trim() || undefined,
        weight: profileDraft.weight.trim() || undefined,
        age: toIntOrUndefined(profileDraft.age),
        body_fat_pct: bodyFatRangeToValue(profileDraft.bodyFatRange),
        training_days: toIntOrUndefined(profileDraft.trainingDays),
        gender: profileDraft.gender || undefined,
        activity_level: profileDraft.activityLevel || undefined,
        goal: profileDraft.goal || undefined,
        experience_level: profileDraft.experienceLevel || undefined,
        notes: profileDraft.notes.trim() || undefined,
      });
      await loadRecords();
      onNotice('Coach profile details saved.');
    } catch (error: any) {
      onError(error?.message || 'Failed to save coach info.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCheckIn() {
    try {
      setSaving(true);
      await updateCoachCheckInRecord({
        userId,
        day: checkInDraft.day,
        weight_kg: toNumberOrUndefined(checkInDraft.weight_kg),
        body_fat_pct: toNumberOrUndefined(checkInDraft.body_fat_pct),
        waist_cm: toNumberOrUndefined(checkInDraft.waist_cm),
        energy: toIntOrUndefined(checkInDraft.energy),
        hunger: toIntOrUndefined(checkInDraft.hunger),
        recovery: toIntOrUndefined(checkInDraft.recovery),
        adherence: (checkInDraft.adherence || undefined) as 'on_track' | 'partial' | 'off_track' | undefined,
        notes: checkInDraft.notes.trim() || undefined,
      });
      await loadRecords();
      onNotice('Progress check-in saved.');
    } catch (error: any) {
      onError(error?.message || 'Failed to save progress check-in.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMeal() {
    if (!mealDraft) return;
    try {
      setSaving(true);
      await updateCoachMealRecord({
        userId,
        day: mealDraft.day,
        mealId: mealDraft.mealId,
        description: mealDraft.description.trim().slice(0, 500),
        calories: toNumberOrUndefined(mealDraft.calories),
        protein_g: toNumberOrUndefined(mealDraft.protein_g),
        carbs_g: toNumberOrUndefined(mealDraft.carbs_g),
        fat_g: toNumberOrUndefined(mealDraft.fat_g),
        time: mealDraft.time.trim() || undefined,
      });
      await loadRecords();
      setMealDraft(null);
      onNotice('Meal record updated.');
    } catch (error: any) {
      onError(error?.message || 'Failed to update meal record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTraining() {
    if (!trainingDraft) return;
    try {
      setSaving(true);
      await updateCoachTrainingRecord({
        userId,
        day: trainingDraft.day,
        trainingId: trainingDraft.trainingId,
        name: trainingDraft.name.trim().slice(0, 120),
        sets: toIntOrUndefined(trainingDraft.sets),
        reps: trainingDraft.reps.trim().slice(0, 20) || undefined,
        weight_kg: toNumberOrUndefined(trainingDraft.weight_kg),
        notes: trainingDraft.notes.trim().slice(0, 500),
        time: trainingDraft.time.trim() || undefined,
      });
      await loadRecords();
      setTrainingDraft(null);
      onNotice('Training record updated.');
    } catch (error: any) {
      onError(error?.message || 'Failed to update training record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleExercise(exerciseId: string, completed: boolean) {
    try {
      setSaving(true);
      await toggleCoachTrainingPlanExercise({
        userId,
        day: effectiveDay,
        exerciseId,
        completed,
      });
      await Promise.all([loadRecords(), loadPlan(effectiveDay)]);
      onNotice(completed ? 'Moved this exercise into your training log.' : 'Returned this exercise to the active plan.');
    } catch (error: any) {
      onError(error?.message || 'Failed to update training plan.');
    } finally {
      setSaving(false);
    }
  }

  function renderHeaderExtras() {
    if (mode === 'info') {
      return (
        <p className="text-sm leading-6 text-slate-500">
          Tell the agent your height, weight, age, goal, and training context so {coachLabel} can know you better.
        </p>
      );
    }

    if (mode === 'progress') {
      return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Weight is the main daily signal. Waist and body fat stay optional so check-ins stay fast enough to actually keep doing.
          </p>
          <input
            className="input-shell w-full sm:w-[180px]"
            type="date"
            value={effectiveDay}
            onChange={(event) => setSelectedDay(event.target.value)}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {mode === 'meals'
            ? 'Filter by date. If nothing was logged that day, you will see the empty state right away.'
            : 'Coach plans appear on top. Checked exercises move into your training log below.'}
        </p>
        <input
          className="input-shell w-full sm:w-[180px]"
          type="date"
          value={effectiveDay}
          onChange={(event) => setSelectedDay(event.target.value)}
        />
      </div>
    );
  }

  function renderSelectField(
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: SelectOption[],
    placeholder: string,
  ) {
    return (
      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</span>
        <select
          className={selectClassName(value)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderInfoView() {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Height</span>
            <input
              className="input-shell"
              placeholder="Height"
              value={profileDraft.height}
              onChange={(event) => setProfileDraft((prev) => ({ ...prev, height: event.target.value.slice(0, 40) }))}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Weight</span>
            <input
              className="input-shell"
              placeholder="Weight"
              value={profileDraft.weight}
              onChange={(event) => setProfileDraft((prev) => ({ ...prev, weight: event.target.value.slice(0, 40) }))}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Age</span>
            <input
              className="input-shell"
              inputMode="numeric"
              placeholder="Age"
              value={profileDraft.age}
              onChange={(event) => setProfileDraft((prev) => ({ ...prev, age: event.target.value.slice(0, 3) }))}
            />
          </label>

          {renderSelectField('Body fat', profileDraft.bodyFatRange, (value) => setProfileDraft((prev) => ({ ...prev, bodyFatRange: value })), bodyFatRangeOptions, 'Body fat range')}
          {renderSelectField('Training days', profileDraft.trainingDays, (value) => setProfileDraft((prev) => ({ ...prev, trainingDays: value })), trainingDayOptions, 'Training days / week')}
          {renderSelectField('Gender', profileDraft.gender, (value) => setProfileDraft((prev) => ({ ...prev, gender: value })), genderOptions, 'Gender')}
          {renderSelectField('Activity', profileDraft.activityLevel, (value) => setProfileDraft((prev) => ({ ...prev, activityLevel: value })), activityLevelOptions, 'Activity level')}
          {renderSelectField('Goal', profileDraft.goal, (value) => setProfileDraft((prev) => ({ ...prev, goal: value })), goalOptions, 'Goal')}
          {renderSelectField('Experience', profileDraft.experienceLevel, (value) => setProfileDraft((prev) => ({ ...prev, experienceLevel: value })), experienceLevelOptions, 'Experience level')}
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Notes</span>
          <textarea
            className="input-shell min-h-[140px]"
            maxLength={2000}
            placeholder="Anything the coach should remember about injuries, equipment, preferences, or schedule."
            value={profileDraft.notes}
            onChange={(event) => setProfileDraft((prev) => ({ ...prev, notes: event.target.value.slice(0, 2000) }))}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button className={primaryButtonClass} type="button" onClick={() => void handleSaveProfile()} disabled={saving || loadingRecords}>
            {saving ? 'Saving...' : 'Save coach info'}
          </button>
        </div>
      </div>
    );
  }

  function renderMealsView() {
    const meals = selectedDayRecord?.meals || [];

    return (
      <div className="space-y-6">
        <div className="rounded-[24px] border border-white/70 bg-white/72 p-5">
          <p className="text-sm font-semibold text-slate-900">{formatDay(effectiveDay)}</p>
          <p className="mt-1 text-sm text-slate-500">
            Intake {Math.round(selectedDayRecord?.total_intake || 0)} kcal
          </p>
        </div>

        {meals.length === 0 ? (
          <div className="grid min-h-[240px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-white/55 px-6 text-center text-sm text-slate-500">
            You have no meals recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 rounded-[24px] border border-white/70 bg-white/72 px-5">
            {meals.map((meal, index) => (
              <article key={meal.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Meal {index + 1} {meal.time ? `· ${meal.time}` : ''}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-slate-800">{meal.description || 'Meal entry'}</p>
                    <p className="mt-2 text-xs leading-6 text-slate-500">
                      Calories {meal.calories || 0} · Protein {meal.protein_g || 0}g · Carbs {meal.carbs_g || 0}g · Fat {meal.fat_g || 0}g
                    </p>
                  </div>
                  <button
                    className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
                    type="button"
                    onClick={() => setMealDraft(buildMealEditDraft(effectiveDay, meal))}
                    disabled={saving}
                  >
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderTrainingLog() {
    const trainingEntries = selectedDayRecord?.training || [];
    if (trainingEntries.length === 0) {
      return (
        <div className="grid min-h-[180px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-white/55 px-6 text-center text-sm text-slate-500">
          You have no training recorded yet.
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-200/70 rounded-[24px] border border-white/70 bg-white/72 px-5">
        {trainingEntries.map((entry, index) => (
          <article key={entry.id} className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Log {index + 1} {entry.time ? `· ${entry.time}` : ''}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{entry.name || 'Training entry'}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {entry.sets || 0} sets · {entry.reps || '0'} reps{typeof entry.weight_kg === 'number' ? ` · ${entry.weight_kg} kg` : ''}
                </p>
                {entry.notes ? <p className="mt-2 text-sm leading-7 text-slate-600">{entry.notes}</p> : null}
              </div>
              <button
                className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
                type="button"
                onClick={() => setTrainingDraft(buildTrainingEditDraft(effectiveDay, entry))}
                disabled={saving}
              >
                Edit
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderTrainsView() {
    const plan = trainingPlan?.plan || null;
    const planDescription = buildPlanDescription(plan);

    return (
      <div className="space-y-6">
        <div className="rounded-[24px] border border-white/70 bg-white/72 p-5">
          <p className="text-sm font-semibold text-slate-900">{formatDay(effectiveDay)}</p>
          <p className="mt-1 text-sm text-slate-500">
            Burned {Math.round(selectedDayRecord?.total_burned || 0)} kcal
          </p>
        </div>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Plan</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {plan?.title || `No plan made by ${coachLabel} yet.`}
              </h3>
              {planDescription ? <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{planDescription}</p> : null}
            </div>
            {loadingPlan ? <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Loading...</span> : null}
          </div>

          {!plan ? (
            <div className="grid min-h-[180px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-white/55 px-6 text-center text-sm text-slate-500">
              Ask {coachLabel} to build a workout for this day and it will appear here.
            </div>
          ) : activePlanExercises.length === 0 ? (
            <div className="grid min-h-[180px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-white/55 px-6 text-center text-sm text-slate-500">
              This coach plan is fully checked off for {formatDay(effectiveDay)}.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activePlanExercises.map((exercise) => (
                <article key={exercise.id} className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="flex items-start gap-4">
                    {exercise.demo_thumbnail ? (
                      <button
                        type="button"
                        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100"
                        onClick={() => exercise.demo_url && onOpenMedia(exercise.demo_url, `${exercise.name} demo`)}
                        title={exercise.demo_url ? 'Open demo video' : 'Exercise demo'}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={exercise.demo_thumbnail}
                          alt={`${exercise.name} demo`}
                          className="h-full w-full object-cover"
                        />
                        {exercise.demo_url ? (
                          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25 text-white">
                            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>play_circle</span>
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[18px] border border-slate-200 bg-slate-100 text-slate-400">
                        <span className="material-symbols-outlined" style={{ fontSize: 26 }}>fitness_center</span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        #{exercise.order}
                      </p>
                      <h4 className="mt-1 text-base font-semibold text-slate-900">{exercise.name}</h4>
                      <p className="mt-2 text-sm text-slate-600">
                        {exercise.sets} sets · {exercise.reps} reps · {formatRest(exercise.rest_seconds)}
                      </p>
                      {typeof exercise.target_weight_kg === 'number' && Number.isFinite(exercise.target_weight_kg) && exercise.target_weight_kg > 0 ? (
                        <p className="mt-1 text-sm text-slate-600">Target weight {exercise.target_weight_kg} kg</p>
                      ) : null}
                      {exercise.cue ? <p className="mt-2 text-sm leading-6 text-slate-600">{exercise.cue}</p> : null}
                      {exercise.notes ? <p className="mt-2 text-xs leading-6 text-slate-500">{exercise.notes}</p> : null}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
                      type="button"
                      onClick={() => exercise.demo_url && onOpenMedia(exercise.demo_url, `${exercise.name} demo`)}
                      disabled={!exercise.demo_url}
                    >
                      {exercise.demo_url ? 'Open demo' : 'No demo yet'}
                    </button>
                    <button
                      className={primaryButtonClass}
                      type="button"
                      onClick={() => void handleToggleExercise(exercise.id, true)}
                      disabled={saving}
                    >
                      Check off
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Train log</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">What was recorded</h3>
          </div>
          {renderTrainingLog()}
        </section>
      </div>
    );
  }

  function renderProgressView() {
    const rawChart = buildLinePath(progressSeries.map((point) => point.weight), 640, 220);
    const avgChart = buildLinePath(progressSeries.map((point) => point.avgWeight), 640, 220);
    const selectedCheckIn = selectedDayRecord?.check_in || null;
    const statusTone = progressSummary?.status === 'on_track'
      ? 'rgba(16,185,129,0.14)'
      : progressSummary?.status === 'off_track'
        ? 'rgba(239,68,68,0.12)'
        : 'rgba(148,163,184,0.12)';
    const metricCards = [
      {
        label: 'Goal',
        value: toText(records?.profile?.goal || 'maintain').toUpperCase() || 'MAINTAIN',
        detail: progressSummary?.statusLabel || 'Add a few check-ins to unlock trend feedback.',
      },
      {
        label: 'Latest Weight',
        value: formatNullableMetric(progressSummary?.latestWeightKg, ' kg'),
        detail: progressSummary?.latestWeightDay ? `Last weigh-in ${formatDay(progressSummary.latestWeightDay)}` : 'No weigh-in logged yet',
      },
      {
        label: '7d Avg',
        value: formatNullableMetric(progressSummary?.weight7dAvg, ' kg'),
        detail: 'Smooths normal day-to-day noise',
      },
      {
        label: '14d Delta',
        value: formatSignedMetric(progressSummary?.weight14dDelta, ' kg'),
        detail: 'Change over the last two weeks',
      },
      {
        label: 'Recovery',
        value: progressSummary?.avgRecovery7d ? `${progressSummary.avgRecovery7d}/5` : '--',
        detail: progressSummary?.adherence7d && progressSummary.adherence7d !== 'unknown'
          ? `Recent adherence ${progressSummary.adherence7d}`
          : 'Recovery shows up when you log it',
      },
    ];

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {metricCards.map((card) => (
            <article key={card.label} className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{card.detail}</p>
            </article>
          ))}
        </div>

        <section className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Progress view</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-900">See the trend, then log the next signal</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                ['trend', 'Trend'],
                ['calendar', 'Calendar'],
              ] as Array<[ProgressViewMode, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${progressViewMode === value ? '' : 'bg-slate-100 text-slate-500 hover:text-slate-900'}`}
                  style={progressViewMode === value ? { background: statusTone, color: 'rgb(15 23 42)' } : undefined}
                  onClick={() => setProgressViewMode(value)}
                >
                  {label}
                </button>
              ))}
              {([
                [7, '7d'],
                [30, '30d'],
                [90, '90d'],
              ] as Array<[ProgressRange, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${progressRange === value ? '' : 'bg-slate-100 text-slate-500 hover:text-slate-900'}`}
                  style={progressRange === value ? { background: 'rgba(15,23,42,0.08)', color: 'rgb(15 23 42)' } : undefined}
                  onClick={() => setProgressRange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {progressViewMode === 'trend' ? (
            <div className="mt-6">
              {rawChart.dots.length < 2 ? (
                <div className="grid min-h-[260px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-slate-50/80 px-6 text-center text-sm text-slate-500">
                  Log at least two weigh-ins and your trend line will appear here.
                </div>
              ) : (
                <>
                  <div className="rounded-[24px] border border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] p-4">
                    <svg viewBox="0 0 640 240" className="h-[240px] w-full overflow-visible">
                      {[0, 1, 2, 3].map((tick) => (
                        <line
                          key={tick}
                          x1="0"
                          x2="640"
                          y1={20 + (tick * 60)}
                          y2={20 + (tick * 60)}
                          stroke="rgba(148,163,184,0.18)"
                          strokeDasharray="6 8"
                        />
                      ))}
                      {rawChart.path ? (
                        <path
                          d={rawChart.path}
                          fill="none"
                          stroke="rgba(148,163,184,0.72)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                      {avgChart.path ? (
                        <path
                          d={avgChart.path}
                          fill="none"
                          stroke={coachId === 'lc' ? 'rgba(242,138,58,0.98)' : 'rgba(105,121,247,0.98)'}
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                      {rawChart.dots.map((dot) => (
                        <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r="3.5" fill="rgba(255,255,255,0.98)" stroke="rgba(148,163,184,0.92)" strokeWidth="2" />
                      ))}
                    </svg>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:grid-cols-6">
                    {progressSeries.filter((_, index) => index === 0 || index === progressSeries.length - 1 || index % Math.max(1, Math.floor(progressSeries.length / 4)) === 0).map((point) => (
                      <span key={point.day}>{formatChartDay(point.day)}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mt-6">
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
                {calendarDays.map((day) => {
                  const record = dayLookup.get(day);
                  const isSelected = day === effectiveDay;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`rounded-[18px] border p-3 text-left transition ${isSelected ? 'shadow-[0_18px_36px_rgba(15,23,42,0.08)]' : 'hover:-translate-y-0.5 hover:bg-white'}`}
                      style={isSelected ? {
                        borderColor: coachId === 'lc' ? 'rgba(242,138,58,0.3)' : 'rgba(105,121,247,0.3)',
                        background: coachId === 'lc' ? 'rgba(242,138,58,0.08)' : 'rgba(105,121,247,0.08)',
                      } : {
                        borderColor: 'rgba(226,232,240,0.9)',
                        background: 'rgba(248,250,252,0.8)',
                      }}
                      onClick={() => setSelectedDay(day)}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{formatChartDay(day)}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {typeof record?.check_in?.weight_kg === 'number' ? `${record.check_in.weight_kg}kg` : '--'}
                      </p>
                      <div className="mt-3 flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${record?.check_in ? 'bg-sky-500' : 'bg-slate-200'}`} title="Check-in" />
                        <span className={`h-2.5 w-2.5 rounded-full ${(record?.meals?.length || 0) > 0 ? 'bg-amber-500' : 'bg-slate-200'}`} title="Meals" />
                        <span className={`h-2.5 w-2.5 rounded-full ${(record?.training?.length || 0) > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`} title="Training" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <article className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Coach interpretation</p>
            <p className="mt-3 text-base font-semibold text-slate-900">{progressSummary?.statusLabel || 'Need more signal before calling the trend.'}</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {progressSummary?.trendNarrative || 'Once you log a few quick check-ins, your coach can read the difference between real progress and normal short-term noise.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Energy {progressSummary?.avgEnergy7d ? `${progressSummary.avgEnergy7d}/5` : '--'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Hunger {progressSummary?.avgHunger7d ? `${progressSummary.avgHunger7d}/5` : '--'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Recovery {progressSummary?.avgRecovery7d ? `${progressSummary.avgRecovery7d}/5` : '--'}
              </span>
            </div>
          </article>

          <article className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Selected day</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-900">{formatDay(effectiveDay)}</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Weight</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{formatNullableMetric(selectedCheckIn?.weight_kg, ' kg')}</p>
              </div>
              <div className="rounded-[18px] bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Waist</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{formatNullableMetric(selectedCheckIn?.waist_cm, ' cm')}</p>
              </div>
              <div className="rounded-[18px] bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Meals</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{selectedDayRecord?.meals.length || 0}</p>
              </div>
              <div className="rounded-[18px] bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Training</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{selectedDayRecord?.training.length || 0}</p>
              </div>
            </div>
            {selectedCheckIn?.notes ? (
              <p className="mt-4 text-sm leading-7 text-slate-600">{selectedCheckIn.notes}</p>
            ) : (
              <p className="mt-4 text-sm leading-7 text-slate-500">No note saved for this day yet.</p>
            )}
          </article>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Quick check-in</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-900">Log the next signal in under a minute</h3>
            </div>
            <p className="text-sm text-slate-500">Weight daily if you want. Body fat and waist only when you actually measured them.</p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Day</span>
              <input
                className="input-shell"
                type="date"
                value={checkInDraft.day}
                onChange={(event) => {
                  setCheckInDraft((prev) => ({ ...prev, day: event.target.value }));
                  setSelectedDay(event.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Weight (kg)</span>
              <input className="input-shell" inputMode="decimal" placeholder="82.7" value={checkInDraft.weight_kg} onChange={(event) => setCheckInDraft((prev) => ({ ...prev, weight_kg: event.target.value.slice(0, 8) }))} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Waist (cm)</span>
              <input className="input-shell" inputMode="decimal" placeholder="84.5" value={checkInDraft.waist_cm} onChange={(event) => setCheckInDraft((prev) => ({ ...prev, waist_cm: event.target.value.slice(0, 8) }))} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Body fat %</span>
              <input className="input-shell" inputMode="decimal" placeholder="17" value={checkInDraft.body_fat_pct} onChange={(event) => setCheckInDraft((prev) => ({ ...prev, body_fat_pct: event.target.value.slice(0, 5) }))} />
            </label>
            {([
              ['energy', 'Energy'],
              ['hunger', 'Hunger'],
              ['recovery', 'Recovery'],
            ] as Array<[keyof Pick<CheckInDraft, 'energy' | 'hunger' | 'recovery'>, string]>).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</span>
                <select className={selectClassName(checkInDraft[key])} value={checkInDraft[key]} onChange={(event) => setCheckInDraft((prev) => ({ ...prev, [key]: event.target.value }))}>
                  <option value="">{label} / 5</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{value} / 5</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Adherence</span>
              <select className={selectClassName(checkInDraft.adherence)} value={checkInDraft.adherence} onChange={(event) => setCheckInDraft((prev) => ({ ...prev, adherence: event.target.value }))}>
                <option value="">How on track?</option>
                <option value="on_track">On track</option>
                <option value="partial">Partial</option>
                <option value="off_track">Off track</option>
              </select>
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Short note</span>
            <textarea
              className="input-shell min-h-[120px]"
              maxLength={500}
              placeholder="How did training feel, what felt off, or what made today easier or harder?"
              value={checkInDraft.notes}
              onChange={(event) => setCheckInDraft((prev) => ({ ...prev, notes: event.target.value.slice(0, 500) }))}
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className={primaryButtonClass} type="button" onClick={() => void handleSaveCheckIn()} disabled={saving || loadingRecords}>
              {saving ? 'Saving...' : 'Save check-in'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setCheckInDraft(buildCheckInDraft(effectiveDay, selectedDayRecord?.check_in || null))}
              disabled={saving}
            >
              Reset
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200/50 bg-white/25 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">{renderHeaderExtras()}</div>
          <button className="btn btn-ghost" type="button" onClick={() => void handleRefresh()} disabled={loadingRecords || loadingPlan || saving}>
            {loadingRecords || loadingPlan ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
        {loadingRecords && !records ? (
          <div className="grid min-h-[320px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-white/55 px-6 text-center text-sm text-slate-500">
            Loading your coach workspace...
          </div>
        ) : null}

        {!loadingRecords || records ? (
          <>
            {mode === 'info' ? renderInfoView() : null}
            {mode === 'meals' ? renderMealsView() : null}
            {mode === 'trains' ? renderTrainsView() : null}
            {mode === 'progress' ? renderProgressView() : null}
          </>
        ) : null}
      </div>

      {mealDraft ? (
        <section className="coach-edit-sheet">
          <header className="coach-edit-head">
            <strong>Edit meal</strong>
            <span className="entity-sub">{formatDay(mealDraft.day)}</span>
          </header>
          <textarea
            className="input-shell"
            maxLength={500}
            placeholder="Meal description"
            value={mealDraft.description}
            onChange={(event) => setMealDraft((prev) => (prev ? { ...prev, description: event.target.value.slice(0, 500) } : prev))}
          />
          <div className="coach-edit-grid">
            <input className="input-shell" inputMode="decimal" placeholder="Calories" value={mealDraft.calories} onChange={(event) => setMealDraft((prev) => (prev ? { ...prev, calories: event.target.value.slice(0, 8) } : prev))} />
            <input className="input-shell" inputMode="decimal" placeholder="Protein (g)" value={mealDraft.protein_g} onChange={(event) => setMealDraft((prev) => (prev ? { ...prev, protein_g: event.target.value.slice(0, 8) } : prev))} />
            <input className="input-shell" inputMode="decimal" placeholder="Carbs (g)" value={mealDraft.carbs_g} onChange={(event) => setMealDraft((prev) => (prev ? { ...prev, carbs_g: event.target.value.slice(0, 8) } : prev))} />
            <input className="input-shell" inputMode="decimal" placeholder="Fat (g)" value={mealDraft.fat_g} onChange={(event) => setMealDraft((prev) => (prev ? { ...prev, fat_g: event.target.value.slice(0, 8) } : prev))} />
            <input className="input-shell" maxLength={5} placeholder="Time HH:mm" value={mealDraft.time} onChange={(event) => setMealDraft((prev) => (prev ? { ...prev, time: event.target.value.slice(0, 5) } : prev))} />
          </div>
          <div className="coach-records-actions">
            <button className={primaryButtonClass} type="button" onClick={() => void handleSaveMeal()} disabled={saving}>
              {saving ? 'Saving...' : 'Save meal'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setMealDraft(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {trainingDraft ? (
        <section className="coach-edit-sheet">
          <header className="coach-edit-head">
            <strong>Edit training log</strong>
            <span className="entity-sub">{formatDay(trainingDraft.day)}</span>
          </header>
          <div className="coach-edit-grid">
            <input className="input-shell" maxLength={120} placeholder="Exercise name" value={trainingDraft.name} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, name: event.target.value.slice(0, 120) } : prev))} />
            <input className="input-shell" inputMode="numeric" placeholder="Sets" value={trainingDraft.sets} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, sets: event.target.value.slice(0, 2) } : prev))} />
            <input className="input-shell" maxLength={20} placeholder="Reps" value={trainingDraft.reps} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, reps: event.target.value.slice(0, 20) } : prev))} />
            <input className="input-shell" inputMode="decimal" placeholder="Weight kg" value={trainingDraft.weight_kg} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, weight_kg: event.target.value.slice(0, 8) } : prev))} />
            <input className="input-shell" maxLength={5} placeholder="Time HH:mm" value={trainingDraft.time} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, time: event.target.value.slice(0, 5) } : prev))} />
          </div>
          <textarea
            className="input-shell"
            maxLength={500}
            placeholder="Notes"
            value={trainingDraft.notes}
            onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, notes: event.target.value.slice(0, 500) } : prev))}
          />
          <div className="coach-records-actions">
            <button className={primaryButtonClass} type="button" onClick={() => void handleSaveTraining()} disabled={saving}>
              {saving ? 'Saving...' : 'Save training'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setTrainingDraft(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
