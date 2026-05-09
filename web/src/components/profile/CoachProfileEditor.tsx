'use client';

import { useEffect, useState } from 'react';
import { getCoachRecords, updateCoachRecordProfile } from '@/lib/api';
import {
  activityLevelOptions,
  experienceLevelOptions,
  genderOptions,
  goalOptions,
  normalizeActivityLevelValue,
  normalizeExperienceLevelValue,
  normalizeGenderValue,
  normalizeGoalValue,
  normalizeTrainingDaysValue,
  optionLabelForValue,
  trainingDayOptions,
} from '@/lib/coach-profile-options';
import { CoachProfileData } from '@/lib/types';

interface CoachProfileEditorProps {
  userId: number;
  active: boolean;
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

const emptyDraft: CoachProfileDraft = {
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
};

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toNumber(value: string): number | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toInt(value: string): number | undefined {
  const numeric = toNumber(value);
  return numeric === undefined ? undefined : Math.floor(numeric);
}

function buildDraft(profile: CoachProfileData | null | undefined): CoachProfileDraft {
  return {
    height: toText(profile?.height ?? profile?.height_cm ?? profile?.heightCm).slice(0, 40),
    weight: toText(profile?.weight ?? profile?.weight_kg ?? profile?.weightKg).slice(0, 40),
    age: toText(profile?.age ?? profile?.ageYears).slice(0, 3),
    body_fat_pct: toText(profile?.body_fat_pct ?? profile?.bodyFatPct).slice(0, 5),
    training_days: normalizeTrainingDaysValue(profile?.training_days ?? profile?.trainingDays),
    gender: normalizeGenderValue(profile?.gender ?? profile?.sex),
    activity_level: normalizeActivityLevelValue(profile?.activity_level ?? profile?.activityLevel),
    goal: normalizeGoalValue(profile?.goal ?? profile?.fitness_goal ?? profile?.fitnessGoal),
    experience_level: normalizeExperienceLevelValue(profile?.experience_level ?? profile?.experienceLevel),
    notes: toText(profile?.notes).slice(0, 1200),
  };
}

function selectField(
  label: string,
  value: string,
  onChange: (value: string) => void,
  options: Array<{ value: string; label: string }>,
  placeholder: string,
) {
  return (
    <label className="grid gap-1.5">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <select className="input-shell" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function textField(
  label: string,
  value: string,
  onChange: (value: string) => void,
  placeholder: string,
  maxLength: number,
  inputMode?: 'numeric' | 'decimal',
) {
  return (
    <label className="grid gap-1.5">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <input
        className="input-shell"
        inputMode={inputMode}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
      />
    </label>
  );
}

export function CoachProfileEditor(props: CoachProfileEditorProps) {
  const { userId, active, onNotice, onError } = props;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<CoachProfileDraft>(emptyDraft);

  async function loadProfile() {
    if (!userId) return;
    try {
      setLoading(true);
      const result = await getCoachRecords(userId, 1);
      setDraft(buildDraft(result.profile));
    } catch (error: any) {
      onError(error?.message || 'Failed to load coach profile.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active || !userId) return;
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId]);

  async function saveProfile() {
    if (!draft.goal || !draft.training_days || !draft.experience_level) {
      onError('Set goal, training days, and experience level before saving.');
      return;
    }

    try {
      setSaving(true);
      await updateCoachRecordProfile({
        userId,
        height: draft.height.trim() || undefined,
        weight: draft.weight.trim() || undefined,
        age: toInt(draft.age),
        body_fat_pct: toNumber(draft.body_fat_pct),
        training_days: toInt(draft.training_days),
        gender: draft.gender || undefined,
        activity_level: draft.activity_level || undefined,
        goal: draft.goal,
        experience_level: draft.experience_level,
        notes: draft.notes.trim() || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await loadProfile();
      onNotice('Coach profile updated.');
    } catch (error: any) {
      onError(error?.message || 'Failed to save coach profile.');
    } finally {
      setSaving(false);
    }
  }

  const summary = [
    draft.goal ? optionLabelForValue(goalOptions, draft.goal) : 'Goal missing',
    draft.training_days ? optionLabelForValue(trainingDayOptions, draft.training_days) : 'Days missing',
    draft.experience_level ? optionLabelForValue(experienceLevelOptions, draft.experience_level) : 'Experience missing',
  ].join(' · ');

  return (
    <section className="rounded-[24px] bg-white/78 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Coach profile</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl">Profile your coach uses</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{loading ? 'Loading profile...' : summary}</p>
        </div>
        <button className="btn btn-ghost px-3 py-2 text-xs" type="button" onClick={() => void loadProfile()} disabled={loading || saving}>
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {selectField('Goal', draft.goal, (goal) => setDraft((prev) => ({ ...prev, goal })), goalOptions, 'Choose goal')}
        {selectField('Training days', draft.training_days, (training_days) => setDraft((prev) => ({ ...prev, training_days })), trainingDayOptions, 'Choose days')}
        {selectField('Experience level', draft.experience_level, (experience_level) => setDraft((prev) => ({ ...prev, experience_level })), experienceLevelOptions, 'Choose level')}
        {selectField('Activity level', draft.activity_level, (activity_level) => setDraft((prev) => ({ ...prev, activity_level })), activityLevelOptions, 'Choose activity')}
        {selectField('Gender', draft.gender, (gender) => setDraft((prev) => ({ ...prev, gender })), genderOptions, 'Not set')}
        {textField('Age', draft.age, (age) => setDraft((prev) => ({ ...prev, age })), 'Age', 3, 'numeric')}
        {textField('Height', draft.height, (height) => setDraft((prev) => ({ ...prev, height })), 'Height', 40, 'decimal')}
        {textField('Weight', draft.weight, (weight) => setDraft((prev) => ({ ...prev, weight })), 'Weight', 40, 'decimal')}
        {textField('Body fat %', draft.body_fat_pct, (body_fat_pct) => setDraft((prev) => ({ ...prev, body_fat_pct })), 'Optional', 5, 'decimal')}
      </div>

      <label className="mt-3 grid gap-1.5">
        <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Coach notes</span>
        <textarea
          className="input-shell min-h-[90px] resize-none"
          value={draft.notes}
          maxLength={1200}
          placeholder="Anything your coach should remember."
          onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value.slice(0, 1200) }))}
        />
      </label>

      <div className="mt-4 flex justify-end">
        <button className="btn btn-primary" type="button" onClick={() => void saveProfile()} disabled={loading || saving}>
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </section>
  );
}
