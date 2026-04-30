'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { getCoachRecords, selectCoach, updateCoachRecordProfile } from '@/lib/api';
import { setCoach } from '@/lib/auth-storage';
import {
  CoachAvatar,
  CoachHero,
  CoachSpeechBubble,
  type CoachId,
} from '@/components/onboarding/CoachAvatar';
import {
  activityLevelOptions,
  bodyFatRangeOptions,
  bodyFatRangeToValue,
  bodyFatValueToRange,
  experienceLevelOptions,
  formatNumericProfileValue,
  genderOptions,
  normalizeActivityLevelValue,
  normalizeExperienceLevelValue,
  normalizeGenderValue,
  normalizeTrainingDaysValue,
  optionLabelForValue,
  trainingDayOptions,
} from '@/lib/coach-profile-options';
import type { CoachProfileData } from '@/lib/types';

type HeightUnit = 'cm' | 'ft_in';
type WeightUnit = 'kg' | 'lb';

interface SetupState {
  coach: CoachId | '';
  height: string;
  heightUnit: HeightUnit;
  weight: string;
  weightUnit: WeightUnit;
  age: string;
  bodyFatRange: string;
  trainingDays: string;
  gender: string;
  activityLevel: string;
  goal: string;
  experienceLevel: string;
  notes: string;
}

interface WelcomeFlowProps {
  userId: number;
  initialCoach: CoachId | null;
  onComplete: (coach: CoachId) => void;
}

const totalSteps = 4;

const coachCards = [
  {
    id: 'zj' as const,
    title: 'ZJ',
    badge: 'Gentle encouragement',
    description: 'Warm, supportive, and steady.',
    sample: "I'll help you keep momentum without overcomplicating your day.",
    tone: 'rgba(105,121,247,0.12)',
    border: 'rgba(105,121,247,0.3)',
    ink: 'var(--coach-zj-ink)',
    glow: '0 26px 58px rgba(105,121,247,0.18)',
  },
  {
    id: 'lc' as const,
    title: 'LC',
    badge: 'Tough accountability',
    description: 'Direct, sharp, and demanding.',
    sample: "I'll push you to stop drifting and start executing.",
    tone: 'rgba(242,138,58,0.13)',
    border: 'rgba(242,138,58,0.34)',
    ink: 'var(--coach-lc-ink)',
    glow: '0 26px 58px rgba(177,99,34,0.2)',
  },
];

const EMPTY_SETUP_STATE: SetupState = {
  coach: '',
  height: '',
  heightUnit: 'cm',
  weight: '',
  weightUnit: 'kg',
  age: '',
  bodyFatRange: '',
  trainingDays: '',
  gender: '',
  activityLevel: '',
  goal: '',
  experienceLevel: '',
  notes: '',
};

function detectLocalTimezone(): string | undefined {
  try {
    const timezone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim();
    return timezone || undefined;
  } catch {
    return undefined;
  }
}

function stepTitle(step: number): string {
  switch (step) {
    case 0:
      return 'Meet your coaches';
    case 1:
      return 'Choose your coach';
    case 2:
      return 'Build your coach profile';
    default:
      return 'You are ready';
  }
}

function normalizeHeightInput(value: unknown): { value: string; unit: HeightUnit } {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: '', unit: 'cm' };
  const lower = raw.toLowerCase();
  if (/['"]|\b(ft|feet|foot|in|inch|inches)\b/.test(lower)) {
    const value = raw
      .replace(/\s*(?:feet|foot|ft)\s*/gi, "'")
      .replace(/\s*(?:inches|inch|in)\s*$/gi, '"')
      .replace(/\s+/g, '')
      .trim();
    return { value, unit: 'ft_in' };
  }
  const meters = lower.match(/^(\d(?:\.\d+)?)\s*m$/);
  if (meters) {
    return { value: String(Math.round(Number(meters[1]) * 1000) / 10), unit: 'cm' };
  }
  return {
    value: raw.replace(/\s*(?:cm|centimeters?|m)\s*$/i, '').trim(),
    unit: 'cm',
  };
}

function normalizeWeightInput(value: unknown): { value: string; unit: WeightUnit } {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: '', unit: 'kg' };
  const lower = raw.toLowerCase();
  if (/\b(lb|lbs|pound|pounds)\b/.test(lower)) {
    return {
      value: raw.replace(/\s*(?:lb|lbs|pound|pounds)\s*$/i, '').trim(),
      unit: 'lb',
    };
  }
  return {
    value: raw.replace(/\s*(?:kg|kgs|kilograms?)\s*$/i, '').trim(),
    unit: 'kg',
  };
}

function heightForPayload(state: SetupState): string | undefined {
  const value = state.height.trim();
  if (!value) return undefined;
  return state.heightUnit === 'ft_in' ? value : `${value} cm`;
}

function weightForPayload(state: SetupState): string | undefined {
  const value = state.weight.trim();
  if (!value) return undefined;
  return `${value} ${state.weightUnit}`;
}

function heightSummary(state: SetupState): string {
  if (!state.height.trim()) return '';
  return state.heightUnit === 'ft_in' ? state.height.trim() : `${state.height.trim()} cm`;
}

function weightSummary(state: SetupState): string {
  if (!state.weight.trim()) return '';
  return `${state.weight.trim()} ${state.weightUnit}`;
}

function buildSetupState(
  profile: CoachProfileData | null | undefined,
  initialCoach: CoachId | null,
  selectedCoachOverride?: CoachId | null,
): SetupState {
  const rawSource = (profile || {}) as CoachProfileData & {
    profile?: CoachProfileData | null;
    body_fat?: number | null;
    activity?: string | null;
    experience?: string | null;
    fitness_goal?: string | null;
  };
  const source = ((rawSource.profile && typeof rawSource.profile === 'object')
    ? { ...rawSource.profile, ...rawSource }
    : rawSource) as CoachProfileData & {
      heightCm?: number | string | null;
      weightKg?: number | string | null;
      ageYears?: number | string | null;
      body_fat?: number | null;
      bodyFatPct?: number | null;
      trainingDays?: number | string | null;
      activity?: string | null;
      activityLevel?: string | null;
      experience?: string | null;
      experienceLevel?: string | null;
      fitness_goal?: string | null;
      fitnessGoal?: string | null;
      timeZone?: string | null;
    };
  const height = normalizeHeightInput(source.height ?? source.height_cm ?? source.heightCm);
  const weight = normalizeWeightInput(source.weight ?? source.weight_kg ?? source.weightKg);
  return {
    coach: selectedCoachOverride || initialCoach || '',
    height: height.value || formatNumericProfileValue(source.height_cm ?? source.heightCm, 1),
    heightUnit: height.unit,
    weight: weight.value || formatNumericProfileValue(source.weight_kg ?? source.weightKg, 2),
    weightUnit: weight.unit,
    age: formatNumericProfileValue(source.age ?? source.ageYears, 0),
    bodyFatRange: bodyFatValueToRange((source.body_fat_pct ?? source.body_fat ?? source.bodyFatPct) as number | null | undefined),
    trainingDays: normalizeTrainingDaysValue(source.training_days ?? source.trainingDays),
    gender: normalizeGenderValue(source.gender),
    activityLevel: normalizeActivityLevelValue(source.activity_level || source.activity || source.activityLevel),
    goal: String(source.goal || source.fitness_goal || source.fitnessGoal || '').trim().slice(0, 180),
    experienceLevel: normalizeExperienceLevelValue(source.experience_level || source.experience || source.experienceLevel),
    notes: String(source.notes || ''),
  };
}

function selectedCoachOrDefault(coach: SetupState['coach'], fallback: CoachId | null): CoachId {
  return coach || fallback || 'zj';
}

function coachProfilePrompt(state: SetupState): string {
  const coach = selectedCoachOrDefault(state.coach, null);
  if (state.trainingDays) {
    return "I'll build your weekly structure around your available days.";
  }
  if (state.goal) {
    return "Got it. I'll shape your plan around this goal.";
  }
  return coach === 'lc'
    ? "Give me the basics. I'll use this to set your calories and training structure."
    : "Let's set your baseline so I can guide you from the first reply.";
}

function summaryItem(label: string, value: string) {
  return (
    <div className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value || 'Not set'}</p>
    </div>
  );
}

function UnitToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <span className="coach-unit-toggle" aria-label="Measurement unit">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'coach-unit-toggle-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

function profileTextField({
  label,
  value,
  onChange,
  inputMode = 'text',
  maxLength = 40,
  unit,
  placeholder,
  control,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: 'decimal' | 'numeric' | 'text';
  maxLength?: number;
  unit?: string;
  placeholder?: string;
  control?: ReactNode;
}) {
  return (
    <label className="coach-profile-field">
      <span className="coach-profile-field-top">
        <span className="coach-profile-label">{label}</span>
        {control}
      </span>
      <span className="coach-form-field">
        <input
          className="input-shell"
          inputMode={inputMode}
          placeholder={placeholder || label}
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        />
        {unit ? <span className="coach-form-unit">{unit}</span> : null}
      </span>
    </label>
  );
}

function profileSelectField(
  label: string,
  value: string,
  onChange: (value: string) => void,
  options: Array<{ value: string; label: string }>,
) {
  return (
    <label className="coach-profile-field">
      <span className="coach-profile-label">{label}</span>
      <select className="input-shell" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function WelcomeFlow(props: WelcomeFlowProps) {
  const { userId, initialCoach, onComplete } = props;
  const [step, setStep] = useState(0);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<SetupState>(buildSetupState(undefined, initialCoach));

  const progress = useMemo(() => ((step + 1) / totalSteps) * 100, [step]);
  const selectedCoach = selectedCoachOrDefault(state.coach, initialCoach);

  useEffect(() => {
    let cancelled = false;
    setLoadingExisting(true);
    setError('');

    void getCoachRecords(userId, 45)
      .then((result) => {
        if (cancelled) return;
        setState(buildSetupState(result.profile, initialCoach, result.selectedCoach || null));
      })
      .catch(() => {
        if (cancelled) return;
        setState(buildSetupState(undefined, initialCoach));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExisting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, initialCoach]);

  const canContinue = step !== 1 || Boolean(state.coach);

  async function handleFinish() {
    if (!state.coach) {
      setError('Choose a coach before finishing setup.');
      setStep(1);
      return;
    }

    try {
      setPending(true);
      setError('');
      await selectCoach(userId, state.coach);
      await updateCoachRecordProfile({
        userId,
        height: heightForPayload(state),
        weight: weightForPayload(state),
        age: state.age.trim() ? Number(state.age.trim()) : undefined,
        body_fat_pct: bodyFatRangeToValue(state.bodyFatRange),
        training_days: state.trainingDays.trim() ? Number(state.trainingDays.trim()) : undefined,
        gender: state.gender || undefined,
        activity_level: state.activityLevel || undefined,
        goal: state.goal || undefined,
        experience_level: state.experienceLevel || undefined,
        notes: state.notes.trim() || undefined,
        timezone: detectLocalTimezone(),
        seed_initial_check_in: true,
      });
      setCoach(state.coach);
      onComplete(state.coach);
    } catch (err: any) {
      setError(err.message || 'Failed to save your welcome setup.');
    } finally {
      setPending(false);
    }
  }

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-[28px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_24px_50px_rgba(59,49,40,0.07)] sm:p-6">
            <CoachHero
              coach="zj"
              animationMode="loop"
              state="talking"
              size={250}
              showBubble
              bubbleText="I'm ZJ. I'll help you build steady habits without making fitness feel overwhelming."
              tailDirection="left"
            />
            <CoachSpeechBubble
              coach="zj"
              text="Share your goal, schedule, meals, and training context."
              tailDirection="top-left"
              className="mt-3"
            />
          </section>

          <section className="rounded-[28px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_24px_50px_rgba(59,49,40,0.07)] sm:p-6">
            <CoachHero
              coach="lc"
              animationMode="loop"
              state="talking"
              size={250}
              showBubble
              bubbleText="I'm LC. I'll keep the plan sharp and call out drift before it becomes a pattern."
              tailDirection="left"
              bubbleTone="strong"
            />
            <CoachSpeechBubble
              coach="lc"
              tone="strong"
              text="Then ZYM turns it into meals, workouts, check-ins, and feedback."
              tailDirection="top-left"
              className="mt-3"
            />
          </section>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {coachCards.map((card) => {
            const active = state.coach === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, coach: card.id }))}
                className={`rounded-[28px] border p-5 text-left transition duration-300 sm:p-6 ${
                  active ? (card.id === 'lc' ? 'scale-[1.012]' : 'scale-[1.008]') : 'hover:scale-[1.004]'
                }`}
                style={{
                  background: active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.72)',
                  borderColor: active ? card.border : 'rgba(255,255,255,0.65)',
                  boxShadow: active ? card.glow : '0 16px 34px rgba(59,49,40,0.06)',
                }}
              >
                <div className="flex items-start gap-4">
                  <CoachAvatar coach={card.id} state={active ? 'selected' : 'idle'} size={74} />
                  <div className="min-w-0 flex-1">
                    <div
                      className="inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                      style={{ background: card.tone, color: card.ink }}
                    >
                      {card.badge}
                    </div>
                    <h2 className="mt-4 text-3xl font-bold text-slate-900">{card.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-end gap-4">
                  <CoachHero coach={card.id} state={active ? 'selected' : 'idle'} size={150} animationMode={active ? 'loop' : 'static'} />
                  <CoachSpeechBubble
                    coach={card.id}
                    tone={active ? 'strong' : 'soft'}
                    text={card.sample}
                    tailDirection="left"
                    className="mb-4"
                  />
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="grid gap-6">
          <section className="rounded-[28px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_24px_50px_rgba(59,49,40,0.07)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <CoachAvatar
                coach={selectedCoach}
                state={state.goal || state.trainingDays ? 'talking' : 'idle'}
                size={92}
                showBubble
                bubbleText={coachProfilePrompt(state)}
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {profileTextField({
                label: 'Height',
                value: state.height,
                onChange: (value) => setState((prev) => ({ ...prev, height: value })),
                inputMode: state.heightUnit === 'cm' ? 'decimal' : 'text',
                placeholder: state.heightUnit === 'cm' ? '180' : '5\'11"',
                unit: state.heightUnit === 'cm' ? 'cm' : 'ft/in',
                control: (
                  <UnitToggle
                    options={[{ value: 'cm', label: 'cm' }, { value: 'ft_in', label: 'ft/in' }]}
                    value={state.heightUnit}
                    onChange={(heightUnit) => setState((prev) => ({ ...prev, heightUnit }))}
                  />
                ),
              })}
              {profileTextField({
                label: 'Weight',
                value: state.weight,
                onChange: (value) => setState((prev) => ({ ...prev, weight: value })),
                inputMode: 'decimal',
                placeholder: state.weightUnit === 'kg' ? '81.5' : '180',
                unit: state.weightUnit,
                control: (
                  <UnitToggle
                    options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
                    value={state.weightUnit}
                    onChange={(weightUnit) => setState((prev) => ({ ...prev, weightUnit }))}
                  />
                ),
              })}
              {profileTextField({
                label: 'Age',
                value: state.age,
                onChange: (value) => setState((prev) => ({ ...prev, age: value })),
                inputMode: 'numeric',
                maxLength: 3,
                placeholder: '23',
                unit: 'years',
              })}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profileSelectField('Gender', state.gender, (gender) => setState((prev) => ({ ...prev, gender })), genderOptions)}
              {profileSelectField('Body fat range', state.bodyFatRange, (bodyFatRange) => setState((prev) => ({ ...prev, bodyFatRange })), bodyFatRangeOptions)}
              {profileSelectField('Training days / week', state.trainingDays, (trainingDays) => setState((prev) => ({ ...prev, trainingDays })), trainingDayOptions)}
              {profileSelectField('Activity level', state.activityLevel, (activityLevel) => setState((prev) => ({ ...prev, activityLevel })), activityLevelOptions)}
              {profileSelectField('Experience level', state.experienceLevel, (experienceLevel) => setState((prev) => ({ ...prev, experienceLevel })), experienceLevelOptions)}
            </div>

            <div className="mt-4">
              {profileTextField({
                label: 'Goal',
                value: state.goal,
                onChange: (goal) => setState((prev) => ({ ...prev, goal: goal.slice(0, 180) })),
                placeholder: 'Maintain strength while leaning out',
                maxLength: 180,
              })}
            </div>

            <label className="coach-profile-field mt-4">
              <span className="coach-profile-label">Extra notes</span>
              <textarea
                className="input-shell min-h-[120px] resize-none"
                placeholder="Injuries, sport focus, schedule, food preferences..."
                value={state.notes}
                onChange={(event) => setState((prev) => ({ ...prev, notes: event.target.value.slice(0, 1200) }))}
              />
            </label>
          </section>
        </div>
      );
    }

    const readyLine = selectedCoach === 'lc'
      ? 'Profile saved. Now stop guessing and start executing.'
      : "You're ready. I'll help you build this step by step.";

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        <section className="rounded-[28px] border border-white/70 bg-white/72 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
          <CoachHero coach={selectedCoach} state="celebrate" size={230} showBubble bubbleText={readyLine} bubbleTone="strong" />
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/72 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Coach profile card</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {summaryItem('Coach', state.coach ? state.coach.toUpperCase() : 'Not selected')}
            {summaryItem('Goal', state.goal)}
            {summaryItem('Height', heightSummary(state))}
            {summaryItem('Weight', weightSummary(state))}
            {summaryItem('Age', state.age ? `${state.age} years` : '')}
            {summaryItem('Training days', state.trainingDays ? optionLabelForValue(trainingDayOptions, state.trainingDays) : '')}
            {summaryItem('Activity', state.activityLevel ? optionLabelForValue(activityLevelOptions, state.activityLevel) : '')}
            {summaryItem('Experience', state.experienceLevel ? optionLabelForValue(experienceLevelOptions, state.experienceLevel) : '')}
          </div>
          {state.notes.trim() ? (
            <div className="mt-3 rounded-[18px] border border-slate-200/80 bg-white px-4 py-3 text-sm leading-7 text-slate-700">
              {state.notes.trim()}
            </div>
          ) : null}
        </section>
      </div>
    );
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-white px-4 py-6 sm:px-6 sm:py-8">
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[clamp(2.1rem,5vw,4rem)] font-bold leading-[0.98] text-slate-900">{stepTitle(step)}</h1>
            </div>
            <div className="rounded-full border border-white/70 bg-white/68 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
              {step + 1} / {totalSteps}
            </div>
          </div>

          <div className="mb-8 h-2 overflow-hidden rounded-full bg-slate-100/80">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--coach-zj), var(--coach-lc))',
              }}
            />
          </div>

          {loadingExisting ? (
            <div className="grid min-h-[360px] place-items-center rounded-[28px] border border-white/70 bg-white/72 px-6 text-center text-sm text-slate-500 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
              Loading your saved coach profile...
            </div>
          ) : (
            renderStep()
          )}

          {error ? <p className="mt-5 text-sm text-[color:var(--danger)]">{error}</p> : null}

          <div className="welcome-action-bar mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={pending || loadingExisting || step === 0}
            >
              Back
            </button>

            {step < totalSteps - 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!canContinue) {
                    setError('Choose a coach before continuing.');
                    return;
                  }
                  setError('');
                  setStep((current) => Math.min(totalSteps - 1, current + 1));
                }}
                disabled={pending || loadingExisting}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleFinish()}
                disabled={pending || loadingExisting}
              >
                {pending ? 'Saving...' : 'Enter ZYM'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
