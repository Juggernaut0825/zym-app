'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { setAuth } from '@/lib/auth-storage';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    try {
      setPending(true);
      const auth = await login(username.trim(), password);
      setAuth(auth);
      const hasCoach = auth.selectedCoach === 'zj' || auth.selectedCoach === 'lc';
      router.push(hasCoach ? '/app' : '/coach-select');
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-x-hidden px-4 py-[clamp(1.25rem,3vh,2.5rem)] sm:px-6">
      <div className="pointer-events-none absolute -left-20 -top-20 size-[28rem] rounded-full bg-[radial-gradient(circle,_rgba(105,121,247,0.18)_0%,_rgba(105,121,247,0)_70%)]" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 size-[30rem] rounded-full bg-[radial-gradient(circle,_rgba(242,138,58,0.16)_0%,_rgba(242,138,58,0)_70%)]" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-clamp(2.5rem,6vh,5rem))] w-full max-w-[480px] flex-col justify-center gap-[clamp(1.25rem,3vh,2.25rem)]">
        <section className="rounded-[28px] border border-white/60 bg-white/70 p-[clamp(1.5rem,4vw,2.5rem)] text-sm text-[color:var(--ink-900)] shadow-[0_30px_80px_rgba(59,49,40,0.12)] backdrop-blur-2xl">
          <div className="mb-[clamp(1.5rem,3vh,2rem)] flex items-center justify-center gap-3">
            <div className="flex size-[clamp(3rem,6vw,3.5rem)] items-center justify-center rounded-2xl bg-white shadow-[0_18px_32px_rgba(105,121,247,0.12)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="ZYM logo" className="size-[clamp(2rem,4vw,2.5rem)] object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[color:var(--ink-900)]">ZYM</h1>
            </div>
          </div>

          <div className="mb-[clamp(1.5rem,3vh,2rem)] text-center">
            <h2 className="text-[1.625rem] font-semibold tracking-tight text-[color:var(--ink-900)] sm:text-[1.875rem]">Welcome Back</h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--ink-500)] sm:leading-7">
              Pick your AI coach, connect with friends, and manage training, nutrition, and daily habits in one premium community app.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Username</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[color:var(--ink-300)]">person</span>
                <input
                  className="w-full rounded-2xl border border-[rgba(171,164,155,0.22)] bg-white/55 py-3.5 pl-12 pr-4 text-sm text-[color:var(--ink-900)] outline-none transition focus:border-[rgba(105,121,247,0.32)] focus:ring-4 focus:ring-[rgba(105,121,247,0.12)] sm:py-4"
                  placeholder="your username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="ml-1 block text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Password</label>
                <button
                  type="button"
                  className="text-xs font-semibold text-[color:var(--coach-zj)] transition hover:underline"
                  onClick={() => router.push('/forgot-password')}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[color:var(--ink-300)]">lock</span>
                <input
                  className="w-full rounded-2xl border border-[rgba(171,164,155,0.22)] bg-white/55 py-3.5 pl-12 pr-4 text-sm text-[color:var(--ink-900)] outline-none transition focus:border-[rgba(105,121,247,0.32)] focus:ring-4 focus:ring-[rgba(105,121,247,0.12)] sm:py-4"
                  placeholder="••••••••"
                  value={password}
                  type="password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>

            {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[color:var(--coach-lc)] to-[color:var(--coach-lc-strong)] px-4 py-4 text-sm font-bold text-white shadow-[0_18px_32px_rgba(177,99,34,0.22)] transition active:scale-[0.99]"
              disabled={pending}
            >
              {pending ? 'Signing in...' : 'Get to Work'}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>
          </form>

          <div className="mt-[clamp(1.5rem,3vh,2rem)] border-t border-[rgba(171,164,155,0.12)] pt-[clamp(1.5rem,3vh,2rem)] text-center">
            <p className="text-sm text-[color:var(--ink-500)]">
              New to the community?{' '}
              <button
                type="button"
                className="font-bold text-[color:var(--coach-zj)] transition hover:underline"
                onClick={() => router.push('/register')}
              >
                Register today
              </button>
            </p>
            <p className="mt-3 text-xs text-[color:var(--ink-300)]">
              Need a verification email?{' '}
              <button
                type="button"
                className="font-semibold text-[color:var(--coach-zj)] transition hover:underline"
                onClick={() => router.push('/verify-email')}
              >
                Send again
              </button>
            </p>
          </div>
        </section>

        <div className="flex justify-center gap-[clamp(1.25rem,4vw,2rem)] pb-1 opacity-60">
          {[
            { label: 'Coach ZJ', tone: 'bg-[rgba(105,121,247,0.12)] text-[color:var(--coach-zj)]' },
            { label: 'Coach LC', tone: 'bg-[rgba(242,138,58,0.12)] text-[color:var(--coach-lc)]' },
          ].map((coach) => (
            <div key={coach.label} className="flex flex-col items-center">
              <div className={`flex size-11 items-center justify-center rounded-full border border-white/70 sm:size-12 ${coach.tone}`}>
                <span className="material-symbols-outlined">fitness_center</span>
              </div>
              <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">{coach.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
