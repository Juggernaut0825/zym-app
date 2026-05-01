'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getCoachRecords,
  updateCoachMealRecord,
  updateCoachRecordProfile,
  updateCoachTrainingRecord,
} from '@/lib/api';
import { CoachDayRecord, CoachMealRecord, CoachProfileData, CoachRecordsResponse, CoachTrainingRecord } from '@/lib/types';

interface CoachRecordsPanelProps {
  userId: number;
  active: boolean;
  coachId: 'zj' | 'lc';
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

interface CoachProfileDraft {
  height: string;
  weight: string;
  age: string;
  body_fat_pct: string;
  training_days: string;
  gender: string;
  activity_level: string;
  goal: string;
  experience_level: string;
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

type WeightUnit = 'kg' | 'lb';

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

function inferPreferredWeightUnit(profile: CoachProfileData | null | undefined): WeightUnit {
  const preferred = String(profile?.preferred_weight_unit || '').trim().toLowerCase();
  if (preferred === 'lb' || preferred === 'lbs') return 'lb';
  const raw = String(profile?.weight || '').trim().toLowerCase();
  return /\b(lb|lbs|pound|pounds)\b/.test(raw) ? 'lb' : 'kg';
}

function kgToDisplayWeight(value: number | null | undefined, unit: WeightUnit): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return unit === 'lb' ? Math.round(value * 2.2046226218 * 10) / 10 : Math.round(value * 10) / 10;
}

function displayWeight(valueKg: number | null | undefined, unit: WeightUnit): string {
  const value = kgToDisplayWeight(valueKg, unit);
  return typeof value === 'number' ? `${value} ${unit}` : `0 ${unit}`;
}

function weightInputToKg(value: string, unit: WeightUnit): number | undefined {
  const numeric = toNumberOrUndefined(value);
  if (numeric === undefined) return undefined;
  return unit === 'lb' ? Math.round(numeric * 0.45359237 * 100) / 100 : numeric;
}

function formatDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function buildProfileDraft(profile: CoachProfileData): CoachProfileDraft {
  return {
    height: toText(profile.height ?? profile.height_cm),
    weight: toText(profile.weight ?? profile.weight_kg),
    age: toText(profile.age),
    body_fat_pct: toText(profile.body_fat_pct),
    training_days: toText(profile.training_days),
    gender: toText(profile.gender).slice(0, 40),
    activity_level: toText(profile.activity_level).slice(0, 60),
    goal: toText(profile.goal).slice(0, 120),
    experience_level: toText(profile.experience_level).slice(0, 40),
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

function buildTrainingEditDraft(day: string, entry: CoachTrainingRecord, unit: WeightUnit): TrainingEditDraft {
  return {
    day,
    trainingId: entry.id,
    name: toText(entry.name).slice(0, 120),
    sets: toText(entry.sets),
    reps: toText(entry.reps).slice(0, 20),
    weight_kg: toText(kgToDisplayWeight(entry.weight_kg, unit)),
    notes: toText(entry.notes).slice(0, 500),
    time: toText(entry.time).slice(0, 5),
  };
}

export function CoachRecordsPanel(props: CoachRecordsPanelProps) {
  const { userId, active, coachId, onNotice, onError } = props;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<CoachRecordsResponse | null>(null);
  const [recordQuery, setRecordQuery] = useState('');
  const [recordDateFilter, setRecordDateFilter] = useState('');
  const [profileDraft, setProfileDraft] = useState<CoachProfileDraft>({
    height: '',
    weight: '',
    age: '',
    body_fat_pct: '',
    training_days: '',
    gender: '',
    activity_level: '',
    goal: '',
    experience_level: '',
    notes: '',
  });
  const [mealDraft, setMealDraft] = useState<MealEditDraft | null>(null);
  const [trainingDraft, setTrainingDraft] = useState<TrainingEditDraft | null>(null);
  const primaryButtonClass = coachId === 'lc' ? 'btn btn-lc' : 'btn btn-zj';
  const preferredWeightUnit = inferPreferredWeightUnit(records?.profile);

  async function loadData() {
    if (!userId || userId <= 0) return;
    try {
      setLoading(true);
      const result = await getCoachRecords(userId, 28);
      setRecords(result);
      setProfileDraft(buildProfileDraft(result.profile || {}));
    } catch (error: any) {
      onError(error?.message || 'Failed to load coach records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active || !userId) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId]);

  const dayLookup = useMemo(() => {
    const map = new Map<string, CoachDayRecord>();
    for (const day of records?.records || []) {
      map.set(day.day, day);
    }
    return map;
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = recordQuery.trim().toLowerCase();
    return (records?.records || []).filter((day) => {
      if (recordDateFilter && day.day !== recordDateFilter) {
        return false;
      }
      if (!query) return true;

      const haystack = [
        day.day,
        ...day.meals.map((meal) => [
          meal.description,
          meal.time,
          meal.calories,
          meal.protein_g,
          meal.carbs_g,
          meal.fat_g,
        ].join(' ')),
        ...day.training.map((entry) => [
          entry.name,
          entry.time,
          entry.sets,
          entry.reps,
          entry.weight_kg,
          entry.notes,
        ].join(' ')),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [recordDateFilter, recordQuery, records]);

  async function handleSaveProfile() {
    if (!records) return;
    try {
      setSaving(true);
      await updateCoachRecordProfile({
        userId,
        height: profileDraft.height.trim() || undefined,
        weight: profileDraft.weight.trim() || undefined,
        age: toIntOrUndefined(profileDraft.age),
        body_fat_pct: toNumberOrUndefined(profileDraft.body_fat_pct),
        training_days: toIntOrUndefined(profileDraft.training_days),
        gender: profileDraft.gender || undefined,
        activity_level: profileDraft.activity_level || undefined,
        goal: profileDraft.goal || undefined,
        experience_level: profileDraft.experience_level || undefined,
        notes: profileDraft.notes.trim() || undefined,
      });
      await loadData();
      onNotice('Coach profile records updated.');
    } catch (error: any) {
      onError(error?.message || 'Failed to update coach profile records.');
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
      await loadData();
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
        weight_kg: weightInputToKg(trainingDraft.weight_kg, preferredWeightUnit),
        notes: trainingDraft.notes.trim().slice(0, 500),
        time: trainingDraft.time.trim() || undefined,
      });
      await loadData();
      setTrainingDraft(null);
      onNotice('Training record updated.');
    } catch (error: any) {
      onError(error?.message || 'Failed to update training record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Coach Records Details</h2>
        </div>
        <button className="btn btn-ghost" type="button" onClick={() => void loadData()} disabled={loading || saving}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <input
          className="input-shell"
          placeholder="Height"
          value={profileDraft.height}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, height: event.target.value.slice(0, 40) }))}
        />
        <input
          className="input-shell"
          placeholder="Weight"
          value={profileDraft.weight}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, weight: event.target.value.slice(0, 40) }))}
        />
        <input
          className="input-shell"
          inputMode="numeric"
          placeholder="Age"
          value={profileDraft.age}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, age: event.target.value.slice(0, 3) }))}
        />
        <input
          className="input-shell"
          inputMode="decimal"
          placeholder="Body fat %"
          value={profileDraft.body_fat_pct}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, body_fat_pct: event.target.value.slice(0, 5) }))}
        />
        <input
          className="input-shell"
          inputMode="numeric"
          placeholder="Training days / week"
          value={profileDraft.training_days}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, training_days: event.target.value.slice(0, 2) }))}
        />
        <input
          className="input-shell"
          placeholder="Gender"
          value={profileDraft.gender}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, gender: event.target.value.slice(0, 40) }))}
        />
        <input
          className="input-shell"
          placeholder="Activity level"
          value={profileDraft.activity_level}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, activity_level: event.target.value.slice(0, 60) }))}
        />
        <input
          className="input-shell"
          placeholder="Goal"
          value={profileDraft.goal}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, goal: event.target.value.slice(0, 120) }))}
        />
        <input
          className="input-shell"
          placeholder="Experience level"
          value={profileDraft.experience_level}
          onChange={(event) => setProfileDraft((prev) => ({ ...prev, experience_level: event.target.value.slice(0, 40) }))}
        />
      </div>

      <textarea
        className="input-shell mt-3"
        maxLength={2000}
        placeholder="Notes"
        value={profileDraft.notes}
        onChange={(event) => setProfileDraft((prev) => ({ ...prev, notes: event.target.value.slice(0, 2000) }))}
      />

      <div className="mt-4 flex gap-3">
        <button className={primaryButtonClass} type="button" onClick={() => void handleSaveProfile()} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save coach profile records'}
        </button>
      </div>

      <section className="mt-5 rounded-[26px] border border-slate-200/70 bg-white/78 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Meal + Training Log</h3>
            <p className="mt-1 text-sm text-slate-500">Latest days stay on top. Filter by date or keyword, then edit inline.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input-shell min-w-[150px]"
              type="date"
              value={recordDateFilter}
              onChange={(event) => setRecordDateFilter(event.target.value)}
            />
            <input
              className="input-shell min-w-[210px]"
              value={recordQuery}
              onChange={(event) => setRecordQuery(event.target.value.slice(0, 120))}
              placeholder="Search meals or training"
            />
          </div>
        </div>

        {!records && !loading ? (
          <p className="mt-4 text-sm text-slate-500">No coach records available yet.</p>
        ) : null}

        <div className="mt-4 max-h-[420px] overflow-y-auto rounded-[22px] border border-slate-200/70 bg-[rgba(248,250,252,0.88)] px-4 py-2">
          {filteredRecords.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">No records matched this filter.</p>
          ) : null}

          {filteredRecords.map((day, index) => (
            <article
              key={day.day}
              className={`py-4 text-sm leading-6 text-slate-700 ${index > 0 ? 'border-t border-slate-200/70' : ''}`}
            >
              <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <strong className="text-base font-semibold text-slate-900">{formatDay(day.day)}</strong>
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Intake {Math.round(day.total_intake)} kcal · Burned {Math.round(day.total_burned)} kcal
                </span>
              </header>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Meals</p>
                {day.meals.length === 0 ? <p className="mt-1 text-sm text-slate-500">No meals logged.</p> : null}
                <ol className="mt-1 space-y-1">
                  {day.meals.map((meal, mealIndex) => (
                    <li key={meal.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        {mealIndex + 1}) {meal.description || 'Meal'} {meal.time ? `${meal.time}` : '--:--'} calories: {meal.calories || 0}, protein: {meal.protein_g || 0}, carbs: {meal.carbs_g || 0}, fat: {meal.fat_g || 0}
                      </span>
                      <button
                        className="shrink-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                        type="button"
                        onClick={() => setMealDraft(buildMealEditDraft(day.day, meal))}
                        disabled={saving || loading}
                      >
                        Edit
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Training</p>
                {day.training.length === 0 ? <p className="mt-1 text-sm text-slate-500">No training logged.</p> : null}
                <ol className="mt-1 space-y-1">
                  {day.training.map((entry, trainingIndex) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        {trainingIndex + 1}) {entry.name || 'Training entry'} {entry.time ? `${entry.time}` : '--:--'} sets: {entry.sets || 0}, reps: {entry.reps || '0'}, weight: {displayWeight(entry.weight_kg, preferredWeightUnit)}{entry.notes ? `, notes: ${entry.notes}` : ''}
                      </span>
                      <button
                        className="shrink-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                        type="button"
                        onClick={() => setTrainingDraft(buildTrainingEditDraft(day.day, entry, preferredWeightUnit))}
                        disabled={saving || loading}
                      >
                        Edit
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ))}
        </div>
      </section>

      {mealDraft ? (
        <section className="coach-edit-sheet">
          <header className="coach-edit-head">
            <strong>Edit meal record</strong>
            <span className="entity-sub">{formatDay(mealDraft.day)}</span>
          </header>
          <textarea
            className="input-shell"
            maxLength={500}
            placeholder="Meal description (max 500 chars)"
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
              {saving ? 'Saving...' : 'Save meal update'}
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
            <strong>Edit training record</strong>
            <span className="entity-sub">{formatDay(trainingDraft.day)}</span>
          </header>
          <div className="coach-edit-grid">
            <input className="input-shell" maxLength={120} placeholder="Exercise name" value={trainingDraft.name} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, name: event.target.value.slice(0, 120) } : prev))} />
            <input className="input-shell" inputMode="numeric" placeholder="Sets" value={trainingDraft.sets} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, sets: event.target.value.slice(0, 2) } : prev))} />
            <input className="input-shell" maxLength={20} placeholder="Reps" value={trainingDraft.reps} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, reps: event.target.value.slice(0, 20) } : prev))} />
            <input className="input-shell" inputMode="decimal" placeholder={`Weight ${preferredWeightUnit}`} value={trainingDraft.weight_kg} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, weight_kg: event.target.value.slice(0, 8) } : prev))} />
            <input className="input-shell" maxLength={5} placeholder="Time HH:mm" value={trainingDraft.time} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, time: event.target.value.slice(0, 5) } : prev))} />
          </div>
          <textarea
            className="input-shell"
            maxLength={500}
            placeholder="Notes (max 500 chars)"
            value={trainingDraft.notes}
            onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, notes: event.target.value.slice(0, 500) } : prev))}
          />
          <div className="coach-records-actions">
            <button className={primaryButtonClass} type="button" onClick={() => void handleSaveTraining()} disabled={saving}>
              {saving ? 'Saving...' : 'Save training update'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setTrainingDraft(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {mealDraft && !dayLookup.get(mealDraft.day) ? <p className="entity-sub">Selected meal day no longer exists. Refresh records.</p> : null}
      {trainingDraft && !dayLookup.get(trainingDraft.day) ? <p className="entity-sub">Selected training day no longer exists. Refresh records.</p> : null}
    </section>
  );
}
