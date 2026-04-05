'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCoachRecords, selectCoach, updateCoachRecordProfile } from '@/lib/api';
import { setCoach } from '@/lib/auth-storage';
import {
  activityLevelOptions,
  bodyFatRangeOptions,
  bodyFatRangeToValue,
  bodyFatValueToRange,
  experienceLevelOptions,
  genderOptions,
  goalOptions,
  trainingDayOptions,
} from '@/lib/coach-profile-options';
import type { CoachProfileData } from '@/lib/types';

type CoachId = 'zj' | 'lc';

interface SetupState {
  coach: CoachId | '';
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

interface WelcomeFlowProps {
  userId: number;
  initialCoach: CoachId | null;
  onComplete: (coach: CoachId) => void;
}

const totalSteps = 5;

const coachCards = [
  {
    id: 'zj' as const,
    title: 'ZJ',
    badge: 'Encouraging',
    description: 'Thoughtful, supportive, and steady. Best when you want consistency without feeling judged.',
    sample: 'I will help you keep momentum without overcomplicating your day.',
    tone: 'rgba(105,121,247,0.12)',
    border: 'rgba(105,121,247,0.18)',
    ink: 'var(--coach-zj)',
  },
  {
    id: 'lc' as const,
    title: 'LC',
    badge: 'Strict',
    description: 'Direct, sharper, and more demanding. Best when you want structure and accountability.',
    sample: 'I will push you to stop drifting and start executing.',
    tone: 'rgba(242,138,58,0.12)',
    border: 'rgba(242,138,58,0.18)',
    ink: 'var(--coach-lc)',
  },
];

const EMPTY_SETUP_STATE: SetupState = {
  coach: '',
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
      return 'See what this turns into';
    case 1:
      return 'Preview the outcome';
    case 2:
      return 'Choose your coach';
    case 3:
      return 'Fill the basics';
    default:
      return 'You are ready';
  }
}

function stepSubtitle(step: number): string {
  switch (step) {
    case 0:
      return 'A quick setup makes the first conversation feel guided instead of blank.';
    case 1:
      return 'ZYM works better when you know what kind of recipes, plans, and check-ins it can produce.';
    case 2:
      return 'Pick the coaching energy you want to hear every day.';
    case 3:
      return 'Tell the agent your height, weight, age, goal, and training context so it can personalize your output.';
    default:
      return 'We will save this into your coach profile so meals, plans, and feedback feel tailored from the start.';
  }
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
  return {
    coach: selectedCoachOverride || initialCoach || '',
    height: String(source.height || source.height_cm || source.heightCm || '').trim(),
    weight: String(source.weight || source.weight_kg || source.weightKg || '').trim(),
    age: String(source.age || source.ageYears || '').trim(),
    bodyFatRange: bodyFatValueToRange((source.body_fat_pct ?? source.body_fat ?? source.bodyFatPct) as number | null | undefined),
    trainingDays: String(source.training_days || source.trainingDays || '').trim(),
    gender: String(source.gender || ''),
    activityLevel: String(source.activity_level || source.activity || source.activityLevel || ''),
    goal: String(source.goal || source.fitness_goal || source.fitnessGoal || ''),
    experienceLevel: String(source.experience_level || source.experience || source.experienceLevel || ''),
    notes: String(source.notes || ''),
  };
}

export function WelcomeFlow(props: WelcomeFlowProps) {
  const {
    userId,
    initialCoach,
    onComplete,
  } = props;
  const [step, setStep] = useState(0);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<SetupState>(buildSetupState(undefined, initialCoach));

  const progress = useMemo(() => ((step + 1) / totalSteps) * 100, [step]);

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

  const canContinue = (() => {
    if (step === 2) return Boolean(state.coach);
    return true;
  })();

  async function handleFinish() {
    if (!state.coach) {
      setError('Choose a coach before finishing setup.');
      setStep(2);
      return;
    }

    try {
      setPending(true);
      setError('');
      await selectCoach(userId, state.coach);
      await updateCoachRecordProfile({
        userId,
        height: state.height.trim() || undefined,
        weight: state.weight.trim() || undefined,
        age: state.age.trim() ? Number(state.age.trim()) : undefined,
        body_fat_pct: bodyFatRangeToValue(state.bodyFatRange),
        training_days: state.trainingDays.trim() ? Number(state.trainingDays.trim()) : undefined,
        gender: state.gender || undefined,
        activity_level: state.activityLevel || undefined,
        goal: state.goal || undefined,
        experience_level: state.experienceLevel || undefined,
        notes: state.notes.trim() || undefined,
        timezone: detectLocalTimezone(),
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]">
          <section className="rounded-[28px] border border-white/70 bg-white/68 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">What people type</p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-[22px] border border-[rgba(105,121,247,0.14)] bg-[rgba(105,121,247,0.08)] px-4 py-3 text-sm text-slate-700">
                "I am 179 cm, 83 kg, want to cut, and train 4 days a week."
              </div>
              <div className="rounded-[22px] border border-[rgba(242,138,58,0.14)] bg-[rgba(242,138,58,0.08)] px-4 py-3 text-sm text-slate-700">
                "Can you help me plan meals and tell me what to train today?"
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/68 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">What you get back</p>
            <div className="mt-5 grid gap-4">
              <div className="rounded-[22px] border border-[rgba(105,121,247,0.14)] bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--coach-zj)]">Meal guidance</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">Protein target, calorie direction, and a believable meal structure for the day.</p>
              </div>
              <div className="rounded-[22px] border border-[rgba(242,138,58,0.14)] bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--coach-lc)]">Training plan</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">A structured list of exercises with sets, reps, rest time, and built-in movement demos.</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Follow-up coaching</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">Sharper advice because the coach already knows your baseline and goal.</p>
              </div>
            </div>
          </section>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.48fr)_minmax(0,0.52fr)]">
          <section className="rounded-[28px] border border-white/70 bg-white/68 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Input example</p>
            <div className="mt-5 rounded-[24px] border border-[rgba(242,138,58,0.14)] bg-[rgba(242,138,58,0.08)] px-5 py-5 text-sm text-slate-700">
              I want a simple upper-body workout for today. I am trying to cut, my shoulders are a little uneven, and I do not want a huge complicated plan.
            </div>
          </section>
          <section className="rounded-[28px] border border-white/70 bg-white/68 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Output example</p>
            <div className="mt-5 rounded-[24px] border border-[rgba(105,121,247,0.14)] bg-white px-5 py-5">
              <p className="text-sm font-semibold text-slate-900">Upper A</p>
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                <li>1. Incline dumbbell press · 4 sets · 8 reps · 90 sec rest</li>
                <li>2. Chest-supported row · 4 sets · 10 reps · 75 sec rest</li>
                <li>3. Cable lateral raise · 3 sets · 12 reps · 60 sec rest</li>
                <li>4. One-arm dumbbell shoulder press · 3 sets · 8 reps each side · 75 sec rest</li>
              </ol>
              <p className="mt-4 text-xs leading-6 text-slate-500">
                The same setup also helps meals, recovery guidance, progress summaries, and coach memory.
              </p>
            </div>
          </section>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          {coachCards.map((card) => {
            const active = state.coach === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, coach: card.id }))}
                className="rounded-[28px] border p-6 text-left transition"
                style={{
                  background: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.72)',
                  borderColor: active ? card.border : 'rgba(255,255,255,0.6)',
                  boxShadow: active ? '0 24px 50px rgba(59,49,40,0.12)' : '0 16px 34px rgba(59,49,40,0.06)',
                }}
              >
                <div
                  className="inline-flex rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]"
                  style={{ background: card.tone, color: card.ink }}
                >
                  {card.badge}
                </div>
                <h2 className="mt-5 text-3xl font-bold text-slate-900">{card.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-700">{card.description}</p>
                <p className="mt-4 text-sm font-semibold leading-7" style={{ color: card.ink }}>{card.sample}</p>
              </button>
            );
          })}
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="grid gap-6">
          <section className="rounded-[28px] border border-white/70 bg-white/72 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="input-shell" placeholder="Height" value={state.height} onChange={(event) => setState((prev) => ({ ...prev, height: event.target.value.slice(0, 40) }))} />
              <input className="input-shell" placeholder="Weight" value={state.weight} onChange={(event) => setState((prev) => ({ ...prev, weight: event.target.value.slice(0, 40) }))} />
              <input className="input-shell" inputMode="numeric" placeholder="Age" value={state.age} onChange={(event) => setState((prev) => ({ ...prev, age: event.target.value.slice(0, 3) }))} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select className="input-shell" value={state.gender} onChange={(event) => setState((prev) => ({ ...prev, gender: event.target.value }))}>
                <option value="">Gender</option>
                {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select className="input-shell" value={state.bodyFatRange} onChange={(event) => setState((prev) => ({ ...prev, bodyFatRange: event.target.value }))}>
                <option value="">Body fat range</option>
                {bodyFatRangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select className="input-shell" value={state.trainingDays} onChange={(event) => setState((prev) => ({ ...prev, trainingDays: event.target.value }))}>
                <option value="">Training days / week</option>
                {trainingDayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select className="input-shell" value={state.activityLevel} onChange={(event) => setState((prev) => ({ ...prev, activityLevel: event.target.value }))}>
                <option value="">Activity level</option>
                {activityLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select className="input-shell" value={state.goal} onChange={(event) => setState((prev) => ({ ...prev, goal: event.target.value }))}>
                <option value="">Goal</option>
                {goalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select className="input-shell" value={state.experienceLevel} onChange={(event) => setState((prev) => ({ ...prev, experienceLevel: event.target.value }))}>
                <option value="">Experience level</option>
                {experienceLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <textarea
              className="input-shell mt-4 min-h-[120px] resize-none"
              placeholder="Optional notes: injuries, sport focus, schedule, food preferences..."
              value={state.notes}
              onChange={(event) => setState((prev) => ({ ...prev, notes: event.target.value.slice(0, 1200) }))}
            />
          </section>
        </div>
      );
    }

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.56fr)_minmax(0,0.44fr)]">
        <section className="rounded-[28px] border border-white/70 bg-white/72 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Saved context</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Coach: {state.coach ? state.coach.toUpperCase() : 'Not selected'}</div>
            <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Goal: {state.goal || 'Not set'}</div>
            <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Height: {state.height || 'Not set'}</div>
            <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Weight: {state.weight || 'Not set'}</div>
            <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Age: {state.age || 'Not set'}</div>
            <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Experience: {state.experienceLevel || 'Not set'}</div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/72 p-6 shadow-[0_24px_50px_rgba(59,49,40,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">What happens next</p>
          <div className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
            <p>Tell the agent your height, weight, age, goals, injuries, food preferences, or sport focus so it knows you better from the first reply.</p>
            <p>The coach can now shape meal feedback, recipes, and training plans around the profile you just saved.</p>
            <p>If you want, you can still edit all of this later inside the coach conversation.</p>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute -left-24 -top-24 size-[28rem] rounded-full bg-[radial-gradient(circle,_rgba(105,121,247,0.14)_0%,_rgba(105,121,247,0)_70%)]" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 size-[30rem] rounded-full bg-[radial-gradient(circle,_rgba(242,138,58,0.16)_0%,_rgba(242,138,58,0)_70%)]" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Welcome setup</p>
              <h1 className="mt-3 text-[clamp(2.2rem,5vw,4rem)] font-bold leading-[0.98] text-slate-900">{stepTitle(step)}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--ink-500)] sm:text-base">{stepSubtitle(step)}</p>
            </div>
            <div className="rounded-full border border-white/70 bg-white/68 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
              {step + 1} / {totalSteps}
            </div>
          </div>

          <div className="mb-8 h-2 overflow-hidden rounded-full bg-white/60">
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

          <div className="mt-8 flex items-center justify-between gap-3">
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
                    setError('Finish this step before continuing.');
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
