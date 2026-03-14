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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute -left-20 -top-20 size-[28rem] rounded-full bg-[radial-gradient(circle,_rgba(105,121,247,0.18)_0%,_rgba(105,121,247,0)_70%)]" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 size-[30rem] rounded-full bg-[radial-gradient(circle,_rgba(242,138,58,0.16)_0%,_rgba(242,138,58,0)_70%)]" />

      <div className="relative z-10 w-full max-w-[480px]">
        <section className="rounded-[32px] border border-white/60 bg-white/70 p-8 shadow-[0_30px_80px_rgba(59,49,40,0.12)] backdrop-blur-2xl md:p-10">
          <div className="mb-8 flex items-center justify-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white shadow-[0_18px_32px_rgba(105,121,247,0.12)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="ZYM logo" className="size-10 object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[color:var(--ink-900)]">ZYM</h1>
            </div>
          </div>

          <div className="mb-8 text-center">
            <h2 className="text-lg font-medium text-[color:var(--ink-900)]">Welcome Back</h2>
            <p className="mt-3 text-sm leading-7 text-[color:var(--ink-500)]">
              Pick your AI coach, connect with friends, and manage training, nutrition, and daily habits in one premium community app.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Username</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[color:var(--ink-300)]">person</span>
                <input
                  className="w-full rounded-2xl border border-[rgba(171,164,155,0.22)] bg-white/55 py-4 pl-12 pr-4 text-[color:var(--ink-900)] outline-none transition focus:border-[rgba(105,121,247,0.32)] focus:ring-4 focus:ring-[rgba(105,121,247,0.12)]"
                  placeholder="your username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="ml-1 text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Password</label>
                <span className="text-xs text-[color:var(--ink-300)]">Secure session</span>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[color:var(--ink-300)]">lock</span>
                <input
                  className="w-full rounded-2xl border border-[rgba(171,164,155,0.22)] bg-white/55 py-4 pl-12 pr-4 text-[color:var(--ink-900)] outline-none transition focus:border-[rgba(105,121,247,0.32)] focus:ring-4 focus:ring-[rgba(105,121,247,0.12)]"
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

          <div className="mt-8 border-t border-[rgba(171,164,155,0.12)] pt-8 text-center">
            <p className="text-sm text-[color:var(--ink-500)]">New to the community?</p>
            <button
              type="button"
              className="mt-3 inline-flex items-center justify-center gap-1 text-sm font-bold text-[color:var(--coach-zj)] transition hover:underline"
              onClick={() => router.push('/register')}
            >
              Start Your 14-Day Challenge
            </button>
          </div>
        </section>

        <div className="mt-10 flex justify-center gap-8 opacity-60">
          {[
            { label: 'Coach ZJ', tone: 'bg-[rgba(105,121,247,0.12)] text-[color:var(--coach-zj)]' },
            { label: 'Coach LC', tone: 'bg-[rgba(242,138,58,0.12)] text-[color:var(--coach-lc)]' },
          ].map((coach) => (
            <div key={coach.label} className="flex flex-col items-center">
              <div className={`flex size-12 items-center justify-center rounded-full border border-white/70 ${coach.tone}`}>
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
