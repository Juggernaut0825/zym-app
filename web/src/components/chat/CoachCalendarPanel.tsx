'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getCoachRecords,
  updateCoachMealRecord,
  updateCoachTrainingRecord,
} from '@/lib/api';
import {
  type CoachDayRecord,
  type CoachMealRecord,
  type CoachRecordsResponse,
  type CoachTrainingRecord,
} from '@/lib/types';

interface CoachCalendarPanelProps {
  userId: number;
  active: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
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

type ProgressRange = 14 | 30 | 90;

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
  return numeric === undefined ? undefined : Math.floor(numeric);
}

function localDayString(timezone?: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const year = map.get('year') || '1970';
  const month = map.get('month') || '01';
  const day = map.get('day') || '01';
  return `${year}-${month}-${day}`;
}

function addDays(day: string, delta: number): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

function buildRecentDays(range: number, endDay: string): string[] {
  return Array.from({ length: range }, (_, index) => addDays(endDay, index - range + 1));
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

function formatChartDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day.slice(5);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

function average(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
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

function buildLinePath(values: Array<number | null>, width: number, height: number): { path: string; dots: Array<{ x: number; y: number }> } {
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
  const dots: Array<{ x: number; y: number }> = [];
  let path = '';

  values.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const x = stepX * index;
    const y = height - (((value - paddedMin) / range) * height);
    dots.push({ x, y });
    path += `${path ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  return { path, dots };
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

export function CoachCalendarPanel(props: CoachCalendarPanelProps) {
  const { userId, active, onNotice, onError } = props;

  const [selectedDay, setSelectedDay] = useState('');
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<CoachRecordsResponse | null>(null);
  const [mealDraft, setMealDraft] = useState<MealEditDraft | null>(null);
  const [trainingDraft, setTrainingDraft] = useState<TrainingEditDraft | null>(null);
  const [progressRange, setProgressRange] = useState<ProgressRange>(30);

  const effectiveDay = selectedDay || localDayString(records?.profile?.timezone || undefined);

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

  const selectedCheckIn = selectedDayRecord?.check_in || null;
  const selectedHealth = selectedDayRecord?.health || null;
  const selectedMeals = selectedDayRecord?.meals || [];
  const selectedTraining = selectedDayRecord?.training || [];
  const progressDays = useMemo(() => buildRecentDays(progressRange, effectiveDay), [effectiveDay, progressRange]);

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
      health: record?.health || null,
    };
  }), [dayLookup, progressDays]);

  const trendChart = useMemo(
    () => buildLinePath(progressSeries.map((point) => point.weight), 640, 220),
    [progressSeries],
  );
  const avgChart = useMemo(
    () => buildLinePath(progressSeries.map((point) => point.avgWeight), 640, 220),
    [progressSeries],
  );

  useEffect(() => {
    if (!selectedDay) {
      setSelectedDay(localDayString(records?.profile?.timezone || undefined));
    }
  }, [records?.profile?.timezone, selectedDay]);

  async function loadRecords() {
    if (!userId || userId <= 0) return;
    try {
      setLoadingRecords(true);
      const result = await getCoachRecords(userId, 120);
      setRecords(result);
    } catch (error: any) {
      onError(error?.message || 'Failed to load calendar records.');
    } finally {
      setLoadingRecords(false);
    }
  }

  useEffect(() => {
    if (!active || !userId) return;
    void loadRecords();
  }, [active, userId]);

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
      onNotice('Meal updated.');
    } catch (error: any) {
      onError(error?.message || 'Failed to update meal.');
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
        notes: trainingDraft.notes.trim().slice(0, 500) || undefined,
        time: trainingDraft.time.trim() || undefined,
      });
      await loadRecords();
      setTrainingDraft(null);
      onNotice('Training entry updated.');
    } catch (error: any) {
      onError(error?.message || 'Failed to update training entry.');
    } finally {
      setSaving(false);
    }
  }

  const stats = [
    {
      label: 'Daily Target',
      value: formatNullableMetric(records?.profile?.daily_target as number | null | undefined, ' kcal'),
      detail: 'Calculated from your saved profile',
    },
    {
      label: 'Latest Weight',
      value: formatNullableMetric(records?.progress?.latestWeightKg, ' kg'),
      detail: records?.progress?.latestWeightDay ? `Last weigh-in ${formatDay(records.progress.latestWeightDay)}` : 'No weigh-ins yet',
    },
    {
      label: 'Selected Steps',
      value: typeof selectedHealth?.steps === 'number' ? `${selectedHealth.steps}` : '--',
      detail: selectedHealth?.synced_at ? 'Synced from Apple Health' : 'No health sync for this day',
    },
    {
      label: '14d Delta',
      value: formatSignedMetric(records?.progress?.weight14dDelta, ' kg'),
      detail: records?.progress?.statusLabel || 'Need more signal',
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200/60 bg-white px-5 py-4 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Calendar</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Progress, meals, training, and health in one place</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Use the date picker to jump between days. The rest of the page stays anchored around the date you actually selected.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input-shell w-[180px]"
              type="date"
              value={effectiveDay}
              onChange={(event) => setSelectedDay(event.target.value)}
            />
            <button className="btn btn-ghost" type="button" onClick={() => void loadRecords()} disabled={loadingRecords || saving}>
              {loadingRecords ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
        {loadingRecords && !records ? (
          <div className="grid min-h-[320px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-white px-6 text-center text-sm text-slate-500">
            Loading your calendar...
          </div>
        ) : null}

        {!loadingRecords || records ? (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((card) => (
                <article key={card.label} className="rounded-[24px] bg-white/86 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{card.detail}</p>
                </article>
              ))}
            </section>

            <section className="rounded-[28px] bg-white/88 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Trend</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">Weight trend anchored to {formatDay(effectiveDay)}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    [14, '14d'],
                    [30, '30d'],
                    [90, '90d'],
                  ] as Array<[ProgressRange, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${progressRange === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                      onClick={() => setProgressRange(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div>
                  {trendChart.dots.length < 2 ? (
                    <div className="grid min-h-[260px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-slate-50 px-6 text-center text-sm text-slate-500">
                      Add at least two weigh-ins and the trend line will appear here.
                    </div>
                  ) : (
                    <>
                      <div className="rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4">
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
                          {trendChart.path ? (
                            <path
                              d={trendChart.path}
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
                              stroke="rgba(31,41,55,0.98)"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ) : null}
                          {trendChart.dots.map((dot) => (
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

                <div className="rounded-[24px] bg-slate-50/75 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Coach interpretation</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{records?.progress?.statusLabel || 'Need more signal before calling the trend.'}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {records?.progress?.trendNarrative || 'Once you log a few check-ins, the calendar can separate real progress from normal short-term noise.'}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Body Fat</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">{formatNullableMetric(selectedCheckIn?.body_fat_pct, '%')}</p>
                    </div>
                    <div className="rounded-[18px] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Activity Calories</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">
                        {typeof selectedHealth?.calories_burned === 'number' ? `${selectedHealth.calories_burned} kcal` : '--'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] bg-white/88 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Selected day</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">{formatDay(effectiveDay)}</h3>
                </div>
                <p className="text-sm text-slate-500">One cleaner summary instead of separate history cards.</p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-[20px] bg-slate-50/85 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Check-in</p>
                    <p className="mt-1 text-sm text-slate-700">
                      Weight {formatNullableMetric(selectedCheckIn?.weight_kg, ' kg')} · Body fat {formatNullableMetric(selectedCheckIn?.body_fat_pct, '%')}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50/85 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Activity</p>
                    <p className="mt-1 text-sm text-slate-700">
                      Steps {typeof selectedHealth?.steps === 'number' ? selectedHealth.steps : '--'} · Calories {typeof selectedHealth?.calories_burned === 'number' ? `${selectedHealth.calories_burned} kcal` : '--'} · Active {typeof selectedHealth?.active_minutes === 'number' ? selectedHealth.active_minutes : '--'} min
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-[20px] bg-slate-50/85 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Meals</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {selectedMeals.length} logged · Intake {Math.round(selectedDayRecord?.total_intake || 0)} kcal · Target {formatNullableMetric(records?.profile?.daily_target as number | null | undefined, ' kcal')}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-slate-50/85 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Training</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {selectedTraining.length} entries · Estimated work {Math.round(selectedDayRecord?.total_burned || 0)} kcal
                    </p>
                  </div>
                </div>
              </div>

              {selectedCheckIn?.notes ? (
                <p className="mt-4 text-sm leading-7 text-slate-500">{selectedCheckIn.notes}</p>
              ) : null}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-[28px] bg-white/88 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Meals</p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-900">What you ate on {formatDay(effectiveDay)}</h3>
                  </div>
                  <span className="text-sm text-slate-500">{selectedMeals.length} entries</span>
                </div>

                {selectedMeals.length ? (
                  <div className="mt-4 divide-y divide-slate-200/60 rounded-[24px] bg-slate-50/55 px-5">
                    {selectedMeals.map((meal, index) => (
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
                ) : (
                  <div className="mt-4 grid min-h-[220px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-slate-50 px-6 text-center text-sm text-slate-500">
                    No meals were logged for this day.
                  </div>
                )}
              </article>

              <article className="rounded-[28px] bg-white/88 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Training</p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-900">What you trained on {formatDay(effectiveDay)}</h3>
                  </div>
                  <span className="text-sm text-slate-500">{selectedTraining.length} entries</span>
                </div>

                {selectedTraining.length ? (
                  <div className="mt-4 divide-y divide-slate-200/60 rounded-[24px] bg-slate-50/55 px-5">
                    {selectedTraining.map((entry, index) => (
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
                ) : (
                  <div className="mt-4 grid min-h-[220px] place-items-center rounded-[24px] border border-dashed border-slate-300/80 bg-slate-50 px-6 text-center text-sm text-slate-500">
                    No training entries were logged for this day.
                  </div>
                )}
              </article>
            </section>
          </div>
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
            <button className="btn btn-zj" type="button" onClick={() => void handleSaveMeal()} disabled={saving}>
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
            className="input-shell mt-3 min-h-[110px]"
            maxLength={500}
            placeholder="Notes"
            value={trainingDraft.notes}
            onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, notes: event.target.value.slice(0, 500) } : prev))}
          />
          <div className="coach-records-actions">
            <button className="btn btn-zj" type="button" onClick={() => void handleSaveTraining()} disabled={saving}>
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
