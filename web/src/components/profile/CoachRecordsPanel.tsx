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

export function CoachRecordsPanel(props: CoachRecordsPanelProps) {
  const { userId, active, coachId, onNotice, onError } = props;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<CoachRecordsResponse | null>(null);
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
        weight_kg: toNumberOrUndefined(trainingDraft.weight_kg),
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

      {!records && !loading ? (
        <p className="mt-3 text-sm text-slate-500">No coach records available yet.</p>
      ) : null}

      {records?.records.map((day) => (
        <article key={day.day} className="coach-day-card">
          <header className="coach-day-head">
            <strong>{formatDay(day.day)}</strong>
            <span className="entity-sub">
              Intake {Math.round(day.total_intake)} kcal · Burned {Math.round(day.total_burned)} kcal
            </span>
          </header>

          <div className="coach-day-columns">
            <section className="coach-day-block">
              <h4>Meals</h4>
              {day.meals.length === 0 ? <p className="entity-sub">No meals logged.</p> : null}
              {day.meals.map((meal) => (
                <div key={meal.id} className="coach-record-row">
                  <div>
                    <strong>{meal.description || 'Meal'}</strong>
                    <p className="entity-sub">
                      {meal.time || '--:--'} · C {meal.calories || 0} · P {meal.protein_g || 0} · Cb {meal.carbs_g || 0} · F {meal.fat_g || 0}
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setMealDraft(buildMealEditDraft(day.day, meal))}
                    disabled={saving || loading}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </section>

            <section className="coach-day-block">
              <h4>Training</h4>
              {day.training.length === 0 ? <p className="entity-sub">No training logged.</p> : null}
              {day.training.map((entry) => (
                <div key={entry.id} className="coach-record-row">
                  <div>
                    <strong>{entry.name || 'Training entry'}</strong>
                    <p className="entity-sub">
                      {entry.time || '--:--'} · {entry.sets || 0} sets × {entry.reps || '0'} reps @ {entry.weight_kg || 0} kg
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setTrainingDraft(buildTrainingEditDraft(day.day, entry))}
                    disabled={saving || loading}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </section>
          </div>
        </article>
      ))}

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
            <input className="input-shell" inputMode="decimal" placeholder="Weight kg" value={trainingDraft.weight_kg} onChange={(event) => setTrainingDraft((prev) => (prev ? { ...prev, weight_kg: event.target.value.slice(0, 8) } : prev))} />
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
