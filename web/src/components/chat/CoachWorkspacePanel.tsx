'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getCoachRecords,
  getCoachTrainingPlan,
  toggleCoachTrainingPlanExercise,
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
  CoachDayRecord,
  CoachMealRecord,
  CoachProfileData,
  CoachRecordsResponse,
  CoachTrainingPlan,
  CoachTrainingPlanResponse,
  CoachTrainingRecord,
} from '@/lib/types';

export type CoachWorkspaceMode = 'info' | 'meals' | 'trains';

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

  const activePlanExercises = useMemo(
    () => (trainingPlan?.plan?.exercises || [])
      .filter((exercise) => !exercise.completed_at)
      .sort((left, right) => left.order - right.order),
    [trainingPlan],
  );

  useEffect(() => {
    setSelectedDay((current) => current || localDayString());
  }, []);

  async function loadRecords() {
    if (!userId || userId <= 0) return;
    try {
      setLoadingRecords(true);
      const result = await getCoachRecords(userId, 45);
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
